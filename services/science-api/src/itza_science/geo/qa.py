"""HLS v2.0 Fmask quality-band decoding.

Fmask is a per-pixel byte: bit 0 cirrus, bit 1 cloud, bit 2 adjacent to
cloud/shadow, bit 3 cloud shadow, bit 4 snow/ice, bit 5 water, bits 6-7
aerosol level. We mask cloud, cloud shadow, snow/ice and water; cirrus and
aerosol level alone do not disqualify a pixel.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

FMASK_FILL = 255
_CLOUD_BIT = 1
_CLOUD_SHADOW_BIT = 3
_SNOW_ICE_BIT = 4
_WATER_BIT = 5
_MASK_BITS = (_CLOUD_BIT, _CLOUD_SHADOW_BIT, _SNOW_ICE_BIT, _WATER_BIT)


def hls_fmask_invalid(fmask: npt.NDArray[np.integer]) -> npt.NDArray[np.bool_]:
    """True where the Fmask QA band marks the pixel unusable."""
    values = np.asarray(fmask).astype(np.uint16)
    invalid: npt.NDArray[np.bool_] = values == FMASK_FILL
    for bit in _MASK_BITS:
        invalid |= ((values >> bit) & 1).astype(np.bool_)
    return invalid
