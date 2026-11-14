# Hero bundles

`<id>/bundle.json` is a precomputed Field Data Bundle served as a static file and loaded cache-first by `apps/web/src/data`.

The two bundles here are **synthetic placeholders** copied from `fixtures/synthetic/`. Issue #17 replaces them with real precomputed bundles for the Sétif story field and the US proof field.

`<id>/projection.json` is the matching `/v1/projection` response for the 2050 view, served the same way (and precached for offline use). It is a **synthetic placeholder** copied from `fixtures/projection/setif-2050.json`; #17 replaces it with the real response for each hero field.
