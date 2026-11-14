# Synthetic native-layout context granules

These tiny offline fixtures are generated, not recorded NASA observations. Run
`uv run python tests/fixtures/context/rebuild.py` from the science-api directory.
They use the published datasets' structures to establish known answers and test
missing data, QA, geolocation and units without credentials or network access.

- `nisar.h5`: SME2 baseline `science/LSAR/SME2/grids`, EPSG:6933, 200 m cells,
  separate retrieval/surface flags; the fixture field contains two valid cells
  (0.1 and 0.4), one rejected retrieval and one precipitation flag.
- `grace.nc`: monthly JPL-style `lwe_thickness` in cm and gain 2, a 2 cm/year
  input trend that becomes 4 cm/year after gain. One missing value and one absent
  calendar month must stay null. Land mask and 0.5 degree coordinates are included.
- `gedi_a.h5`, `gedi_b.h5`: L2A RH98 and L2B cover with their distinct native
  geolocation groups, shared 64-bit shot numbers, real delta-time convention,
  accepted on-field/nearby returns and rejected far/degraded/low-sensitivity/fill
  shots. Accepted RH98 is 10 m and cover is 0.6; neither is real field evidence.
- `scene_*.tif`: north-up 70 m LST=300 K / ESI=0.6 COG-compatible GeoTIFF layers,
  with separate mandatory QC, cloud and water flags.

Layouts and conservative QA policies follow the [NISAR SME2 specification](https://nisar-docs.asf.alaska.edu/sme2/),
[JPL GRACE catalog](https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4),
[GEDI L2A dictionary](https://lpdaac.usgs.gov/documents/982/gedi_l2a_dictionary_P003_v2.html),
[GEDI L2B dictionary](https://edcftp.cr.usgs.gov/project/lpdaac/GEDI_L2/gedi_l2b_product_data_dictionary.html)
and [ECOSTRESS collection 2 guide](https://lpdaac.usgs.gov/documents/1566/ECOL2-4_Grid_Tile_User_Guide_V2.pdf).
These tests do not establish global coverage, calibration or cold-request latency.
