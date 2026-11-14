from hashlib import sha256
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

from itza_science.api.prithvi import Publication, Season, Source


def fixture_publication(root: Path) -> Publication:
    directory = root / "fixture-field"
    directory.mkdir(parents=True)
    path = directory / "prithvi-2022.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=2,
        height=2,
        count=1,
        dtype="uint8",
        crs="EPSG:32613",
        transform=from_origin(500000, 4400000, 30, 30),
        nodata=0,
    ) as dst:
        dst.write(np.array([[0, 1], [2, 1]], dtype="uint8"), 1)
    manifest = Publication(
        bundle_id="fixture-field",
        model="synthetic endpoint fixture",
        checkpoint_sha256="0" * 64,
        classes={"0": "no data", "1": "crop", "2": "fallow or idle cropland"},
        seasons=[
            Season(
                year=2022,
                file=path.name,
                sha256=sha256(path.read_bytes()).hexdigest(),
                provenance=[Source(source="synthetic raster", resolution="30 m", period="2022")],
            )
        ],
        gaps=[],
        limitations=["Synthetic raster tests transport only; no scientific validation."],
    )
    (directory / "prithvi.json").write_text(manifest.model_dump_json())
    return manifest
