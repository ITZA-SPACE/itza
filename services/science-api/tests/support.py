import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from itza_science.adapters.granules import Granule

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "power"
GRANULE_FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "granules"


def load_fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / name).read_text())
    return data


@dataclass
class FakeGranuleReader:
    """A ``GranuleReader`` backed by fixture files, for adapter tests without network.

    ``files`` maps ``(short_name, day)`` to a fixture path; a missing key means
    "no granule that day", exercising the adapter's own fallback/gap behavior.
    """

    files: dict[tuple[str, date], Path] = field(default_factory=dict)
    credentials: bool = True

    def credentials_available(self) -> bool:
        return self.credentials

    async def search_day(
        self,
        short_name: str,
        version: str,
        bbox: tuple[float, float, float, float],
        day: date,
    ) -> list[Granule]:
        path = self.files.get((short_name, day))
        return [Granule(path=path, data_date=day)] if path else []
