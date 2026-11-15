# Relief fixtures

Small real responses captured on 2026-11-14 for the relief package tests (`services/science-api/tests/unit/terrain/test_relief_sources.py`). Tests read these files; they never call the network.

| File | Source | Request |
|---|---|---|
| `akron-3dep-64.tif` | USGS 3DEP `3DEPElevation/ImageServer/exportImage` | bbox `-103.1729,40.1654,-103.1662,40.1705`, EPSG:4326, 64×64, float32 |
| `akron-3dep-catalog.json` | USGS 3DEP `ImageServer/query` | point `-103.1695,40.168`; trimmed to the fields the client reads |
| `akron-naip-64.jpg` | USDA NAIP `USGSNAIPPlus/ImageServer/exportImage` | same bbox, 64×64 JPEG |
| `akron-naip-catalog.json` | USDA NAIP `ImageServer/query` | same point, `Category=1`; trimmed |
| `constant-zero-16.tif` | USGS 3DEP `exportImage` over Sétif, Algeria | bbox `5.726,36.117,5.733,36.122`; every value is 0.0 (no coverage outside the US) |
| `eox-tile.jpg` | EOX s2cloudless 2016 WMTS | tile `15/12854/16905` (zoom/row/column) over Sétif (CC BY 4.0, EOX IT Services GmbH, contains modified Copernicus Sentinel data 2016 & 2017) |
| `terrarium-tile.png` | AWS Terrain Tiles (Terrarium encoding) | tile `13/4226/3213` (zoom/column/row) over Sétif, 922 to 978 m |

USGS and USDA data are US Government works in the public domain.
