# Reference field outlines for click-to-field (#81)

Hand-drawn outlines of real fields, used by `services/science-api/scripts/evaluate_boundaries.py` to measure how often a click gives a field boundary that needs no edits (F-24: at least 70 % of clicks with IoU of at least 0.85). One GeoJSON file per hero region:

| File | Region | Imagery to draw on |
|---|---|---|
| `setif.geojson` | Sétif high plains, Algeria (around 5.33 E, 36.12 N) | Copernicus Sentinel-2 L2A, a clear date inside the evaluation period (free, full and open data policy) |
| `akron.geojson` | Akron, Colorado (around 103.15 W, 40.15 N) | USDA NAIP aerial imagery (public domain), or Copernicus Sentinel-2 L2A |

No file is committed yet: the outlines have to be drawn by a person on the imagery, not derived from any algorithm's output, or the score would measure the algorithm against itself.

## Format

A `FeatureCollection`, optionally with a `region` member (the file name is used otherwise), one `Polygon` per field in longitude/latitude (EPSG:4326). Every feature needs:

| Property | Meaning |
|---|---|
| `name` | Unique within the file, such as `setif-01` |
| `imagery` | The imagery it was drawn on, with its product and tile or flight |
| `date` | Acquisition date of that imagery, `YYYY-MM-DD` |

The script refuses a file with a missing or duplicate name, an invalid or non-polygon geometry, or no imagery or date, and asks for at least 10 fields per region (`--min-fields`).

## How to draw them

1. Open the imagery in QGIS or geojson.io. Use a date from the same cropping season as the evaluation period (`--start`, `--end`): boundaries change between seasons.
2. Pick at least 10 fields per region by looking at the imagery only, before running anything. Include the usual cases: large and small fields, irregular shapes, fields next to bare ground, a fallow or bare field, fields that touch.
3. Trace each field along its visible edge (tracks, hedges, colour change). One polygon per field; no holes.
4. Save the outlines, fill in `name`, `imagery` and `date`, and commit the file with the imagery source recorded.

## Running the evaluation

See the header of `evaluate_boundaries.py` and TECHNICAL_ARCHITECTURE §8.3. The first run over a region downloads HLS scenes (hours, several GB, Earthdata credentials in the environment or `~/.netrc`); the run can be interrupted and resumed with `--resume`.
