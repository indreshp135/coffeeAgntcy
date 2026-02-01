import asyncio
import io
import json
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn
from pypdf import PdfReader
from sqlalchemy import select

try:
    from docx import Document as DocxDocument
except ImportError:
    DocxDocument = None

from agntcy_app_sdk.factory import AgntcyFactory
from ioa_observe.sdk.tracing import session_start
from common.version import get_version_info

from langchain_core.messages import HumanMessage, SystemMessage

from config.logging_config import setup_logging
from common.llm import get_llm, invoke_structured_with_retry, GenerateJDOutput, JobDescriptionExtractOutput
from exchange.agent import ExchangeAgent
from exchange.services import AgentClient
from auth.service import AuthService
from auth.deps import get_current_user, require_role
from database.session import get_session, init_db
from database.models import User, CandidateProfile, ResumeBlob, Job, JobCandidate, InterviewSession
from schemas import JD_SCHEMA_JSON, job_description_to_markdown, resume_schema_to_profile

# Directory for interview recordings (relative to cwd when running exchange)
RECORDINGS_DIR = Path(__file__).resolve().parent.parent / "recordings"
# Base path for trylipsync (interviewer image, checkpoint, etc.)
TRYLIPSYNC_BASE = Path(__file__).resolve().parent.parent / "trylipsync"


def _parse_questions_from_agent(questions_text: str | None) -> list[str]:
    """Parse agent response into list of question strings (max 10)."""
    if not (questions_text or "").strip():
        return []
    lines = (questions_text or "").strip().split("\n")
    questions = [
        line.strip()
        for line in lines
        if line.strip() and (line.strip()[0].isdigit() or line.strip().startswith("-"))
    ]
    if not questions:
        questions = [q.strip() for q in lines if q.strip()][:10]
    return questions[:10]


async def _background_generate_question_videos(token: str, questions: list[str]) -> None:
    """Generate lipsync videos for each question (TTS + Wav2Lip), save under RECORDINGS_DIR/interview/<token>/, update session.question_videos."""
    if not questions:
        return
    try:
        from trylipsync.speech import generate_question_video
    except ImportError as e:
        logger.warning("trylipsync not available, skipping question video generation: %s", e)
        return
    video_dir = RECORDINGS_DIR / "interview" / token
    video_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for i, q in enumerate(questions):
        try:
            out_path = video_dir / f"q{i}.mp4"
            await asyncio.to_thread(
                generate_question_video,
                q,
                out_path,
                base_dir=TRYLIPSYNC_BASE,
                use_openai_tts=True,
            )
            paths.append(f"interview/{token}/q{i}.mp4")
        except Exception as e:
            logger.exception("Question video %s generation failed: %s", i, e)
    if not paths:
        return
    async with get_session() as session:
        inv = (
            await session.execute(
                select(InterviewSession).where(InterviewSession.interview_link_token == token)
            )
        ).scalar_one_or_none()
        if inv:
            inv.question_videos = paths
            await session.commit()

setup_logging()
logger = logging.getLogger("corto.exchange.main")
load_dotenv()

# Initialize the agntcy factory with tracing enabled
factory = AgntcyFactory("corto.exchange", enable_tracing=True)
agent_client = AgentClient(factory)
auth_service = AuthService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)
# Serve interview recordings (create dir if missing)
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
from fastapi.staticfiles import StaticFiles
app.mount("/recordings", StaticFiles(directory=str(RECORDINGS_DIR)), name="recordings")
# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

exchange_agent = ExchangeAgent(factory=factory)

ALLOWED_RESUME_EXTENSIONS = {".pdf", ".docx"}


# ---------- Agent discovery (HTTP) ----------
# Serve agent card over HTTP so discovery does not rely on SLIM request-response;
# SLIM can log "no output connection available" / "no matching found" when the
# requester is not subscribed for the response on the same SLIM instance.
@app.get("/.well-known/agent-card.json")
async def well_known_agent_card(request: Request):
    """Return the Corto Exchange agent card for HTTP-based discovery."""
    base = str(request.base_url).rstrip("/")
    card = {
        "name": "Corto Exchange",
        "id": "corto-exchange-agent",
        "description": "Recruitment orchestration: resume ingestion, job matching, interview prep and scheduling.",
        "url": base,
        "version": "1.0.0",
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
        "capabilities": {"streaming": True},
        "skills": [],
        "supportsAuthenticatedExtendedCard": False,
    }
    return Response(
        content=json.dumps(card, indent=2),
        media_type="application/json",
    )
MAX_RESUME_SIZE_MB = 10


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "candidate"  # candidate | employer


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/register")
async def register(req: RegisterRequest):
    try:
        return await auth_service.register(req.username, req.password, req.role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
async def login(req: LoginRequest):
    try:
        return await auth_service.login(req.username, req.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


# ---------- Candidate portal ----------
_PROFILE_KEYS = (
    "full_name", "email", "phone", "address", "summary",
    "education", "work_experience", "skills", "languages",
    "certifications", "interests", "projects",
)
_LIST_KEYS = frozenset(("education", "work_experience", "skills", "languages", "certifications", "interests", "projects"))


@app.post("/candidate/resume/upload")
async def candidate_upload_resume(
    user: Annotated[dict, Depends(require_role("candidate"))],
    file: UploadFile = File(...),
):
    """Upload resume; extract text, call resume mastermind, store profile + last resume."""
    user_id = int(user.get("user_id", 0))
    filename = file.filename or "resume"
    logger.info("Resume upload started: user_id=%s filename=%s", user_id, filename)

    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_RESUME_EXTENSIONS:
        logger.warning("Resume upload rejected: unsupported type suffix=%s user_id=%s", suffix, user_id)
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_RESUME_EXTENSIONS)}",
        )
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if len(content) > MAX_RESUME_SIZE_MB * 1024 * 1024:
        logger.warning("Resume upload rejected: file too large size_mb=%.2f user_id=%s", size_mb, user_id)
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {MAX_RESUME_SIZE_MB} MB",
        )
    logger.debug("Resume upload: extracting text suffix=%s size_bytes=%s user_id=%s", suffix, len(content), user_id)
    try:
        text = _extract_text_pdf(content) if suffix == ".pdf" else _extract_text_docx(content)
    except Exception as e:
        logger.exception("Resume extraction failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {e}") from e
    logger.info("Resume text extracted: user_id=%s text_len=%s", user_id, len(text))

    logger.info("Resume upload: calling resume_ingest user_id=%s text_len=%s", user_id, len(text))
    print(text)
    result = await agent_client.resume_ingest(text)
    print(result)
    result_keys = list(result.keys()) if isinstance(result, dict) else []
    logger.info("Resume upload: resume_ingest returned keys=%s user_id=%s", result_keys, user_id)

    resume_schema = result.get("resume") or {}
    agent_profile_raw = result.get("profile")
    logger.info(
        "Resume upload: resume_schema keys=%s profile type=%s user_id=%s",
        list(resume_schema.keys()) if isinstance(resume_schema, dict) else type(resume_schema).__name__,
        type(agent_profile_raw).__name__ if agent_profile_raw is not None else "None",
        user_id,
    )

    profile_data = resume_schema_to_profile(resume_schema)
    profile_data_filled = [k for k in _PROFILE_KEYS if profile_data.get(k) not in (None, [], {})]
    logger.info("Resume upload: profile_data filled keys=%s user_id=%s", profile_data_filled, user_id)

    agent_profile = agent_profile_raw if isinstance(agent_profile_raw, dict) else {}
    merged = 0
    for k, v in agent_profile.items():
        if v is not None and profile_data.get(k) in (None, [], {}):
            profile_data[k] = v
            merged += 1
    if merged:
        logger.info("Resume upload: merged %s keys from agent_profile user_id=%s", merged, user_id)

    data = {}
    for k in _PROFILE_KEYS:
        v = profile_data.get(k)
        data[k] = (v if isinstance(v, list) else []) if k in _LIST_KEYS else v
    profile_autofilled = any(data.get(k) for k in ("full_name", "email", "summary", "skills"))
    autofill_keys = [k for k in ("full_name", "email", "summary", "skills") if data.get(k)]
    logger.info(
        "Resume upload: profile_autofilled=%s autofill_keys=%s user_id=%s",
        profile_autofilled,
        autofill_keys,
        user_id,
    )

    try:
        async with get_session() as session:
            logger.debug("Resume upload: loading CandidateProfile user_id=%s", user_id)
            row = (await session.execute(select(CandidateProfile).where(CandidateProfile.user_id == user_id))).scalar_one_or_none()
            logger.info("Resume upload: existing profile row=%s user_id=%s", row is not None, user_id)

            if profile_autofilled:
                if row:
                    for k, v in data.items():
                        setattr(row, k, v)
                    logger.info("Resume upload: updated CandidateProfile user_id=%s", user_id)
                else:
                    session.add(CandidateProfile(user_id=user_id, **data))
                    logger.info("Resume upload: created CandidateProfile user_id=%s", user_id)

            logger.debug("Resume upload: adding ResumeBlob user_id=%s file_name=%s", user_id, filename)
            session.add(ResumeBlob(
                user_id=user_id,
                file_name=filename,
                content_type=file.content_type,
                file_content=content,
                extracted_text=text,
                parsed_schema=resume_schema,
            ))
            await session.commit()
            logger.info("Resume upload: commit ok user_id=%s", user_id)
    except Exception as e:
        logger.exception("Resume upload: DB failed user_id=%s filename=%s error=%s", user_id, filename, e)
        raise

    logger.info("Resume upload completed: user_id=%s filename=%s profile_autofilled=%s", user_id, filename, profile_autofilled)

    return {
        "message": result.get("result", "Resume uploaded."),
        "filename": file.filename,
        "profile_autofilled": profile_autofilled,
    }


@app.get("/candidate/profile")
async def candidate_get_profile(
    user: Annotated[dict, Depends(require_role("candidate"))],
):
    async with get_session() as session:
        row = (await session.execute(select(CandidateProfile).where(CandidateProfile.user_id == int(user["user_id"])))).scalar_one_or_none()
        if not row:
            return None
        return {
            "full_name": row.full_name,
            "email": row.email,
            "phone": row.phone,
            "address": row.address,
            "summary": row.summary,
            "education": row.education or [],
            "work_experience": row.work_experience or [],
            "skills": row.skills or [],
            "languages": row.languages or [],
            "certifications": row.certifications or [],
            "interests": row.interests or [],
            "projects": row.projects or [],
        }


@app.put("/candidate/profile")
async def candidate_update_profile(
    body: dict[str, Any],
    user: Annotated[dict, Depends(require_role("candidate"))],
):
    async with get_session() as session:
        row = (await session.execute(select(CandidateProfile).where(CandidateProfile.user_id == int(user["user_id"])))).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found. Upload a resume first.")
        for k in ("full_name", "email", "phone", "address", "summary", "education", "work_experience", "skills", "languages", "certifications", "interests", "projects"):
            if k in body and body[k] is not None:
                setattr(row, k, body[k])
        await session.commit()
        await session.refresh(row)
        return {"message": "Profile updated."}


@app.get("/candidate/resume/last")
async def candidate_last_resume(
    user: Annotated[dict, Depends(require_role("candidate"))],
):
    async with get_session() as session:
        row = (
            await session.execute(
                select(ResumeBlob)
                .where(ResumeBlob.user_id == int(user["user_id"]))
                .order_by(ResumeBlob.created_at.desc())
                .limit(1)
            )
        )
        r = row.scalar_one_or_none()
        if not r:
            return None
        return {"filename": r.file_name, "text": r.extracted_text, "uploaded_at": r.created_at.isoformat(), "content_type": r.content_type or ""}


@app.get("/candidate/resume/last/pdf", response_class=Response)
async def candidate_last_resume_pdf(
    user: Annotated[dict, Depends(require_role("candidate"))],
):
    """Return the last uploaded resume as PDF for in-browser display. 404 if not PDF or missing."""
    async with get_session() as session:
        row = (
            await session.execute(
                select(ResumeBlob)
                .where(ResumeBlob.user_id == int(user["user_id"]))
                .order_by(ResumeBlob.created_at.desc())
                .limit(1)
            )
        )
        r = row.scalar_one_or_none()
        if not r or not r.file_content:
            raise HTTPException(status_code=404, detail="No resume file found.")
        ct = (r.content_type or "").lower()
        if "pdf" not in ct and not (r.file_name or "").lower().endswith(".pdf"):
            raise HTTPException(status_code=404, detail="Last resume is not a PDF.")
        return Response(
            content=r.file_content,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=\"" + (r.file_name or "resume.pdf") + "\""},
        )


# ---------- Candidate interviews (list + swipe respond) ----------
@app.get("/candidate/interviews")
async def candidate_list_interviews(
    user: Annotated[dict, Depends(require_role("candidate"))],
):
    """List all interviews for the candidate: open (pending swipe) and history with decision status."""
    user_id = int(user["user_id"])
    async with get_session() as session:
        profile = (
            await session.execute(
                select(CandidateProfile).where(CandidateProfile.user_id == user_id)
            )
        ).scalar_one_or_none()
        if not profile:
            return {"open": [], "history": []}
        jc_list = (
            await session.execute(
                select(JobCandidate, Job, InterviewSession)
                .join(Job, JobCandidate.job_id == Job.id)
                .outerjoin(
                    InterviewSession,
                    InterviewSession.job_candidate_id == JobCandidate.id,
                )
                .where(JobCandidate.candidate_profile_id == profile.id)
                .order_by(JobCandidate.id.desc())
            )
        ).all()
        open_list = []
        history_list = []
        for jc, job, inv in jc_list:
            inv_token = inv.interview_link_token if inv else None
            item = {
                "job_candidate_id": jc.id,
                "job_id": job.id,
                "job_title": job.title,
                "description_md": job.description_md or """# AI Engineer

**Location:** [City, Country / Remote]  
**Job Type:** [Full-Time / Part-Time / Contract]

## About the Role
We are looking for an **AI Engineer** to design, develop, and deploy AI/ML models that solve real-world problems and enhance our products.

## Responsibilities
- Build and optimize machine learning models.  
- Collaborate with teams to integrate AI solutions.  
- Maintain AI pipelines and workflows.  
- Research and implement latest AI techniques.  

## Requirements
- Bachelor’s or Master’s in Computer Science, AI, or related field.  
- Proficiency in Python and ML libraries (TensorFlow, PyTorch, scikit-learn).  
- Experience with data preprocessing, feature engineering, and model evaluation.  
- Knowledge of cloud platforms (AWS, GCP, Azure) and Docker/Kubernetes.  

## Preferred
- Experience with NLP, computer vision, or generative AI.  
- Familiarity with MLOps and production deployment.  
- Strong problem-solving and teamwork skills.
""",
                "invited_at": jc.invited_at.isoformat() if jc.invited_at else None,
                "interview_completed_at": (
                    jc.interview_completed_at.isoformat() if jc.interview_completed_at else None
                ),
                "score": jc.score,
                "interview_link_token": inv_token,
                "candidate_decision": jc.candidate_decision,
                "company_decision": jc.company_decision,
            }
            if jc.candidate_decision is None:
                open_list.append(item)
            else:
                status = "candidate_rejected"
                if jc.company_decision == "placed":
                    status = "placed"
                elif jc.company_decision == "rejected":
                    status = "company_rejected"
                elif jc.candidate_decision == "interested":
                    status = "interested"  # pending company
                item["status"] = status
                history_list.append(item)
        return {"open": open_list, "history": history_list}


class InterviewRespondRequest(BaseModel):
    interested: bool


@app.post("/candidate/interviews/{job_candidate_id}/respond")
async def candidate_respond_to_interview(
    job_candidate_id: int,
    body: InterviewRespondRequest,
    user: Annotated[dict, Depends(require_role("candidate"))],
):
    """Record candidate swipe: interested (right) or rejected (left). If interested, send interview link email."""
    user_id = int(user["user_id"])
    async with get_session() as session:
        profile = (
            await session.execute(
                select(CandidateProfile).where(CandidateProfile.user_id == user_id)
            )
        ).scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        jc = (
            await session.execute(
                select(JobCandidate).where(
                    JobCandidate.id == job_candidate_id,
                    JobCandidate.candidate_profile_id == profile.id,
                )
            )
        ).scalar_one_or_none()
        if not jc:
            raise HTTPException(status_code=404, detail="Interview not found")
        if jc.candidate_decision is not None:
            raise HTTPException(
                status_code=400,
                detail="Already responded to this interview",
            )
        jc.candidate_decision = "interested" if body.interested else "rejected"
        await session.commit()

        # If swipe right: prepare questions, store them, send email, then generate question videos in background
        if body.interested:
            job = (
                await session.execute(select(Job).where(Job.id == jc.job_id))
            ).scalar_one_or_none()
            inv = (
                await session.execute(
                    select(InterviewSession).where(InterviewSession.job_candidate_id == jc.id)
                )
            ).scalar_one_or_none()
            cp = (
                await session.execute(
                    select(CandidateProfile).where(CandidateProfile.id == jc.candidate_profile_id)
                )
            ).scalar_one_or_none()
            if job and inv and cp:
                # Prepare questions now (so they're ready when candidate joins)
                questions_text = await agent_client.interview_prepare_questions(
                    _job_content_for_agent(job), _candidate_profile_for_agent(cp)
                )
                questions = _parse_questions_from_agent(questions_text)
                if questions:
                    inv.questions = questions
                    await session.commit()
                if cp.email:
                    await agent_client.interview_send_invites(
                        job_id=job.id,
                        job_title=job.title,
                        job_description_md=_job_content_for_agent(job),
                        candidate_infos=[{
                            "profile_id": cp.id,
                            "email": cp.email,
                            "full_name": cp.full_name or "Candidate",
                            "profile_summary": cp.summary or "",
                            "interview_link_token": inv.interview_link_token,
                        }],
                    )
                # Generate lipsync videos in background (TTS + Wav2Lip)
                if questions:
                    asyncio.create_task(_background_generate_question_videos(inv.interview_link_token, questions))
    return {"message": "Response recorded", "interested": body.interested}


# ---------- Public interview join (by token from email link) ----------
@app.get("/interview/join")
async def interview_join(token: str):
    """Validate interview token and return job + candidate context + questions. No auth required (link from email)."""
    if not token or not token.strip():
        raise HTTPException(status_code=400, detail="Token is required.")
    async with get_session() as session:
        inv = (
            await session.execute(
                select(InterviewSession).where(InterviewSession.interview_link_token == token.strip())
            )
        ).scalar_one_or_none()
        if not inv:
            raise HTTPException(status_code=404, detail="Invalid or expired interview link.")
        jc = (
            await session.execute(
                select(JobCandidate).where(JobCandidate.id == inv.job_candidate_id)
            )
        ).scalar_one_or_none()
        if not jc:
            raise HTTPException(status_code=404, detail="Interview session not found.")
        if jc.interview_completed_at:
            raise HTTPException(status_code=400, detail="This interview has already been completed.")
        job = (
            await session.execute(select(Job).where(Job.id == jc.job_id))
        ).scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        cp = (
            await session.execute(
                select(CandidateProfile).where(CandidateProfile.id == jc.candidate_profile_id)
            )
        ).scalar_one_or_none()
        if not cp:
            raise HTTPException(status_code=404, detail="Candidate not found.")
        # Use pre-generated questions if available (from swipe), else prepare now
        if inv.questions and isinstance(inv.questions, list) and len(inv.questions) > 0:
            questions = inv.questions[:10]
        else:
            questions_text = await agent_client.interview_prepare_questions(
                _job_content_for_agent(job), _candidate_profile_for_agent(cp)
            )
            questions = _parse_questions_from_agent(questions_text)
            if questions:
                inv.questions = questions
                await session.commit()
        question_video_urls = []
        if inv.question_videos and isinstance(inv.question_videos, list):
            question_video_urls = [f"/recordings/{p}" for p in inv.question_videos]
    return {
        "job_id": job.id,
        "job_candidate_id": jc.id,
        "job_title": job.title or "",
        "description_md": job.description_md or "",
        "candidate_name": cp.full_name or "Candidate",
        "profile_summary": _candidate_profile_for_agent(cp),
        "questions": questions[:10],
        "question_video_urls": question_video_urls,
    }


class InterviewStartRequest(BaseModel):
    token: str


@app.post("/interview/start")
async def interview_start(body: InterviewStartRequest):
    """Record interview start time. No auth required."""
    async with get_session() as session:
        inv = (
            await session.execute(
                select(InterviewSession).where(
                    InterviewSession.interview_link_token == body.token.strip()
                )
            )
        ).scalar_one_or_none()
        if not inv:
            raise HTTPException(status_code=404, detail="Invalid or expired interview link.")
        if inv.started_at:
            pass
        else:
            inv.started_at = datetime.now(timezone.utc)
            await session.commit()
    return {"message": "Interview started."}


class InterviewChatRequest(BaseModel):
    token: str
    transcript_so_far: str = ""  # "Interviewer: ...\nCandidate: ..." format
    candidate_message: str | None = None


@app.post("/interview/chat")
async def interview_chat(body: InterviewChatRequest):
    """Get next interviewer message from interview mastermind (JD + resume + questions, ~10 min conversation). No auth."""
    if not body.token or not body.token.strip():
        raise HTTPException(status_code=400, detail="Token is required.")
    jd_content = ""
    profile_content = "{}"
    questions: list[str] = []
    async with get_session() as session:
        inv = (
            await session.execute(
                select(InterviewSession).where(
                    InterviewSession.interview_link_token == body.token.strip()
                )
            )
        ).scalar_one_or_none()
        if not inv:
            raise HTTPException(status_code=404, detail="Invalid or expired interview link.")
        jc = (
            await session.execute(
                select(JobCandidate).where(JobCandidate.id == inv.job_candidate_id)
            )
        ).scalar_one_or_none()
        if not jc or jc.interview_completed_at:
            raise HTTPException(status_code=400, detail="Interview already completed.")
        job = (
            await session.execute(select(Job).where(Job.id == jc.job_id))
        ).scalar_one_or_none()
        cp = (
            await session.execute(
                select(CandidateProfile).where(CandidateProfile.id == jc.candidate_profile_id)
            )
        ).scalar_one_or_none()
        if not job or not cp:
            raise HTTPException(status_code=404, detail="Job or candidate not found.")
        jd_content = _job_content_for_agent(job)
        profile_content = json.dumps(_candidate_profile_for_agent(cp), indent=0)
        questions = (inv.questions or [])[:10]
    questions_text = "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions)) if questions else "Ask role-specific and behavioral questions."
    system = (
        "You are the interviewer in a live 10-minute video interview. Use the job description and candidate profile to ask "
        "relevant questions. Cover the suggested questions naturally; follow up on the candidate's answers. "
        "Keep each response to 1-3 sentences. Be professional and concise.\n\n"
        f"Job description:\n{jd_content[:3000]}\n\nCandidate profile:\n{profile_content[:2000]}\n\n"
        f"Suggested questions to cover:\n{questions_text}"
    )
    transcript = (body.transcript_so_far or "").strip()
    candidate_message = (body.candidate_message or "").strip()
    if not candidate_message:
        if transcript:
            raise HTTPException(status_code=400, detail="Candidate message required.")
        user_content = (
            "Begin the interview with a brief greeting and your first question. "
            "Respond only with the interviewer line, no prefix."
        )
    else:
        new_line = f"Candidate: {candidate_message}"
        user_content = f"{transcript}\n{new_line}" if transcript else new_line
        user_content += (
            "\n\nRespond as the interviewer with your next question or follow-up "
            "(only the interviewer line, no prefix)."
        )
    try:
        response = get_llm().invoke([
            SystemMessage(content=system),
            HumanMessage(content=user_content),
        ])
        agent_reply = (response.content or "").strip()
    except Exception as e:
        logger.exception("Interview chat LLM failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate interviewer response.")
    return {"reply": agent_reply}


class InterviewCompleteRequest(BaseModel):
    token: str
    transcript: str


@app.post("/interview/complete")
async def interview_complete(body: InterviewCompleteRequest):
    """Store transcript, score via interview mastermind, and mark interview completed. No auth required."""
    async with get_session() as session:
        inv = (
            await session.execute(
                select(InterviewSession).where(
                    InterviewSession.interview_link_token == body.token.strip()
                )
            )
        ).scalar_one_or_none()
        if not inv:
            raise HTTPException(status_code=404, detail="Invalid or expired interview link.")
        jc = (
            await session.execute(
                select(JobCandidate).where(JobCandidate.id == inv.job_candidate_id)
            )
        ).scalar_one_or_none()
        if not jc or jc.interview_completed_at:
            raise HTTPException(status_code=400, detail="Interview already completed.")
        job = (
            await session.execute(select(Job).where(Job.id == jc.job_id))
        ).scalar_one_or_none()
        cp = (
            await session.execute(
                select(CandidateProfile).where(CandidateProfile.id == jc.candidate_profile_id)
            )
        ).scalar_one_or_none()
        if not job or not cp:
            raise HTTPException(status_code=404, detail="Job or candidate not found.")
        inv.transcript = (body.transcript or "").strip() or None
        inv.ended_at = datetime.now(timezone.utc)
        try:
            score_result = await agent_client.interview_score(
                job_description=_job_content_for_agent(job),
                resume_summary=cp.summary or "",
                transcript=body.transcript or "",
            )
            score = score_result.get("score")
            if score is not None:
                inv.score = float(score)
                jc.score = float(score)
        except Exception as e:
            logger.exception("Interview scoring failed: %s", e)
        jc.interview_completed_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(inv)
    return {"message": "Interview completed.", "score": inv.score}


@app.post("/interview/upload-recording")
async def interview_upload_recording(
    token: str = Form(...),
    file: UploadFile = File(...),
):
    """Upload interview recording (video/audio). No auth required. Token in form."""
    async with get_session() as session:
        inv = (
            await session.execute(
                select(InterviewSession).where(
                    InterviewSession.interview_link_token == token.strip()
                )
            )
        ).scalar_one_or_none()
        if not inv:
            raise HTTPException(status_code=404, detail="Invalid or expired interview link.")
        ext = Path(file.filename or "recording").suffix or ".webm"
        safe_name = f"{inv.job_candidate_id}_{inv.id}_{secrets.token_hex(4)}{ext}"
        path = RECORDINGS_DIR / safe_name
        content = await file.read()
        path.write_bytes(content)
        recording_url = f"/recordings/{safe_name}"
        inv.recording_url = recording_url
        await session.commit()
    return {"recording_url": recording_url}


# ---------- Employer / Job portal ----------
def _job_content_for_agent(job: Job) -> str:
    """Return JD as schema JSON string when available, else description_md."""
    if job.description_schema:
        return json.dumps(job.description_schema)
    return job.description_md or ""


def _job_schema_for_best_match(job: Job) -> str:
    """Return JD as schema JSON string only. Required for resume best_match (schema format only)."""
    if not job.description_schema:
        raise HTTPException(
            status_code=400,
            detail="Best match requires job with structured description (schema). Save or generate the JD in structured form first.",
        )
    return json.dumps(job.description_schema)


def _candidate_profile_for_agent(cp: CandidateProfile) -> dict[str, Any]:
    """Return full candidate profile as a JSON-serializable dict for the interview agent."""
    return {
        "full_name": cp.full_name,
        "email": cp.email,
        "phone": cp.phone,
        "address": cp.address,
        "summary": cp.summary,
        "education": cp.education or [],
        "work_experience": cp.work_experience or [],
        "skills": cp.skills if isinstance(cp.skills, list) else (cp.skills or []),
        "languages": cp.languages or [],
        "certifications": cp.certifications if isinstance(cp.certifications, list) else (cp.certifications or []),
        "interests": cp.interests or [],
        "projects": cp.projects or [],
    }


class JobCreate(BaseModel):
    title: str
    description_md: str = ""
    job_description: dict | None = None  # schema per schemas.JD_SCHEMA_JSON


class GenerateJDRequest(BaseModel):
    prompt: str


JD_GEN_SYSTEM = (
    "You are an expert HR writer. Given a short prompt describing a job (e.g. role title, company type, key skills), "
    "output a JSON object with three keys: 'title', 'description_md', and 'job_description'. "
    "1) 'title': a short job title (e.g. 'Senior Backend Engineer'). "
    "2) 'description_md': a full, readable job description in Markdown: company intro, role summary, responsibilities as bullets, "
    "requirements, preferred qualifications, compensation/benefits if relevant, and how to apply. Write it for candidates to read. "
    "3) 'job_description': a structured object with company_information (company_name, industry, website, location with city, state, country, remote), "
    "job_details (job_title, department, employment_type: Full-time/Part-time/Internship/Contract/Temporary/Freelance, "
    "experience_level: Entry/Junior/Mid/Senior/Lead/Manager, posted_date, application_deadline), "
    "summary (string), responsibilities (array of strings), requirements (education, experience_years, technical_skills, soft_skills, certifications), "
    "preferred_qualifications (array), optional compensation (salary_min, salary_max, currency, benefits), optional application_information. "
    "Use empty strings or empty arrays where not specified. Output only valid JSON, no markdown code fence or extra text."
)


@app.post("/employer/generate-jd")
async def employer_generate_jd(
    body: GenerateJDRequest,
    user: Annotated[dict, Depends(require_role("employer"))],
):
    """Generate a job description as schema JSON from a short prompt using AI."""
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required.")
    try:
        result = invoke_structured_with_retry(
            [
                SystemMessage(content=JD_GEN_SYSTEM),
                HumanMessage(content=prompt),
            ],
            GenerateJDOutput,
        )
        title = (result.title or "").strip() or "Untitled role"
        description_md = (result.description_md or "").strip() or job_description_to_markdown(
            {"job_description": result.job_description}
        )
        job_description = {"job_description": result.job_description}
        return {"title": title, "description_md": description_md, "job_description": job_description}
    except Exception as e:
        logger.exception("JD generation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/employer/jobs")
async def employer_create_job(
    body: JobCreate,
    user: Annotated[dict, Depends(require_role("employer"))],
):
    if body.job_description is not None:
        if "job_description" not in body.job_description:
            body.job_description = {"job_description": body.job_description}
        description_schema = body.job_description
        description_md = job_description_to_markdown(description_schema)
    else:
        description_schema = None
        description_md = body.description_md or ""
    async with get_session() as session:
        job = Job(
            employer_id=int(user["user_id"]),
            title=body.title,
            description_md=description_md,
            description_schema=description_schema,
            status="draft",
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return {"id": job.id, "title": job.title, "status": job.status}


@app.get("/employer/jobs")
async def employer_list_jobs(
    user: Annotated[dict, Depends(require_role("employer"))],
):
    async with get_session() as session:
        rows = (await session.execute(select(Job).where(Job.employer_id == int(user["user_id"])))).scalars().all()
        return [{"id": r.id, "title": r.title, "status": r.status, "created_at": r.created_at.isoformat()} for r in rows]


@app.get("/employer/jobs/{job_id}")
async def employer_get_job(
    job_id: int,
    user: Annotated[dict, Depends(require_role("employer"))],
):
    async with get_session() as session:
        row = (await session.execute(select(Job).where(Job.id == job_id, Job.employer_id == int(user["user_id"])))).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return {
            "id": row.id,
            "title": row.title,
            "description_md": row.description_md,
            "description_schema": row.description_schema,
            "status": row.status,
        }


class JobUpdate(BaseModel):
    title: str | None = None
    description_md: str | None = None
    job_description: dict | None = None  # schema per schemas.JD_SCHEMA_JSON


@app.put("/employer/jobs/{job_id}")
async def employer_update_job(
    job_id: int,
    body: JobUpdate,
    user: Annotated[dict, Depends(require_role("employer"))],
):
    """Update job title and/or description. Only allowed for drafts."""
    async with get_session() as session:
        row = (await session.execute(select(Job).where(Job.id == job_id, Job.employer_id == int(user["user_id"])))).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        if row.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft jobs can be edited.")
        if body.title is not None:
            row.title = body.title
        if body.job_description is not None:
            schema = body.job_description
            if "job_description" not in schema:
                schema = {"job_description": schema}
            row.description_schema = schema
            row.description_md = job_description_to_markdown(schema)
        elif body.description_md is not None:
            row.description_md = body.description_md
        await session.commit()
        await session.refresh(row)
        return {
            "id": row.id,
            "title": row.title,
            "description_md": row.description_md,
            "description_schema": row.description_schema,
            "status": row.status,
        }


@app.post("/employer/jobs/{job_id}/publish")
async def employer_publish_job(
    job_id: int,
    user: Annotated[dict, Depends(require_role("employer"))],
):
    """Publish job: ensure description_schema exists (via job description mastermind if needed), then get top 10 candidates from resume mastermind, send interview invites via interview mastermind."""
    logger.info("employer_publish_job started job_id=%s employer_id=%s", job_id, user.get("user_id"))
    async with get_session() as session:
        job = (await session.execute(select(Job).where(Job.id == job_id, Job.employer_id == int(user["user_id"])))).scalar_one_or_none()
        if not job:
            logger.warning("employer_publish_job job not found job_id=%s employer_id=%s", job_id, user.get("user_id"))
            raise HTTPException(status_code=404, detail="Job not found")
        logger.info("employer_publish_job job found id=%s title=%s status=%s", job.id, job.title, job.status)
        # Generate description_schema via job description mastermind if job has only description_md
        if not job.description_schema and (job.description_md or "").strip():
            logger.info("employer_publish_job generating description_schema via job description mastermind job_id=%s", job_id)
            result = await agent_client.job_description_generate_schema(job.description_md)
            logger.info("employer_publish_job job_description_generate_schema result keys=%s", list(result.keys()) if isinstance(result, dict) else type(result).__name__)
            if "error" in result:
                logger.warning("employer_publish_job job_description_generate_schema error job_id=%s result=%s", job_id, result)
                schema = None
            else:
                # Store full root { "job_description": { ... } } per schema
                schema = result if result.get("job_description") else None
                if schema:
                    job.description_schema = schema
                    job.description_md = job_description_to_markdown(schema)
                    await session.flush()
                    logger.info("employer_publish_job description_schema stored and description_md updated job_id=%s", job_id)
                else:
                    logger.info("employer_publish_job no job_description in result, schema not stored job_id=%s", job_id)
        else:
            logger.info("employer_publish_job skipping schema generation job_id=%s has_schema=%s has_md=%s", job_id, bool(job.description_schema), bool((job.description_md or "").strip()))
        # Fetch all candidate profiles for best_match
        profiles = (await session.execute(select(CandidateProfile))).scalars().all()
        logger.info("employer_publish_job fetched %s candidate profiles for best_match job_id=%s", len(profiles), job_id)
        candidates_payload = [
            {
                "id": p.id,
                "full_name": p.full_name,
                "email": p.email,
                "skills": p.skills or [],
                "work_experience": p.work_experience or [],
                "education": p.education or [],
            }
            for p in profiles
        ]
        job_schema = _job_schema_for_best_match(job)
        logger.info("employer_publish_job calling resume_best_match job_id=%s candidates_count=%s", job_id, len(candidates_payload))
        top = await agent_client.resume_best_match(job_schema, candidates_payload)
        top_5 = top.get("top_5") or top.get("top_10") or []
        if len(top_5) > 5:
            top_5 = top_5[:5]
        logger.info("employer_publish_job resume_best_match returned top_5 count=%s job_id=%s raw_keys=%s", len(top_5), job_id, list(top.keys()))
        # Create JobCandidate and InterviewSession placeholders; interview mastermind will send emails
        created = 0
        skipped = 0
        for i, entry in enumerate(top_5):
            profile_id = entry.get("profile_id") or entry.get("id")
            rank = entry.get("rank", i + 1)
            cand = (await session.execute(select(CandidateProfile).where(CandidateProfile.id == profile_id))).scalar_one_or_none()
            if not cand:
                logger.warning("employer_publish_job candidate not found profile_id=%s rank=%s job_id=%s", profile_id, rank, job_id)
                skipped += 1
                continue
            jc = JobCandidate(
                job_id=job.id,
                candidate_profile_id=cand.id,
                rank=rank,
                invited_at=job.created_at,
            )
            session.add(jc)
            await session.flush()
            token = secrets.token_urlsafe(32)
            inv = InterviewSession(job_candidate_id=jc.id, interview_link_token=token)
            session.add(inv)
            created += 1
            logger.info("employer_publish_job created JobCandidate jc_id=%s candidate_id=%s rank=%s job_id=%s", jc.id, cand.id, rank, job_id)
        logger.info("employer_publish_job JobCandidate/InterviewSession created=%s skipped=%s job_id=%s", created, skipped, job_id)
        job.status = "published"
        await session.commit()
        logger.info("employer_publish_job committed job status=published job_id=%s", job_id)

        # Send "job opportunity" emails (job + profile); candidates see open opportunities in UI and swipe right to get interview link
        async with get_session() as session2:
            job_row = (await session2.execute(select(Job).where(Job.id == job_id))).scalar_one_or_none()
            jd_md = (job_row.description_md or "") if job_row else ""
            jc_list = (await session2.execute(select(JobCandidate).where(JobCandidate.job_id == job_id))).scalars().all()
            logger.info("employer_publish_job email phase job_id=%s jc_count=%s jd_md_len=%s", job_id, len(jc_list), len(jd_md))
            infos = []
            for jc in jc_list:
                cp = (await session2.execute(select(CandidateProfile).where(CandidateProfile.id == jc.candidate_profile_id))).scalar_one_or_none()
                if not cp or not cp.email:
                    if not cp:
                        logger.warning("employer_publish_job email skip: candidate profile not found jc_id=%s", jc.id)
                    elif not cp.email:
                        logger.warning("employer_publish_job email skip: candidate has no email profile_id=%s", cp.id)
                    continue
                infos.append({
                    "email": cp.email,
                    "full_name": cp.full_name or "Candidate",
                    "profile_summary": cp.summary or "",
                })
            logger.info("employer_publish_job sending interview_send_potential_match job_id=%s job_title=%s candidate_infos_count=%s", job_id, job.title, len(infos))
            await agent_client.interview_send_potential_match(
                job_title=job.title,
                job_description_md=jd_md,
                candidate_infos=infos,
            )
            logger.info("employer_publish_job interview_send_potential_match completed job_id=%s", job_id)
    logger.info("employer_publish_job finished job_id=%s", job_id)
    return {"message": "Job published. Top candidates notified; they can view opportunities in the app and swipe right to get their interview link."}


@app.post("/employer/jobs/{job_id}/reinvite")
async def employer_reinvite_candidates(
    job_id: int,
    user: Annotated[dict, Depends(require_role("employer"))],
):
    """Re-send 'potential match' emails to all candidates already invited for this published job."""
    async with get_session() as session:
        job = (await session.execute(select(Job).where(Job.id == job_id, Job.employer_id == int(user["user_id"])))).scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status != "published":
            raise HTTPException(status_code=400, detail="Only published jobs can reinvite candidates.")
        jc_list = (await session.execute(select(JobCandidate).where(JobCandidate.job_id == job_id))).scalars().all()
        infos = []
        for jc in jc_list:
            cp = (await session.execute(select(CandidateProfile).where(CandidateProfile.id == jc.candidate_profile_id))).scalar_one_or_none()
            if not cp or not cp.email:
                continue
            infos.append({
                "email": cp.email,
                "full_name": cp.full_name or "Candidate",
                "profile_summary": cp.summary or "",
            })
        if not infos:
            return {"message": "No candidates with email to reinvite."}
        await agent_client.interview_send_potential_match(
            job_title=job.title,
            job_description_md=job.description_md or "",
            candidate_infos=infos,
        )
    return {"message": "Reinvite emails sent to candidates."}


@app.post("/employer/jobs/{job_id}/finalize")
async def employer_finalize_job(
    job_id: int,
    user: Annotated[dict, Depends(require_role("employer"))],
):
    """After all interviews or deadline: score any remaining, pick top 3, send to JD mastermind.
    Stores all 10 candidates with interview recording + transcript and highlights top 3."""
    async with get_session() as session:
        job = (
            await session.execute(
                select(Job).where(Job.id == job_id, Job.employer_id == int(user["user_id"]))
            )
        ).scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        jc_list = (
            await session.execute(
                select(JobCandidate, InterviewSession, CandidateProfile)
                .outerjoin(InterviewSession, InterviewSession.job_candidate_id == JobCandidate.id)
                .join(CandidateProfile, CandidateProfile.id == JobCandidate.candidate_profile_id)
                .where(JobCandidate.job_id == job_id)
                .order_by(JobCandidate.id)
            )
        ).all()
    candidates_payload = []
    scored = [(jc, inv, cp) for jc, inv, cp in jc_list if jc.interview_completed_at and (inv and inv.transcript)]
    for jc, inv, cp in scored:
        candidates_payload.append({
            "job_candidate_id": jc.id,
            "profile_id": cp.id,
            "full_name": cp.full_name or "Candidate",
            "email": cp.email or "",
            "recording_url": (inv.recording_url if inv else None) or "",
            "transcript": (inv.transcript if inv else None) or "",
            "score": jc.score,
            "selected_top_3": False,
        })
    sorted_by_score = sorted(candidates_payload, key=lambda c: (c["score"] or 0), reverse=True)
    top_3 = sorted_by_score[:3]
    top_3_ids = [c["profile_id"] for c in top_3]
    for c in candidates_payload:
        c["selected_top_3"] = c["profile_id"] in top_3_ids
    if not candidates_payload:
        raise HTTPException(
            status_code=400,
            detail="No completed interviews to finalize. Candidates must complete their video interviews first.",
        )
    async with get_session() as session:
        jc_rows = (
            await session.execute(select(JobCandidate).where(JobCandidate.job_id == job_id))
        ).scalars().all()
        for jc in jc_rows:
            jc.selected_top_3 = jc.candidate_profile_id in top_3_ids
        await session.commit()
    try:
        await agent_client.job_description_store_interview_results(
            job_id=job.id,
            job_title=job.title or "",
            candidates=candidates_payload,
            top_3_ids=top_3_ids,
        )
    except Exception as e:
        logger.exception("JD mastermind store_interview_results failed: %s", e)
    async with get_session() as session:
        job = (
            await session.execute(
                select(Job).where(Job.id == job_id, Job.employer_id == int(user["user_id"]))
            )
        ).scalar_one_or_none()
        if job:
            job.status = "closed"
            await session.commit()
    return {
        "message": "Job finalized. Top 3 candidates highlighted; results sent to job description mastermind.",
        "top_3": [c["full_name"] for c in top_3],
    }


def _extract_text_pdf(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_text_docx(content: bytes) -> str:
    if DocxDocument is None:
        raise HTTPException(
            status_code=501,
            detail="DOCX support requires python-docx. Install with: pip install python-docx",
        )
    doc = DocxDocument(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs)


@app.post("/agent/extract-resume")
async def extract_resume(file: UploadFile = File(...)):
    """
    Upload a resume file (PDF or DOCX); returns extracted plain text.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_RESUME_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_RESUME_EXTENSIONS)}",
        )
    content = await file.read()
    if len(content) > MAX_RESUME_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {MAX_RESUME_SIZE_MB} MB",
        )
    try:
        if suffix == ".pdf":
            text = _extract_text_pdf(content)
        else:
            text = _extract_text_docx(content)
    except Exception as e:
        logger.exception("Resume extraction failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {e}") from e
    return {"text": text, "filename": file.filename}


# Run the FastAPI server using uvicorn (from repo root: python exchange/main.py)
if __name__ == "__main__":
    uvicorn.run("exchange.main:app", host="0.0.0.0", port=8000, reload=True)