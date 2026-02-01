# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import json
import logging
import os
from typing import Any
from uuid import uuid4

from agntcy_app_sdk.factory import AgntcyFactory
from agntcy_app_sdk.semantic.a2a.protocol import A2AProtocol
from a2a.types import (
    SendMessageRequest,
    MessageSendParams,
    Message,
    Part,
    TextPart,
    Role,
)
from langchain_core.messages import HumanMessage, SystemMessage

from config.config import DEFAULT_MESSAGE_TRANSPORT, TRANSPORT_SERVER_ENDPOINT
from resume_mastermind.card import AGENT_CARD as resume_agent_card
from job_description_mastermind.card import AGENT_CARD as job_description_agent_card
from interview_mastermind.card import AGENT_CARD as interview_agent_card
from common.llm import (
    invoke_structured_with_retry,
    JobDescriptionExtractOutput,
    RankingOutput,
    InterviewScoreOutput,
)
from schemas import JD_SCHEMA_JSON, resume_schema_to_profile
from exchange.email_sendgrid import (
    send_job_opportunity_email,
    send_interview_link_email,
)

logger = logging.getLogger("corto.exchange.services")

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")


class AgentClient:
    """Client for resume, job description, and interview masterminds; plus SendGrid emails and in-exchange LLM for ranking/scoring."""

    def __init__(self, factory: AgntcyFactory):
        self.factory = factory

    async def _send_to_agent(self, agent_card: Any, payload: dict) -> str:
        topic = A2AProtocol.create_agent_topic(agent_card)
        transport = self.factory.create_transport(
            DEFAULT_MESSAGE_TRANSPORT,
            endpoint=TRANSPORT_SERVER_ENDPOINT,
            name="default/default/exchange",
        )
        client = await self.factory.create_client(
            "A2A",
            agent_topic=topic,
            transport=transport,
        )
        request = SendMessageRequest(
            id=str(uuid4()),
            params=MessageSendParams(
                message=Message(
                    message_id=str(uuid4()),
                    role=Role.user,
                    parts=[Part(TextPart(text=json.dumps(payload)))],
                )
            ),
        )
        response = await client.send_message(request)
        if response.root.result and response.root.result.parts:
            part = response.root.result.parts[0].root
            if hasattr(part, "text"):
                return part.text
        if response.root.error:
            raise RuntimeError(f"A2A error: {response.root.error.message}")
        return ""

    async def resume_ingest(self, resume_text: str) -> dict[str, Any]:
        """Call resume mastermind ingest_resume; return {result, profile}."""
        payload = {"action": "ingest_resume", "resume_text": resume_text}
        try:
            raw = await self._send_to_agent(resume_agent_card, payload)
            if isinstance(raw, str) and raw.strip():
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError as e:
                    logger.warning(
                        "Resume ingest response was not valid JSON (agent may need restart). raw[:300]=%r err=%s",
                        raw[:300] if raw else "",
                        e,
                    )
                    data = {}
            else:
                data = {}
        except Exception as e:
            logger.exception("Resume mastermind ingest failed: %s", e)
            return {"result": str(e), "profile": None, "resume": None}
        if "error" in data:
            return {"result": data["error"], "profile": None, "resume": None}
        resume_schema = data.get("resume")
        profile = data.get("profile")
        # Ensure profile is always in schema format: derive from resume when missing/empty
        if not profile or not isinstance(profile, dict):
            profile = resume_schema_to_profile(resume_schema or {})
        return {
            "result": data.get("result", "Resume ingested."),
            "profile": profile,
            "resume": resume_schema,
        }

    async def resume_best_match(self, job_schema_str: str, candidates_payload: list[dict]) -> dict[str, Any]:
        """Rank candidates by job fit; return top_5 (or top_10) with profile_id and rank. Uses LLM in exchange."""
        if not candidates_payload:
            return {"top_10": [], "top_5": []}
        limit = 5
        system = (
            "You are an HR matching expert. Given a job description (JSON or text) and a list of candidates "
            "(each with id, full_name, skills, work_experience, education), rank them by fit (1 = best). "
            "Return only the top 5 as a 'ranked' array of objects with 'profile_id' (integer, the candidate id) and 'rank' (1-based integer)."
        )
        candidates_json = json.dumps(candidates_payload, indent=0)[:6000]
        user = f"Job description:\n{job_schema_str[:4000]}\n\nCandidates:\n{candidates_json}"
        try:
            result = invoke_structured_with_retry(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=user),
                ],
                RankingOutput,
            )
            top = [{"profile_id": r.profile_id, "rank": r.rank} for r in result.ranked[:limit]]
            return {"top_10": top, "top_5": top}
        except Exception as e:
            logger.exception("Resume best_match LLM failed: %s", e)
            return {"top_10": [{"profile_id": c.get("id"), "rank": i + 1} for i, c in enumerate(candidates_payload[:limit])], "top_5": []}

    async def interview_prepare_questions(self, job_content: str, profile_summary: str) -> str:
        payload = {"job_description": job_content, "resume_text": profile_summary}
        try:
            raw = await self._send_to_agent(interview_agent_card, payload)
            if isinstance(raw, str) and raw.strip():
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    data = {}
            else:
                data = {}
        except Exception as e:
            logger.exception("Interview mastermind prepare_questions failed: %s", e)
            return ""
        if "error" in data:
            return ""
        return data.get("result", "")

    async def interview_send_invites(
        self,
        job_id: int,
        job_title: str,
        job_description_md: str,
        candidate_infos: list[dict],
    ) -> None:
        """Send interview link email to each candidate via SendGrid."""
        base = (FRONTEND_BASE_URL or "").rstrip("/")
        for info in candidate_infos:
            email = info.get("email")
            if not email:
                continue
            token = info.get("interview_link_token")
            link = f"{base}/interview?token={token}" if (base and token) else (base or "about:blank")
            send_interview_link_email(
                to_email=email,
                full_name=info.get("full_name") or "Candidate",
                job_title=job_title or "Interview",
                interview_link=link,
            )

    async def interview_send_potential_match(
        self,
        job_title: str,
        job_description_md: str,
        candidate_infos: list[dict],
    ) -> None:
        """Send job opportunity email (job + profile) to each candidate via SendGrid."""
        for info in candidate_infos:
            email = info.get("email")
            if not email:
                continue
            send_job_opportunity_email(
                to_email=email,
                full_name=info.get("full_name") or "Candidate",
                job_title=job_title or "Job opportunity",
                job_description_md=job_description_md or "",
                profile_summary=info.get("profile_summary") or "",
            )

    async def job_description_generate_schema(self, description_md: str) -> dict[str, Any] | None:
        """Extract structured job_description schema from markdown using LLM. Output conforms to JD schema."""
        system = (
            "You are an HR expert. Given a job description in markdown, extract structured data that strictly "
            "follows this schema. The root object must have exactly one key 'job_description' whose value is an object with: "
            "company_information (company_name, industry, website, location with city, state, country, remote), "
            "job_details (job_title, department, employment_type from enum Full-time/Part-time/Internship/Contract/Temporary/Freelance, "
            "experience_level from Entry/Junior/Mid/Senior/Lead/Manager, posted_date, application_deadline), "
            "summary, responsibilities (array of strings), requirements (technical_skills array required; education, experience_years, soft_skills, certifications optional), "
            "preferred_qualifications (array), optional compensation, optional application_information. "
            "Use empty strings or empty arrays where not specified.\n\n"
            f"Schema:\n{JD_SCHEMA_JSON}"
        )
        try:
            result = invoke_structured_with_retry(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=description_md[:8000]),
                ],
                JobDescriptionExtractOutput,
            )
            return {"job_description": result.job_description}
        except Exception as e:
            logger.exception("JD generate_schema failed: %s", e)
            return None

    async def interview_score(
        self,
        job_description: str,
        resume_summary: str,
        transcript: str,
    ) -> dict[str, Any]:
        """Score interview transcript; return {score: float}."""
        system = (
            "You are an interview evaluator. Given the job description, candidate summary, and interview transcript, "
            "output a score from 0 to 100."
        )
        user = f"Job:\n{job_description[:2000]}\n\nCandidate summary:\n{resume_summary[:1000]}\n\nTranscript:\n{transcript[:4000]}"
        try:
            result = invoke_structured_with_retry(
                [
                    SystemMessage(content=system),
                    HumanMessage(content=user),
                ],
                InterviewScoreOutput,
            )
            return {"score": result.score}
        except Exception as e:
            logger.exception("Interview score failed: %s", e)
            return {}

    async def job_description_store_interview_results(
        self,
        job_id: int,
        job_title: str,
        candidates: list[dict],
        top_3_ids: list[int],
    ) -> None:
        """Send all selected candidates with interview recordings and top 3 highlighted to JD mastermind."""
        payload = {
            "action": "store_interview_results",
            "job_id": job_id,
            "job_title": job_title,
            "candidates": candidates,
            "top_3_ids": top_3_ids,
        }
        try:
            await self._send_to_agent(job_description_agent_card, payload)
        except Exception as e:
            logger.exception("JD mastermind store_interview_results failed: %s", e)
            raise
