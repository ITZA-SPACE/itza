# Hero bundles

`<id>/bundle.json` is a precomputed Field Data Bundle served as a static file and loaded cache-first by `apps/web/src/data`.

The two bundles here are **synthetic placeholders** copied from `fixtures/synthetic/`. Issue #17 replaces them with real precomputed bundles for the Sétif story field and the US proof field.

`<id>/projection.json` is the matching `/v1/projection` response for the 2050 view, served the same way (and precached for offline use). It is a **synthetic placeholder** copied from `fixtures/projection/setif-2050.json`; #17 replaces it with the real response for each hero field.

`<id>/frames/index.json` (plus its PNGs), `<id>/terrain.json` (plus `terrain/*.png`) and `<id>/zones.json` feed the 3D twin: 11 years of monthly NDVI frames (every other month also a moisture frame), the colorized slope-class, concavity and accumulation previews with D8 flow lines, and two management zones. They follow the science API's `frames/1.0`, `terrain/1.0` and `zones/1.0` responses and are **synthetic placeholders** (seasonal curves over a made-up surface, labelled so in their provenance); #17 replaces them with real HLS, NASADEM and zone output.
