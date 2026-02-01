# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from ioa_observe.sdk.decorators import agent

from common.llm import get_llm

logger = logging.getLogger("corto.resume_mastermind.agent")

EXTRACT_SYSTEM = (
    "You are a resume parsing expert. Given raw resume text, extract structured data as JSON with keys: "
    "name, email, phone (if present), skills (list), experience (list of {role, company, duration, summary}), "
    "education (list of {degree, institution, year}). Return ONLY valid JSON, no markdown or extra text."
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

    async def ingest_resume(self, resume_text: str) -> str:
        """Extract structured data from resume text and store it. Returns summary."""
        messages = [
            SystemMessage(content=EXTRACT_SYSTEM),
            HumanMessage(content=resume_text),
        ]
        response = get_llm().invoke(messages)
        content = response.content.strip()
        # Strip markdown code block if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        try:
            data = json.loads(content)
            self._resumes.append(data)
            name = data.get("name", "Unknown")
            return f"Resume ingested for: {name}. Total resumes stored: {len(self._resumes)}."
        except json.JSONDecodeError:
            logger.warning("LLM did not return valid JSON, storing as raw.")
            self._resumes.append({"raw": resume_text[:500], "name": "Unknown"})
            return f"Resume stored (raw). Total resumes stored: {len(self._resumes)}."

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
            result = await self.ingest_resume(text)
            return {"result": result}
        if action == "best_match":
            jd = data.get("job_description", "")
            if not jd:
                return {"error": "Missing job_description for best_match."}
            result = await self.best_match(jd)
            return {"result": result}
        return {"error": f"Unknown action: {action}. Use 'ingest_resume' or 'best_match'."}
