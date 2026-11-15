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

On Cloud Run, jobs run as FastAPI background tasks after the POST returns, so the
release deploys with `--no-cpu-throttling` (CPU stays allocated between requests),
`--min-instances=1 --max-instances=1` (jobs live in one instance's memory, so every
poll must reach it) and `ITZA_DATA_DIR=/tmp/itza` (the image's `/app` is not writable
by the runtime user). Memory is 4 GiB: a 1-year bundle for a field outside the dataset store ran out of memory at 1 GiB. With request-based CPU, bundles stay `running` indefinitely.
`/tmp` is in-memory on Cloud Run, so there completed bundles are also lost when the
instance restarts or a release rolls out; the client then POSTs again and the bundle
is rebuilt.

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

`POST /v1/relief` with `{"geometry": ...}` returns `{relief, gaps}`: the detailed surface
the 3D twin draws, built from the outline alone (no bundle needed), or `relief: null` when
no elevation source covers the field. Its images are served from
`/v1/relief/{field key}/{asset}`. `GET /v1/bundles/{id}/terrain?relief=true` adds the same
block to the terrain index (`null` with a `relief` gap when it cannot be built; the 30 m
products above are still served). Hero bundles carry it in their static `terrain.json`.
`relief.heightmap` is an RGB PNG on a grid that is linear in longitude and latitude
(row 0 north, `bounds`, `width` × `height` up to 1024, cells about 1 m and near square,
ground extent `size_m`) covering the field plus 150 m. Elevation in metres is
`min_elevation_m + (R × 256 + G) / 65535 × (max_elevation_m − min_elevation_m)`; cells
without data are filled from the nearest cell and reported as a gap. `relief.imagery`
is a JPEG on the same grid. Sources, in order: USGS 3DEP elevation and USDA NAIP aerial
imagery (United States; the provenance names the lidar project, its native cell and
flight dates, and the NAIP tile and date), then the 30 m DEM resampled onto the grid and
the EOxCloudless 2016 mosaic, both marked `coarse`, each fallback recorded as an info
gap. When the 30 m DEM cannot be read (no Earthdata login), the open AWS terrain tiles
(Terrarium encoding, zoom 13, blurred over one source cell) supply the elevation instead. A 3DEP answer with one constant value means no coverage. The package is built on
the first request for a field (the USGS exports take 10 to 60 s, run in parallel and are
tried twice), then cached with the field; building a bundle never waits for it. Limits:
height image 2.5 MB, picture 400 KB (re-encoded at lower quality to fit).
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

`POST /v1/boundaries` takes `{lon, lat, period?}` (period at most 300 days, default 270)
and starts a job, answering 202 at once with `{id, status, progress}`.
`GET /v1/boundaries/{id}` polls it: when `status` is `done` it carries a proposed field
polygon (`proposal`: `geometry`, `area_ha`, `confidence`, `separation`, `dates_used`,
`period`, `sources`) traced from 30 m HLS NDVI behavior around the click (method
`hls-temporal-segmentation`, see TECHNICAL_ARCHITECTURE §8.3); when `error`, an `error`
with `kind` (`no-field`, `timeout`, `unavailable`) and a message. A first click on a new
place takes minutes while HLS scenes download. Jobs are kept in memory only.

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

## NISAR and landscape context endpoints

The context API implements F-18/F-19 with explicit `ok`, `empty` and `pending`
states. Every returned observation carries its acquisition date and source,
collection version, resolution, period and method. Missing coverage and failed
upstreams produce HTTP 200 with `status: "empty"` and safe gaps, rather than
invented zero values. Invalid queries return 422. Models and examples are in
OpenAPI (`/openapi.json` in development).

| Endpoint | Query | Result |
|---|---|---|
| `/v1/nisar` | `bbox`, `from`, `to`, optional `limit`, `refresh` | Provisional SME2 moisture snapshots, quality counts, field statistics, PNGs and same-date SMAP comparison |
| `/v1/context/grace` | `lat`, `lon`, optional `refresh` | Monthly regional TWS anomaly in cm, null missing months and OLS trend in cm/year |
| `/v1/context/gedi` | `bbox`, optional `limit`, `refresh` | Quality-screened 25 m L2A/L2B GeoJSON footprints within 2 km, height/cover summary and on-field flags |
| `/v1/context/ecostress` | `bbox`, `from`, `to`, optional `limit`, `refresh` | LST in Kelvin and ESI in [0,1] from available 70 m clear-land scenes |

`bbox` is comma-separated west,south,east,north (WGS84), ordered, within UTM
coverage, at most 10,000 ha and no more than two degrees on either axis.
Scene periods must be ordered and span no more than five years. `limit` defaults
to four and is capped at eight **recent matching granules per collection**;
`truncated` reports additional matching granules or footprint limits. A gallery
is a bounded recent sample, not exhaustive coverage of its requested period.
NISAR dates are restricted to 2026-06-17 onward. GEDI searches 2019 onward and
caps returned, merged footprints at 2,000. The bbox represents the requested
field rectangle; these GET endpoints do not accept an arbitrary field polygon.

Cold queries run as deduplicated background tasks. The GET waits at most
`ITZA_CONTEXT_WAIT_S` (default 20 seconds, maximum 25), then returns HTTP 202,
`status: "pending"` and `Retry-After: 5`. Repeat the same GET to obtain the result.
There are at most four context tasks per worker; capacity overflow also returns
202 without queuing unbounded work. Context processing is independent of the
terrain/zone lock. Only SDK auth/search/download hold earthaccess's global auth
lock; decoding and math run off the event loop outside that lock. This does not
make cold source downloads fast or guarantee proxy completion. Tasks are lost
on a process restart; clients must retry. Successful complete results are cached
per query/collection-version/day; `refresh=true` rebuilds a completed result.
Failures and partial responses with gaps are immediately retryable.

Downloaded context granules are temporary and removed after decoding, including
on ordinary decoding/download failure. A killed process can leave scratch files
under `context-tmp/`; operators can remove abandoned directories after stopping
that worker. Cached context JSON and PNGs are pruned after seven days; PNG storage
is additionally limited to 64 MiB, evicting older assets first. A cached scene
whose PNG was evicted is rebuilt on the next query. Asset URLs are SHA-256 names
and have a one-week client cache lifetime. These bounds apply to the new context
namespace; they do not clean older bundle/spatial downloads.

### Scientific methods and limits

**NISAR:** Read the baseline `/science/LSAR/SME2/grids/soilMoisture` HDF5 dataset,
its native x/y coordinates and EPSG projection. Mask nonfinite/fill/out-of-range
values and require both retrieval and surface quality flags to be zero. Report
nonzero retrieval/surface counts and individual surface-flag bit counts. This is
a conservative policy, including rejection of precipitation, dense vegetation,
water, urban, snow/ice, frozen ground and terrain flags. QA counts refer to the
native clipping window. Statistics use actual native pixel/field overlap areas;
`coverage` is valid overlap divided by requested field area. Resolution comes
from the native grid; a finer PNG does not add information. Products with 5+5 MHz
acquisitions can have 400 m effective resolution despite 200 m posting. SME2 is
still provisional and not fully calibrated; every snapshot carries that flag.
See the [ASF SME2 guide and specification](https://nisar-docs.asf.alaska.edu/sme2/).

SMAP comparison uses SPL4SMGP v008 surface moisture at 9 km, reduced to the same
field on the exact NISAR acquisition date. Available three-hourly samples are
averaged and their count is reported. Missing same-date data stay null, with no
nearest-date substitution. SMAP is a regional model-assimilated context value,
not an independent measurement of a 200 m NISAR pixel.

**GRACE:** Use JPL CRI-filtered RL06.3 v04, the nearest 0.5 degree grid cell,
land mask and supplied gain factor when present. Native cm/m units are checked
and converted to cm; source anomaly baseline is retained. Missing values and
absent months remain null. Trend is ordinary least squares over actual observed
dates (365.2425 days/year), requiring at least 24 valid months spanning one year.
There is no gap interpolation, seasonal adjustment or trend significance claim.
The effective resolution is approximately 300 km. Total water storage includes
surface water, soil water, snow/ice and groundwater; it cannot isolate field-scale
groundwater depletion. See the [JPL CRI catalog](https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4).

**GEDI:** Use v002 L2A RH98 height and L2B canopy cover with their distinct native
geolocation groups. Require quality=1, degrade=0 and sensitivity in [0.9,1]. Reject
fill, nonfinite and out-of-range values. Footprints are filtered by true metric
2 km distance to the requested rectangle and joined by exact 64-bit shot number,
returned as strings to preserve precision in JavaScript. `on_field` means that the
25 m footprint intersects the field. Summaries describe accepted sampled returns,
not field-wide means. Returns ≥5 m trigger an explicitly tentative woody-structure
hint; sparse tracks cannot identify tree rows or prove a windbreak. Height/cover
are not interchangeable, and no crop classification is inferred. See the
[L2A dictionary](https://lpdaac.usgs.gov/documents/982/gedi_l2a_dictionary_P003_v2.html)
and [L2B dictionary](https://edcftp.cr.usgs.gov/project/lpdaac/GEDI_L2/gedi_l2b_product_data_dictionary.html).

**ECOSTRESS:** Use collection-2 tiled LSTE and ESI COGs, with separate cloud/water
masks. LST additionally requires mandatory QC bits 0-1 = 00; ESI must be finite
and in [0,1]. ESI is actual/potential evapotranspiration (0 stressed, 1 unstressed),
not a standardized anomaly. LST is surface temperature, not air temperature.
The [collection-2 guide](https://lpdaac.usgs.gov/documents/1566/ECOL2-4_Grid_Tile_User_Guide_V2.pdf)
and [LSTE quality guide](https://lpdaac.usgs.gov/documents/1574/ECOL2_User_Guide_V2.pdf)
describe these layers and QA bits. Higher QC bits are not a full uncertainty model.

PNG previews are masked geographic images on the requested bbox, bounded to
150,000 bytes. They resample native pixels for display only. Moisture uses a
0-1 blue scale; ESI uses 0-1 brown/green; LST uses a fixed 250-330 K cool-to-warm
scale. Values beyond display endpoints saturate; numeric statistics retain actual
values. Native window reads cap at 500,000 cells.

Collection versions were confirmed in the public CMR catalog on 2026-11-12.
Automated tests use [explicitly synthetic native-layout fixtures](tests/fixtures/context/README.md)
for known answers, plus mocked auth/search/download and HTTP integration tests.
The issue's fixture criteria are covered; authenticated live retrieval/decoding
of these four context products and worldwide coverage have not been established
by those tests. Hero-field precomputation and real-granule verification remain
part of demo preparation.
