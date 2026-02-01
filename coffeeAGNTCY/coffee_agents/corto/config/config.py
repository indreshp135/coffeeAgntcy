# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import os
from dotenv import load_dotenv

load_dotenv()  # Automatically loads from `.env` or `.env.local`

DEFAULT_MESSAGE_TRANSPORT = os.getenv("DEFAULT_MESSAGE_TRANSPORT", "SLIM")
TRANSPORT_SERVER_ENDPOINT = os.getenv("TRANSPORT_SERVER_ENDPOINT", "http://localhost:46357")
FARM_AGENT_HOST = os.getenv("FARM_AGENT_HOST", "localhost")
FARM_AGENT_PORT = int(os.getenv("FARM_AGENT_PORT", "9999"))

# Resume Mastermind agent
RESUME_MASTERMIND_HOST = os.getenv("RESUME_MASTERMIND_HOST", "localhost")
RESUME_MASTERMIND_PORT = int(os.getenv("RESUME_MASTERMIND_PORT", "9991"))

# Job Description Mastermind agent
JOB_DESCRIPTION_MASTERMIND_HOST = os.getenv("JOB_DESCRIPTION_MASTERMIND_HOST", "localhost")
JOB_DESCRIPTION_MASTERMIND_PORT = int(os.getenv("JOB_DESCRIPTION_MASTERMIND_PORT", "9992"))

# Interview Mastermind agent
INTERVIEW_MASTERMIND_HOST = os.getenv("INTERVIEW_MASTERMIND_HOST", "localhost")
INTERVIEW_MASTERMIND_PORT = int(os.getenv("INTERVIEW_MASTERMIND_PORT", "9993"))

LLM_MODEL = os.getenv("LLM_MODEL", "")
## Oauth2 OpenAI Provider
OAUTH2_CLIENT_ID= os.getenv("OAUTH2_CLIENT_ID", "")
OAUTH2_CLIENT_SECRET= os.getenv("OAUTH2_CLIENT_SECRET", "")
OAUTH2_TOKEN_URL= os.getenv("OAUTH2_TOKEN_URL", "")
OAUTH2_BASE_URL= os.getenv("OAUTH2_BASE_URL", "")
OAUTH2_APPKEY= os.getenv("OAUTH2_APPKEY", "")

LOGGING_LEVEL = os.getenv("LOGGING_LEVEL", "INFO").upper()
