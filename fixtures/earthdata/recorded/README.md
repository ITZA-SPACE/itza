# Recorded NASA granule clips

These are **real NASA observations**, captured with Earthdata authentication
near the Akron, Colorado proof-field area. The synthetic
fixtures in `fixtures/granules/` are intentionally separate.

| Collection | Version | Observation | Captured data |
|---|---|---|---|
| GPM_3IMERGDF | 07 (V07B files) | 2025-05-01 | `precipitation(time,lon,lat)`, 3×3 native cells |
| GPM_3IMERGDL | 07 (V07B files) | 2025-05-01 | Same window; different Final/Late native values |
| SPL4SMGP | 008 | 2025-04-30, 19:30 and 22:30 UTC granules | 3×3 native geolocation cells; `Geophysical_Data/sm_surface` and `sm_rootzone` |
| HLSL30_VI | 2.0 | 2025-04-05 | 17×17 native NDVI and matching Fmask COG windows |
| HLSS30_VI | 2.0 | 2025-05-02 | 17×17 native NDVI and matching Fmask COG windows |

`manifest.json` records the original granule ids and unauthenticated URL strings,
collection versions, native observation periods, exact clipping indices, retrieval
timestamps, native-pixel reference values and SHA-256 hashes of all clips. URLs
identify protected NASA files; the manifest contains no tokens, signed URLs or
user profile information. The reference point is inside the selected native pixel,
so a small field fully inside that pixel has an independently known mean.

## Capture method

1. Authenticate with `earthaccess.login(strategy="environment", persist=False)`.
   The account must authorize GES DISC access as well as the NSIDC and LP DAAC
   applications. Credentials stay in the service `.env` or process environment.
2. Discover the versioned collections with `earthaccess.search_data` near
   `(-103.15, 40.15)`. The recorded manifest contains the exact returned granules;
   the L30 search spans April–June because the first short May search had no result.
3. Stream the manifest URLs with `earthaccess.open`; close each returned handle
   with `contextlib.closing`. Use `open_kwargs={"cache_type":"blockcache"}` for
   synchronous HDF5 range reads. No full global raster is committed.
4. For IMERG, use xarray/h5netcdf with `decode_cf=False` to preserve raw values,
   variable attributes and latitude/longitude coordinates while selecting the
   manifest's 3×3 window. Only the precipitation variable and its coordinates are
   retained; no spatial or temporal resampling is applied.
5. For SMAP, copy native 3×3 `cell_lat` / `cell_lon` arrays, root attributes and the
   two soil-moisture datasets using h5py. Preserve variable attributes; omit HDF5
   dimension reference attributes because their full-file dimension scales are not
   copied. Keep the original `Geophysical_Data` group. No values are synthesized.
6. For HLS, read the identical native window from NDVI and Fmask with Rasterio;
   preserve CRS, window transform, nodata, scale/offset and tags and write small
   COGs. NDVI raw values remain int16 with the product's 0.0001 scale and -19999 fill.
7. Sample the reference value from the **original** native source pixel before
   writing the clip. Store those reference values and the final file hashes in the
   manifest. Offline tests verify both the numerical results and file integrity.

The two SMAP samples test daily averaging of available observations; they are only
2 of the expected 8 daily samples, so the adapter explicitly reports incomplete
sampling and low confidence. Final and Late IMERG have different values at the
same cell/day, allowing the integration test to verify that Final wins.

## Verification

The automated suite never contacts NASA or loads developer credentials. Adapter
unit tests replay each captured granule and check native-pixel values, units,
provenance and hashes. Bundle integration tests create, poll, schema-validate and
fetch series from these actual files, including the Final-over-Late preference.
Additional synthetic fixtures exercise exact weights and controlled invalid pixels.

A manual authenticated login succeeded, and the protected source data for all five
collections were read during capture. See `smoke.json` for the manual verification
record and its scope. These small clips verify format handling and known points;
they do not establish global coverage or a cold-cache latency guarantee.

Source documentation:
[IMERG](https://gpm.nasa.gov/data/imerg),
[SMAP L4 v008 guide](https://nsidc.org/sites/default/files/documents/user-guide/multi_spl4smau-v008-userguide.pdf),
[HLS VI v2 guide](https://lpdaac.usgs.gov/documents/2088/HLS_VI_User_Guide_V2.pdf),
[Earthdata authentication](https://earthaccess.readthedocs.io/en/latest/user/howto/authenticate/).
