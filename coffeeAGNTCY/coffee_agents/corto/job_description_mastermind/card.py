# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

from a2a.types import AgentCapabilities, AgentCard, AgentSkill

from config.config import (
    JOB_DESCRIPTION_MASTERMIND_HOST,
    JOB_DESCRIPTION_MASTERMIND_PORT,
)

AGENT_SKILL = AgentSkill(
    id="process_job_description",
    name="Process Job Description",
    description="Accepts a job description, fetches best-matching candidates from Resume Mastermind, and can request Interview Mastermind to prepare interview questions for the top candidate(s).",
    tags=["job", "recruitment", "orchestration", "hr"],
    examples=[
        "I have this job description: [paste]. Find best candidates and prepare interview questions.",
        "Get best matches for this role and schedule interview prep: [job description]",
    ],
)

AGENT_CARD = AgentCard(
    name="Job Description Mastermind",
    id="job-description-mastermind-agent",
    description="Orchestrates recruitment: takes job description, gets best resumes from Resume Mastermind, and requests Interview Mastermind to prepare questions.",
    url=f"http://{JOB_DESCRIPTION_MASTERMIND_HOST}:{JOB_DESCRIPTION_MASTERMIND_PORT}/",
    version="1.0.0",
    defaultInputModes=["text"],
    defaultOutputModes=["text"],
    capabilities=AgentCapabilities(streaming=True),
    skills=[AGENT_SKILL],
    supportsAuthenticatedExtendedCard=False,
)
