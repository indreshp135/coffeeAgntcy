# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from ioa_observe.sdk.decorators import agent

from common.llm import get_llm

logger = logging.getLogger("corto.interview_mastermind.agent")

SYSTEM_PROMPT = (
    "You are an expert interview designer. Given a job description and a candidate's resume (or summary), "
    "generate 5–8 tailored interview questions that assess fit for the role. Mix behavioral, situational, "
    "and role-specific questions. Return a numbered list of questions only, no preamble."
)


@agent(name="interview_mastermind_agent")
class InterviewMastermindAgent:
    async def prepare_questions(self, job_description: str, resume_or_summary: str) -> str:
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(
                content=f"Job description:\n{job_description}\n\nCandidate resume/summary:\n{resume_or_summary}"
            ),
        ]
        response = get_llm().invoke(messages)
        return response.content.strip()

    async def ainvoke(self, payload: str) -> dict[str, Any]:
        """
        payload: JSON with job_description and resume_text (or candidate_summary).
        """
        try:
            data = json.loads(payload) if isinstance(payload, str) else payload
        except json.JSONDecodeError:
            return {
                "error": "Invalid JSON. Provide job_description and resume_text (or candidate_summary)."
            }

        jd = data.get("job_description", "")
        resume = data.get("resume_text") or data.get("candidate_summary", "")
        if not jd or not resume:
            return {"error": "Missing job_description or resume_text/candidate_summary."}

        result = await self.prepare_questions(jd, resume)
        return {"result": result}
