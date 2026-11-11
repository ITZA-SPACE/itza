# ITZA Data & Science API

FastAPI service for work that needs secrets or heavy raster processing: authenticated NASA Earthdata access, Field Data Bundles, management zones, NISAR snapshots, climate projection factors and ML inference. See [TECHNICAL_ARCHITECTURE.md §3 and §11](../../docs/TECHNICAL_ARCHITECTURE.md#11-service-api-data--science).

## Layout

```
src/itza_science/
  main.py          create_app() factory; mounts routers and middleware
  core/config.py   Settings from environment (prefix ITZA_)
  core/logging.py  JSON log formatter
  api/             One router module per resource (health, bundles, zones, ...)
tests/
  unit/            Pure module tests (marker: unit)
  integration/     Tests through the ASGI app (marker: integration)
```

## Commands

Run from this directory, or use the root `pnpm` scripts.

| Task | Command |
|---|---|
| Install | `uv sync` |
| Dev server (port 8000) | `uv run uvicorn itza_science.main:app --reload` |
| Tests + coverage (≥ 90%) | `uv run pytest` |
| Unit / integration only | `uv run pytest -m unit` / `uv run pytest -m integration` |
| Lint / format | `uv run ruff check .` / `uv run ruff format .` |
| Type check | `uv run mypy` |

Configuration: copy `.env.example` to `.env`. Tests never touch the network; use `fixtures/` at the repository root.
