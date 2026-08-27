"""Application settings.

Every value comes from the environment. Nothing here is a secret at rest: the
only sensitive field is OPENAI_API_KEY, which is read from `.env` (gitignored)
or the process environment.

Model ids are intentionally *settings*, never literals in source — see
CLAUDE.md absolute rule 2.
"""

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, DotEnvSettingsSource, SettingsConfigDict
from pydantic_settings.sources import PydanticBaseSettingsSource

# backend/app/config.py -> backend/ -> the repository root
BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent


def _is_unset(value: object) -> bool:
    """Whether an environment value should be treated as absent.

    Two cases, both of which happen to a hand-edited file:

    * **Blank.** `.env.example` documents every key with an empty value and the
      README says to copy it, so a half-filled file is the normal starting state.
      It should mean "use the defaults", not "refuse to boot" — without this,
      `CHAT_TEMPERATURE=` crashes on a Pydantic traceback at the README's own
      first step.
    * **A stray inline comment.** python-dotenv reads `FOO=  # note` as the
      literal value `"# note"`.
    """
    if not isinstance(value, str):
        return False
    stripped = value.strip()
    return not stripped or stripped.startswith("#")


class _EnvFile(DotEnvSettingsSource):
    """One `.env` file, with blank values treated as absent.

    Filtering per file rather than after the merge is the whole point. Pydantic's
    built-in source reads several files into one dict, so a *blank* key in the
    higher-priority file overwrites a real value in the lower-priority one and
    the value is gone before any validator sees it. That is exactly the
    `backend/.env` / root `.env` case below.
    """

    def __call__(self) -> dict[str, Any]:
        return {key: value for key, value in super().__call__().items() if not _is_unset(value)}


class Settings(BaseSettings):
    """Single source of configuration truth for the backend."""

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Where configuration comes from, highest priority first.

        Two `.env` files are read, not one. `backend/.env` is the documented
        place and wins. The repository root is also checked, because `.env` next
        to `README.md` is where people put it — it is the first place you look in
        a repo with a `backend/` and a `frontend/` in it, and a key left there
        silently does nothing while every answer degrades to "I do not have
        that". Losing an afternoon to that is not a lesson worth teaching twice.

        Both are gitignored. Neither is ever committed — CLAUDE.md rule 1.
        """
        return (
            init_settings,
            env_settings,
            _EnvFile(settings_cls, env_file=BACKEND_ROOT / ".env"),
            _EnvFile(settings_cls, env_file=REPO_ROOT / ".env"),
            file_secret_settings,
        )

    @model_validator(mode="before")
    @classmethod
    def _blank_means_unset(cls, values: dict) -> dict:
        """Treat an empty value as absent, whatever source it came from.

        The `.env` sources already filter their own blanks; this catches the same
        thing arriving from the real process environment, where an exported-but-
        empty variable is just as common.
        """
        if not isinstance(values, dict):
            return values
        return {key: value for key, value in values.items() if not _is_unset(value)}

    # --- OpenAI -----------------------------------------------------------
    # No default for the key: absence must be obvious, not silently empty-string.
    OPENAI_API_KEY: str = ""
    OPENAI_CHAT_MODEL: str = "gpt-5.6-terra"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-large"
    OPENAI_TRANSCRIBE_MODEL: str = "gpt-transcribe"
    OPENAI_TTS_MODEL: str = "gpt-4o-mini-tts"
    OPENAI_TTS_VOICE: str = "marin"

    # How hard the chat model thinks before answering.
    #
    # Default `none`, and that is a compatibility requirement rather than a
    # preference. The default chat model is a reasoning model, and OpenAI rejects
    # a `/v1/chat/completions` request that combines reasoning with **function
    # tools**:
    #
    #     Function tools with reasoning_effort are not supported for <model> in
    #     /v1/chat/completions. To use function tools, use /v1/responses or set
    #     reasoning_effort to 'none'.
    #
    # This assistant is an agent — the tools are the whole design — so on this
    # endpoint the choice is reasoning or tools, and it has to be tools. The
    # other route, `/v1/responses`, returns content as typed blocks rather than a
    # string, which `app.agent.graph` would need to handle on both the sync and
    # the streaming path. Worth doing deliberately, not as a side effect.
    #
    # Set to `omit` for a model that does not accept the parameter at all.
    OPENAI_REASONING_EFFORT: str = "none"

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
    # Points at the dated export the researchers actually delivered, not at a
    # `latest.csv` pointer. The pointer convention still works — `build_kb_index`
    # resolves a symlink and records the real filename — but nothing in this repo
    # creates one, so a `latest.csv` default meant a fresh checkout resolved to a
    # file that does not exist and indexed nothing, silently.
    KB_CSV_PATH: Path = Path("../data/knowledge/scaspa_kb_2026-07-31.csv")
    CHROMA_DIR: Path = Path("../data/chroma")
    # Watchtower's structured store: the operational rows Chroma is the wrong
    # tool for. A file beside the Chroma one — see app/watchtower/store.py.
    OPERATIONAL_DB_PATH: Path = Path("../data/operational.sqlite3")
    SCRAPED_DIR: Path = Path("../data/scraped")

    # --- Service ----------------------------------------------------------
    # Both spellings of the dev origin. A browser treats http://localhost:5173
    # and http://127.0.0.1:5173 as different origins, so a developer who opened
    # the one the other was not configured for gets a bare failed fetch and no
    # reason for it — the browser will not tell JavaScript that CORS was the
    # cause. Cheap to allow both; expensive to debug.
    #
    # 4400 is `frontend/scripts/a11y-check.mjs`, which starts its own Vite
    # server on that port (hardcoded, `strictPort`). It was never in this
    # default, so two of that script's checks — "the finished answer is
    # announced" and the citation-chip focus test — failed with a CORS error on
    # every machine, for anyone who had not hand-edited their `.env`. They were
    # reported as a known limitation for long enough to become furniture.
    #
    # Dev ports only, and this default is dev-only in effect: production must
    # set the real origin, and a wildcard with ENV=prod refuses to boot.
    ALLOWED_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4400,http://127.0.0.1:4400"
    )
    RATE_LIMIT_PER_MINUTE: int = Field(default=15, gt=0)
    MAX_HISTORY_TURNS: int = Field(default=6, gt=0)
    CONVERSATION_TTL_MINUTES: int = Field(default=60, gt=0)

    # --- Scraper ----------------------------------------------------------
    SCRAPER_USER_AGENT: str = "SCASPA-Chatbot/0.1 (+https://www.scaspa.com)"
    # pay.scaspa.com is a live payment portal and is never fetched — CLAUDE.md rule 3.
    SCRAPER_BLOCKLIST: str = "pay.scaspa.com"

    # --- Operational data -------------------------------------------------
    # Where /api/vessels, /api/flights and /api/tariffs get their records.
    #
    #   none     nothing configured. Endpoints answer 200 with an empty list and
    #            a notice saying so. The default, and the only safe one.
    #   fixture  the obviously-fake sample feed in app/ops/fixtures.py, for
    #            development. REFUSED AT BOOT when ENV=prod — see app/main.py.
    #
    # There is no "live" value yet because there is no feed. Adding one is a new
    # OpsSource implementation and this string, and nothing else.
    OPS_DATA_SOURCE: str = "none"

    # --- Voice ------------------------------------------------------------
    #
    # Which provider does speech. Two, because this project's OpenAI key has no
    # speech-model entitlement at all — `/v1/models` returns nine models and not
    # one of them can transcribe or synthesise (decisions.md 0047).
    #
    #   auto        ElevenLabs when ELEVENLABS_API_KEY is set, else OpenAI.
    #               The default, so one key is the whole of the configuration.
    #   openai      /v1/audio/transcriptions and /v1/audio/speech.
    #   elevenlabs  api.elevenlabs.io — Scribe for speech-to-text, and the
    #               text-to-speech endpoint for the reply.
    #
    # `auto` is resolved once, in `app/voice/provider.py`, and reported by
    # `/api/health` so nobody has to guess which one a deployment is using.
    VOICE_PROVIDER: str = "auto"

    # Never committed. `.env` is gitignored; only `.env.example` is tracked.
    ELEVENLABS_API_KEY: str = ""

    # Model ids in settings rather than in source, for the same reason the
    # OpenAI ones are — CLAUDE.md rule 2. A provider that renames a model must
    # be a configuration change, not a code change.
    ELEVENLABS_TTS_MODEL: str = "eleven_multilingual_v2"
    ELEVENLABS_STT_MODEL: str = "scribe_v1"

    # ── NO DEFAULT VOICE, DELIBERATELY ────────────────────────────────────
    #
    # Every ElevenLabs account has voices and they differ; picking one in source
    # would choose an accent, a gender and a register for a Caribbean port
    # authority on the strength of what a developer saw first in a list.
    #
    # Blank means text-to-speech is not configured. The availability probe
    # reports that, the UI hides the control rather than offering one that
    # fails, and `scripts/voice_smoke.py --voices` prints the account's voices
    # with their ids so the choice is made by somebody entitled to make it.
    ELEVENLABS_VOICE_ID: str = ""

    # --- Watchtower -------------------------------------------------------
    # Whether the application runs the source monitor on a schedule.
    #
    # ── DEFAULT TRUE, DELIBERATELY ────────────────────────────────────────
    #
    # `interval_hours=6` sat in the source registry for a while with nothing
    # calling it, so the Vessels page stamped "checked at 05:12" against a fetch
    # nobody was going to repeat. A default of False would have left that true
    # for any deployment whose operator did not know to set a flag — and the
    # failure is invisible, because the screen keeps looking correct while the
    # data ages underneath it.
    #
    # Off is for a process that must not reach the network: the test suite (see
    # tests/conftest.py) and any one-shot CLI. Sources still govern their own
    # cadence, so switching this on does not decide how often anything is
    # fetched — see app/watchtower/scheduler.py.
    WATCHTOWER_ENABLED: bool = True

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
    def operational_db_path(self) -> Path:
        """OPERATIONAL_DB_PATH resolved against backend/, like the others."""
        return (BACKEND_ROOT / self.OPERATIONAL_DB_PATH).resolve()

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
