"""USDA NASS CropScape CDL point-value client (per-season crop/fallow ground truth, F-22).

Public REST service, no key: one GET per point and year returns the land-cover category
grown there that year. Used only by the offline hero-field pipeline (#17), never by a live
route, so it keeps its own minimal retry rather than the JSON-only `UpstreamClient.get_json`.
"""

import re
from typing import Literal

from pydantic import BaseModel

from itza_science.clients.http import UpstreamClient
from itza_science.core.errors import UpstreamError

SOURCE = "usda_nass_cdl"
BASE_URL = "https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue"
RESOLUTION_M = 30.0
# First year both Algeria and the Great Plains tests need; CDL exists nationally from 2008.
MIN_YEAR = 2008

_RESULT = re.compile(r"Value is (\d+)\.\s*Category is ([^.]+)\.", re.IGNORECASE)

# Land-cover categories that are not a farmed crop in any year (background, developed, water,
# natural vegetation); every other named category is treated as a crop. Not exhaustive: an
# unrecognized but plainly non-agricultural label still classifies as "crop" and should be
# reviewed if it shows up in practice (recorded as a gap by the caller, not here).
_NON_CROP = {
    "background",
    "developed",
    "developed/open space",
    "developed/low intensity",
    "developed/med intensity",
    "developed/high intensity",
    "open water",
    "water",
    "wetlands",
    "woody wetlands",
    "herbaceous wetlands",
    "forest",
    "deciduous forest",
    "evergreen forest",
    "mixed forest",
    "shrubland",
    "barren",
    "grassland/pasture",
    "grass/pasture",
    "clouds/no data",
    "nlcd-sampled background",
}
_FALLOW = {"fallow/idle cropland"}

Classification = Literal["crop", "fallow", "other"]


def classify(category: str) -> Classification:
    name = category.strip().lower()
    if name in _FALLOW:
        return "fallow"
    if name in _NON_CROP:
        return "other"
    return "crop"


class CdlLabel(BaseModel):
    year: int
    value: int
    category: str
    classification: Classification


class CdlClient:
    """One point, queried year by year; CropScape has no multi-year endpoint."""

    def __init__(self, http: UpstreamClient, base_url: str = BASE_URL) -> None:
        self._http = http
        self._base_url = base_url

    async def value_at(self, lon: float, lat: float, year: int) -> CdlLabel | None:
        """The label at this point for this year, or `None` outside CDL's coverage or years."""
        if year < MIN_YEAR:
            return None
        text = await self._http.get_text(
            SOURCE, self._base_url, {"year": year, "x": lon, "y": lat}
        )
        match = _RESULT.search(text)
        if not match:
            raise UpstreamError(SOURCE, "unexpected CropScape response shape")
        value, category = int(match.group(1)), match.group(2).strip()
        if value == 0:
            return None
        return CdlLabel(year=year, value=value, category=category, classification=classify(category))
