# Hero bundles

The real publications below were captured by
[`pipelines/build_demo.py`](../../../../pipelines/README.md#hero-field-bundles-17).
`index.json` contains their sampling polygons, region packs and selection rationale.

| Folder | Role | Weather / NDVI | CDL labels | HLS frames |
|---|---|---|---|---|
| `setif-story` | Sétif story sampling area | 2008–2025 | Not covered by CDL | 10 |
| `akron-proof-1` | Akron proof sampling area | 2008–2025 | 2008–2023 (16 seasons) | 18 |
| `akron-proof-2` | Akron proof sampling area | 2008–2025 | 2008–2023 (16 seasons) | 19 |
| `akron-proof-3` | Akron proof sampling area | 2008–2025 | 2008–2023 (16 seasons) | 18 |

All four include actual NASADEM terrain and management zones, historical POWER
weather and QA-screened MODIS inputs for Field Memory, a one-day native
IMERG/SMAP sample (2025-12-31), and 18 seasonal model results with SHAP and input/model
provenance. ML uses the training model's fixed January–June windows; it estimates
NDVI anomaly, not yield. Terrain GeoTIFFs, PNG previews and frames are static assets.

GRACE uses native solution dates, including distinct solutions in one calendar
month; missing months remain null. Its trend is regional total water storage,
not field groundwater. GEDI was captured for Sétif and ECOSTRESS for the Akron
fields. Missing/failed products retain explicit context gaps. The sampled recent
NISAR scenes yielded no quality-screened field pixels; no moisture value is invented.

Each directory contains `bundle.json`, `server.json`, `terrain.json`, `frames.json`,
`zones.json`, `context.json`, `ml.json`, `cdl.json`, `field.json`, `provenance.json`
and `assets/`. The bundle follows `field-bundle.schema.json`; `layers.cdl` links
independent proof labels. `provenance.json` hashes every product and asset except
itself. Every field is below 5,000,000 bytes; every PNG is below 150,000 bytes, except
the 3D height image in `assets/relief/` (limit 2,500,000 bytes). The Akron fields carry
that relief package (USGS 3DEP lidar and USDA NAIP, listed under `relief` in
`terrain.json`); Sétif gets it from `refresh_relief.py` run with Earthdata credentials.

Rebuild from the repository root, retaining the cache between runs:

```sh
uv run --project pipelines python pipelines/build_demo.py --cache /tmp/itza-demo --server-days 1
```

The polygons are sampling areas, not cadastral boundaries or identified USDA trial
plots. CDL histories are remote-sensing references, independent of Field Memory;
no agreement score is fabricated here. Sétif history needs farmer confirmation.

The older `semi-arid-winter-cereal` and `fallow-heavy` folders remain explicitly
**synthetic fixtures**, including their 2050 projection files. The app's existing
hero selector still points to those fixtures. Registering the real polygons and
replacing the remaining synthetic UI/2050 inputs is tracked separately in #95;
these publications do not claim that integration is complete.
