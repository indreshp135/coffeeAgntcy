# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import json
import logging
from uuid import uuid4
from typing import Any

from ioa_observe.sdk.decorators import agent
from agntcy_app_sdk.factory import AgntcyFactory
from agntcy_app_sdk.semantic.a2a.protocol import A2AProtocol
from config.config import DEFAULT_MESSAGE_TRANSPORT, TRANSPORT_SERVER_ENDPOINT
from langchain_core.messages import HumanMessage, SystemMessage
from common.llm import get_llm
from a2a.types import (
    SendMessageRequest,
    MessageSendParams,
    Message,
    Part,
    TextPart,
    Role,
)

from resume_mastermind.card import AGENT_CARD as resume_agent_card
from job_description_mastermind.card import AGENT_CARD as job_description_agent_card
from interview_mastermind.card import AGENT_CARD as interview_agent_card

logger = logging.getLogger("corto.exchange.agent")

tools = [
    {
        "type": "function",
        "function": {
            "name": "call_resume_mastermind",
            "description": "Use for: (1) ingesting a resume (extract and store), or (2) finding who has maximum match for a job description. Use action 'ingest_resume' with resume_text, or action 'best_match' with job_description.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["ingest_resume", "best_match"],
                        "description": "ingest_resume to store a resume, best_match to get best candidates for a job",
                    },
                    "resume_text": {
                        "type": "string",
                        "description": "Raw resume text (required when action is ingest_resume)",
                    },
                    "job_description": {
                        "type": "string",
                        "description": "Job description text (required when action is best_match)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "call_job_description_mastermind",
            "description": "Use when user provides a job description and wants best candidates and/or interview scheduling. Gets best resumes from Resume Mastermind and can request Interview Mastermind to prepare questions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_description": {
                        "type": "string",
                        "description": "The job description text",
                    },
                    "schedule_interview": {
                        "type": "boolean",
                        "description": "If true, also get interview questions for top candidate(s). Default true.",
                    },
                },
                "required": ["job_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "call_interview_mastermind",
            "description": "Use when user wants interview questions prepared for a specific candidate and job. Provide job description and the candidate's resume or summary.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_description": {"type": "string", "description": "Job description"},
                    "resume_text": {
                        "type": "string",
                        "description": "Candidate resume text or summary",
                    },
                },
                "required": ["job_description", "resume_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "a2a_client_send_message",
            "description": "Processes user prompts about coffee flavor, taste or sensory profile (legacy).",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "The user prompt"},
                },
                "required": ["prompt"],
            },
        },
    },
]

system_prompt = (
    "You are a routing assistant for recruitment and coffee-flavor requests.\n"
    "Route as follows:\n"
    "- Resume ingestion (user pastes a resume to store) or 'who best matches this job description?' -> call_resume_mastermind with action ingest_resume (and resume_text) or best_match (and job_description).\n"
    "- User gives a job description and wants best candidates and/or interview prep/scheduling -> call_job_description_mastermind with job_description and schedule_interview (true/false).\n"
    "- User wants interview questions for a specific candidate and job -> call_interview_mastermind with job_description and resume_text (candidate resume or summary).\n"
    "- Questions about coffee flavor, taste or sensory profile -> a2a_client_send_message with the prompt.\n"
    "Otherwise respond: 'I can help with: resume ingestion, best match for job description, job description workflow (best candidates + interview prep), interview question preparation, or coffee flavor/taste questions.'"
)


@agent(name="exchange_agent")
class ExchangeAgent:
    def __init__(self, factory: AgntcyFactory):
        self.factory = factory

    async def _send_to_agent(self, agent_card: Any, payload: dict) -> str:
        """Send JSON payload to an A2A agent and return the text response."""
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
            raise ValueError(f"A2A error: {response.root.error.message}")
        return ""

    async def execute_agent_with_llm(self, user_prompt: str) -> str:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        response = get_llm().invoke(messages, tools=tools)

        if hasattr(response, "tool_calls") and response.tool_calls:
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call.get("args", {})
                logger.info("Tool called: %s with %s", tool_name, tool_args)

                if tool_name == "call_resume_mastermind":
                    action = tool_args.get("action")
                    if action == "ingest_resume":
                        payload = {
                            "action": "ingest_resume",
                            "resume_text": tool_args.get("resume_text", ""),
                        }
                    else:
                        payload = {
                            "action": "best_match",
                            "job_description": tool_args.get("job_description", ""),
                        }
                    result = await self._send_to_agent(resume_agent_card, payload)
                    return result

                if tool_name == "call_job_description_mastermind":
                    payload = {
                        "job_description": tool_args.get("job_description", ""),
                        "schedule_interview": tool_args.get(
                            "schedule_interview", True
                        ),
                    }
                    result = await self._send_to_agent(
                        job_description_agent_card, payload
                    )
                    return result

                if tool_name == "call_interview_mastermind":
                    payload = {
                        "job_description": tool_args.get("job_description", ""),
                        "resume_text": tool_args.get("resume_text", ""),
                    }
                    result = await self._send_to_agent(
                        interview_agent_card, payload
                    )
                    return result

                if tool_name == "a2a_client_send_message":
                    return await self.a2a_client_send_message(
                        tool_args.get("prompt", "")
                    )

        return response.content if hasattr(response, "content") else str(response)

    async def a2a_client_send_message(self, prompt: str) -> str:
        """Send plain-text prompt to the farm (coffee flavor) agent."""
        topic = A2AProtocol.create_agent_topic(farm_agent_card)
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
                    parts=[Part(TextPart(text=prompt))],
                )
            ),
        )
        response = await client.send_message(request)
        if response.root.result and response.root.result.parts:
            part = response.root.result.parts[0].root
            if hasattr(part, "text"):
                return part.text
        if response.root.error:
            raise ValueError(f"A2A error: {response.root.error.message}")
        return ""
