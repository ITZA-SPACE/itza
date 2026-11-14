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
| Dev server (port 8100) | `uv run uvicorn itza_science.main:app --reload --port 8100` |
| Tests + coverage (≥ 90%) | `uv run pytest` |
| Unit / integration only | `uv run pytest -m unit` / `uv run pytest -m integration` |
| Lint / format | `uv run ruff check .` / `uv run ruff format .` |
| Type check | `uv run mypy` |

Configuration: copy `.env.example` to `.env`. Tests never touch the network; use `fixtures/` at the repository root.

## Field bundles and native NASA inputs

`POST /v1/bundles` accepts a GeoJSON `geometry`, a `period: {start,end}`, optional
`variables` (precip, sm_surface, sm_rootzone, ndvi), and optional `refresh: true`.
The existing API returns `{id,status}`; poll `GET /v1/bundles/{id}` until `done`
or `error`, then fetch canonical JSON from `/v1/bundles/{id}/series/{var}`.
Inputs retain the merged service's limits: 500 vertices, 10,000 ha and a five-year
date span. Geometry coordinates and unsupported variables are validated by Pydantic.

Set `EARTHDATA_TOKEN` or `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` in the service
`.env` or process environment. The account must authorize the GES DISC application
for IMERG access. Credentials are secret settings, excluded from serialization.
Earthdata authentication/search/download run off the event loop and are serialized
because earthaccess keeps global session state. Login is noninteractive and does
not persist a netrc; temporarily supplied environment values are restored afterward.
Each daily search is capped at 64 granules, and ancillary assets are not downloaded.

Native formats are verified against recorded NASA data:

- IMERG V07 uses `precipitation`, with named (time, lon, lat) dimensions transposed
  before spatial aggregation. Final precedes Late per day; source segments and
  product identifiers retain the actual source. Late observations are not labeled
  as gap-filled estimates.
- SMAP L4 v008 stores soil moisture under `Geophysical_Data`, with native EASE-Grid
  geolocation. Every available three-hourly granule contributes to the daily mean;
  fewer than eight samples produces a warning and lower confidence.
- HLS VI v2 supplies NDVI and Fmask as separate COGs. The reader pairs those assets,
  clips a native window, applies NDVI scale/fill/range checks and the QA mask, and
  respects the projected CRS. The old two-band synthetic fixtures remain supported.
  Normal days between satellite visits remain null without being treated as failed
  acquisitions. Pixel/field intersection weights use equal-area EPSG:6933 areas.

Cached bundle keys include source versions and variable mappings. An ordinary
POST retries an errored job; `refresh: true` rebuilds an already completed partial
bundle with the same id and still deduplicates queued/running work. Cache writes
are part of job error handling, and public errors never include raw exception text.
Completed bundles persist in `ITZA_DATA_DIR`; in-flight jobs are lost on restart,
so the client must POST again if a GET returns 404. Use a writable persistent volume
for that directory in read-only production containers.

Unavailable elevation and slope are null with explicit gaps, using the shared
contract and generated types. Zero is not a missing-terrain sentinel. The engine
rejects missing elevation before computing ET0; terrain must be supplied before replay.

The authoritative manifest is the root `data-sources.yaml`. Wheels include a
checked snapshot at `src/itza_science/core/data-sources.yaml`, used when the repository
file is absent. After changing the root manifest, refresh that snapshot with:

```sh
cp data-sources.yaml services/science-api/src/itza_science/core/data-sources.yaml
```

A unit test checks that the snapshot matches the shared source. Adapter and bundle
tests replay the [recorded NASA clips](../../fixtures/earthdata/recorded/README.md)
without network access or local credentials. Synthetic granules separately test
controlled edge cases. The recorded manifest includes source URLs, versions,
periods, clipping windows, reference pixels and hashes; `smoke.json` records manual
live login/data access and the production HLS adapter check. These checks establish
format and point handling, not global coverage or cold-cache latency guarantees.
