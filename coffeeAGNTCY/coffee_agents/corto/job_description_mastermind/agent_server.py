# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import asyncio

from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from dotenv import load_dotenv
from uvicorn import Config, Server

from agntcy_app_sdk.factory import AgntcyFactory
from agntcy_app_sdk.app_sessions import AppContainer
from agntcy_app_sdk.semantic.a2a.protocol import A2AProtocol

from config.config import (
    JOB_DESCRIPTION_MASTERMIND_HOST,
    JOB_DESCRIPTION_MASTERMIND_PORT,
    DEFAULT_MESSAGE_TRANSPORT,
    TRANSPORT_SERVER_ENDPOINT,
)
from job_description_mastermind.agent_executor import JobDescriptionMastermindExecutor
from job_description_mastermind.card import AGENT_CARD

load_dotenv()

factory = AgntcyFactory("corto.job_description_mastermind", enable_tracing=True)


async def main():
    request_handler = DefaultRequestHandler(
        agent_executor=JobDescriptionMastermindExecutor(factory),
        task_store=InMemoryTaskStore(),
    )
    server = A2AStarletteApplication(
        agent_card=AGENT_CARD, http_handler=request_handler
    )

    if DEFAULT_MESSAGE_TRANSPORT == "A2A":
        config = Config(
            app=server.build(),
            host=JOB_DESCRIPTION_MASTERMIND_HOST,
            port=JOB_DESCRIPTION_MASTERMIND_PORT,
            loop="asyncio",
        )
        userver = Server(config)
        await userver.serve()
    else:
        transport = factory.create_transport(
            DEFAULT_MESSAGE_TRANSPORT,
            endpoint=TRANSPORT_SERVER_ENDPOINT,
            name="default/default/" + A2AProtocol.create_agent_topic(AGENT_CARD),
        )
        app_session = factory.create_app_session()
        app_session.add_app_container(
            "corto-job-description-mastermind",
            AppContainer(
                server,
                transport=transport,
                topic=A2AProtocol.create_agent_topic(AGENT_CARD),
            ),
        )
        await app_session.start_session(
            "corto-job-description-mastermind", keep_alive=True
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down gracefully on keyboard interrupt.")
    except Exception as e:
        print(f"Error occurred: {e}")
