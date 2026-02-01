# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

from a2a.types import AgentCapabilities, AgentCard, AgentSkill

from config.config import INTERVIEW_MASTERMIND_HOST, INTERVIEW_MASTERMIND_PORT

AGENT_SKILL = AgentSkill(
    id="prepare_questions",
    name="Prepare Interview Questions",
    description="Given a job description and candidate resume (or summary), generates tailored interview questions for that candidate.",
    tags=["interview", "questions", "hr"],
    examples=[
        "Prepare interview questions for this job and candidate",
        "Generate questions for interviewing this candidate for the role",
    ],
)

AGENT_CARD = AgentCard(
    name="Interview Mastermind",
    id="interview-mastermind-agent",
    description="Prepares tailored interview questions given a job description and candidate resume.",
    url=f"http://{INTERVIEW_MASTERMIND_HOST}:{INTERVIEW_MASTERMIND_PORT}/",
    version="1.0.0",
    defaultInputModes=["text"],
    defaultOutputModes=["text"],
    capabilities=AgentCapabilities(streaming=True),
    skills=[AGENT_SKILL],
    supportsAuthenticatedExtendedCard=False,
)
