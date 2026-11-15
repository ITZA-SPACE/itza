# Recorded public demo sources

Captured for the first Akron proof sampling polygon in
`pipelines/hero_fields.yaml`. These are real source responses, separate from the
synthetic spatial and smoke-test inputs. Each `.bin` is the unmodified HTTP body;
its matching `.json` records the public URL, exact request parameters, retrieval
time, byte count and SHA-256. Request keys are hashes of URL and sorted parameters.
No credentials or signed URLs are included.

The small snapshot contains POWER weather for 2023-01-01 through 2023-01-03,
MOD13Q1 NDVI and pixel reliability for the first ten 2008 composites, and a 2023
CDL nearest-neighbor categorical raster export around the polygon. It does not
represent the complete hero history. The pipeline test replays these exact requests
with `Archive(..., offline=True)`, checks their integrity, and exercises canonical
weather/NDVI parsing and the observed winter-wheat CDL label without network access.

Capture/replay commands and limits: [pipeline README](../../../pipelines/README.md#raw-fixture-capture).
NASA source descriptions: [POWER](https://power.larc.nasa.gov/),
[ORNL MODIS REST](https://modis.ornl.gov/data/modis_webservice.html).
USDA classification reference: [CDL](https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php).
