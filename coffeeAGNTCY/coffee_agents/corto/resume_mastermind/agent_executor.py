# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import json
import logging

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import (
    UnsupportedOperationError,
    JSONRPCResponse,
    ContentTypeNotSupportedError,
    InternalError,
    Task,
)
from a2a.utils import new_agent_text_message, new_task
from a2a.utils.errors import ServerError

from resume_mastermind.agent import ResumeMastermindAgent

logger = logging.getLogger("corto.resume_mastermind.a2a_executor")


class ResumeMastermindExecutor(AgentExecutor):
    def __init__(self):
        self.agent = ResumeMastermindAgent()

    def _validate_request(self, context: RequestContext) -> JSONRPCResponse | None:
        if not context or not context.message or not context.message.parts:
            logger.error("Invalid request parameters: %s", context)
            return JSONRPCResponse(error=ContentTypeNotSupportedError())
        return None

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        logger.info("Received message request: %s", context.message)

        validation_error = self._validate_request(context)
        if validation_error:
            await event_queue.enqueue_event(validation_error)
            return

        payload = context.get_user_input()
        if not payload:
            await event_queue.enqueue_event(
                new_agent_text_message("No payload provided. Send JSON with 'action' and required fields.")
            )
            return

        task = context.current_task
        if not task:
            task = new_task(context.message)
            await event_queue.enqueue_event(task)

        try:
            output = await self.agent.ainvoke(payload)
            if output.get("error"):
                await event_queue.enqueue_event(
                    new_agent_text_message(output["error"])
                )
                return
            # For ingest_resume, return full JSON (result, resume, profile) so exchange gets profile in schema format
            try:
                data = json.loads(payload) if isinstance(payload, str) else payload
            except (json.JSONDecodeError, TypeError):
                data = {}
            if data.get("action") == "ingest_resume":
                await event_queue.enqueue_event(
                    new_agent_text_message(json.dumps(output))
                )
            else:
                await event_queue.enqueue_event(
                    new_agent_text_message(output.get("result", ""))
                )
        except Exception as e:
            logger.exception("Resume mastermind execution failed: %s", e)
            raise ServerError(error=InternalError()) from e

    async def cancel(
        self, request: RequestContext, event_queue: EventQueue
    ) -> Task | None:
        raise ServerError(error=UnsupportedOperationError())
