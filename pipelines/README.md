# Pipelines

Batch Python jobs (uv): demo bundle build, fixture capture, ML training and Prithvi jobs, all run on CPU on developer machines or a Compute Engine VM. Outputs go to the dataset store or the repository; batch machines never serve the app ([TECHNICAL_ARCHITECTURE.md §4.4](../docs/TECHNICAL_ARCHITECTURE.md#44-hosting-and-compute)). Owned by workstreams D and M.

## Hero-field bundles (#17)

`hero_fields.yaml` defines one Sétif story sampling polygon and three independent
Akron proof sampling polygons, their selection rationale, and the 2008–2025 replay
period. These are sampling areas, not cadastral boundaries or identified USDA trial
plots. Proof areas were selected inside the three largest contiguous winter-wheat
patches in a fixed 2023 CDL search window, before examining historical agreement.
CDL labels are independent reference observations; they never supply Field Memory.
The Sétif outline and inferred history still need farmer confirmation.

**Real boundaries, not sampling rectangles (follow-up).** `trace_boundaries.py` traces a real
field boundary around each hero-field centroid with the click-to-field algorithm (`propose`,
the same one behind `POST /v1/boundaries`), so each hero field's outline comes from real HLS
NDVI behavior instead of the hand-picked sampling polygons above:

```sh
uv run --project pipelines python pipelines/trace_boundaries.py
```

Writes `pipelines/traced_boundaries.json` (one proposal per field, or an error) for manual
review; it does not touch `hero_fields.yaml` itself. A real per-field trace (31 date windows at
the default 300-day period) took over an hour against the live Earthdata token and had not
finished for all four fields at the time of writing — rerun with network access well in advance
of using the result, and expect each field's trace to take a while.

From the repository root (Python 3.13+, uv; Node/pnpm dependencies installed for
Biome formatting; OpenMP as for `ml/`):

```sh
uv sync --project pipelines --locked
uv run --project pipelines python pipelines/build_demo.py --cache /tmp/itza-demo
uv run --project pipelines python pipelines/refresh_soil.py --captures /tmp/itza-soil-captures
uv run --directory pipelines pytest
uv run --directory pipelines mypy
uv run --directory pipelines ruff check build_demo.py capture_fixtures.py validate_bundle.py tests
uv run --directory pipelines ruff format --check build_demo.py capture_fixtures.py validate_bundle.py tests
```

**Dataset store (#103, #127).** With a copy of the team store (`pipelines/data_store/README.md`:
`sync.py pull smap-l4-spl4smgp imerg-final-daily`), add `--store pipelines/data_store/data` (or set
`ITZA_DATASET_STORE_DIR`) and the build reads the stored SMAP L4 and IMERG hero-region clips
instead of downloading them, and fetches only the days the store does not have. Every clip is
checked against the SHA-256 in `data_store/manifest.yaml` first: a damaged clip or a file the
manifest does not list aborts the build, and a clip that was not pulled is simply fetched live.
The stored clips use the same windows as the live path.

The pipeline has its own locked uv project. Run its checks explicitly in addition
to `pnpm check` and `pnpm build`; it is outside the pnpm workspace globs. The CI
Pipelines job runs lint, formatting, strict types and offline tests for both this
project and `ml/` on every pull request and push to `dev` or `main`.
Tests use offline synthetic inputs and the recorded NASA granule clips; they make
no network requests. Coverage of the pipeline modules must reach 90%.

Configure Earthdata only in `services/science-api/.env` or the environment, as for
the science service. Credentials never enter the output. Public POWER, ORNL MODIS
and USDA CDL calls require no account. Authenticated source failures become the
service's explicit gaps; missing POWER/MODIS or insufficient proof labels stop
publication. The trained model in `services/science-api/models/stress-v1` is required;
fixture models cannot publish production bundles.

`--only <id> [<id> ...]` selects fields. `--output <directory>` changes the publication
root. `--refresh` recomputes completed stages while retaining raw request caches.
`--server-days` (default 7, maximum 365) controls the native server sample at the end
of the requested period. This sample does not replace historical daily forcing.
Retain the cache between runs: public responses are keyed by URL and sorted public
parameters and checked against SHA-256. Transient HTTP failures retry four times.
Completed stages are checkpointed by field, period, code digest and model digest;
rerunning the same command resumes them. Changing the manifest or code creates a
new checkpoint. A failed capture can safely be retried with the same cache.

### Outputs and scientific limits

Each `<id>/` contains:

- `bundle.json`: validated against the shared JSON Schema, complete historical
  POWER weather and quality-screened MODIS NDVI inputs for Field Memory, field
  geometry, available terrain and native soil moisture, provenance and gaps.
- `server.json`: the original native IMERG/SMAP/HLS service result for its declared
  short sampling period. Historical replay uses POWER precipitation; it is not
  silently truncated to the native sampling period.
- `terrain.json`, `frames.json`, `zones.json`, and `assets/`: original service
  contracts with static relative asset paths, including numerical terrain GeoTIFFs,
  PNG overlays, flow lines, and zonal stability/coverage when available. The two-year
  HLS spatial window samples up to 12 evenly spaced scenes per collection. Sparse
  sampling can disable zones or miss phenological extremes; it is disclosed in gaps.
- `context.json`: NISAR, GRACE, GEDI and ECOSTRESS responses, with explicit empty
  coverage and source gaps. Context images use static relative paths. No API server
  is needed to read a completed publication. The batch reader uses the installed
  client's scalar CMR sort key, clips NISAR/ECOSTRESS/SMAP/GEDI inputs before
  decoding, and retains captured files for retries. Published SME2 v1's root
  surface-quality flag is normalized to the service decoder's input layout.
  The NISAR comparison samples one same-date 3-hour SMAP granule; it is explicitly
  labelled as a sample rather than a complete daily mean. GRACE retains distinct
  native solution dates when multiple solutions fall in one calendar month;
  missing months stay null and the trend uses observed solution dates.
- `ml.json`: one result or explicit missing-weather gap per season, using the trained
  regional model and all SHAP drivers with input/model provenance. January–June
  windows and Hargreaves ET0 match training; optional missing covariates use the
  model's missing-value path. Predictions are NDVI anomaly estimates, not yield.
- `cdl.json`: at least 15 distinct annual labels on each proof area (2008–2023).
  Nearest-neighbor categorical exports are aggregated over pixel centers inside
  the polygon. USDA codes 1–60 are crop, 61 is fallow/idle cropland, other classes
  remain other, and tied modes remain mixed. Histograms, modal fractions, native
  source resolution, periods and raster hashes are retained. CDL is a satellite
  classification reference, not farmer-confirmed ground truth.
- `field.json`, `provenance.json`: selection rationale, configuration fingerprint,
  and SHA-256 hashes for every product and asset.

The daily MODIS grid contains observations on composite dates and nulls elsewhere;
there is no interpolation across clouds or between acquisitions. The centroid's
250 m pixel is not a field-resolution map. POWER is regional weather. Soil tests
are absent; downstream pack estimates require local confirmation. NISAR and GRACE
context must retain the service's coarse-scale and provisional labels.
HLS frames retain their native 30 m pixels. Small sampling areas therefore produce
tiny, visibly blocky overlays; enlarging the image would not add measured detail.

Publication happens only after contract validation and size checks. Every field,
including JSON, source sidecars and binary assets, must fit 5,000,000 bytes; each PNG
must fit 150,000 bytes. Outputs are assembled in a staging directory before replacing
the previous publication. `index.json` records the hero definitions. The existing
synthetic demo folders and their projection files remain separately labelled; these
new data artifacts do not change the web hero selector or synthesize CMIP6 factors.

### Raw fixture capture

`capture_fixtures.py` records a small raw public API response or raster plus a
request/provenance record with byte count, retrieval timestamp and SHA-256:

```sh
uv run --project pipelines python pipelines/capture_fixtures.py \
  https://modis.ornl.gov/rst/api/v1/MOD13Q1/dates \
  --params '{"latitude":40.15,"longitude":-103.15}' \
  --output /tmp/itza-demo-fixtures
```

Responses are bounded to 2 MB. Only allowlisted unsigned HTTPS endpoints are
accepted; credential parameters are rejected. `Archive(..., offline=True)` replays
captured requests and fails on missing or corrupt data. Protected NASA raw clips
used by the tests are documented in `fixtures/earthdata/recorded/README.md`.

### Relief-only refresh

`refresh_relief.py --cache <dir> [--only <hero> ...]` adds the 3D surface package
(`assets/relief/`: height image and aerial picture, listed under `relief` in
`terrain.json`) to existing publications without re-fetching NASA data. Akron needs no
credentials (USGS 3DEP and USDA NAIP are open). Sétif falls back to the 30 m DEM, so it
needs Earthdata credentials in `services/science-api/.env`; without them the field is
reported and its previous publication is kept. The USGS services drop requests now and
then: re-run with `--only` for a field that was skipped. A full `build_demo.py` run
publishes the same package.

### Soil-only refresh

`refresh_soil.py` also updates an existing publication without re-fetching NASA data.
It publishes SSURGO soil for Akron and SoilGrids for Sétif, plus `soil.json` metadata.
It stages each field, verifies contracts/assets/size limits and regenerates all file
hashes before replacement. Incomplete soil or failed validation preserves that field's
previous publication. Imagery, classification rasters and ML predictions are retained;
the existing seasonal ML products do not use soil covariates. Re-run this post-step
after a full demo build. `--output` selects the bundle root; `--captures` retains raw
public responses, query/URL records and checksums for reproducibility. The committed
capture set is in `fixtures/ssurgo/hero-refresh/`. No NASA credentials are involved.

### Refresh modeled land-surface data (#106)

From the repo root: `uv run --project pipelines python pipelines/refresh_ldas.py
--store /tmp/itza-ldas-store --captures fixtures/ldas --start 2014-06-01
--end 2014-06-01`. This imports real capture clips with hash checks, reads only
local data, fills moisture gaps after SMAP, retains model ET in `ldas.json`, and
reseals publication hashes. All four heroes include this captured day; this is
not a complete historical LDAS backfill. Run with additional local clips and a
longer explicit period to extend it. Failed validation preserves the previous
publication.

## 2050 baselines (`projection_baselines.py`)

`/v1/projection` turns 2041–2060 model climatologies into change factors against each model's own 1995–2014 baseline, one JSON record per 0.25° cell (`itza_science.clients.baseline.BaselineRecord`). This script builds those records for every hero field's cell from NASA NEX-GDDP-CMIP6 v2.0 (AWS Open Data bucket `nex-gddp-cmip6`, us-west-2, no sign-in; CC0): the six POWER Projection models, the seven variables the API uses (tmax, tmin, tmean, precip, rh, wind, srad) and, per model, the baseline plus the future for SSP1-2.6, SSP2-4.5 and SSP3-7.0. The future is stored too, so cells where POWER Projection returns no data (Sétif) still get factors.

The source files are global, one per model, variable and year (~245 MB), so the full run reads 3,360 files (~820 GB) once and keeps only the hero cells. It is not practical from a laptop; run it on a short-lived VM next to the bucket:

```sh
# one-off run on GCP (us-west1, n2-standard-8, ~1 h, then the VM stops itself)
git archive -o code.tgz HEAD pipelines services/science-api schemas
gcloud storage cp code.tgz gs://$BUCKET/tmp/projection-run/code.tgz
gcloud compute instances create itza-projection-baselines --zone us-west1-b \
  --machine-type n2-standard-8 --image-family debian-12 --image-project debian-cloud \
  --boot-disk-size 50GB --service-account itza-data@$PROJECT.iam.gserviceaccount.com \
  --scopes cloud-platform --metadata-from-file startup-script=startup.sh
# startup.sh: uv sync, `uv run python projection_baselines.py --out /work/out --workers 16`,
# copy /work/out/*.json to gs://$BUCKET/derived/nex-gddp-cmip6/v1/, shut down.
gcloud compute instances delete itza-projection-baselines --zone us-west1-b   # afterwards
```

The science API reads records from `ITZA_DATA_DIR/baselines/projection/` first, then from the dataset store at `derived/nex-gddp-cmip6/v1/` (the Cloud Run mount, or a local `sync.py pull nex-gddp-climatologies`). Shortwave is kept in W/m²; POWER Projection's `ALLSKY_SFC_SW_DWN` values are W/m²-sized despite their `MJ/m^2/day` label, and since that factor is a ratio, the two must stay in the same unit.
