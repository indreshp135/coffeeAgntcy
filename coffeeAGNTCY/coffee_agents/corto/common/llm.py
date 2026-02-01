# Copyright AGNTCY Contributors (https://github.com/agntcy)
# SPDX-License-Identifier: Apache-2.0

import itertools
import logging
import os

from config.config import LLM_MODEL
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger("corto.common.llm")

# Default Gemini model when LLM_MODEL is not set
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

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
        timeout=None,
        max_retries=2,
    )
