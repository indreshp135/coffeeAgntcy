# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import json
import logging
from uuid import uuid4
from typing import Any

from agntcy_app_sdk.factory import AgntcyFactory

# In-memory store for interview results (job_id -> payload) for retrieval / reporting
_interview_results_store: dict[int, dict[str, Any]] = {}
from agntcy_app_sdk.semantic.a2a.protocol import A2AProtocol
from a2a.types import (
    SendMessageRequest,
    MessageSendParams,
    Message,
    Part,
    TextPart,
    Role,
)

from config.config import DEFAULT_MESSAGE_TRANSPORT, TRANSPORT_SERVER_ENDPOINT
from resume_mastermind.card import AGENT_CARD as resume_agent_card
from interview_mastermind.card import AGENT_CARD as interview_agent_card

from ioa_observe.sdk.decorators import agent

logger = logging.getLogger("corto.job_description_mastermind.agent")


@agent(name="job_description_mastermind_agent")
class JobDescriptionMastermindAgent:
    def __init__(self, factory: AgntcyFactory):
        self.factory = factory

    async def _send_to_agent(self, agent_card: Any, payload: dict) -> str:
        """Send JSON payload to an A2A agent and return the text response."""
        topic = A2AProtocol.create_agent_topic(agent_card)
        transport = self.factory.create_transport(
            DEFAULT_MESSAGE_TRANSPORT,
            endpoint=TRANSPORT_SERVER_ENDPOINT,
            name="default/default/job-description-mastermind",
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

    async def ainvoke(self, payload: str) -> dict[str, Any]:
        """
        payload: JSON with either:
        - job_description (+ optionally schedule_interview): best_match + interview questions.
        - action "store_interview_results": store all 10 candidates with recordings and top 3 highlighted.
        """
        try:
            data = json.loads(payload) if isinstance(payload, str) else payload
        except json.JSONDecodeError:
            return {
                "error": "Invalid JSON. Provide job_description or action store_interview_results."
            }

        if data.get("action") == "store_interview_results":
            job_id = data.get("job_id")
            job_title = data.get("job_title", "")
            candidates = data.get("candidates", [])
            top_3_ids = data.get("top_3_ids", [])
            if job_id is None:
                return {"error": "Missing job_id for store_interview_results."}
            _interview_results_store[int(job_id)] = {
                "job_id": job_id,
                "job_title": job_title,
                "candidates": candidates,
                "top_3_ids": top_3_ids,
            }
            logger.info(
                "Stored interview results for job_id=%s: %d candidates, top_3=%s",
                job_id,
                len(candidates),
                top_3_ids,
            )
            return {
                "result": f"Stored {len(candidates)} candidates for job '{job_title}' (job_id={job_id}) with top 3 highlighted."
            }

        jd = data.get("job_description", "")
        schedule_interview = data.get("schedule_interview", True)
        if not jd:
            return {"error": "Missing job_description."}

        try:
            best_matches = await self._send_to_agent(
                resume_agent_card,
                {"action": "best_match", "job_description": jd},
            )
        except Exception as e:
            logger.exception("Resume Mastermind call failed: %s", e)
            return {"error": f"Failed to get best matches: {e}"}

        if not schedule_interview:
            return {"result": f"Best matches for this job:\n\n{best_matches}"}

        try:
            questions = await self._send_to_agent(
                interview_agent_card,
                {
                    "job_description": jd,
                    "candidate_summary": best_matches,
                },
            )
        except Exception as e:
            logger.exception("Interview Mastermind call failed: %s", e)
            return {
                "result": f"Best matches:\n\n{best_matches}\n\n(Interview questions could not be generated: {e})"
            }

        result = (
            f"Best matches for this job:\n\n{best_matches}\n\n"
            f"Interview questions for top candidate(s):\n\n{questions}"
        )
        return {"result": result}
