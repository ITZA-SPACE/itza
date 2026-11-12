"""Records small raw CDL responses into `fixtures/cdl/` for offline tests (#17).

    uv run python capture_fixtures.py --year 2020 --lon -103.15 --lat 40.15 --out akron_2020.txt

The live CropScape service (`nassgeodata.gmu.edu`) returned HTTP 500 for every point and year
tried during this session, including its own documented example point; `fixtures/cdl/*.txt`
were hand-authored from the documented response shape instead (noted in `tests/unit/test_cdl.py`).
Re-run this script once the service is reachable to replace them with real captures.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from itza_science.clients.cdl import BASE_URL
from itza_science.clients.http import UpstreamClient, build_client
from itza_science.core.config import Settings

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "cdl"


async def capture(year: int, lon: float, lat: float, out: str) -> None:
    settings = Settings()
    async with build_client(settings) as client:
        upstream = UpstreamClient(client, settings)
        text = await upstream.get_text(
            "usda_nass_cdl", BASE_URL, {"year": year, "x": lon, "y": lat}
        )
    FIXTURES.mkdir(parents=True, exist_ok=True)
    path = FIXTURES / out
    path.write_text(text)
    print(f"wrote {path} ({len(text)} bytes)")
    print(text[:300])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--out", required=True, help="Filename under fixtures/cdl/.")
    args = parser.parse_args()
    asyncio.run(capture(args.year, args.lon, args.lat, args.out))


if __name__ == "__main__":
    main()
