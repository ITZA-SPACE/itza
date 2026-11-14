# NASA Data Sources

Catalog of the datasets, APIs and tools ITZA uses: role, access, live-verified status, limitations, the plug-in model for adding the official challenge resources, and the data to test with before the event.

Back to [PRD](../PRD.md). Architecture of the adapter layer: [TECHNICAL_ARCHITECTURE.md §5](TECHNICAL_ARCHITECTURE.md#5-data-layer).

> **Verification note.** "Verified" entries were checked with live requests on **2026-11-08** from the team machine using a Sétif high-plains test point (36.19 N, 5.41 E) unless stated otherwise. Resolutions and coverage come from official product pages. The official challenge Resources tab was published on **2026-11-13**; its list is mapped to these sources in [CHALLENGE_RULES_2026.md §7](CHALLENGE_RULES_2026.md#7-official-resources-for-field-shift-and-itza-coverage). No listed resource is individually mandatory; at least one NASA source is required for a Global Award.

---

## Official resource intake — 2026-11-13

Read the published [Field Shift Resources tab](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=resources)
on November 13. It links source portals rather than supplying a separate label archive.
“Listed” below records challenge inclusion, not API or product-version verification.

| Listed resources | ITZA mapping / intake decision |
|---|---|
| SMAP; GPM/IMERG; Landsat; MODIS; VIIRS; POWER; SRTM; ECOSTRESS; GEDI | Existing source families; retain verified product IDs and native provenance |
| USDA CDL / CropScape | Independent proof-area history reference in #17; preserve crop/fallow/other labels |
| Web Soil Survey; SSURGO/STATSGO2; Ag Data Commons | Candidate US soil/research complements; no adapter claimed by this intake |
| PRISM; NLDAS/GLDAS; CoCoRaHS; USGS NWIS; OpenET | Candidate weather/water cross-checks; access and coverage still need verification |
| GAEZ; NAIP; NLCD; LANDFIRE; USDA AMS Market News; NASS QuickStats | Candidate crop suitability, imagery, landscape and economic context; outside #17 |
| Sentinel-2 (Copernicus); ERA5 | Partner alternatives; retain the NASA-first source chains |

This intake does not automatically add dependencies or change canonical contracts.
The resources do not replace the separate verification records below. CDL remains a
satellite classification reference, not a farmer-confirmed observation or an identified
Akron experimental plot.


> **Shared dataset store (#103):** large or slow inputs are mirrored once, as area-of-interest clips and derived products, in a team GCS bucket described by `pipelines/data_store/manifest.yaml` (source, version, license, citation, SHA-256 per file). See `pipelines/data_store/README.md` and `infra/README.md`.

## 1. Summary matrix

| # | Source | Variables used | Resolution / cadence | Coverage | Access | Auth | Browser CORS | Status (2026-11-08) | Priority |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **NASA POWER Daily** | T2M, T2M_MAX/MIN, RH2M, WS2M, ALLSKY_SFC_SW_DWN, PRECTOTCORR, EVPTRNS, GWETROOT | ~0.5° × 0.625° (MERRA-2), daily | 1981–near real time | REST `/api/temporal/daily/point` | None | Yes (`*`) | **Verified**, API v2.10.3 | P0 |
| 2 | **NASA POWER Climatology** | Monthly normals | as above | 2001–2025 (25 yr) | REST `/api/temporal/climatology/point` | None | Yes | **Verified** | P0 |
| 3 | **NASA POWER Projection** (NEX-GDDP-CMIP6) | T2M, T2M_MAX/MIN, RH2M, PRECTOTCORR, WS10M, SW/LW down | 0.25°, daily/monthly | 2015–2100, SSP126/245/370 | REST `/api/projection/...` | None | Yes | **Partially verified**: API v2.6.4-beta returns values for US test points (Denver; Akron proof field, verified 2026-11-09); **returns −999 for the Sétif point** (2015 and 2050) | P1 (+fallback) |
| 4 | **NEX-GDDP-CMIP6 archive** | tas, tasmax, tasmin, pr, hurs, rsds, sfcWind | 0.25°, daily | 1950–2100 | AWS S3 open data `s3://nex-gddp-cmip6` (no-sign); NCCS THREDDS NetcdfSubset | None | No (server-side) | Documented ([AWS registry](https://registry.opendata.aws/nex-gddp-cmip6/), [NCCS](https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6)) | P1 fallback |
| 5 | **GPM IMERG Final daily V07** (`GPM_3IMERGDF`) | Precipitation | 0.1°, daily | 1998 → **2025-09-30** (latest granule in CMR) | Earthdata Cloud / GES DISC (OPeNDAP), earthaccess | Earthdata Login | n/a | **Verified (CMR)** | P0 |
| 6 | **GPM IMERG Late daily V07** (`GPM_3IMERGDL`) | Precipitation | 0.1°, daily | 1998 → ongoing | as above | Earthdata Login | n/a | **Verified (CMR)** | P0 |
| 7 | **SMAP L4 Global 3-hourly 9 km** (`SPL4SMGP` v008) | Surface + root-zone soil moisture | 9 km, 3-hourly | 2015-03-31 → **2026-11-05** | NSIDC DAAC / Earthdata Cloud, earthaccess, AppEEARS | Earthdata Login | n/a | **Verified (CMR)** | P0 |
| 8 | **SMAP L3 Enhanced 9 km** (`SPL3SMP_E`) | Surface soil moisture | 9 km, daily | 2015 → **2026-11-07** | NSIDC, AppEEARS | Earthdata Login | n/a | **Verified (CMR)**; ORNL subset service says "no data" for this location | P1 |
| 9 | **MODIS MOD13Q1 / MYD13Q1** | NDVI, EVI, VI quality | 250 m, 16-day | 2000-02-18 → **2026-10-16** | ORNL DAAC MODIS REST | None | Yes (origin echoed) | **Verified** (614 dates) | P0 |
| 10 | **MODIS MOD16A2GF** | Actual ET (gap-filled) | 500 m, 8-day | 2000 → 2025-12-27 | ORNL REST | None | Yes | **Verified** | P1 |
| 11 | **MODIS MCD12Q2** | Land-surface phenology (green-up, peak, dormancy) | 500 m, yearly | 2001–2025 | ORNL REST | None | Yes | **Verified** | P1 (Field Memory cross-check) |
| 12 | **VIIRS VNP13A1** | NDVI (MODIS continuity) | 500 m, 16-day | ORNL series ends 2024-05-24 | ORNL REST / LP DAAC | None / EDL | Yes | **Verified (ORNL dates)**; use LP DAAC for newer versions | P2 continuity |
| 13 | **HLS v2.0** (`HLSL30`, `HLSS30`) | Surface reflectance | 30 m, ~2–3 day combined | L30 2013→, S30 2015→ | LP DAAC Earthdata Cloud (COG), CMR-STAC, earthaccess, TiTiler-CMR | Earthdata Login | n/a | **Verified (CMR)**: S30 granules over Sétif in March 2026 (tile T31SGA) | P0/P1 |
| 14 | **HLS Vegetation Indices v2.0** (`HLSL30_VI`, `HLSS30_VI`) | NDVI, EVI, SAVI, etc. | 30 m, daily product | L30 2013-04→, S30 2015-11→ | as above | Earthdata Login | n/a | **Verified (CMR collections)** | P0/P1 |
| 15 | **NISAR L3 Soil Moisture** (`NISAR_L3_SME2_PROVISIONAL_V1`) | Soil moisture | 200 m, ~twice per 12 days | Observations from 2026-06-17; full record expected by end of 2026 | ASF DAAC (Vertex, `asf_search`), Earthdata Search | Earthdata Login | n/a | **Verified (CMR)**: ≥ 100 granules in a Sétif-area box from 2026-06-21; provisional, partially validated ([Earthdata](https://www.earthdata.nasa.gov/data/alerts-outages/nisar-l-band-data-now-publicly-available), [catalog](https://www.earthdata.nasa.gov/data/catalog/asf-nisar-l3-sme2-provisional-v1-1)) | P1 |
| 16 | **GRACE/GRACE-FO JPL Mascon RL06.3 v04** (`TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4`) | Terrestrial water storage anomaly | 0.5° grid (mascon-based, ~300 km effective), monthly | 2002-04 → ongoing | PO.DAAC, earthaccess | Earthdata Login | n/a | **Verified (CMR)** | P1 |
| 17 | **NASADEM / SRTM** | Elevation, slope, aspect, flow | 30 m (1 arc-second) | Near-global 60 N–56 S | LP DAAC; AWS Terrain Tiles (Terrarium PNG, includes SRTM) | EDL / none | Yes (tiles) | **Verified**: AWS terrain tile HTTP 200 | P0 |
| 18 | **ECOSTRESS L4 ESI / L2 LST** | Evaporative stress index, LST | 70 m, irregular (ISS) | 2018 → | LP DAAC, AppEEARS | Earthdata Login | n/a | Mission operating; extension through FY2026, senior review 2026 ([ECOSTRESS](https://ecostress.jpl.nasa.gov/)); ORNL subset "no data" at test point | P1 (evidence when scenes exist) |
| 19 | **GEDI L2A/L2B (L4A)** | Canopy height, cover, profile (biomass) | 25 m footprints, sparse tracks | 2019 → (hibernation 2023-03 to 2024-04) | LP DAAC / ORNL DAAC, earthaccess | Earthdata Login | n/a | Operating per 2025 science team meeting ([NASA](https://science.nasa.gov/uncategorized/summary-of-the-2025-gedi-science-team-meeting)); 2026 status not independently confirmed | P1 context |
| 20 | **FLDAS Noah** (`FLDAS_NOAH01_C_GL_M`) | Modeled soil moisture, ET, runoff (food-security LSM) | 0.1°, monthly | 1982 → | GES DISC | Earthdata Login | n/a | **Verified (CMR)** | P2 cross-check |
| 21 | **OPERA DIST-ALERT-HLS** | Vegetation disturbance alerts | 30 m | 2023 → | LP DAAC | Earthdata Login | n/a | **Verified (CMR)** | P2 |
| 22 | **Prithvi-EO-2.0** (NASA/IBM) | Foundation model weights | HLS 30 m input | — | Hugging Face `ibm-nasa-geospatial` | None | n/a | **Verified**: 300M, 600M, 100M-TL, tiny-TL (Sep 2025) and EO-1.0 multi-temporal crop classification listed | P2 |
| 23 | **NASA POWER MCP** | SI tool access to POWER | — | — | `https://power.larc.nasa.gov/mcp/` (JSON-RPC over HTTP) | None | — | **Verified**: healthcheck alive, v1.1.0-beta ([docs](https://power.larc.nasa.gov/docs/services/super-intelligence/mcp/)) | P1 |
| 24 | **NASA CMR MCP** (earthdata-mcp) | SI dataset discovery, citations | — | — | `https://cmr.earthdata.nasa.gov/mcp/v1` (streamable HTTP) | None | — | **Reachable**: responds and requires an MCP session ([repo](https://github.com/nasa/earthdata-mcp)) | P1 |
| 25 | **TiTiler-CMR** (Development Seed) | Dynamic map tiles from CMR (HLS, IMERG) | — | — | Self-host (FastAPI) | EDL for protected data | — | Documented, v1.0.x, MIT ([repo](https://github.com/developmentseed/titiler-cmr)) | P1 (3D twin textures) |

Discovery and no-code helpers: [Earthdata Search](https://search.earthdata.nasa.gov/), [AppEEARS](https://appeears.earthdatacloud.nasa.gov/) (point/area extraction incl. SMAP L3E, ECOSTRESS, HLS; Earthdata Login required), [Giovanni](https://giovanni.gsfc.nasa.gov/), CMR search API (`https://cmr.earthdata.nasa.gov/search/`, CORS-enabled, no login for metadata).

**ML capture verification (2026-11-12, #16).** MOD13Q1 NDVI and pixel reliability
and MCD12Q1 IGBP cropland masks are available through the public
[ORNL REST API](https://modis.ornl.gov/data/modis_webservice.html), with at most ten
composites per request. The ML pipeline also reads root-zone moisture `RZMC` from
`https://nasa-power-smap.s3.amazonaws.com/smap/temporal/power_smap_daily_temporal_utc.zarr`,
without authentication. NASA documents this [POWER SMAP archive](https://power.larc.nasa.gov/docs/methodology/data/sources_hydrology/);
live nearest-cell histories were retrieved for all six ML sampling areas. Its metadata
reports POWER version 10.0.0 and variable status `reviewing`. Coordinate coverage extends
past the observation period, so the pipeline explicitly slices through 2025 and rejects
incomplete seasons. This is a POWER-processed daily SMAP product, distinct from the native
3-hourly NSIDC archive and from MERRA-2 `GWETROOT`. Pre-2016 winter seasons remain missing.
SoilGrids WCS `GetCoverage` v1.0.0 returned numeric water-retention rasters (`wv0033`,
`wv1500`, five depths to 100 cm) at all six areas; NASADEM_HGT v001 retrieval also succeeded.
The reproducible snapshot, provenance and measured scores are documented in
[`pipelines/ml/MODEL_CARD.md`](../pipelines/ml/MODEL_CARD.md).

## 2. Non-NASA complements

| Source | Use | Access | Status / caveat |
|---|---|---|---|
| **SoilGrids v2.0** (ISRIC) | Soil texture, SOC, pH, bulk density → available water | REST `rest.isric.org/soilgrids/v2.0/properties/query`; WCS `maps.isric.org` | REST returned 502 then `null` values at the test point; WCS GetCapabilities 200. Treat REST as unreliable; precompute hero fields via WCS; editable defaults |
| **FAO-56** tables | Kc, stage lengths, rooting depth, depletion fraction | Publication ([FAO](https://www.fao.org/4/x0490e/x0490e00.htm)) | Static; calibrate locally where possible |
| **FAO ECOCROP** (via GAEZ) | Crop temperature/rainfall ranges | [FAO ECOCROP](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en) | Discontinued ~2015, served through GAEZ; bulk export not confirmed |
| **FAO WaPOR v3** | Actual ET and water productivity; 100 m Africa/Near East; 20 m Mitidja pilot | [WaPOR](https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data/en) | Optional ET cross-check |
| **USDA NASS Cropland Data Layer** | Ground-truth crop history for validating Field Memory on the proof field (IN-13) | CropScape point service `nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue` (public, no key) | US only; validation use. **Not verified**: returned HTTP 500 "Failed to get value" for every point and year tried 2026-11-12, including its own documented example point, before and after retries. The client (`itza_science.clients.cdl`) and its tests are written against the documented response shape; re-run `pipelines/capture_fixtures.py` once the service is reachable |
| **Fields of The World** | Field boundary model/data | [arXiv 2409.16252](https://arxiv.org/abs/2409.16252) | P2 |
| **Basemaps** | OpenFreeMap vector tiles; EOxCloudless **2016** Sentinel-2 imagery | `tiles.openfreemap.org`; `tiles.maps.eox.at` (WMTS layer `s2cloudless_3857`) | Both HTTP 200 (imagery checked at zoom 10 to 16 over both hero regions, 2026-11-13). The 2026 Terms require third-party materials to be freely available without restriction or OSI-licensed. EOX licenses only the **2016** mosaic under CC BY 4.0 (attribution: "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)"); its 2018 to 2025 mosaics, including the 2024 layer used before, are non-commercial and are not used. Decision in [#100](https://github.com/ITZA-SPACE/itza/issues/100): the 2016 mosaic is the only recent-enough source with imagery at field zoom and an attribution-only license; the cost is that the picture is about ten years old (fields and tracks may have changed). NASA GIBS (public domain) was checked as the other candidate and is too coarse at field zoom 15 to 17 (its best imagery layers are 250 m to about 30 m per pixel). Source: [EOX license page](https://cloudless.eox.at/license-non-commercial) |

## 3. Role of each dataset in the decision path

| Decision question | Primary source | Cross-check | Shown as |
|---|---|---|---|
| When is the field bare / fallow? Which rotation did it have? | MODIS MOD13Q1, HLS VI | MCD12Q2 phenology; farmer confirmation; Prithvi (P2) | Field Memory timeline, bare-window heat strip |
| How much water does each rotation lack, and when? | POWER (ET0 inputs) + IMERG (rain) in FAO-56 model | SMAP L4 root-zone anomaly; MOD16 ET; WaPOR | Season Replay curves, evidence |
| Frost and heat risk at sensitive stages | POWER T2M_MIN/MAX | NEX-GDDP for future | Stress calendar |
| Erosion risk | NASADEM slope + IMERG intensity + NDVI cover | — | 3D flow paths, criterion score |
| Within-field differences | HLS 30 m NDVI stats, NASADEM | NISAR 200 m moisture | Zones |
| Long-term water sustainability | GRACE/GRACE-FO | — | Context card |
| Landscape structure | GEDI | — | Context card |
| Future robustness | NEX-GDDP-CMIP6 (POWER Projection or archive) | Model spread | 2050 mode |
| Disease weather | POWER RH2M, T2M + IMERG wet spells | SMAP wet soil | Pest risk scaling |

## 4. Harmonization strategy

The brief suggests resampling datasets to a common analysis grid. We use **two tiers** instead of forcing everything onto one grid:

1. **Field tier (time series).** Every source is reduced to a field-level daily (or native-cadence) series: point sources (POWER, NEX-GDDP) at the field centroid; gridded sources area-weighted over the polygon (or nearest cell when the cell is larger than the field). Series are aligned on a common daily calendar and aggregated to growth stages, months and agricultural seasons. Each value keeps its native resolution in metadata.
2. **Zone tier (30 m grid).** For within-field analysis only, sources are resampled to the HLS 30 m grid clipped to the field: HLS native; NASADEM bilinear; NISAR (200 m) and SMAP (9 km) as coarse covariates with explicit scale flags.

Gap handling: QA masking (clouds, snow, low quality), short gaps interpolated and flagged, long gaps left as gaps. Every gap feeds the information-gaps list.

## 5. Limitations (shown in the product)

| Limitation | Effect | Handling |
|---|---|---|
| POWER (~50 km) and SMAP (9 km) cells are larger than most fields | Weather/moisture represent the area, not the field | Pixel footprint overlay; confidence penalty; ground-truth input |
| MODIS 250 m mixes neighboring fields | Field Memory blurred for small fields | HLS 30 m for recent years; field-size rule; farmer confirmation |
| Clouds reduce optical observations | Gaps in NDVI series | QA masking, interpolation flags, "uncertain" labels |
| IMERG Final lags by months | Recent rain from Late run (less calibrated) | Source policy recorded per day |
| NISAR products are provisional (2026) | Accuracy goal 0.06 m³/m³ over unflagged areas; quality may not be optimal | "Provisional" badge; snapshot use only |
| GRACE resolution ~300 km | Regional, not field | Context card only |
| GEDI sparse footprints | No continuous coverage | Context, never a field-wide layer |
| ECOSTRESS irregular revisit | Few scenes per field | Evidence when available |
| POWER Projection beta gaps (Sétif returned −999) | 2050 mode may lack data via API | NEX-GDDP archive fallback; precompute demo |
| POWER Projection has no 1995–2014 historical baseline, and reading the NEX-GDDP S3 archive per request is too slow (~245 MB per model/variable/year) | `/v1/projection` cannot compute change factors from a cold cache | A pipeline precomputes per-0.25°-cell monthly baseline (and, for hero fields, future) climatologies into `data/baselines/projection/{lat}_{lon}.json`; the endpoint serves POWER for the future period and 502s with a gap when no baseline record exists for the cell (see #17) |
| MODIS end of science (Terra ~Feb 2027, Aqua ~Sep 2027) | Long-term continuity | VIIRS/HLS adapters ([NASA Science](https://science.nasa.gov/science-research/earth-science/terra-the-end-of-an-era/)) |
| Mission budgets (GRACE-FO, ECOSTRESS) | Possible future gaps | Adapter fallbacks; not critical path |

## 6. Plug-in model for the official resources

The official Resources tab was published on **November 13, 2026** ([mapping](CHALLENGE_RULES_2026.md#7-official-resources-for-field-shift-and-itza-coverage)). It lists NASA products ITZA already uses (SMAP, GPM/IMERG, Landsat via HLS, MODIS/VIIRS, POWER, SRTM via NASADEM, ECOSTRESS, GEDI), one NASA family not yet used (NLDAS/GLDAS), ESA partner data (Sentinel-2, used through HLS S30; ERA5) and optional, mostly US-only non-NASA sources. New sources enter through the same model (planned: GLDAS/NLDAS [#106](https://github.com/ITZA-SPACE/itza/issues/106), SSURGO [#104](https://github.com/ITZA-SPACE/itza/issues/104); shared team data store [#103](https://github.com/ITZA-SPACE/itza/issues/103)):


1. **Canonical variables.** The engine consumes only canonical variables (see table below). Adapters translate source variables and units.
2. **Adapter manifest.** Each source is declared in `data-sources.yaml` and implemented as a small adapter (Python for authenticated/raster sources; TypeScript for browser-fetchable sources). Contract in [TECHNICAL_ARCHITECTURE §5](TECHNICAL_ARCHITECTURE.md#5-data-layer).
3. **Priority chains.** For each canonical variable, an ordered list of sources with fallback (e.g., precipitation: IMERG Final → IMERG Late → POWER).
4. **Resource intake checklist:** for each new resource, record product ID, version, variables, resolution, period, access, auth, CORS; map to canonical variables; add a manifest entry; run the adapter conformance test; regenerate demo bundles.

### Canonical variables (v1)

Each canonical variable serves at least one PRD information need ([PRD §8](../PRD.md#8-information-requirements-data-independent)). A new official resource is accepted when it maps to a canonical variable; features never reference a dataset directly.

| Canonical name | Unit | Information need | Default sources (priority order) |
|---|---|---|---|
| `precip` | mm/day | IN-02 | IMERG Final → IMERG Late → POWER PRECTOTCORR |
| `tmax`, `tmin`, `tmean` | °C | IN-01 | POWER |
| `rh` | % | IN-01 | POWER RH2M |
| `wind2m` | m/s | IN-01 | POWER WS2M |
| `srad` | MJ/m²/day | IN-01 | POWER ALLSKY_SFC_SW_DWN |
| `et0` | mm/day | IN-01 (derived) | Derived (FAO-56 PM from POWER) |
| `eta` | mm/day | IN-12 | MOD16A2GF → WaPOR |
| `sm_surface` | m³/m³ | IN-04, IN-09 | SMAP L4 → SMAP L3E → NISAR (snapshot) |
| `sm_rootzone` | m³/m³ | IN-04 | SMAP L4 → POWER GWETROOT (wetness index, flagged) |
| `ndvi` | – | IN-03, IN-09 | HLS VI → MOD13Q1 → VNP13A1 |
| `lst` | °C | IN-12 (stress) | ECOSTRESS → MOD11A2 |
| `esi` | – | IN-12 | ECOSTRESS ESI |
| `elevation`, `slope`, `aspect`, `flow_acc` | m, °, °, cells | IN-05 | NASADEM / terrain tiles |
| `tws_anomaly` | cm | IN-10 | GRACE/GRACE-FO mascon |
| `canopy_height`, `canopy_cover` | m, % | IN-11 | GEDI L2A/L2B |
| `proj_*` (tmax, tmin, precip, rh, srad, wind) | as above | IN-08 | POWER Projection → NEX-GDDP archive |
| `soil_*` (clay, sand, soc, ph, bdod, awc) | various | IN-06 | farmer test → SoilGrids → regional default |
| `crop_label` | class | IN-13 | USDA CDL (US) → farmer confirmation (the official resources include no crop labels outside the US) |

## 7. Test data before the event

Use these to build and test adapters, engine and visuals against real responses. The official resource list (published November 13) did not replace any of them.

### 7.1 Test fields

| Field | Purpose | How to choose |
|---|---|---|
| **Story field: Sétif high plains, rainfed** (×3) | Hero field 1: cereal–fallow history, drought years, local story | Draw polygons on cultivated parcels on EOxCloudless imagery south/east of Sétif city, away from built-up areas (the 36.19 N, 5.41 E point used for API checks is near the city and returned null SoilGrids values) |
| **Saharan irrigated pivots** (×1–2, Adrar or El Meniaa wilaya) | GRACE story, zones, irrigation detection | Circular pivots clearly visible in imagery |
| **Mitidja plain near Boumerdes** (×1) | Local tie-in; WaPOR 20 m cross-check | Irrigated orchard/vegetable parcels |
| **Proof field: US Central Great Plains, dryland wheat–fallow** (×3, near Akron, Colorado, 40.15 N, 103.15 W) | Hero field 2: validate Field Memory against USDA CDL per season; compare rotation ranking with the USDA-ARS Akron long-term rotation study; full 2050 data (POWER Projection verified for this point on 2026-11-09) | Pick parcels whose CDL history alternates winter wheat and fallow/idle for ≥ 10 years, plus at least one parcel with a more intensive rotation (wheat–corn/millet–fallow) |

### 7.2 Ready-to-run requests (verified)

```text
# NASA POWER daily (no key, CORS)
https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,T2M,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PRECTOTCORR,GWETROOT&community=AG&longitude=5.41&latitude=36.19&start=20010101&end=20251231&format=JSON

# NASA POWER climatology
https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,PRECTOTCORR&community=AG&longitude=5.41&latitude=36.19&format=JSON

# NASA POWER projection (check for -999; fall back to NEX-GDDP archive)
https://power.larc.nasa.gov/api/projection/monthly/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=5.41&latitude=36.19&start=204101&end=206012&format=JSON&time-standard=UTC
https://power.larc.nasa.gov/api/projection/monthly/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=-103.15&latitude=40.15&start=204101&end=206012&format=JSON&time-standard=UTC
https://power.larc.nasa.gov/api/projection/models?temporal=monthly

# ORNL MODIS NDVI (no login, CORS)
https://modis.ornl.gov/rst/api/v1/MOD13Q1/dates?latitude=36.19&longitude=5.41
https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=36.19&longitude=5.41&startDate=A2023001&endDate=A2023365&kmAboveBelow=1&kmLeftRight=1

# CMR discovery (no login for metadata, CORS)
https://cmr.earthdata.nasa.gov/search/granules.json?short_name=HLSS30_VI&point=5.41,36.19&temporal=2026-03-01T00:00:00Z,2026-03-31T00:00:00Z
https://cmr.earthdata.nasa.gov/search/granules.json?short_name=NISAR_L3_SME2_PROVISIONAL_V1&bounding_box=4.5,35.5,6.5,36.8
https://cmr.earthdata.nasa.gov/search/granules.json?short_name=SPL4SMGP&sort_key=-start_date&page_size=1

# Terrain and basemaps
https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
https://tiles.openfreemap.org/styles/liberty
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg

# NASA POWER MCP
https://power.larc.nasa.gov/mcp/healthcheck
```

Authenticated pulls (IMERG, SMAP L4, HLS VI, NISAR, GRACE, GEDI, ECOSTRESS) use `earthaccess` (Python) with a free Earthdata Login ([earthaccess docs](https://earthaccess.readthedocs.io/)); NISAR also via `asf_search`.

### 7.3 Fixture policy

- Store raw responses for test fields under `fixtures/` (small JSON/Parquet/COG clips) with a manifest (source, URL, date retrieved, version).
- Engine and adapter tests run only against fixtures (no network in CI).
- Demo bundles are regenerated from fixtures + live pulls by one command.

## Context service verification (#15)

The science API supports NISAR SME2 provisional v1, JPL GRACE CRI RL06.3Mv04,
GEDI02_A/B v002 and ECOSTRESS tiled LSTE/ESI v002. These collection versions
were confirmed by public CMR collection queries on 2026-11-12; GEDI and ECOSTRESS
also expose newer collections, which are not silently mixed into these decoders.
Offline tests use explicitly synthetic native HDF5/NetCDF/GeoTIFF fixtures for QA,
geolocation, units and trend math. This establishes fixture behavior, not live
access, calibration, global coverage or a demo field's current observations.
See the [context API methods](../services/science-api/README.md#nisar-and-landscape-context-endpoints)
for the supported schemas, conservative masking, scientific limits and retention.

## Hero capture verification — 2026-11-13 (#17)

Four real sampling-area publications now exist under `apps/web/public/bundles/`:
`setif-story`, `akron-proof-1`, `akron-proof-2`, and `akron-proof-3`. They contain
POWER/MOD13Q1 history for 2008–2025, actual NASADEM derivatives, QA-screened HLS
frames and management zones, and a native IMERG/SMAP sample for 2025-12-31.
The USDA [CDL image service](https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer)
returned categorical GeoTIFF exports for all three proof areas for every year
2008–2023. The earlier CropScape point-service outage remains a historical
observation; it does not imply the raster service is unavailable.

GRACE native solution dates can share a calendar month. The batch reader retains
those distinct dates and inserts nulls for missing months; a real clipped cell
and regression test are in `fixtures/demo/grace/`. GEDI succeeded at Sétif and
ECOSTRESS at the proof areas. The sampled recent NISAR scenes had no
quality-screened field pixels; other missing products retain explicit source gaps.
These observations do not establish global coverage or absence of a product.

Small raw POWER/MODIS/CDL captures with request records and hashes are in
`fixtures/demo/recorded/`. Each generated publication has its own file hashes and
source/period/resolution metadata. Publication contracts, sample limits and the
remaining UI registration work are described in the [bundle index](../apps/web/public/bundles/README.md).

## SSURGO live soil adapter (#104)

Live server bundles query USDA NRCS Soil Data Access for polygon intersections,
components and horizons. The soil priority is farmer test (existing app overrides),
SSURGO where US survey polygons exist, SoilGrids, then farmer-confirmed regional
fallbacks. The source manifest uses `resolution_m: 0` for vector soil surveys;
it does not mean a zero-metre raster. Actual survey area and restoration version,
root-zone method and per-property field coverage are retained at
`GET /v1/bundles/{id}/soil`. Completed bundle status also includes canonical soil
values so the browser can retain SSURGO ahead of SoilGrids regardless of request order.

For each polygon/component, only complete 0-100 cm profiles contribute. Horizons
are thickness-weighted; components are weighted by component percentage times
geodesic polygon intersection area. Properties need at least 50% field coverage;
missing properties fall back independently. AWC (cm/cm) is multiplied by 1000 for
mm/m. Organic matter is retained as `om_pct`; `soc_pct` is an approximate OM/1.724
conversion, flagged low confidence, per [NRCS SSIR45](https://www.nrcs.usda.gov/sites/default/files/2022-10/SSIR45.pdf).
Hydrologic group and drainage remain categorical proportions in the soil metadata,
not arbitrary numeric codes or automatic irrigation advice.

Sétif bypasses SSURGO and queries SoilGrids. The rectangular prefilter is only a
search budget, not a country boundary: an empty SDA response (including Canada or
Mexico inside that box) yields an informational no-survey-coverage gap. Transport errors, invalid responses,
insufficient survey coverage and incomplete horizons produce gaps; a failure of
both providers leaves missing properties for an explicit farmer/default decision.
No missing value becomes zero. All four precomputed hero publications now include
soil and `soil.json` provenance, refreshed with `pipelines/refresh_soil.py`. The
three Akron areas use SSURGO; Sétif uses SoilGrids. The recorded Akron proof response, SQL, retrieval
time and SHA-256 are in `fixtures/ssurgo/`; tests never call the network.
