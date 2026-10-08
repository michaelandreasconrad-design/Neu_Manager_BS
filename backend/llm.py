import logging
import os
from functools import lru_cache

import openai

from prompts import Direction, Intensity, build_system_prompt, build_user_message

logger = logging.getLogger(__name__)

BASE_URL = "https://openrouter.ai/api/v1"
MODEL = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v4.1-flash")
TIMEOUT_SECONDS = 30.0
MAX_RETRIES = 1
MAX_OUTPUT_TOKENS = 1024


class LLMError(Exception):
    """LLM-Anbieter lieferte einen Fehler oder keine brauchbare Antwort."""


class LLMTimeout(LLMError):
    """LLM-Anbieter hat nicht rechtzeitig geantwortet."""


@lru_cache(maxsize=1)
def _get_client() -> openai.OpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        logger.error("OPENROUTER_API_KEY ist nicht gesetzt.")
        raise LLMError("Der LLM-Anbieter ist nicht konfiguriert.")
    return openai.OpenAI(
        base_url=BASE_URL,
        api_key=api_key,
        timeout=TIMEOUT_SECONDS,
        max_retries=MAX_RETRIES,
    )


def translate(text: str, direction: Direction, intensity: Intensity) -> tuple[str, int | None]:
    client = _get_client()  # Konfigurationsfehler bewusst außerhalb des try
    try:
        response = client.chat.completions.create(
            model=MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
            messages=[
                {"role": "system", "content": build_system_prompt(direction, intensity)},
                {"role": "user", "content": build_user_message(text)},
            ],
        )
    except openai.APITimeoutError as exc:
        raise LLMTimeout("Der LLM-Anbieter hat nicht rechtzeitig geantwortet.") from exc
    except openai.OpenAIError as exc:
        logger.exception("LLM-Anfrage fehlgeschlagen")
        raise LLMError("Der LLM-Anbieter ist nicht erreichbar oder hat einen Fehler gemeldet.") from exc

    if not response.choices:
        raise LLMError("Der LLM-Anbieter lieferte keine Übersetzung.")

    choice = response.choices[0]
    result = (choice.message.content or "").strip()
    if not result:
        raise LLMError("Der LLM-Anbieter lieferte keine Übersetzung.")
    if choice.finish_reason == "length":
        raise LLMError("Die Übersetzung wurde abgeschnitten (Textlimit erreicht).")

    tokens = response.usage.total_tokens if response.usage else None
    return result, tokens
