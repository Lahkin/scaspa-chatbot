# syntax=docker/dockerfile:1
#
# Build from the REPOSITORY ROOT, not from backend/:
#   DOCKER_BUILDKIT=1 docker build -t scaspa-chatbot .
#
# The context has to be the root because the builder needs both backend/ and
# data/knowledge/ to build the index into the image. A backend/-only context
# cannot reach ../data, which is a real constraint rather than a preference.
#
# The index is BAKED IN. Deliberate trade-off — docs/decisions.md 0017. The image
# is immutable and cannot start with a stale index; updating the knowledge base
# means a rebuild and redeploy (minutes), not a live mutation.

# ---------------------------------------------------------------- builder
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY --from=ghcr.io/astral-sh/uv:0.12.0 /uv /usr/local/bin/uv

WORKDIR /build

# Dependencies first so a code change does not invalidate this layer.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/app ./app
COPY backend/scripts ./scripts
RUN uv sync --frozen --no-dev

COPY data ./data-src

# ---- build the index into the image ----
#
# The API key is mounted as a BuildKit SECRET, never passed as an ARG or ENV. An
# ARG is recorded in image history and `docker history` would print the key; a
# secret mount leaves no trace in any layer.
#
# BUILD_INDEX=false skips this, producing an image that starts degraded and says
# so on /api/health. Useful for standing up a public URL before the researchers
# have delivered content. Never for a demo.
ARG BUILD_INDEX=true
RUN --mount=type=secret,id=openai_key,required=false \
    set -eu; \
    mkdir -p /build/index; \
    if [ "$BUILD_INDEX" != "true" ]; then \
      echo "BUILD_INDEX=false: skipping index build (image will start degraded)"; \
    elif [ ! -s /run/secrets/openai_key ]; then \
      echo "WARNING: no openai_key secret supplied; skipping index build."; \
      echo "         The image will start degraded and /api/health will say so."; \
    else \
      CSV="$(ls data-src/knowledge/ | grep -E '^scaspa_kb_[0-9-]+\.csv$' | sort | tail -1 || true)"; \
      if [ -z "$CSV" ]; then \
        echo "WARNING: no scaspa_kb_YYYY-MM-DD.csv in data/knowledge/."; \
        echo "         Refusing to bake an index from fixture data (CLAUDE.md rule 5)."; \
      else \
        echo "Building index from $CSV"; \
        OPENAI_API_KEY="$(cat /run/secrets/openai_key)" \
        CHROMA_DIR=/build/index/chroma \
        SCRAPED_DIR=/build/data-src/scraped \
        /build/.venv/bin/python scripts/build_index.py \
          --csv "/build/data-src/knowledge/$CSV" --force; \
      fi; \
    fi; \
    mkdir -p /build/index/chroma

# ---------------------------------------------------------------- runtime
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    ENV=prod \
    PORT=8000 \
    LOG_JSON=true \
    CHROMA_DIR=/app/index/chroma \
    SCRAPED_DIR=/app/state/scraped \
    QUESTION_LOG_PATH=/app/state/questions.jsonl \
    OPERATIONAL_DB_PATH=/app/state/operational.sqlite3

# curl exists only for HEALTHCHECK. Nothing else is installed.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 scaspa

WORKDIR /app

COPY --from=builder /build/.venv /app/.venv
COPY --from=builder /build/app /app/app
COPY --from=builder /build/scripts /app/scripts

# index_meta.json is written beside the chroma directory, so copying /build/index
# brings both. /api/health reads it to report kb_version and row count.
COPY --from=builder /build/index /app/index

# /app/state is the only writable path in the image, and everything that has to
# survive a request is pointed at it in the ENV block above.
#
# OPERATIONAL_DB_PATH was the one missing, and it would have failed silently.
# Its default is `../data/operational.sqlite3` RELATIVE TO BACKEND_ROOT, which
# is /app in this image — so it resolved to /data, a directory that does not
# exist and that uid 10001 cannot create. Watchtower catches its own errors, so
# the API would have served perfectly while every sweep failed and the cruise
# schedule stayed empty for ever.
#
# Mount a persistent disk here, or the schedule is refetched from scratch on
# every deploy and the "last checked" record is lost with it. See render.yaml.
RUN mkdir -p /app/state && chown -R scaspa:scaspa /app/state /app/index
USER scaspa

EXPOSE 8000

# A generous start period: the first request opens Chroma and constructs the
# embedding client, and a health check failing during startup causes a restart
# loop that looks exactly like a broken deploy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/api/health" >/dev/null || exit 1

# One worker on purpose. Conversation memory, the rate limiter and the spend
# counter are all per-process, so a second worker silently multiplies the rate
# limit and splits conversations. See docs/architecture.md.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
