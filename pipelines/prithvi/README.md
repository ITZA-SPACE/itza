# Experimental Prithvi crop/fallow layer

This is an experimental two-class segmentation opinion, not a management record or
an improvement over Field Memory. The measured model fails to distinguish fallow
in the held-out dataset (see results below). Do not treat its crop maps as validated
rotation history. No cereal/legume classification is claimed.

## Method and data

The encoder is NASA/IBM **Prithvi-EO-2.0-tiny-TL**, built through TerraTorch's backbone
registry. Its official weights are pinned to revision
`335eadc2c45ad5abe7bd307223e1c48c5b60c41b`. The design follows the official
[multi-temporal crop configuration](https://github.com/NASA-IMPACT/Prithvi-EO-2.0/blob/main/configs/multicrop.yaml):
three dates, six bands (blue, green, red, narrow NIR, SWIR1, SWIR2), date and location
coordinates. A small trainable 1×1 convolutional head replaces the large UperNet
head for CPU work; all encoder weights are fine-tuned. TerraTorch's published v2
normalization constants are used in native reflectance ×10,000 units. The head
bilinearly upsamples 16-pixel encoder patches (480 m) to a 30 m raster grid. This
small decoder does not independently resolve 30 m field detail.

Training data come from the official [2022 HLS/CDL crop dataset](https://huggingface.co/datasets/ibm-nasa-geospatial/multi-temporal-crop-classification)
(CC BY 4.0; Cecil, Kordi, Li, Khallaghi and Alemohammad, DOI 10.57967/hf/0955), served
from its public Source Cooperative S3 mirror. `capture.py` selects in source CSV
order, caps each HLS tile at four chips, and requires at least 64 pixels of both crop
and fallow per chip. This is a targeted benchmark, not the population distribution.
CDL-derived codes 3, 4, 8, 9, 11 and 12 become crop; 10 becomes fallow/idle; all other
classes are ignored. CDL is a satellite classification reference, not surveyed truth.

Tiles 13TDE, 14TNR, 11TPH and 12TYR are reserved before training. No held-out tile
enters training, and the actual chip footprints must be separated by at least 10 km. The measured
minimum training-to-holdout edge gap is 414,902 m.
All fields inside the held-out chips are therefore excluded from training; no
cadastral outlines are available. Metrics count scored pixels within these spatial
blocks, not independent field observations. The committed data manifest records
all chip identifiers, dates, URLs and source hashes.

Training uses seed 18, 80 optimizer steps, AdamW (learning rate 0.0001, weight decay
0.01), and 64×64 windows alternately centered on training crop and fallow pixels.
The final fixed step is evaluated once; validation does not select a checkpoint.
There are 16 training chips and 5 held-out chips. Sétif has no farmer-confirmed
seasons, so there is no Algeria validation or story-field supervision.

## Measured held-out results

`artifacts/metrics.json` is the source of these measurements (2022 HLS/CDL, 30 m).
On 116,502 scored pixels, confusion matrix rows are reference crop/fallow and
columns predicted crop/fallow:

| Reference | Predicted crop | Predicted fallow |
|---|---:|---:|
| Crop | 93,054 | 0 |
| Fallow/idle | 23,448 | 0 |

Pixel accuracy is **0.798733**, crop IoU **0.798733**, fallow IoU **0**, and mean IoU
**0.399367**. The training-majority baseline has the same scores. The model predicts
crop everywhere on these held-out chips. This small CPU run establishes the
reproducible training, evaluation and inference path; it establishes no useful fallow
classification skill. Per-chip results, spatial separation and artifact hashes are
reported in `artifacts/metrics.json`. No yield, causal or farmer-confirmed accuracy
claim follows from these metrics. Future model development needs a new untouched
holdout before reporting confirmatory improvements.

## Reproduce locally

From the repository root, with Python 3.13 and uv:

```sh
uv sync --project pipelines/prithvi --locked
uv run --project pipelines/prithvi python pipelines/prithvi/capture.py /tmp/itza-prithvi-data
uv run --project pipelines/prithvi python pipelines/prithvi/train.py \
  /tmp/itza-prithvi-data /tmp/itza-prithvi-model --steps 80 --seed 18
uv run --directory pipelines/prithvi ruff check .
uv run --directory pipelines/prithvi ruff format --check .
uv run --directory pipelines/prithvi mypy .
uv run --directory pipelines/prithvi pytest
```

A dedicated CI job runs lint, formatting, strict types and the offline tests.
The capture downloads only selected individual chips, not the 10 GB training
archive. Captures resume from cached files; their hashes are checked before training.
The full trained checkpoint stays outside the repo and outside the API image.
The weights can be reproduced with these commands; platform/library changes may
change trained bytes or floating-point results. The committed report contains the
checkpoint digest used for the published maps. Tests use synthetic offline rasters
and never download model weights or imagery.

## Hero inputs, precomputation and serving

```sh
uv run --project pipelines/prithvi python pipelines/prithvi/hero.py capture /tmp/itza-prithvi-heroes
uv run --project pipelines/prithvi python pipelines/prithvi/hero.py infer \
  /tmp/itza-prithvi-heroes /tmp/itza-prithvi-model/model.pt \
  /tmp/itza-prithvi-model/metrics.json services/science-api/models/prithvi
```

Earthdata credentials are read only from the science service's `.env` or environment.
`capture --only <hero-id>` resumes a single field. Capture uses three distinct
recorded HLS dates nearest April, June and September in each of 2024 and 2025,
with a native 64×64 context window. If a VI date has no matching spectral
granule, the next nearest recorded date is tried and the substitution is disclosed. The six raw bands and Fmask are read with bounded
remote windows. Bands are aligned with nearest-neighbor resampling to the first
scene's native 30 m grid. Fmask bits 0–4 and fill values are invalid. Outputs are
masked to the intersection of valid observations across all three dates and to
pixel centers inside the sampling polygon. No valid observation is interpolated
across clouds; missing input values are replaced by the pretrained channel mean
only for model execution and always masked from the output. Three-date coverage
can be poor; a zero raster is a gap, not fallow.

`data/heroes/` retains the small captured input chips and source sidecars so hero
inference can be replayed without Earthdata. Each sidecar records public source URLs,
window hashes, grid and dates. These input chips are real imagery, not test fixtures.
The classes are 0 = no data, 1 = crop, 2 = fallow/idle. Native output pixels remain
blocky on these small sampling polygons. They are not surveyed farm/trial outlines.
2024–2025 hero predictions are unvalidated transfer results; all earlier replay
years lack six-band captures and remain an explicit gap.

For repository publication, install the root Node/pnpm dependencies so `infer` uses
Biome before computing static JSON integrity hashes.
`infer` writes `prithvi.json` and per-season GeoTIFFs under the API model directory,
adds identical sidecars to the four static hero bundles, and updates their integrity
records. Both copies come from this single publication command. The dedicated
Prithvi CI job verifies identical manifests, the complete raster inventory, every
raster's bytes and checksums, and bundle integrity records. Editing only one copy
or leaving an unlisted raster causes CI to fail. Existing FieldBundle/layer schemas are unchanged. This issue does not wire
an unskilled experimental opinion into the web Model Arena or replace Field Memory.
The Docker image already copies `services/science-api/models/`; torch stays in this
pipeline's separate uv environment. Set `ITZA_PRITHVI_DIR` to override the publication
root. The API serves provenance at `GET /v1/prithvi/{bundle_id}` and verified rasters
at `GET /v1/prithvi/{bundle_id}/rasters/{year}`. Missing seasons return 404, corrupt
publications return 503. No inference or NASA request runs during these endpoints.

## Brev job lifecycle

CPU was sufficient for the measured run; no cloud instance was created. `brev.sh`
provides explicit create, run, copy and stop commands for one L4 GPU job, using team
credits. Brev is batch compute and never serves the app. The CLI is not installed in
the local development environment, so this cloud lifecycle has not been executed.

```sh
pipelines/prithvi/brev.sh create itza-prithvi
pipelines/prithvi/brev.sh run itza-prithvi /tmp/itza-prithvi-data /tmp/itza-prithvi-heroes
pipelines/prithvi/brev.sh copy itza-prithvi ./prithvi-output
pipelines/prithvi/brev.sh stop itza-prithvi
```

`create` displays current offers and the instance type before provisioning. `run`
uploads only code, the lockfile, manifest and captured inputs; credentials and repo
env files are excluded. It trains, evaluates and precomputes under `~/itza-prithvi`.
Inspect and validate copied outputs before publishing; GPU results can differ from
the CPU report. Run `stop` after copying, including after a failed job, and verify
its status with `brev ls`. Stopped disks may still be billed; no deletion is automated.
