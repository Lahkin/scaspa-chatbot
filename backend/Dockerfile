# syntax=docker/dockerfile:1

# Build context is backend/. The knowledge index is NOT baked in — it is built at
# release time from the researchers' CSV (see docs/deploy.md), so a redeploy
# cannot silently ship a stale or fixture index.

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY --from=ghcr.io/astral-sh/uv:0.12.0 /uv /usr/local/bin/uv

WORKDIR /app

# Dependencies first so a code change does not invalidate the layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY scripts ./scripts
RUN uv sync --frozen --no-dev

# Run as a non-root user.
RUN useradd --create-home --uid 10001 scaspa \
    && mkdir -p /data/chroma \
    && chown -R scaspa:scaspa /app /data
USER scaspa

ENV PATH="/app/.venv/bin:$PATH" \
    CHROMA_DIR=/data/chroma \
    ENV=prod \
    PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
