# Model card: regional NDVI stress opinion

Artifact: `stress-v1-9a81e031e6a4`. Seed 16.

This is an **experimental statistical second opinion** for retrospective winter-cereal seasons. Holdout skill is low, especially in the US region. It must not determine a rotation choice by itself. It predicts satellite greenness anomaly, not yield, causation, or a management prescription.

## Data and target

The frozen [dataset](data/pixel-seasons.jsonl.gz) contains 5,143 qualifying pixel-seasons. Whole-pixel history filtering retains **5,085 rows from 279 pixels**, spanning every year from 2001 through 2025. Histories need at least five cropped seasons and nonconstant NDVI. The 300-pixel cap per region does not bind for this snapshot. All scores below come from the committed [metrics.json](../../services/science-api/models/stress-v1/metrics.json); [provenance.json](provenance.json) records sources, resolutions and periods.

| Spatial block center (latitude, longitude) | Retained training rows |
|---|---:|
| dz-high-plains:35.52:6.33 | 504 |
| dz-high-plains:36.12:5.73 | 1,441 |
| us-central-great-plains:39.35:-102.35 | 1,327 |
| us-central-great-plains:40.95:-101.55 | 1,813 |

Two additional candidate areas (35.72 N, 4.93 E and 40.15 N, 103.15 W) supplied no class-12 cropland seasons and were excluded. The proof-region samples are near Akron, rather than the station coordinate itself. Four small sampling areas do not represent either entire region.

The target is January–June good-quality MOD13Q1 NDVI peak, standardized by each pixel’s observed cropped-season mean and population standard deviation. Its fixed retrospective climatology includes held-out years. Temporal scores therefore measure historical reconstruction with a known climatology, **not prospective forecasting**. No current-season NDVI enters the feature vector. The previous season’s observed peak is allowed as historical state.

## Holdout results

Hyperparameters were fixed before viewing these scores: 80 boosting rounds, learning rate 0.05, 7 leaves, minimum 20 rows per leaf, L2 penalty 5, deterministic column-wise training with one CPU thread. No holdout was used for parameter selection. Spatial CV leaves one entire sampling area out (four folds); temporal CV leaves one year out across all areas (25 folds). Each row has exactly one out-of-fold prediction per scheme. Metrics weight pixel-seasons equally; pixels sharing weather are correlated.

| Holdout | RMSE (z-score) | MAE (z-score) | R² | Training-mean baseline RMSE |
|---|---:|---:|---:|---:|
| spatial | 0.939579 | 0.761248 | 0.117191 | 1.000000 |
| temporal | 0.975822 | 0.804933 | 0.047772 | 1.008488 |

| Region | Spatial RMSE | Spatial R² | Temporal RMSE | Temporal R² |
|---|---:|---:|---:|---:|
| dz-high-plains | 0.798855 | 0.361831 | 0.939534 | 0.117275 |
| us-central-great-plains | 1.017028 | -0.034346 | 0.997637 | 0.004720 |

The pooled model improves modestly on the mean baseline. US spatial R² is negative, and US temporal R² is near zero: this snapshot does not establish useful generalization there. No confidence interval or region-wide performance claim is made. Inspect all fold scores in the metrics artifact, rather than interpreting the pooled score as reliability for an individual field.

## Features and missing observations

The [feature builder and capture protocol](README.md) define the four calendar stages and the rain, longest dry spell, Hargreaves reference ET0, rain-minus-ET0, frost and heat aggregates. Additional features are previous-season NDVI peak, SMAP root-zone anomaly, 0–100 cm available water capacity and slope. Missing values follow LightGBM’s native missing-value path. There are no entirely unobserved feature columns in this training run.

| Feature | Missing rows out of 5,085 |
|---|---:|
| `smap_rootzone_anomaly` | 3,150 |
| `previous_peak_ndvi` | 128 |
| `soil_awc_mm_m` | 173 |
| `slope_deg` | 25 |

SMAP starts during 2015, so the complete January–June seasonal feature begins in 2016. Remaining missing AWC/slope values are nodata at sampled cells; prior NDVI can lack enough quality observations. Missing measurements were not replaced with regional defaults. All six source retrievals completed; cell-level missingness is recorded above.

## Sources, resolutions and periods

- [MOD13Q1 via ORNL DAAC REST](https://modis.ornl.gov/data/modis_webservice.html): nominal 250 m, 16-day composites; 2001–2025 January–June, reliability flag 0 only, at least six observations per season. The sinusoidal grid spacing is approximately 231.656 m. Historical state uses 2000 observations when available.
- [MCD12Q1 land-cover guide](https://modis.ornl.gov/documentation/guides/MCD12_User_Guide_V6.pdf): nominal 500 m annual IGBP cropland class 12; mapped by nearest pixel center. The dataset records the mask year for every season; a missing mask uses the latest preceding year.
- [NASA POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/): MERRA-2 weather at 0.5° latitude × 0.625° longitude, 2001–2025, shared within each area. Reference ET0 uses [FAO-56 equations 21–25 and 52](https://www.fao.org/4/X0490E/x0490e07.htm).
- [NASA POWER SMAP archive](https://power.larc.nasa.gov/docs/methodology/data/sources_hydrology/): daily UTC RZMC, SMAP L4 nominal 9 km regridded by POWER; 2016–2025 complete seasonal means standardized across those available seasons. Archive metadata reports POWER version 10.0.0 and variable status `reviewing`. Future placeholder coordinates are excluded.
- [ISRIC SoilGrids WCS](https://docs.isric.org/globaldata/soilgrids/WCS_from_Python.html): nominal 250 m static predicted water retention at 33 and 1500 kPa, five depth intervals from 0–100 cm, thickness-weighted difference in mm/m. Numeric WCS rasters were retrieved on 2026-11-12.
- [NASADEM_HGT v001](https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001): nominal 30 m elevation based on the 2000-02-11 to 2000-02-22 SRTM acquisition. Reprojected local 30 m gradient supplies slope at each MODIS center; retrieved through the existing Earthdata adapter on 2026-11-12.

## Limits and interpretation

- **Irrigation confounding:** management, irrigation, crop type and fallow can preserve or suppress NDVI independently of rain. They are not causal effects identified by this model.
- **Mixed pixels:** a 250 m observation and a 500 m cropland mask can mix crops, bare land, field edges and non-crop vegetation. Class 12 does not confirm a crop in every season.
- **Coverage:** two nonempty blocks per region, 25 annual holdouts and coarse shared weather provide a small number of independent conditions despite thousands of rows. The winter-cereal calendar does not cover every rotation or summer crop.
- **Method uncertainty:** temperature-only Hargreaves ET0 is an approximation; calendar stages are not remotely sensed phenology; SoilGrids is a static prediction; NASADEM slope is sampled at a pixel center rather than averaged over a field. Optical gaps can hide a true seasonal peak.
- **Retrospective information:** target climatology and SMAP seasonal climatology use the frozen observation period. Full-season inputs and previous observed state are for replay, not an advance forecast.
- **Explanations:** native LightGBM path-dependent TreeSHAP describes model contributions, not agronomic causation. All signed contributions plus the expected value sum to the prediction; sorted drivers retain all contributions.
- **No prescriptions:** outputs are neither measured yield nor fertilizer, pesticide or irrigation recommendations. Disagreement with the rule engine or observed satellite anomaly calls for local review.

## Reproduction and artifacts

Use the pinned uv project and offline CPU command in [README.md](README.md). No GPU or paid service is required. The committed model is far below 10 MB and ships in the science-api Docker image. Successful model loads are cached until service restart.

Uncompressed input SHA-256: `af0e344114523a3768805d1c9a2bb2c2ecdd9ef206c1e089c1f1cf8a2176d02e`.

Artifact directory: `services/science-api/models/stress-v1/`; model text: 66,674 bytes. Model version: `stress-v1-9a81e031e6a4`.
