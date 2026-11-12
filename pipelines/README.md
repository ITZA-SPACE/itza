# Pipelines

Batch Python jobs (uv): demo bundle build, fixture capture, ML training and Prithvi jobs on NVIDIA Brev. Outputs go to the VPS or the repository; Brev never serves ([TECHNICAL_ARCHITECTURE.md §4.4](../docs/TECHNICAL_ARCHITECTURE.md#44-hosting-and-compute)). Owned by workstreams D and M.

## Hero-field precompute (`build_demo.py`)

Builds the bundles `apps/web/public/bundles/<id>/` serves, calling the science API's own modules
directly (no HTTP). Needs `services/science-api/.env` with Earthdata credentials (copy
`.env.example`), since granules are read through the same `EarthaccessGranuleReader` the live
service uses.

```sh
uv sync --project pipelines
uv run --project pipelines python pipelines/build_demo.py --years 11            # full run, every field
uv run --project pipelines python pipelines/build_demo.py --days 45 --refresh \
  --fields semi-arid-winter-cereal --out /tmp/hero-test-out                     # a trial run, away from the served path
uv run --project pipelines pytest pipelines/tests
uv run --project pipelines mypy pipelines/build_demo.py pipelines/capture_fixtures.py pipelines/tests
uv run --project pipelines ruff check pipelines
uv run --project pipelines ruff format --check pipelines
```

A real HLS/SMAP/IMERG fetch is slow (SMAP alone is ~150 MB per 3-hourly file): a single month for
one field took on the order of tens of minutes against the live Earthdata token in this session.
Idempotent: a field whose `bundle.json` already carries `generated_at` is skipped unless
`--refresh`, so an interrupted multi-field run can simply be restarted. Every built bundle is
checked against `schemas/field-bundle.schema.json` and the 5 MB budget before it is written;
either failure raises instead of writing a bad or oversized bundle.

Per-season ML stress predictions (the issue's other context item) are not in this pipeline: the
bundle contract has no computed season boundaries to attach them to (`phenology: []` always), and
deriving them would mean re-implementing engine phenology logic in Python. Left for a follow-up
that first decides where season boundaries for a precomputed bundle should come from.

`capture_fixtures.py` records a raw USDA NASS CropScape CDL response into `fixtures/cdl/` for
offline tests:

```sh
uv run --project pipelines python pipelines/capture_fixtures.py --year 2020 --lon -103.15 --lat 40.15 --out akron_2020.txt
```
