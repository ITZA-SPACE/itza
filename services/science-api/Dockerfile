# syntax=docker/dockerfile:1
# Production image for the Data & Science API (uv multi-stage build, non-root runtime).
# Build from the repository root (data-sources.yaml lives there):
#   docker build -f services/science-api/Dockerfile .

FROM ghcr.io/astral-sh/uv:0.13-python3.13-trixie-slim AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=services/science-api/uv.lock,target=uv.lock \
    --mount=type=bind,source=services/science-api/pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev
COPY services/science-api/pyproject.toml services/science-api/uv.lock services/science-api/README.md ./
COPY services/science-api/src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable

FROM python:3.15-slim-trixie AS runtime
# rasterio (HLS adapter) links against libexpat, which the slim base image omits.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --chown=app:app data-sources.yaml /app/data-sources.yaml
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 ITZA_ENVIRONMENT=production ITZA_DATA_SOURCES_PATH=/app/data-sources.yaml
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status != 200)"]
CMD ["uvicorn", "itza_science.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
