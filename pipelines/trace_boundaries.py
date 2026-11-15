"""Traces a real field boundary around each hero-field centroid with the click-to-field
algorithm (`propose`, #24/#89), so each demo field's shape comes from real HLS NDVI behavior
instead of a hand-drawn polygon. Writes results as JSON next to the script for manual review.

    uv run python trace_boundaries.py
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, timedelta
from pathlib import Path

from itza_science.adapters.granules import EarthaccessGranuleReader
from itza_science.api.boundaries import NoFieldFoundError, propose
from itza_science.contracts.common_schema import Period as PeriodModel
from itza_science.core.config import Settings
from itza_science.terrain.service import SpatialService
from itza_science.terrain.sources import EarthdataSpatialSource

ROOT = Path(__file__).resolve().parents[1]
SCIENCE_API = ROOT / "services" / "science-api"
OUT = Path(__file__).resolve().parent / "traced_boundaries.json"

POINTS = [
    ("setif-story", 5.72916, 36.11938),
    ("akron-proof-1", -103.16981, 40.1677),
    ("akron-proof-2", -103.15346, 40.13676),
    ("akron-proof-3", -103.13934, 40.1246),
]

log = logging.getLogger("trace_boundaries")


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    settings = Settings(_env_file=SCIENCE_API / ".env")
    if not settings.data_dir.is_absolute():
        settings.data_dir = SCIENCE_API / settings.data_dir
    reader = EarthaccessGranuleReader(
        settings.data_dir / "granules",
        credentials={
            name: value.get_secret_value()
            for name, value in (
                ("EARTHDATA_TOKEN", settings.earthdata_token),
                ("EARTHDATA_USERNAME", settings.earthdata_username),
                ("EARTHDATA_PASSWORD", settings.earthdata_password),
            )
            if value is not None and value.get_secret_value()
        },
    )
    spatial = SpatialService(settings.data_dir, EarthdataSpatialSource(reader, settings.data_dir))
    period = PeriodModel(start=date.today() - timedelta(days=300), end=date.today())

    results: dict[str, object] = {}
    for field_id, lon, lat in POINTS:
        log.info("%s: tracing a boundary around %.5f, %.5f...", field_id, lon, lat)

        def on_progress(done: int, total: int, fid: str = field_id) -> None:
            log.info("%s: %d/%d date windows read", fid, done, total)

        try:
            proposal = await propose(spatial, lon, lat, period, on_progress)
        except NoFieldFoundError as exc:
            log.warning("%s: no field found (%s)", field_id, exc)
            results[field_id] = {"error": str(exc)}
            continue
        log.info(
            "%s: traced, %.2f ha, confidence %s, separation %.2f",
            field_id,
            proposal.area_ha,
            proposal.confidence,
            proposal.separation,
        )
        results[field_id] = proposal.model_dump(mode="json")
        OUT.write_text(json.dumps(results, indent=2))

    OUT.write_text(json.dumps(results, indent=2))
    log.info("wrote %s", OUT)


if __name__ == "__main__":
    asyncio.run(main())
