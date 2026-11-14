# References

Paste into the Space Apps "Space Agency Partner Data and Other References" field. Generated from THIRD_PARTY_NOTICES.md by `node scripts/submission.mjs references`; do not edit by hand.

Credit ESA/Copernicus: Sentinel-2 data reach ITZA through NASA HLS S30 and the EOxCloudless 2016 basemap (contains modified Copernicus Sentinel data 2016 & 2017).

ITZA's own code and content: Apache License 2.0 (https://github.com/ITZA-SPACE/itza/blob/main/LICENSE).

## 1. NASA data

NASA Earth science data are open: no usage restrictions, citation requested with the product DOI.
POWER data are public domain and need the acknowledgement given in `data-sources.yaml`.

| Product | Used for | DOI |
|---|---|---|
| GPM IMERG Final and Late Daily V07 (GES DISC) | Daily rain | [10.5067/GPM/IMERGDF/DAY/07](https://doi.org/10.5067/GPM/IMERGDF/DAY/07), [10.5067/GPM/IMERGDL/DAY/07](https://doi.org/10.5067/GPM/IMERGDL/DAY/07) |
| SMAP L4 SPL4SMGP v8 (NSIDC DAAC) | Surface and root-zone soil moisture | [10.5067/T5RUATAQREF8](https://doi.org/10.5067/T5RUATAQREF8) |
| HLS L30 and S30 v2.0 vegetation indices (LP DAAC) | 30 m NDVI history | [10.5067/HLS/HLSL30.002](https://doi.org/10.5067/HLS/HLSL30.002), [10.5067/HLS/HLSS30.002](https://doi.org/10.5067/HLS/HLSS30.002) |
| MOD13Q1 v061 (LP DAAC, via ORNL DAAC) | 250 m NDVI history, ML training target | [10.5067/MODIS/MOD13Q1.061](https://doi.org/10.5067/MODIS/MOD13Q1.061) |
| MOD16A2GF v061 (LP DAAC, via ORNL DAAC) | Actual evapotranspiration | [10.5067/MODIS/MOD16A2GF.061](https://doi.org/10.5067/MODIS/MOD16A2GF.061) |
| MCD12Q2 v061 (LP DAAC, via ORNL DAAC) | Season dates (phenology) | [10.5067/MODIS/MCD12Q2.061](https://doi.org/10.5067/MODIS/MCD12Q2.061) |
| MCD12Q1 v061 (LP DAAC, via ORNL DAAC) | Cropland mask for ML training | [10.5067/MODIS/MCD12Q1.061](https://doi.org/10.5067/MODIS/MCD12Q1.061) |
| NASADEM_HGT v001 (LP DAAC) | 30 m elevation and slope | [10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001](https://doi.org/10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001) |
| NASA POWER Daily and Climatology API (LaRC) | Weather, climatology, projections | none ([power.larc.nasa.gov](https://power.larc.nasa.gov)) |
| NASA CMR Search API | Granule availability | none ([cmr.earthdata.nasa.gov](https://cmr.earthdata.nasa.gov/search)) |

Other NASA context products named in `docs/NASA_DATA_SOURCES.md` (GRACE/GRACE-FO, NISAR, GEDI, ECOSTRESS)
follow the same NASA open data policy; their DOIs are added to `data-sources.yaml` when an adapter
reads them.

## 2. Non-NASA data and services

| Item | Used for | License | Source |
|---|---|---|---|
| SoilGrids 2.0 (ISRIC) | Soil texture, organic carbon, pH, available water | CC BY 4.0 | [soilgrids.org](https://soilgrids.org), [doi 10.5194/soil-7-217-2021](https://doi.org/10.5194/soil-7-217-2021) |
| OpenFreeMap vector tiles and Liberty style | Default map | Free service; map data ODbL, © OpenStreetMap contributors; OpenMapTiles schema CC BY 4.0 | [openfreemap.org](https://openfreemap.org) |
| AWS Terrain Tiles (Terrarium) | 3D twin terrain | Open data; built from SRTM and USGS 3DEP (public domain) and other sources, each with its own attribution | [registry.opendata.aws/terrain-tiles](https://registry.opendata.aws/terrain-tiles/) |
| HLS Multi Temporal Crop Classification (2022), Cecil, Kordi, Li, Khallaghi and Alemohammad | Prithvi crop/fallow training and spatial holdout | CC BY 4.0 | [Dataset and citation](https://huggingface.co/datasets/ibm-nasa-geospatial/multi-temporal-crop-classification), DOI 10.57967/hf/0955 |
| USDA NRCS SSURGO / Soil Data Access | US live-bundle soil properties | Public domain (US Government work) | [Soil Data Access](https://sdmdataaccess.nrcs.usda.gov/); survey area/version retained in soil metadata |
| USDA NASS Cropland Data Layer | Crop history for validating Field Memory (US) | Public domain (US Government work) | [nassgeodata.gmu.edu](https://nassgeodata.gmu.edu/CropScape/) |
| **Satellite basemap: EOxCloudless 2016 (Sentinel-2 cloudless)** | Satellite view on the map and 3D twin | CC BY 4.0, attribution required and shown on the map. Only the 2016 mosaic: EOX licenses 2018 to 2025 non-commercially, and none of those is used | [EOX license page](https://cloudless.eox.at/license-non-commercial) (read 2026-11-13); contains modified Copernicus Sentinel data 2016 & 2017 |

## 3. Literature behind the knowledge packs

`packages/knowledge/packs/*.yaml` hold numbers transcribed from published tables, each with a citation
in the pack. Only the values are used, never the text or figures.

| Source | Used for | Rights |
|---|---|---|
| Allen et al. (1998), FAO Irrigation and Drainage Paper 56 (FAO-56), Tables 11, 12, 22 | Crop stage lengths, Kc, rooting depth | © FAO. FAO publications are generally CC BY-NC-SA 3.0 IGO. **Team to confirm** that reusing table values is acceptable, or restate them from a source without a non-commercial term |
| FAO GIEWS Country Brief, Algeria | Crop calendar | © FAO (same terms as above; same confirmation) |
| USDA NASS (1997), Agricultural Handbook 628 | Usual planting and harvest dates | Public domain (US Government work) |
| USDA ARS (2011), AgResearch Magazine, rotations at Akron | Rotation context | Public domain (US Government work) |
| USDA ARS, planting date effect on no-till proso millet | Planting window | Public domain (US Government work) |
| Nelson et al. (2008), University of Nebraska-Lincoln Extension EC137 | Proso millet guidance | © University of Nebraska. Values only; **team to confirm** |
| Values marked `team_estimate` | Placeholders pending local review | ITZA's own |

## 4. Model

| Item | License | Notes |
|---|---|---|
| `stress-v1` LightGBM model (`services/science-api/models/stress-v1/`) | ITZA's own weights, Apache 2.0 | Trained on MODIS, POWER, SMAP, SoilGrids and NASADEM listed above. See [`pipelines/ml/MODEL_CARD.md`](https://github.com/ITZA-SPACE/itza/blob/main/pipelines/ml/MODEL_CARD.md) |
| NASA/IBM Prithvi-EO-2.0-tiny-TL | Apache 2.0 | [Model card](https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-tiny-TL), base revision `335eadc2c45ad5abe7bd307223e1c48c5b60c41b`; experimental fine-tuned outputs and measured limitations in [`pipelines/prithvi/README.md`](https://github.com/ITZA-SPACE/itza/blob/main/pipelines/prithvi/README.md). Base and trained weights are not shipped in the API image |
| LightGBM, scikit-learn and the other training libraries | MIT, BSD-3-Clause and others, per the Python list below | |

Training dependency metadata clarifications: `antlr4-python3-runtime` uses
[BSD-3-Clause](https://github.com/antlr/antlr4/blob/4.9.3/LICENSE.txt),
`pycocotools` uses the [FreeBSD/BSD-2-Clause license](https://github.com/ppwwyyxx/cocoapi/blob/master/license.txt),
and `torchvision` uses [BSD-3-Clause](https://github.com/pytorch/vision/blob/main/LICENSE).
Their wheels omit exact SPDX expressions; these mappings are recorded in
`scripts/licenses.allow.json`. PyTorch's compound permissive expression includes
[Apache-2.0 with the LLVM exception](https://spdx.org/licenses/LLVM-exception.html);
regex also includes [CNRI-Python](https://spdx.org/licenses/CNRI-Python.html).

## 5. Fonts, icons and images

- No web fonts are bundled; the app uses the system font stack.
- The favicon, app icons and the field imagery frames (`apps/web/public/`) are made by the team from the
  data above; the frames are derived from NASA data.
- UI icons are inline SVG written for the project.

## 6. Dependencies (generated)

Production dependencies only; build and test tooling is not shipped.


### JavaScript packages (production dependencies of every workspace) (204)

| Package | Version | License |
|---|---|---|
| @a2ui/markdown-it | 0.2.2 | Apache-2.0 |
| @a2ui/react | 0.15.0 | Apache-2.0 |
| @a2ui/web_core | 0.15.0 | Apache-2.0 |
| @ai-sdk/gateway | 4.0.143 | Apache-2.0 |
| @ai-sdk/google | 4.0.118 | Apache-2.0 |
| @ai-sdk/groq | 4.0.81 | Apache-2.0 |
| @ai-sdk/mcp | 2.0.97 | Apache-2.0 |
| @ai-sdk/provider | 4.0.37 | Apache-2.0 |
| @ai-sdk/provider-utils | 5.0.79 | Apache-2.0 |
| @ai-sdk/react | 4.0.174 | Apache-2.0 |
| @cfworker/json-schema | 4.1.6 | MIT |
| @deck.gl/core | 9.4.1 | MIT |
| @deck.gl/layers | 9.4.1 | MIT |
| @deck.gl/mapbox | 9.4.1 | MIT |
| @dnd-kit/accessibility | 3.1.1 | MIT |
| @dnd-kit/core | 6.3.1 | MIT |
| @dnd-kit/sortable | 10.0.0 | MIT |
| @dnd-kit/utilities | 3.2.2 | MIT |
| @floating-ui/core | 1.8.0 | MIT |
| @floating-ui/dom | 1.8.0 | MIT |
| @floating-ui/react-dom | 2.1.9 | MIT |
| @floating-ui/utils | 0.2.12 | MIT |
| @lit-labs/ssr-dom-shim | 1.6.0 | BSD-3-Clause |
| @lit/context | 1.1.6 | BSD-3-Clause |
| @lit/reactive-element | 2.1.2 | BSD-3-Clause |
| @loaders.gl/core | 4.5.4 | MIT |
| @loaders.gl/images | 4.5.4 | MIT |
| @loaders.gl/loader-utils | 4.5.4 | MIT |
| @loaders.gl/schema | 4.5.4 | MIT |
| @loaders.gl/schema-utils | 4.5.4 | MIT |
| @loaders.gl/worker-utils | 4.5.4 | MIT |
| @luma.gl/core | 9.4.2 | MIT |
| @luma.gl/engine | 9.4.2 | MIT |
| @luma.gl/gpgpu | 9.4.2 | MIT |
| @luma.gl/shadertools | 9.4.2 | MIT |
| @luma.gl/webgl | 9.4.2 | MIT |
| @luma.gl/webgpu | 9.4.2 | MIT |
| @mapbox/jsonlint-lines-primitives | 2.0.3 | MIT |
| @mapbox/point-geometry | 1.1.0 | ISC |
| @mapbox/tiny-sdf | 2.3.0 | BSD-2-Clause |
| @mapbox/unitbezier | 1.0.0 | BSD-2-Clause |
| @mapbox/vector-tile | 3.0.0 | BSD-3-Clause |
| @maplibre/geojson-vt | 6.3.0 | ISC |
| @maplibre/maplibre-gl-style-spec | 26.6.0 | ISC |
| @maplibre/mlt | 1.3.0 | (MIT OR Apache-2.0) |
| @maplibre/vt-pbf | 4.3.3 | MIT |
| @math.gl/core | 4.1.0 | MIT |
| @math.gl/polygon | 4.1.0 | MIT |
| @math.gl/sun | 4.1.0 | MIT |
| @math.gl/types | 4.1.0 | MIT |
| @math.gl/web-mercator | 4.1.0 | MIT |
| @preact/signals-core | 1.14.5 | MIT |
| @probe.gl/env | 4.1.2 | MIT |
| @probe.gl/log | 4.1.2 | MIT |
| @probe.gl/stats | 4.1.2 | MIT |
| @radix-ui/number | 1.1.3 | MIT |
| @radix-ui/primitive | 1.2.0 | MIT |
| @radix-ui/react-arrow | 1.1.17 | MIT |
| @radix-ui/react-collection | 1.2.0 | MIT |
| @radix-ui/react-compose-refs | 1.1.5 | MIT |
| @radix-ui/react-context | 1.3.0 | MIT |
| @radix-ui/react-dialog | 1.3.1 | MIT |
| @radix-ui/react-direction | 1.2.0 | MIT |
| @radix-ui/react-dismissable-layer | 1.2.1 | MIT |
| @radix-ui/react-focus-guards | 1.2.0 | MIT |
| @radix-ui/react-focus-scope | 1.3.1 | MIT |
| @radix-ui/react-id | 1.1.4 | MIT |
| @radix-ui/react-popover | 1.3.1 | MIT |
| @radix-ui/react-popper | 1.4.0 | MIT |
| @radix-ui/react-portal | 1.2.0 | MIT |
| @radix-ui/react-presence | 1.1.11 | MIT |
| @radix-ui/react-primitive | 2.2.0 | MIT |
| @radix-ui/react-roving-focus | 1.2.1 | MIT |
| @radix-ui/react-slider | 1.6.1 | MIT |
| @radix-ui/react-slot | 1.5.0 | MIT |
| @radix-ui/react-tabs | 1.2.1 | MIT |
| @radix-ui/react-toggle | 1.2.1 | MIT |
| @radix-ui/react-tooltip | 1.4.1 | MIT |
| @radix-ui/react-use-callback-ref | 1.1.5 | MIT |
| @radix-ui/react-use-controllable-state | 1.3.0 | MIT |
| @radix-ui/react-use-effect-event | 0.0.5 | MIT |
| @radix-ui/react-use-is-hydrated | 0.1.3 | MIT |
| @radix-ui/react-use-layout-effect | 1.1.4 | MIT |
| @radix-ui/react-use-rect | 1.1.4 | MIT |
| @radix-ui/react-use-size | 1.1.5 | MIT |
| @radix-ui/react-visually-hidden | 1.2.13 | MIT |
| @radix-ui/rect | 1.1.3 | MIT |
| @standard-schema/spec | 1.1.0 | MIT |
| @tanstack/history | 1.162.5 | MIT |
| @tanstack/query-core | 5.107.1 | MIT |
| @tanstack/react-query | 5.107.1 | MIT |
| @tanstack/react-router | 1.170.46 | MIT |
| @tanstack/react-store | 0.11.2 | MIT |
| @tanstack/router-core | 1.171.39 | MIT |
| @tanstack/store | 0.11.2 | MIT |
| @turf/area | 7.4.0 | MIT |
| @turf/center-of-mass | 7.4.0 | MIT |
| @turf/centroid | 7.4.0 | MIT |
| @turf/convex | 7.4.0 | MIT |
| @turf/distance | 7.4.0 | MIT |
| @turf/helpers | 7.4.0 | MIT |
| @turf/invariant | 7.4.0 | MIT |
| @turf/length | 7.4.0 | MIT |
| @turf/meta | 7.4.0 | MIT |
| @types/geojson | 7946.0.16 | MIT |
| @types/node | 25.9.9 | MIT |
| @types/offscreencanvas | 2019.7.3 | MIT |
| @types/trusted-types | 2.0.7 | MIT |
| @vercel/oidc | 3.2.0 | Apache-2.0 |
| @webgpu/types | 0.1.74 | BSD-3-Clause |
| @workflow/serde | 4.1.0 | Apache-2.0 |
| ai | 7.0.170 | Apache-2.0 |
| ajv | 8.20.0 | MIT |
| ajv-formats | 3.0.1 | MIT |
| apache-arrow | 21.2.0 | Apache-2.0 |
| argparse | 2.0.1 | Python-2.0 |
| aria-hidden | 1.2.6 | MIT |
| bidi-js | 1.1.0 | MIT |
| clsx | 2.1.1 | MIT |
| concaveman | 1.2.1 | ISC |
| cookie-es | 3.1.1 | MIT |
| cross-spawn | 7.0.6 | MIT |
| dequal | 2.0.3 | MIT |
| detect-node-es | 1.1.0 | MIT |
| dompurify | 3.4.11 | (MPL-2.0 OR Apache-2.0) |
| earcut | 2.2.4 | ISC |
| earcut | 3.2.4 | ISC |
| echarts | 6.1.0 | Apache-2.0 |
| entities | 4.5.0 | BSD-2-Clause |
| eventsource-parser | 3.1.1 | MIT |
| fast-deep-equal | 3.1.3 | MIT |
| fast-uri | 3.1.9 | BSD-3-Clause |
| flatbuffers | 25.9.23 | Apache-2.0 |
| get-nonce | 1.0.1 | MIT |
| gl-matrix | 3.4.4 | MIT |
| idb-keyval | 6.3.0 | Apache-2.0 |
| isbot | 5.2.3 | Unlicense |
| isexe | 2.0.0 | ISC |
| jsesc | 3.1.0 | MIT |
| json-schema | 0.4.0 | (AFL-2.1 OR BSD-3-Clause) |
| json-schema-traverse | 1.0.0 | MIT |
| json-stringify-pretty-compact | 4.0.0 | MIT |
| json-with-bigint | 3.5.12 | MIT |
| kdbush | 4.1.0 | ISC |
| linkify-it | 5.0.2 | MIT |
| lit | 3.3.3 | BSD-3-Clause |
| lit-element | 4.2.2 | BSD-3-Clause |
| lit-html | 3.3.3 | BSD-3-Clause |
| maplibre-gl | 6.17.0 | BSD-3-Clause |
| markdown-it | 14.3.3 | MIT |
| mdurl | 2.1.0 | MIT |
| minimist | 1.2.8 | MIT |
| mjolnir.js | 3.1.1 | MIT |
| murmurhash-js | 1.0.0 | MIT |
| path-key | 3.1.1 | MIT |
| pbf | 5.1.2 | BSD-3-Clause |
| pkce-challenge | 5.0.1 | MIT |
| point-in-polygon | 1.1.0 | MIT |
| potpack | 2.1.0 | ISC |
| protocol-buffers-schema | 3.6.1 | MIT |
| punycode.js | 2.3.1 | MIT |
| qrcode-generator | 2.0.4 | MIT |
| quickselect | 2.0.0 | ISC |
| quickselect | 3.0.0 | ISC |
| rbush | 3.0.1 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| react-remove-scroll | 2.7.2 | MIT |
| react-remove-scroll-bar | 2.3.8 | MIT |
| react-style-singleton | 2.2.3 | MIT |
| redos-detector | 6.1.4 | MIT |
| regjsparser | 0.13.0 | BSD-2-Clause |
| require-from-string | 2.0.2 | MIT |
| resolve-protobuf-schema | 2.1.0 | MIT |
| robust-predicates | 2.0.4 | Unlicense |
| scheduler | 0.28.0 | MIT |
| seroval | 1.8.0 | MIT |
| seroval-plugins | 1.8.0 | MIT |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| swr | 2.5.1 | MIT |
| terra-draw | 1.39.0 | MIT |
| terra-draw-maplibre-gl-adapter | 1.5.0 | MIT |
| throttleit | 2.1.0 | MIT |
| tinyqueue | 2.0.3 | ISC |
| tinyqueue | 3.0.0 | ISC |
| tslib | 2.3.0 | 0BSD |
| tslib | 2.9.1 | 0BSD |
| uc.micro | 2.1.0 | MIT |
| undici | 7.30.1 | MIT |
| undici-types | 7.24.6 | MIT |
| use-callback-ref | 1.3.3 | MIT |
| use-sidecar | 1.1.3 | MIT |
| use-sync-external-store | 1.7.0 | MIT |
| validate-color | 2.2.4 | MIT |
| which | 2.0.2 | ISC |
| workbox-core | 7.4.1 | MIT |
| workbox-window | 7.4.1 | MIT |
| yaml | 2.9.1 | ISC |
| zod | 3.25.76 | MIT |
| zod | 4.6.7 | MIT |
| zod-to-json-schema | 3.25.2 | ISC |
| zrender | 6.1.0 | BSD-3-Clause |
| zustand | 5.1.0 | MIT |

### Python packages (production dependencies of every uv project, from uv.lock) (148)

| Package | Version | License |
|---|---|---|
| aenum | 3.1.17 | BSD License (OSI) |
| affine | 3.0.1 | BSD-3-Clause |
| aiobotocore | 3.10.0 | Apache-2.0 |
| aiohappyeyeballs | 2.7.1 | PSF-2.0 |
| aiohttp | 3.14.5 | Apache-2.0 AND MIT |
| aioitertools | 0.13.0 | MIT |
| aiosignal | 1.4.0 | Apache Software License (OSI) |
| albucore | 0.0.24 | MIT License (OSI) |
| albumentations | 2.0.8 | MIT License (OSI) |
| annotated-doc | 0.0.6 | MIT |
| annotated-types | 0.8.0 | MIT |
| antlr4-python3-runtime | 4.9.3 | UNKNOWN |
| anyio | 4.16.0 | MIT |
| attrs | 26.1.0 | MIT |
| botocore | 1.43.117 | Apache-2.0 |
| bounded-pool-executor | 0.0.3 | MIT |
| certifi | 2026.10.23 | MPL-2.0 |
| charset-normalizer | 3.5.2 | MIT |
| click | 8.5.1 | BSD-3-Clause |
| cloudpickle | 3.1.2 | BSD-3-Clause |
| contourpy | 1.4.0 | BSD-3-Clause |
| cycler | 0.12.1 | BSD License (OSI) |
| diffusers | 0.43.0 | Apache Software License (OSI) |
| docstring_parser | 0.18.0 | MIT |
| donfig | 0.8.1.post1 | MIT |
| earthaccess | 0.19.0 | MIT |
| einops | 0.8.2 | MIT |
| fastapi | 0.162.4 | MIT |
| filelock | 4.2.10 | MIT |
| fonttools | 4.68.0 | MIT |
| frozenlist | 1.8.0 | Apache-2.0 |
| fsspec | 2026.9.0 | BSD-3-Clause |
| geopandas | 1.2.0 | BSD-3-Clause |
| google-crc32c | 1.9.0 | Apache-2.0 |
| h11 | 0.16.0 | MIT |
| h5netcdf | 1.8.3 | BSD License (OSI) |
| h5py | 3.16.0 | BSD-3-Clause |
| hf-xet | 1.8.0 | Apache-2.0 |
| httpcore | 1.0.9 | BSD-3-Clause |
| httpcore2 | 2.16.0 | BSD-3-Clause |
| httptools | 0.9.0 | MIT |
| httpx | 0.28.1 | BSD-3-Clause |
| httpx2 | 2.16.0 | BSD-3-Clause |
| huggingface_hub | 2.4.0 | Apache-2.0 |
| hydra-core | 1.3.8 | MIT |
| idna | 3.20 | BSD-3-Clause |
| ImageIO | 2.38.1 | BSD-2-Clause |
| importlib_metadata | 10.2.0 | Apache-2.0 |
| importlib_resources | 7.1.0 | Apache-2.0 |
| Jinja2 | 3.1.6 | BSD License (OSI) |
| jmespath | 1.1.0 | MIT |
| joblib | 1.6.0 | BSD-3-Clause |
| jsonargparse | 4.53.0 | MIT |
| jsonnet | 0.22.0 | Apache-2.0 |
| jsonschema | 4.26.0 | MIT |
| jsonschema-specifications | 2025.9.1 | MIT |
| kiwisolver | 1.5.1 | BSD License (OSI) |
| kornia | 0.9.0 | Apache-2.0 |
| kornia_rs | 0.2.0 | Apache Software License (OSI) |
| lazy-importer | 0.1.0 | Apache-2.0 |
| lazy-loader | 0.6 | BSD-3-Clause |
| lightgbm | 4.7.0 | MIT |
| lightly | 1.5.22 | MIT License (OSI) |
| lightly-utils | 0.0.2 | MIT |
| lightning | 2.6.6 | Apache-2.0 |
| lightning-utilities | 0.15.3 | Apache-2.0 |
| markdown-it-py | 4.3.0 | MIT License (OSI) |
| MarkupSafe | 3.0.4 | BSD-3-Clause |
| matplotlib | 3.11.2 | Python Software Foundation License (OSI) |
| mdurl | 0.1.2 | MIT License (OSI) |
| mpmath | 1.3.0 | BSD License (OSI) |
| msgspec | 0.22.0 | BSD-3-Clause |
| multidict | 7.2.1 | Apache-2.0 |
| multimethod | 2.1 | Apache-2.0 |
| narwhals | 2.28.0 | MIT |
| networkx | 3.7 | BSD-3-Clause |
| numcodecs | 0.17.1 | MIT |
| numpy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| omegaconf | 2.3.1 | BSD License (OSI) |
| opencv-python-headless | 5.0.0.93 | Apache Software License (OSI) |
| opentelemetry-api | 1.45.2 | Apache-2.0 |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| pandas | 3.1.1 | BSD-3-Clause |
| pillow | 13.0.0 | MIT-CMU |
| pqdm | 0.2.0 | MIT License (OSI) |
| propcache | 0.5.4 | Apache-2.0 |
| pyarrow | 26.0.1 | Apache-2.0 |
| pycocotools | 2.0.11 | UNKNOWN |
| pydantic | 2.14.3 | MIT |
| pydantic_core | 2.50.4 | MIT |
| pydantic-settings | 2.16.2 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| pyogrio | 0.13.0 | MIT License (OSI) |
| pyparsing | 3.3.3 | MIT |
| pyproj | 3.8.0 | MIT |
| python-box | 8.0.0 | MIT |
| python-cmr | 0.13.0 | MIT |
| python-dateutil | 2.9.0.post0 | BSD License AND Apache Software License (OSI) |
| python-dotenv | 1.2.4 | BSD-3-Clause |
| pytorch-lightning | 2.6.6 | Apache-2.0 |
| PyYAML | 6.0.3 | MIT |
| rasterio | 1.5.2 | BSD-3-Clause |
| referencing | 0.37.0 | MIT |
| regex | 2026.11.9 | Apache-2.0 AND CNRI-Python |
| requests | 2.34.2 | Apache-2.0 |
| rich | 15.0.0 | MIT |
| rioxarray | 0.23.0 | Apache-2.0 |
| rioxarray | 0.24.0 | Apache-2.0 |
| rpds-py | 2026.9.1 | MIT |
| s3fs | 2026.9.0 | BSD License (OSI) |
| safetensors | 0.8.0 | Apache Software License (OSI) |
| scikit-image | 0.26.0 | BSD License (OSI) |
| scikit-learn | 1.9.1 | BSD-3-Clause |
| scipy | 1.18.1 | BSD License (OSI) |
| segmentation_models_pytorch | 0.6.0 | MIT |
| setuptools | 84.2.1 | MIT |
| shapely | 2.2.0 | BSD-3-Clause |
| simsimd | 6.5.16 | Apache-2.0 |
| six | 1.17.0 | MIT |
| starlette | 1.10.0 | BSD-3-Clause |
| stringzilla | 5.3.2 | Apache-2.0 |
| sympy | 1.14.0 | BSD License (OSI) |
| tenacity | 9.2.1 | Apache-2.0 |
| termcolor | 3.3.0 | MIT |
| terratorch | 1.2.14 | Apache-2.0 AND MIT |
| threadpoolctl | 3.8.0 | BSD-3-Clause |
| tifffile | 2026.11.12 | BSD-3-Clause |
| timm | 1.0.31 | Apache-2.0 |
| tinynetrc | 1.3.1 | MIT |
| torch | 2.15.0 | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND ISC AND MIT AND Zlib |
| torchgeo | 0.10.1 | MIT |
| torchmetrics | 1.9.0 | Apache-2.0 |
| torchvision | 0.29.2 | UNKNOWN |
| tqdm | 4.70.1 | MPL-2.0 AND MIT |
| truststore | 0.10.5 | MIT |
| typeshed_client | 2.15.0 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 |
| typing-inspection | 0.4.5 | MIT |
| urllib3 | 2.8.0 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |
| uvloop | 0.23.0 | Apache Software License AND MIT License (OSI) |
| watchfiles | 1.3.0 | MIT |
| websockets | 17.4 | BSD-3-Clause |
| wrapt | 2.5.2 | BSD-2-Clause |
| xarray | 2026.9.0 | Apache-2.0 |
| yarl | 1.25.1 | Apache-2.0 |
| zarr | 3.4.2 | MIT |
| zipp | 4.1.2 | MIT |

