# Real GLDAS / NLDAS field clips

Captured from NASA GES DISC using Earthdata Login and authenticated
HTTP range reads (`earthaccess.open` + h5netcdf). No credentials are stored here.
These are spatial subsets of the unmodified native variables and time bounds,
including adjacent cells for polygon weighting, rather than invented data.

- `gldas_noah/`: Sétif story-field bounding box, GLDAS_NOAH025_3H v2.1,
  [DOI 10.5067/E7TYRXPJKWOQ](https://doi.org/10.5067/E7TYRXPJKWOQ).
- `nldas_noah/`: Akron proof-field 1 bounding box, NLDAS_NOAH0125_H v2.0,
  [DOI 10.5067/T4OW83T8EXDO](https://doi.org/10.5067/T4OW83T8EXDO).

Each folder's `manifest.json` records the original URLs, clipped file SHA-256
hashes, product version, capture time, bounding box and expected daily result.
Both cover 2014-06-01, before SMAP, plus the following midnight. There are 9
three-hourly GLDAS files and 25 hourly NLDAS files: the extra timestamp completes
ET's final interval. ET at the first midnight belongs to the previous day.
Native GLDAS ET flux is multiplied by interval seconds; NLDAS interval amounts
are summed. Top-metre soil water mass is divided by 1000 to obtain m³/m³.

NASA open data: no usage restrictions, citation requested. Native model outputs
are coarse grid estimates, not measurements of these individual fields. Offline
integration tests check file hashes and reproduce the expected daily means and
ET totals. The surrounding unrecorded season remains explicitly missing in tests.
Synthetic conversion/error fixtures are generated separately in `tests/ldas_support.py`.
