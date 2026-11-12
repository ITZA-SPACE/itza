"""Colorized, masked display PNGs; numerical analysis always uses the original rasters."""

from io import BytesIO

import numpy as np
from PIL import Image
from rasterio.warp import transform_bounds

from itza_science.terrain.grid import FloatArray, Grid

MAX_FRAME_BYTES = 150000


def encode(
    values: FloatArray, grid: Grid, variable: str
) -> tuple[bytes, int, int, tuple[float, float, float, float]]:
    rows, cols = grid.field_window()
    data = values[rows, cols]
    valid = grid.mask[rows, cols] & np.isfinite(data)
    ranges = {
        "ndvi": (-1.0, 1.0),
        "moisture": (0.0, 1.0),
        "slope": (0.0, 45.0),
        "aspect": (0.0, 360.0),
        "slope_class": (0.0, 3.0),
        "concavity": (-5.0, 5.0),
    }
    if variable == "accumulation":
        data = np.log1p(data)
    low, high = ranges.get(
        variable,
        (
            float(np.min(data[valid])) if valid.any() else 0.0,
            float(np.max(data[valid])) if valid.any() else 1.0,
        ),
    )
    normalized = np.clip((np.nan_to_num(data, nan=low) - low) / max(high - low, 1e-9), 0, 1)
    bins = np.round(normalized * 15) / 15
    if variable == "moisture":
        rgb = np.stack([210 * (1 - bins), 230 - 170 * bins, 255 - 65 * bins], axis=-1)
    else:
        rgb = np.stack(
            [160 * (1 - bins) + 20 * bins, 80 * (1 - bins) + 150 * bins, 30 + 20 * bins], axis=-1
        )
    rgba = np.dstack([rgb, valid.astype(float) * 255]).astype(np.uint8)
    image = Image.fromarray(rgba)
    image.thumbnail((1024, 1024), Image.Resampling.NEAREST)
    while True:
        stream = BytesIO()
        image.save(stream, format="PNG", optimize=True, compress_level=9)
        payload = stream.getvalue()
        if len(payload) <= MAX_FRAME_BYTES:
            break
        image = image.resize(
            (max(1, image.width * 3 // 4), max(1, image.height * 3 // 4)), Image.Resampling.NEAREST
        )
    affine = grid.affine
    west, north = affine @ (cols.start, rows.start)
    east, south = affine @ (cols.stop, rows.stop)
    bounds = transform_bounds(grid.crs, "EPSG:4326", west, south, east, north)
    return payload, image.width, image.height, bounds
