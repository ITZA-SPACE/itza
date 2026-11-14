# Native GRACE cell

Real JPL RL06.3 v04 coastal-resolution-improved mascon data, captured 2026-11-13
from the source file named in `manifest.json`. The clip retains the native cell
nearest the Sétif story polygon, every native solution timestamp and time bound,
the original thickness values/units, gain and land mask. No temporal averaging,
date relabeling, interpolation or resampling was applied during capture.

Some distinct native solutions fall in the same calendar month. The pipeline
regression test preserves those solution dates instead of collapsing or dropping
observations. Missing calendar months stay null; the trend uses actual observed
solution dates. This is regional total water storage, about 300 km effective
resolution, not field groundwater.

The manifest records source/version, cell coordinates, byte count and SHA-256.
[Dataset catalog and limitations](../../../docs/NASA_DATA_SOURCES.md).
