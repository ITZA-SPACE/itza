# Test fixtures

Raw API responses and clipped rasters captured for tests. Tests never call the network; they read from here. Owned by workstream A.

## Synthetic fixtures

`fixtures/synthetic/` holds invented, deterministic data: two small bundles (a semi-arid winter-cereal site and a fallow-heavy site, 3 seasons each) plus one example per contract. They are labeled `synthetic` in every provenance block and are not NASA data. Regenerate the bundles with `node fixtures/synthetic/generate.mjs`. Real hero bundles come from issue #17.
