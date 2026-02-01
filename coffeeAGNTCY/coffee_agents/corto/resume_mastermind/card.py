# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentSkill,
)

from config.config import RESUME_MASTERMIND_HOST, RESUME_MASTERMIND_PORT

AGENT_SKILL_INGEST = AgentSkill(
    id="ingest_resume",
    name="Ingest and Extract Resume",
    description="Accepts resume text, extracts structured data (name, email, skills, experience) and stores it for later matching.",
    tags=["resume", "extraction", "hr"],
    examples=[
        "Here is a resume: [paste resume text]",
        "Extract and store this candidate's resume",
    ],
)

AGENT_SKILL_MATCH = AgentSkill(
    id="best_match",
    name="Best Match for Job Description",
    description="Given a job description, returns the candidate(s) from stored resumes with the maximum match.",
    tags=["resume", "matching", "job", "hr"],
    examples=[
        "Who has the maximum match for this job description?",
        "Find the best candidates for: [job description]",
    ],
)

AGENT_CARD = AgentCard(
    name="Resume Mastermind",
    id="resume-mastermind-agent",
    description="Ingests resumes, extracts structured data, and finds best-matching candidates for a given job description.",
    url=f"http://{RESUME_MASTERMIND_HOST}:{RESUME_MASTERMIND_PORT}/",
    version="1.0.0",
    defaultInputModes=["text"],
    defaultOutputModes=["text"],
    capabilities=AgentCapabilities(streaming=True),
    skills=[AGENT_SKILL_INGEST, AGENT_SKILL_MATCH],
    supportsAuthenticatedExtendedCard=False,
)
