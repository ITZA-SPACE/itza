"""Captured NASA clips only: replay file access without authentication or network calls."""

import json
from datetime import date, datetime
from pathlib import Path

from pydantic import BaseModel, TypeAdapter

from itza_science.adapters.granules import Granule
from itza_science.api.bundles import BundleRequest

RECORDED = Path(__file__).resolve().parents[3] / "fixtures" / "earthdata" / "recorded"


class RecordedClip(BaseModel):
    file: str
    collection: str
    version: str
    point: tuple[float, float]
    expected: dict[str, float]
    sha256: str
    temporal_extent: dict[str, dict[str, datetime]]
    qa_file: str | None = None
    qa_sha256: str | None = None

    @property
    def day(self) -> date:
        return self.temporal_extent["RangeDateTime"]["BeginningDateTime"].date()

    def request(self) -> BundleRequest:
        lon, lat = self.point
        delta = 0.00004
        return BundleRequest.model_validate(
            {
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [lon - delta, lat - delta],
                            [lon + delta, lat - delta],
                            [lon + delta, lat + delta],
                            [lon - delta, lat + delta],
                            [lon - delta, lat - delta],
                        ]
                    ],
                },
                "period": {"start": self.day, "end": self.day},
                "variables": list(self.expected),
            }
        )


def recorded_clips() -> list[RecordedClip]:
    return TypeAdapter(list[RecordedClip]).validate_python(
        json.loads((RECORDED / "manifest.json").read_text())
    )


class RecordedReader:
    def __init__(self, clips: list[RecordedClip] | None = None) -> None:
        self.clips = recorded_clips() if clips is None else clips

    def credentials_available(self) -> bool:
        return True

    async def search_day(
        self, short_name: str, version: str, bbox: tuple[float, float, float, float], day: date
    ) -> list[Granule]:
        return [
            Granule(
                path=RECORDED / c.file,
                data_date=c.day,
                qa_path=RECORDED / c.qa_file if c.qa_file is not None else None,
            )
            for c in self.clips
            if c.collection == short_name and c.day == day and c.version == version
        ]
