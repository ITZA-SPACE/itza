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

## Terrain, frame sequences and management zones

`POST /v1/bundles` also attempts NASADEM HGT v001, falling back to SRTMGL1 v003.
When available, field-pixel mean elevation and slope populate the bundle, with
static canonical `elevation` (m) and `slope` (deg) series carrying provenance.
Missing terrain remains null with gaps. Spatial processing uses a local UTM grid
at 30 m with a 300 m buffer, capped at 500,000 cells. Polar fields outside UTM
coverage and excessive extents are rejected by spatial endpoints (422); the
bundle can still provide its other series with a terrain gap.

`GET /v1/bundles/{id}/terrain` returns numerical GeoTIFF URLs for elevation, slope,
aspect (downslope azimuth clockwise from north; null on flats), D8 accumulation
(including each cell itself), slope classes (0: <2°, 1: 2–5°, 2: 5–10°, 3: ≥10°),
and concavity (elevation minus the 5×5-cell local mean). Negative concavity is a
low-terrain hint, not a frost forecast. It also returns clipped GeoJSON flow
segments where accumulation reaches max(10 cells, field p90). Routing is unfilled
D8: flats and pits are sinks, and upstream area outside the local buffer is not
represented. Terrain is a surface model, not a drainage survey. Native HGT voids
remain missing. See the [NASADEM guide](https://lpdaac.usgs.gov/documents/592/NASADEM_User_Guide_V1.pdf).

Colorized terrain previews have `_png` layer keys and use `display_bounds`; raw
GeoTIFFs retain their projected CRS and use `bounds` for their geographic extent.
`GET /v1/bundles/{id}/frames` (alias `/frames/index.json`) returns dated NDVI and
available moisture PNGs, each with its source, native resolution, date, geographic
bounds, dimensions and byte size. The bundle's `layers.ndvi_frames` links to that
index. The source period is the bundle NDVI series period, falling back to the stored
request period; older bundles without either return an empty index with a gap. Normal gaps between acquisitions do not create frames.
Masks and missing pixels are transparent. Display rasters are reprojected to
EPSG:4326; quantization to 16 colors and, when necessary, downsampling keep every
PNG ≤150,000 bytes and ≤1024 pixels on either side. Numerical analysis always
uses the 30 m arrays, never the encoded preview. NDVI uses a brown-to-green scale
from −1 to 1; moisture uses light-to-dark blue from 0 to 1. Terrain preview ranges
are slope 0–45°, aspect 0–360°, classes 0–3, concavity −5–5 m and a per-layer
logarithmic accumulation stretch. Previews are illustrative; use GeoTIFFs for values.

`POST /v1/zones` accepts the bundle's `geometry`, `period` and `refresh`, plus
optional `soil: {awc_mm_per_m, curve_number, source}`. It returns a GeoJSON
FeatureCollection with `enabled`, an explanatory `reason` when disabled, per-zone
statistics and English risk notes, annual stability and source provenance. Fields
below 3 ha, grids below 30 field pixels, fewer than two years of comparable HLS
observations, or homogeneous features disable clustering. At least two valid
observations per year are needed for mean/CV/observed peak timing; these are
acquisition statistics, not daily interpolations or fitted phenology. Pixels need
at least two valid years. Unobserved pixels are excluded, and `coverage` records
the fraction of field pixel centers retained; polygons cover only retained cells.

Features are multi-year mean NDVI, CV (undefined near zero mean), circular peak
DOY, and available slope/log-flow/moisture covariates, standardized before k-means.
K=2–4 is selected by silhouette, using a deterministic stratified sample of at most
2,000 pixels; seed 42 and 10 initializations make fits reproducible. Annual fits
use the selected k; overall stability is the mean pairwise adjusted Rand index,
clipped at zero, and per-zone stability is matched membership retention. Missing
comparable annual fits give null stability with a gap. These scores describe
repeatability, not agronomic correctness.

No zone soil measurement is inferred from vegetation. Caller AWC is preserved;
runoff scenarios adjust only the caller curve number using
[Williams' slope correction, SWAT 2005 §2.1.1, eq. 2.1.1.12](https://swat.tamu.edu/media/1292/swat2005theory.pdf):
`CN3 = CN2 exp(0.00673(100−CN2))`,
`CNs = CN2 + (CN3−CN2)/3 × (1−2 exp(−13.86 tan(slope_deg)))`, clamped to 30–98.
The supplied CN2 represents the 5% reference slope. Results are explicitly labeled
low-confidence model scenarios for subsequent mini-backtests. Without caller soil
or usable slope no scenario is returned; no engine replay is performed by this route.

Optional precomputed moisture is read from
`ITZA_DATA_DIR/spatial/<field sha256 without prefix>/moisture/manifest.json`.
This server-owned JSON list contains `{file,date,source}` records; `file` is a local
GeoTIFF basename, values are volumetric moisture in [0,1], and `source` follows the
OpenAPI `Source` model (source, product, version, resolution_m, period, method).
The upstream NISAR pipeline must supply QA-masked numeric layers and provenance.
They are bilinearly resampled; native 200 m resolution and the `coarse` flag remain
visible. Absent or invalid inputs become gaps. No numeric moisture is reconstructed
from display PNGs. The live NISAR endpoint belongs to the following issue.

Source searches cap each HLS collection at 512 granules per period and each DEM
query at 16. Retained observations are bounded to 20 million raster samples;
truncated/unavailable sources produce gaps. Spatial requests execute one at a time
per worker, with CPU work off the event loop. Cold multi-year requests can be slow;
hero-field precomputation is still required. Zone and frame JSON are cached per
field/options/day with explicit refresh; static terrain is cached by method version.
Content-addressed assets have immutable URLs. Keep the data directory persistent.
All automated tests remain offline: synthetic DEMs/clusters establish known answers,
while native raster decoding and API/schema/image-budget checks verify integration.

Manual live verification on 2026-11-12: the production spatial source authenticated
and downloaded NASADEM_HGT v001 covering the fixture field near Sétif, returning
134 valid field pixels and no gaps. This checks native DEM access/decoding at that
location; it does not establish worldwide coverage or multi-year latency.
