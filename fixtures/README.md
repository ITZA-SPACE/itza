# Test fixtures

Raw API responses and clipped rasters captured for tests. Tests never call the network; they read from here. Owned by workstream A.

`synthetic/` holds invented, deterministic Field Data Bundles and one example document per shared schema. It is labeled synthetic: never present it as real data. See [schemas/README.md](../schemas/README.md).

`granules/` holds tiny synthetic NetCDF (IMERG, SMAP L4) and GeoTIFF (HLS VI) granule fixtures for the science-api server adapters (`services/science-api/src/itza_science/adapters/`), covering the semi-arid-winter-cereal field's geometry from `synthetic/generate.mjs`. Regenerate with `cd services/science-api && uv run python ../../fixtures/granules/generate.py`. Synthetic, not real observations.

`adapters/` holds responses for the browser adapters in `packages/adapters-browser` (NASA POWER daily and climatology, ORNL DAAC MODIS MOD13Q1, MOD16A2GF and MCD12Q2, CMR, SoilGrids). They were written by hand from the documented response shapes in [NASA_DATA_SOURCES.md](../docs/NASA_DATA_SOURCES.md), not captured from live calls, and cover the Sétif area. They include the awkward cases the adapters must survive: POWER `-999` fill values, a quality-masked and a fill NDVI pixel, an ET fill composite, a season with no green-up, an empty CMR granule list and an all-null SoilGrids point (as the Sétif city point returned). Replace them with captured responses when live endpoints are checked.
