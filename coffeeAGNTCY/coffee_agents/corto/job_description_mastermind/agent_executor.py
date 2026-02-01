# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

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
from agntcy_app_sdk.factory import AgntcyFactory

from job_description_mastermind.agent import JobDescriptionMastermindAgent

logger = logging.getLogger("corto.job_description_mastermind.a2a_executor")


class JobDescriptionMastermindExecutor(AgentExecutor):
    def __init__(self, factory: AgntcyFactory):
        self.agent = JobDescriptionMastermindAgent(factory)

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
                new_agent_text_message(
                    "No payload. Send JSON with job_description and optionally schedule_interview."
                )
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
            await event_queue.enqueue_event(
                new_agent_text_message(output.get("result", ""))
            )
        except Exception as e:
            logger.exception("Job description mastermind execution failed: %s", e)
            raise ServerError(error=InternalError()) from e

    async def cancel(
        self, request: RequestContext, event_queue: EventQueue
    ) -> Task | None:
        raise ServerError(error=UnsupportedOperationError())
