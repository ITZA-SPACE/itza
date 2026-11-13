# Third-party notices

ITZA's own code and content are released under the [Apache License 2.0](LICENSE). Everything below is
third-party material the project uses, with its license and where to find it. This register backs the
References field of the Space Apps submission and the in-app Data and credits view (#101).

How it is kept honest:

- `node scripts/licenses.mjs` regenerates the dependency lists at the end of this file;
  `node scripts/licenses.mjs --check` fails on a license that is neither OSI-approved nor public domain
  (exceptions go in `scripts/licenses.allow.json`, with a reason), on a stale list, and on a
  `data-sources.yaml` entry without `license`, `citation` or (DAAC products) `doi`.
- Per-product licenses and citation text for the NASA and ISRIC data live next to each source in
  [`data-sources.yaml`](data-sources.yaml).

## 1. NASA data

NASA Earth science data are open: no usage restrictions, citation requested with the product DOI.
POWER data are public domain and need the acknowledgement given in `data-sources.yaml`.

| Product | Used for | DOI |
|---|---|---|
| GPM IMERG Final and Late Daily V07 (GES DISC) | Daily rain | [10.5067/GPM/IMERGDF/DAY/07](https://doi.org/10.5067/GPM/IMERGDF/DAY/07), [10.5067/GPM/IMERGDL/DAY/07](https://doi.org/10.5067/GPM/IMERGDL/DAY/07) |
| SMAP L4 SPL4SMGP v8 (NSIDC DAAC) | Surface and root-zone soil moisture | [10.5067/EVKPQZ4AFC4D](https://doi.org/10.5067/EVKPQZ4AFC4D) |
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
| USDA NASS Cropland Data Layer | Crop history for validating Field Memory (US) | Public domain (US Government work) | [nassgeodata.gmu.edu](https://nassgeodata.gmu.edu/CropScape/) |
| **Satellite basemap: EOX Sentinel-2 cloudless 2024** | Satellite view on the map and 3D twin | **CC BY-NC-SA 4.0: usage restriction.** Not acceptable for the submission | [s2maps.eu](https://s2maps.eu). Replaced in #100; remove this row when it lands |

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
| `stress-v1` LightGBM model (`services/science-api/models/stress-v1/`) | ITZA's own weights, Apache 2.0 | Trained on MODIS, POWER, SMAP, SoilGrids and NASADEM listed above. See [`pipelines/ml/MODEL_CARD.md`](pipelines/ml/MODEL_CARD.md) |
| LightGBM, SHAP and training libraries | MIT, per the Python list below | |

## 5. Fonts, icons and images

- No web fonts are bundled; the app uses the system font stack.
- The favicon, app icons and the field imagery frames (`apps/web/public/`) are made by the team from the
  data above; the frames are derived from NASA data.
- UI icons are inline SVG written for the project.

## 6. Dependencies (generated)

Production dependencies only; build and test tooling is not shipped.

<!-- licenses:begin (generated by scripts/licenses.mjs; do not edit) -->

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

### Python packages (every uv project, as locked in uv.lock) (115)

| Package | Version | License |
|---|---|---|
| affine | 3.0.1 | BSD-3-Clause |
| aiobotocore | 3.10.0 | Apache-2.0 |
| aiohappyeyeballs | 2.7.1 | PSF-2.0 |
| aiohttp | 3.14.5 | Apache-2.0 AND MIT |
| aioitertools | 0.13.0 | MIT |
| aiosignal | 1.4.0 | Apache Software License (OSI) |
| annotated-doc | 0.0.6 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyio | 4.16.0 | MIT |
| argcomplete | 3.7.2 | Apache Software License (OSI) |
| ast_serialize | 0.13.1 | MIT |
| attrs | 26.1.0 | MIT |
| black | 26.10.1 | MIT |
| botocore | 1.43.117 | Apache-2.0 |
| bounded-pool-executor | 0.0.3 | MIT |
| certifi | 2026.10.23 | MPL-2.0 |
| charset-normalizer | 3.5.2 | MIT |
| click | 8.5.1 | BSD-3-Clause |
| cloudpickle | 3.1.2 | BSD-3-Clause |
| coverage | 7.17.2 | Apache-2.0 |
| datamodel-code-generator | 0.93.0 | MIT |
| donfig | 0.8.1.post1 | MIT |
| earthaccess | 0.19.0 | MIT |
| fastapi | 0.162.4 | MIT |
| frozenlist | 1.8.0 | Apache-2.0 |
| fsspec | 2026.9.0 | BSD-3-Clause |
| genson | 1.4.0 | MIT |
| google-crc32c | 1.9.0 | Apache-2.0 |
| h11 | 0.16.0 | MIT |
| h5netcdf | 1.8.3 | BSD License (OSI) |
| h5py | 3.16.0 | BSD-3-Clause |
| httpcore | 1.0.9 | BSD-3-Clause |
| httpcore2 | 2.16.0 | BSD-3-Clause |
| httptools | 0.9.0 | MIT |
| httpx | 0.28.1 | BSD-3-Clause |
| httpx2 | 2.16.0 | BSD-3-Clause |
| idna | 3.20 | BSD-3-Clause |
| importlib_resources | 7.1.0 | Apache-2.0 |
| inflect | 7.6.0 | MIT |
| iniconfig | 2.3.1 | MIT |
| isort | 8.0.1 | MIT |
| jaraco.functools | 4.6.0 | MIT |
| Jinja2 | 3.1.6 | BSD License (OSI) |
| jmespath | 1.1.0 | MIT |
| joblib | 1.6.0 | BSD-3-Clause |
| jsonschema | 4.26.0 | MIT |
| jsonschema-specifications | 2025.9.1 | MIT |
| librt | 0.16.0 | MIT |
| lightgbm | 4.7.0 | MIT |
| MarkupSafe | 3.0.4 | BSD-3-Clause |
| more-itertools | 11.2.1 | MIT |
| msgspec | 0.22.0 | BSD-3-Clause |
| multidict | 7.2.1 | Apache-2.0 |
| multimethod | 2.1 | Apache-2.0 |
| mypy | 2.4.1 | MIT |
| mypy_extensions | 1.2.0 | MIT |
| narwhals | 2.28.0 | MIT |
| numcodecs | 0.17.1 | MIT |
| numpy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| opentelemetry-api | 1.45.2 | Apache-2.0 |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| pandas | 3.1.1 | BSD-3-Clause |
| pathspec | 1.1.1 | Mozilla Public License 2.0 (MPL 2.0) (OSI) |
| pillow | 13.0.0 | MIT-CMU |
| platformdirs | 4.14.5 | MIT |
| pluggy | 1.7.0 | MIT |
| pqdm | 0.2.0 | MIT License (OSI) |
| propcache | 0.5.4 | Apache-2.0 |
| pydantic | 2.14.3 | MIT |
| pydantic_core | 2.50.4 | MIT |
| pydantic-settings | 2.16.2 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| pyparsing | 3.3.3 | MIT |
| pyproj | 3.8.0 | MIT |
| pytest | 9.2.0 | MIT |
| pytest-cov | 7.1.0 | MIT |
| python-cmr | 0.13.0 | MIT |
| python-dateutil | 2.9.0.post0 | BSD License AND Apache Software License (OSI) |
| python-dotenv | 1.2.4 | BSD-3-Clause |
| pytokens | 0.4.1 | MIT License (OSI) |
| PyYAML | 6.0.3 | MIT |
| rasterio | 1.5.2 | BSD-3-Clause |
| referencing | 0.37.0 | MIT |
| requests | 2.34.2 | Apache-2.0 |
| respx | 0.23.1 | BSD-3-Clause |
| rioxarray | 0.23.0 | Apache-2.0 |
| rpds-py | 2026.9.1 | MIT |
| ruff | 0.17.4 | MIT |
| ruff | 0.17.5 | MIT |
| s3fs | 2026.9.0 | BSD License (OSI) |
| scikit-learn | 1.9.1 | BSD-3-Clause |
| scipy | 1.18.1 | BSD License (OSI) |
| shapely | 2.2.0 | BSD-3-Clause |
| six | 1.17.0 | MIT |
| starlette | 1.10.0 | BSD-3-Clause |
| tenacity | 9.2.1 | Apache-2.0 |
| threadpoolctl | 3.8.0 | BSD-3-Clause |
| tinynetrc | 1.3.1 | MIT |
| tqdm | 4.70.1 | MPL-2.0 AND MIT |
| truststore | 0.10.5 | MIT |
| typeguard | 4.6.0 | MIT |
| types-jsonschema | 4.26.0.20261006 | Apache-2.0 |
| types-PyYAML | 6.0.12.20261111 | Apache-2.0 |
| types-shapely | 2.1.0.20261030 | Apache-2.0 |
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

<!-- licenses:end -->
