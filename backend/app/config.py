"""Application settings.

Every value comes from the environment. Nothing here is a secret at rest: the
only sensitive field is OPENAI_API_KEY, which is read from `.env` (gitignored)
or the process environment.

Model ids are intentionally *settings*, never literals in source — see
CLAUDE.md absolute rule 2.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/
BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Single source of configuration truth for the backend."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    @model_validator(mode="before")
    @classmethod
    def _blank_means_unset(cls, values: dict) -> dict:
        """Treat an empty environment value as absent, so the default applies.

        `.env.example` documents every key with a blank value, and the README tells
        a newcomer to copy it. Without this, that documented first step crashes on
        `CHAT_TEMPERATURE=` with a Pydantic traceback — because an empty string is
        not a float. Found by cloning the repo and following the README literally.
        A half-filled `.env` is the normal state for someone starting out; it
        should mean "use the defaults", not "refuse to boot".
        """
        if not isinstance(values, dict):
            return values

        def unset(value: object) -> bool:
            # A stray inline comment counts as unset too: python-dotenv reads
            # `FOO=  # note` as the literal value "# note", and a hand-edited
            # file will eventually contain one.
            if not isinstance(value, str):
                return False
            stripped = value.strip()
            return not stripped or stripped.startswith("#")

        return {key: value for key, value in values.items() if not unset(value)}

    # --- OpenAI -----------------------------------------------------------
    # No default for the key: absence must be obvious, not silently empty-string.
    OPENAI_API_KEY: str = ""
    OPENAI_CHAT_MODEL: str = "gpt-5.6-terra"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-large"
    OPENAI_TRANSCRIBE_MODEL: str = "gpt-transcribe"
    OPENAI_TTS_MODEL: str = "gpt-4o-mini-tts"
    OPENAI_TTS_VOICE: str = "marin"

    # --- Generation limits ------------------------------------------------
    CHAT_TEMPERATURE: float = Field(default=0.0, ge=0.0, le=2.0)
    MAX_OUTPUT_TOKENS: int = Field(default=700, gt=0)
    AGENT_MAX_TOOL_CALLS: int = Field(default=6, gt=0)

    # --- Upstream resilience ----------------------------------------------
    # A stranded traveller would rather see an honest error in 20 seconds than
    # a spinner for two minutes.
    OPENAI_TIMEOUT_SECONDS: float = Field(default=20.0, gt=0)
    OPENAI_MAX_ATTEMPTS: int = Field(default=3, ge=1)
    OPENAI_BACKOFF_BASE_SECONDS: float = Field(default=0.5, ge=0)

    # --- Request limits ----------------------------------------------------
    MAX_MESSAGE_CHARS: int = Field(default=1000, gt=0)

    # --- Cost controls -----------------------------------------------------
    # Rates are settings, not literals, because provider pricing changes and a
    # stale hardcoded rate turns the estimator into a confidently wrong number.
    # Defaults are placeholders: set them from the current OpenAI pricing page.
    PRICE_CHAT_INPUT_PER_MTOK: float = Field(default=0.0, ge=0)
    PRICE_CHAT_OUTPUT_PER_MTOK: float = Field(default=0.0, ge=0)
    PRICE_EMBEDDING_PER_MTOK: float = Field(default=0.0, ge=0)
    PRICE_TRANSCRIBE_PER_MINUTE: float = Field(default=0.0, ge=0)
    PRICE_TTS_PER_MCHAR: float = Field(default=0.0, ge=0)
    DAILY_SPEND_WARN_USD: float = Field(default=5.0, ge=0)

    # --- Admin -------------------------------------------------------------
    # /api/admin/stats is omitted entirely unless this is set. In prod that means
    # an unset secret removes the route rather than exposing it.
    ADMIN_SECRET: str = ""

    # --- Logging -----------------------------------------------------------
    LOG_JSON: bool = True
    # Where question text is appended for scripts/export_questions.py. Questions
    # only — never an identifier.
    QUESTION_LOG_PATH: Path = Path("../data/questions.jsonl")

    # --- Retrieval --------------------------------------------------------
    RETRIEVAL_TOP_K: int = Field(default=5, gt=0)
    RETRIEVAL_FETCH_K: int = Field(default=20, gt=0)
    RETRIEVAL_MIN_SCORE: float = Field(default=0.30, ge=0.0, le=1.0)

    # --- Retrieval techniques, each independently toggleable ---------------
    # Independently toggleable so scripts/evaluate.py can compare configurations,
    # and so one can be turned off if it misbehaves an hour before a demo.
    # Defaults reflect what measurement actually supported — see
    # docs/decisions.md 0015.
    RETRIEVAL_QUERY_REWRITE: bool = True
    RETRIEVAL_CATEGORY_FILTER: bool = True
    RETRIEVAL_HYBRID: bool = False
    RETRIEVAL_RERANK: bool = False
    RETRIEVAL_HYBRID_SEMANTIC_WEIGHT: float = Field(default=0.5, ge=0.0, le=1.0)

    # --- Paths ------------------------------------------------------------
    KB_CSV_PATH: Path = Path("../data/knowledge/latest.csv")
    CHROMA_DIR: Path = Path("../data/chroma")
    SCRAPED_DIR: Path = Path("../data/scraped")

    # --- Service ----------------------------------------------------------
    ALLOWED_ORIGINS: str = "http://localhost:5173"
    RATE_LIMIT_PER_MINUTE: int = Field(default=15, gt=0)
    MAX_HISTORY_TURNS: int = Field(default=6, gt=0)
    CONVERSATION_TTL_MINUTES: int = Field(default=60, gt=0)

    # --- Scraper ----------------------------------------------------------
    SCRAPER_USER_AGENT: str = "SCASPA-Chatbot/0.1 (+https://www.scaspa.com)"
    # pay.scaspa.com is a live payment portal and is never fetched — CLAUDE.md rule 3.
    SCRAPER_BLOCKLIST: str = "pay.scaspa.com"

    # --- Runtime ----------------------------------------------------------
    ENV: str = "dev"
    LOG_LEVEL: str = "INFO"

    @field_validator("RETRIEVAL_FETCH_K")
    @classmethod
    def _fetch_k_at_least_top_k(cls, v: int, info) -> int:  # noqa: ANN001
        top_k = info.data.get("RETRIEVAL_TOP_K")
        if top_k is not None and v < top_k:
            raise ValueError("RETRIEVAL_FETCH_K must be >= RETRIEVAL_TOP_K")
        return v

    @property
    def allowed_origins_list(self) -> list[str]:
        """ALLOWED_ORIGINS parsed into a list for the CORS middleware."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def scraper_blocklist_set(self) -> set[str]:
        """Hosts the scraper must never fetch, lowercased."""
        return {h.strip().lower() for h in self.SCRAPER_BLOCKLIST.split(",") if h.strip()}

    @property
    def chroma_path(self) -> Path:
        """CHROMA_DIR resolved against backend/ so relative defaults work."""
        return (BACKEND_ROOT / self.CHROMA_DIR).resolve()

    @property
    def kb_csv_path(self) -> Path:
        """KB_CSV_PATH resolved against backend/."""
        return (BACKEND_ROOT / self.KB_CSV_PATH).resolve()

    @property
    def question_log_path(self) -> Path:
        """QUESTION_LOG_PATH resolved against backend/."""
        return (BACKEND_ROOT / self.QUESTION_LOG_PATH).resolve()

    @property
    def admin_enabled(self) -> bool:
        """Whether the admin route should exist at all."""
        return bool(self.ADMIN_SECRET.strip())

    @property
    def scraped_path(self) -> Path:
        """SCRAPED_DIR resolved against backend/."""
        return (BACKEND_ROOT / self.SCRAPED_DIR).resolve()


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide Settings singleton."""
    return Settings()
