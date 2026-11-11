# Test fixtures

Raw API responses and clipped rasters captured for tests. Tests never call the network; they read from here. Owned by workstream A.

`synthetic/` holds invented, deterministic Field Data Bundles and one example document per shared schema. It is labeled synthetic: never present it as real data. See [schemas/README.md](../schemas/README.md).

`granules/` holds tiny synthetic NetCDF (IMERG, SMAP L4) and GeoTIFF (HLS VI) granule fixtures for the science-api server adapters (`services/science-api/src/itza_science/adapters/`), covering the semi-arid-winter-cereal field's geometry from `synthetic/generate.mjs`. Regenerate with `cd services/science-api && uv run python ../../fixtures/granules/generate.py`. Synthetic, not real observations.

`projection/` holds `setif-2050.json`, a synthetic `/v1/projection` response (three SSPs with model-spread min/max) for the engine's 2050 delta-change tests. Regenerate with `cd services/science-api && uv run python ../../fixtures/projection/generate.py`. Synthetic, not real projections.
