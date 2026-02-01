# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import itertools
import logging
import os
from typing import Any, TypeVar

from langchain_core.messages import BaseMessage
from pydantic import BaseModel, Field

from config.config import LLM_MODEL
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger("corto.common.llm")

# ---------------------------------------------------------------------------
# Pydantic models for structured LLM output (used with with_structured_output)
# ---------------------------------------------------------------------------


class ResumeExtractOutput(BaseModel):
    """Root object for resume extraction: single key 'resume' with nested data."""

    resume: dict[str, Any] = Field(description="Resume object with personal_information, education, work_experience, skills, summary, additional_details")


class JobDescriptionExtractOutput(BaseModel):
    """Root object for job description extraction: single key 'job_description'."""

    job_description: dict[str, Any] = Field(
        description="Job description object with company_information, job_details, summary, responsibilities, requirements"
    )


class RankedCandidate(BaseModel):
    """One entry in the ranked candidates list."""

    profile_id: int = Field(description="Candidate profile id")
    rank: int = Field(description="1-based rank, 1 = best fit")


class RankingOutput(BaseModel):
    """Output for candidate ranking: top 5 by job fit."""

    ranked: list[RankedCandidate] = Field(description="Top 5 candidates with profile_id and rank (1-based)")


class InterviewScoreOutput(BaseModel):
    """Output for interview transcript scoring."""

    score: float = Field(description="Interview score from 0 to 100", ge=0, le=100)


T = TypeVar("T", bound=BaseModel)

# Default Gemini model when LLM_MODEL is not set
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"

# Cached list of API keys (loaded once from env)
_google_api_keys: list[str] | None = None
_key_cycle: itertools.cycle | None = None


def _get_google_api_keys() -> list[str]:
    """Build list of Google API keys from env (GOOGLE_API_KEYS or GOOGLE_API_KEY)."""
    global _google_api_keys, _key_cycle
    if _google_api_keys is not None:
        return _google_api_keys
    keys_raw = os.getenv("GOOGLE_API_KEYS", "").strip()
    if keys_raw:
        _google_api_keys = [k.strip() for k in keys_raw.split(",") if k.strip()]
    if not _google_api_keys:
        single = os.getenv("GOOGLE_API_KEY", "").strip()
        if single:
            _google_api_keys = [single]
        else:
            _google_api_keys = []
    if _google_api_keys:
        _key_cycle = itertools.cycle(_google_api_keys)
    return _google_api_keys


def _next_google_api_key() -> str | None:
    """Return next key in rotation, or None if no keys configured."""
    keys = _get_google_api_keys()
    if not keys or _key_cycle is None:
        return None
    return next(_key_cycle)


def get_llm():
    """
    Return a Gemini Chat model using config LLM_MODEL and Google API key(s).
    Uses key rotation when GOOGLE_API_KEYS (comma-separated) is set.
    """
    model = LLM_MODEL or DEFAULT_GEMINI_MODEL
    api_key = _next_google_api_key()
    if not api_key:
        raise ValueError(
            "No Google API key configured. Set GOOGLE_API_KEY or GOOGLE_API_KEYS in the environment."
        )
    logger.info(
        "Using Gemini LLM model=%s with key rotation (keys=%d)",
        model,
        len(_get_google_api_keys()),
    )
    return ChatGoogleGenerativeAI(
        model=model,
        api_key=api_key,
        temperature=1.0,
        max_tokens=None,
        timeout=15,
        max_retries=3,
    )


def invoke_with_retry(messages: list[BaseMessage]):
    """Invoke the LLM with the given messages. Retries once on failure (e.g. key rotation)."""
    try:
        return get_llm().invoke(messages)
    except Exception as e:
        logger.warning("LLM invoke failed, retrying once: %s", e)
        return get_llm().invoke(messages)


def invoke_structured_with_retry(
    messages: list[BaseMessage],
    schema_class: type[T],
) -> T:
    """
    Invoke the LLM with structured output. Returns an instance of schema_class.
    Uses provider-native structured output (e.g. Gemini JSON mode) when available.
    Retries once on failure.
    """
    llm = get_llm()
    structured_llm = llm.with_structured_output(schema_class)
    try:
        return structured_llm.invoke(messages)
    except Exception as e:
        logger.warning("Structured LLM invoke failed, retrying once: %s", e)
        llm = get_llm()
        structured_llm = llm.with_structured_output(schema_class)
        return structured_llm.invoke(messages)
