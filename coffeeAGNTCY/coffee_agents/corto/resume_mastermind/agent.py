# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from ioa_observe.sdk.decorators import agent

from common.llm import get_llm, invoke_structured_with_retry, ResumeExtractOutput
from schemas import RESUME_SCHEMA_JSON, resume_schema_to_profile

logger = logging.getLogger("corto.resume_mastermind.agent")

EXTRACT_SYSTEM_TEMPLATE = (
    "You are a resume parsing expert. Given raw resume text, extract structured data as JSON that strictly "
    "follows this schema. The root object must have exactly one key 'resume' whose value is an object with: "
    "personal_information (name, email, phone, address with street, city, state, zip_code, country), "
    "education (array of {{degree, major, school, graduation_year}}), "
    "work_experience (array of {{position, company, start_date, end_date or null, responsibilities array}}), "
    "skills (array of strings), summary (string), additional_details (languages, certifications, interests arrays). "
    "Use empty strings or empty arrays where not specified. Return ONLY valid JSON, no markdown or extra text.\n\n"
    "Schema:\n{schema}"
)

MATCH_SYSTEM = (
    "You are an HR matching expert. You have a list of candidate profiles (each with name, skills, experience) "
    "and a job description. Rank the candidates by fit (1 = best) and return a brief summary: "
    "for each candidate give rank, name, and 1-2 sentence match rationale. "
    "Return plain text, no JSON. If no candidates exist, say 'No resumes stored yet. Ingest resumes first.'"
)


@agent(name="resume_mastermind_agent")
class ResumeMastermindAgent:
    def __init__(self):
        self._resumes: list[dict[str, Any]] = []

    async def ingest_resume(self, resume_text: str) -> tuple[str, dict[str, Any] | None, dict[str, Any] | None]:
        """Extract structured data from resume text. Returns (summary, resume_schema, profile_dict)."""
        messages = [
            SystemMessage(content=EXTRACT_SYSTEM_TEMPLATE.format(schema=RESUME_SCHEMA_JSON)),
            HumanMessage(content=resume_text),
        ]
        try:
            result = invoke_structured_with_retry(messages, ResumeExtractOutput)
            data = {"resume": result.resume}
            self._resumes.append(data)
            profile = resume_schema_to_profile(data)
            name = profile.get("full_name") or "Unknown"
            return (
                f"Resume ingested for: {name}. Total resumes stored: {len(self._resumes)}.",
                data,
                profile,
            )
        except Exception as e:
            logger.warning("Structured resume extraction failed, storing as raw: %s", e)
            self._resumes.append({"resume": {"personal_information": {"name": "Unknown"}, "raw": resume_text[:500]}})
            return f"Resume stored (raw). Total resumes stored: {len(self._resumes)}.", None, None

    async def best_match(self, job_description: str) -> str:
        """Return best-matching candidates for the job description."""
        if not self._resumes:
            return "No resumes stored yet. Ingest resumes first."
        candidates_summary = json.dumps(self._resumes, indent=0)[:8000]
        messages = [
            SystemMessage(content=MATCH_SYSTEM),
            HumanMessage(
                content=f"Job description:\n{job_description}\n\nCandidates:\n{candidates_summary}"
            ),
        ]
        response = get_llm().invoke(messages)
        return response.content.strip()

    async def ainvoke(self, payload: str) -> dict[str, Any]:
        """
        payload: JSON string with action and args.
        - {"action": "ingest_resume", "resume_text": "..."}
        - {"action": "best_match", "job_description": "..."}
        """
        try:
            data = json.loads(payload) if isinstance(payload, str) else payload
        except json.JSONDecodeError:
            return {"error": "Invalid JSON payload. Use action 'ingest_resume' or 'best_match' with appropriate fields."}

        action = data.get("action")
        if action == "ingest_resume":
            text = data.get("resume_text", "")
            if not text:
                return {"error": "Missing resume_text for ingest_resume."}
            result, resume_schema, profile = await self.ingest_resume(text)
            # Ensure JSON-serializable dicts for A2A response (exchange expects same format as schema)
            def _plain(d: dict[str, Any] | None) -> dict[str, Any] | None:
                if d is None:
                    return None
                try:
                    return json.loads(json.dumps(d, default=str))
                except (TypeError, ValueError):
                    return None
            return {
                "result": result,
                "resume": _plain(resume_schema),
                "profile": _plain(profile),
            }
        if action == "best_match":
            jd = data.get("job_description", "")
            if not jd:
                return {"error": "Missing job_description for best_match."}
            result = await self.best_match(jd)
            return {"result": result}
        return {"error": f"Unknown action: {action}. Use 'ingest_resume' or 'best_match'."}
