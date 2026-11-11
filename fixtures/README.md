# Test fixtures

Raw API responses and clipped rasters captured for tests. Tests never call the network; they read from here. Owned by workstream A.

`synthetic/` holds invented, deterministic Field Data Bundles and one example document per shared schema. It is labeled synthetic: never present it as real data. See [schemas/README.md](../schemas/README.md).

`granules/` holds tiny synthetic NetCDF (IMERG, SMAP L4) and GeoTIFF (HLS VI) granule fixtures for the science-api server adapters (`services/science-api/src/itza_science/adapters/`), covering the semi-arid-winter-cereal field's geometry from `synthetic/generate.mjs`. Regenerate with `cd services/science-api && uv run python ../../fixtures/granules/generate.py`. Synthetic, not real observations.

`earthdata/recorded/` holds real IMERG Final/Late V07, SMAP L4 v008 and HLS L30/S30 VI v2 clips, including native QA bands. Source ids, periods, clipping windows, native-pixel reference values and hashes are recorded alongside them. See [the capture and verification notes](earthdata/recorded/README.md). These are separate from the invented `granules/` fixtures.
