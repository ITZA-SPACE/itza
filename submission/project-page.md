# Project page copy (NASA Space Apps 2026)

Final English text for every required field. Values in `[OWNER: ...]` are known only to the team owner and are filled in on the submission page; nothing else in this file is a placeholder. Sources: docs/SOLUTION_OVERVIEW.md, docs/NASA_DATA_SOURCES.md, THIRD_PARTY_NOTICES.md.

## Project Name

ITZA SPACE (ITZA)

## High-Level Project Summary

Farmers choose what to plant without knowing how each option would have fared in the seasons their own field has already lived through. ITZA reads a field's 25-year history from NASA satellites, replays every real past season, and plausible 2050 seasons, on at least three candidate crop rotations, and shows which one holds up best and why, with sources, gaps and risks on every card. It turns NASA's long Earth record into a rehearsal a farmer can see before committing a whole year, for the "Field Shift: Adapting Farms with NASA Data" challenge.

## Link to Project Demo

[OWNER: public, login-free link to the 30-second video and the 7-slide deck, see submission/video/README.md and submission/deck/slides.md]

## Link to Final Project

- Web app: [OWNER: public app URL]
- Repository: https://github.com/ITZA-SPACE/itza (Apache License 2.0)

## Detailed Project Description

**What it is.** A flight simulator for crop rotations. Pilots train on a simulator before risking an aircraft; farmers risk a season every time they plant. ITZA lets them fly each rotation through the real weather of the last 25 years and through NASA climate scenarios for 2050.

**What it does.**
- *Field Memory:* from a drawn field, reads 25 years of MODIS and 30 m HLS vegetation history, splits it into seasons, finds bare windows and proposes the rotation history (wheat-like, fallow, uncertain). The farmer confirms or edits it.
- *Climate Fingerprint:* from NASA POWER, GPM IMERG and SMAP, computes rainfall, dry spells, frost and heat days, reference evapotranspiration and soil-moisture anomalies per season, and flags the worst seasons.
- *Season Replay:* simulates each rotation day by day through every real season (FAO-56 root-zone water balance, thermal stress, legume nitrogen credit, cover, pest-return rules, erosion) and reports a resilience profile: seasons with severe stress, worst year, spread, win rate against the current rotation.
- *2050 replay:* the same engine on NASA NEX-GDDP-CMIP6 scenarios (SSP1-2.6, SSP2-4.5, SSP3-7.0), labelled as scenarios, not forecasts.
- *Evidence Cards and Model Arena:* every option shows why, evidence, benefits, information gaps and risks for local review, plus a confidence label. A rule engine, a LightGBM stress model and what satellites observed are compared, and disagreement is shown.
- *3D field twin, zones and context:* NASADEM terrain in 3D, management zones, GRACE/GRACE-FO, GEDI, ECOSTRESS and NISAR context where scenes exist.
- *Assistant:* answers questions with small interactive screens built from the app's own approved components; every number comes from a tool result (engine, NASA POWER MCP, NASA CMR MCP), never from the model.

**Two hero fields, one dilemma.** A wheat and fallow field on the Sétif high plains (Algeria) tells the story. A wheat and fallow field on the US Great Plains (Akron, Colorado) is the proof field: the inferred history is scored season by season against the USDA Cropland Data Layer (78% of seasons agree, below our 80% target) and the rotation ranking is compared with a long-term USDA-ARS trial (it disagrees with the trial's direction). Both results are shown as measured.

**What it does not do.** No yield guarantees, no fertilizer, pesticide or irrigation prescriptions, no replacement of agronomists. It shows options and evidence; people decide.

**Tools and languages.** TypeScript, React 19, Vite, TanStack Router and Query, MapLibre GL, deck.gl, ECharts (web app); a pure TypeScript simulation engine in a Web Worker; Python 3.13, FastAPI and uv (data and science API); LightGBM, scikit-learn and TerraTorch (models); a Cloudflare Worker with the Vercel AI SDK and A2UI for the assistant. Runs in a browser; no special hardware. The guided demo mode works offline.

## Use of SI

- *Development:* coding agents (Claude Code) were used to accelerate implementation, tests and documentation; the team set the idea, scope and requirements and reviewed every change before merging.
- *In the product:* a generative-interface assistant (a hosted language model through the SI gateway) assembles answers from a fixed catalog of components; numbers are bound to tool results and captions are checked, and an offline template path runs with no model. A LightGBM stress model (ITZA's own weights, with SHAP explanations) and the NASA/IBM Prithvi-EO-2.0 model (experimental crop/fallow output) are used as independent opinions next to the rule engine.
- *Media:* [OWNER: confirm that no SI-generated image, video or audio is in the demo; the demo is screen capture of the app. If any is added it must carry a visible SI watermark, be named here and in its metadata, and contain no NASA logos, flags or mission identifiers.]
- Code and data produced with SI are acknowledged here and in the repository documentation.

## NASA Data

| Product | Version | Resolution | Role |
|---|---|---|---|
| NASA POWER Daily and Climatology API | API v2.10.3 | ~0.5° × 0.625° (MERRA-2), daily | Temperature, humidity, radiation, wind: reference ET, frost and heat days, climatology; backbone of every replay |
| NASA POWER projections (NEX-GDDP-CMIP6) | CMIP6 SSP1-2.6, SSP2-4.5, SSP3-7.0 | 0.25°, daily | 2050 scenario replay |
| GPM IMERG Final and Late Daily (GES DISC) | V07 | 0.1° | Daily rainfall, dry spells, erosion driver |
| SMAP L4 SPL4SMGP (NSIDC DAAC) | v8 | 9 km grid | Surface and root-zone soil moisture, cross-check of the water balance |
| HLS L30 and S30 (LP DAAC) | v2.0 | 30 m | Field-scale NDVI history, zones, 3D texture |
| MODIS MOD13Q1 (LP DAAC) | v061 | 250 m | 25-year NDVI history, ML training target |
| MODIS MOD16A2GF (LP DAAC) | v061 | 500 m | Actual evapotranspiration cross-check |
| MODIS MCD12Q2 (LP DAAC) | v061 | 500 m | Season dates (phenology) |
| MODIS MCD12Q1 (LP DAAC) | v061 | 500 m | Cropland mask for ML training |
| NASADEM_HGT (LP DAAC) | v001 | 30 m | Elevation, slope, flow paths, 3D terrain |
| GRACE / GRACE-FO JPL mascon | RL06.3 v04 | 0.5° grid, ~300 km effective | Water-storage trend card |
| NISAR L3 SME2 soil moisture (ASF DAAC) | provisional V1 | 200 m | Within-field moisture snapshot |
| GEDI L2A / L2B (LP DAAC) | v002 | 25 m footprints | Vegetation structure context |
| ECOSTRESS L2T LSTE, L4T ESI (LP DAAC) | v002 | 70 m | Surface temperature and evaporative stress where scenes exist |
| NASA CMR Search API and NASA POWER MCP / CMR MCP servers | API as of 2026-11 | n/a | Granule availability and grounded assistant tools |
| NASA/IBM Prithvi-EO-2.0-tiny-TL | revision 335eadc | 30 m inputs | Experimental crop/fallow classification |

DOIs are in References for every product that has one in `data-sources.yaml`; GRACE/GRACE-FO, NISAR, GEDI and ECOSTRESS are listed there under the NASA open data policy. Versions match the collections the science API decodes (`services/science-api/src/itza_science/context/products.py`) and docs/NASA_DATA_SOURCES.md.

## Space Agency Partner Data and Other References

The app also lists every source, license, citation and the SI-use statement in its "Data and credits" tab (Methods drawer). Paste the full contents of `submission/references.md` (generated from the third-party register; every dataset, service, library, model, font and image with its license). Partner data: ESA Copernicus Sentinel-2, through HLS S30 and the EOxCloudless 2016 basemap.
