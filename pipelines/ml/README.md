# Regional stress model

This uv project captures NASA observations, constructs stage features, trains a seeded
CPU LightGBM regressor, and evaluates independent spatial blocks and held-out years.
It predicts retrospective **seasonal NDVI peak anomaly**, not yield. See
[MODEL_CARD.md](MODEL_CARD.md) for measured results and limitations.

## Reproduce the committed model (offline)

From the repository root, with uv and Python 3.12+:

```sh
uv sync --project pipelines/ml --locked
uv run --directory pipelines/ml python train.py data/pixel-seasons.jsonl.gz \
  --provenance provenance.json --seed 16 --pixels-per-region 300 \
  --output ../../services/science-api/models/stress-v1
uv run --directory pipelines/ml pytest
uv run --directory pipelines/ml mypy data.py capture.py enrich.py train.py tests
uv run --project pipelines/ml ruff check pipelines/ml
uv run --project pipelines/ml ruff format --check pipelines/ml
```

The CI Pipelines job runs these lint, formatting, type and offline test checks.
The lockfile pins the environment. LightGBM uses deterministic column-wise training,
one CPU thread, 80 rounds, and fixed hyperparameters; no hyperparameter search uses the
holdouts. Byte identity is checked on the fixture in one environment. Different
LightGBM/compiler/platform versions may yield different bytes or floating-point results.
LightGBM requires OpenMP (`brew install libomp` on macOS; `libgomp1` on Debian).

## Capture a new snapshot (network access)

```sh
uv run --directory pipelines/ml python capture.py \
  --cache /tmp/itza-modis-power --output /tmp/itza-pixel-seasons.jsonl
uv run --directory pipelines/ml python enrich.py /tmp/itza-pixel-seasons.jsonl \
  --cache /tmp/itza-covariates --output data/pixel-seasons.jsonl.gz
```

MODIS and POWER are public. NASADEM retrieval uses the existing science-api Earthdata
adapter; configure `EARTHDATA_TOKEN` or username/password in
`services/science-api/.env` or the environment. Credentials never enter the output.
Raw MODIS/POWER responses, SoilGrids rasters, SMAP seasonal means and terrain layers
are cached; keep the cache for audit. Each source fails independently during enrichment;
`gaps.json` lists source failures and the model metrics count missing feature values.
No defaults are substituted for missing measurements. Retraining a new snapshot requires
updating `provenance.json` and the model card with its source periods and resulting metrics.

The capture uses six explicitly listed, separated 2 km sampling areas near the two hero
regions. It retrieves MOD13Q1 250 m NDVI and pixel reliability in batches of at most ten
composites, keeps good-quality observations, and requires six observations per season.
The MCD12Q1 IGBP class 12 mask is sampled by pixel center on its native 500 m grid.
A missing current-year mask uses the latest prior mask; `land_cover_year` records it.
Pixel histories with fewer than five cropped seasons or constant NDVI are excluded.
A seed samples whole pixel histories within each region, preserving their climatology.

January–June windows approximate winter cereals: days 1–46 initial, 47–92 development,
93–138 mid, and the remaining days late. They do not describe every crop in either region.
Rain and Hargreaves ET0 are summed by window; balance = rain − ET0; longest dry spell
counts consecutive days with rain <1 mm within a window; frost = Tmin <0°C; heat = Tmax
>35°C. Previous state is the preceding January–June observed NDVI peak, when available.
Daily weather must be complete and ordered. It is shared within each sampling area.

SMAP RZMC is taken from NASA POWER's public daily UTC Zarr archive at the nearest grid
cell, averaged over January–June, and standardized over available 2016–2025 seasons.
At least 90% daily coverage and five nonconstant years are required. Pre-2016 seasons
remain missing (2015 is incomplete). Soil AWC is the thickness-weighted difference of
SoilGrids water content at 33 and 1500 kPa over 0–100 cm, in mm/m. NASADEM elevation is
reprojected to a local 30 m grid; central-difference slope is sampled at the MODIS center.

The NDVI target is standardized per pixel over its observed cropped seasons in the
snapshot. This fixed retrospective climatology includes held-out years: temporal CV
measures historical-season reconstruction, **not future forecasting**. Spatial CV leaves
one entire sampling area out. Temporal CV leaves one year out across all areas. Each row
has one out-of-fold prediction per scheme; `metrics.json` records pooled and per-region
RMSE/MAE/R², per-fold scores and a training-mean baseline. Nearby pixels sharing weather
are not independent samples. Six sampled areas do not establish region-wide generalization.

## Serve

`services/science-api/models/stress-v1/` contains the small text model, metadata and metrics.
The Docker image copies it to `/app/models/stress-v1` and installs the OpenMP runtime.
Local science-api commands run from that service directory. Override
`ITZA_ML_MODEL_DIR` to use another artifact directory; restart the service after replacing
an artifact because successful loads are cached. Missing, malformed or fixture artifacts
produce HTTP 503. No training runs during an API request.

`POST /v1/ml/stress` takes `features` plus a nonempty `provenance` list containing
`source`, `resolution` and `period`. Four stage objects contain `rain_mm`,
`dry_spell_days`, `et0_mm`, `balance_mm`, `frost_days`, and `heat_days`. Optional fields
are `smap_rootzone_anomaly`, `previous_peak_ndvi`, `soil_awc_mm_m`, and `slope_deg`.
Missing optional fields follow LightGBM's native missing-value path and appear in `gaps`.
All numeric inputs are finite and bounded; unknown fields and malformed input return 422.
The response contains the prediction, expected value, all drivers sorted by absolute
SHAP value (largest first), model version, limitations and input/model provenance.
All SHAP values plus the expected value sum to the prediction. Native LightGBM
`pred_contrib=True` provides path-dependent TreeSHAP, avoiding a separate SHAP dependency:
[LightGBM documentation](https://lightgbm.readthedocs.io/en/latest/pythonapi/lightgbm.Booster.html).
