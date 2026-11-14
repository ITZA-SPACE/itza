# Dataset store

One shared, versioned dataset store on Google Cloud Storage, so nobody re-downloads SMAP, IMERG, HLS and the rest. It holds **area-of-interest clips and derived products, never global archives**. The bucket is read-only for the team; the public app keeps serving its own static bundles.

- `manifest.yaml`: every object set with source product, version, original URL or DOI, retrieval date, spatial and temporal subset, license, citation, and the byte size and SHA-256 of each file.
- `sync.py`: `validate`, `verify`, `pull` (team), `fetch`, `register` and `push` (maintainer).

Sets start as `status: planned` with no files. Nothing large is transferred until the team has reviewed the size table in issue #103 and approved the bucket plan. After a set is fetched and registered it becomes `status: synced`, with its file list and checksums.

## Setup

```bash
cd pipelines/data_store
uv sync                       # team: pull and verify
uv sync --extra fetch         # maintainer: also needs earthaccess
export ITZA_DATA_BUCKET=<bucket name>   # or pass --bucket
```

Authentication is never stored here: Google Cloud uses your `gcloud auth login`, Earthdata uses the `EARTHDATA_TOKEN` environment variable, `~/.netrc` (`machine urs.earthdata.nasa.gov login <user> password <password>`) or `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD`.

## Team: get the data

```bash
uv run python sync.py pull                 # every synced set into ./data (gitignored)
uv run python sync.py pull smap-l4-spl4smgp
uv run python sync.py verify               # recompute every checksum, offline
```

`pull` uses `gcloud storage rsync`, so a rerun resumes an interrupted transfer, and it verifies every SHA-256 afterwards. A non-zero exit means a file is missing or damaged.

## Maintainer: add or update a set

```bash
uv run python sync.py fetch smap-l4-spl4smgp   # earthaccess download into ./data, then register
uv run python sync.py register demo-bundles    # derived set: build the files under ./data/derived/..., then register
uv run python sync.py push                     # verify locally, then upload
```

Sets with a `clip` recipe (SMAP L4 and IMERG, kind `derived`) are streamed instead: `fetch` samples global granules (`every_days`), downloads a few at a time (`ITZA_FETCH_WORKERS`, default 8), writes one clip per region under `<region>/` and deletes the global file, so disk use stays small. It refuses a recipe whose download exceeds `max_download_gb`. Clips follow the windows of `pipelines/build_demo.py`; the SMAP set keeps the first 3-hourly granule of every 15th day and IMERG one day in seven, not full daily series.

Other `fetch` sets download whole granules over each region; files already present are skipped, so an interrupted fetch resumes. It refuses any set whose granules exceed three times the size estimate; for those, add a `clip` recipe or build the clip with the pipeline that owns the product and `register` it. `register` rewrites `manifest.yaml` (status, retrieval date, file list); commit that change with the data push.

New data version: add a new set with a new `version` (a new path and manifest entry). Old versions stay until someone removes them on purpose.

## Bucket layout

`raw/<source>/<version>/...`, `derived/<pipeline>/<version>/...`. The bucket plan, access model and costs are in [`infra/README.md`](../../infra/README.md#dataset-store-gcs).

## Tests

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest
```

Offline: a fake `fetch` module and a copy-based fake bucket replace the network and `gcloud`.
