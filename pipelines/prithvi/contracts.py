"""Validate captured manifests before paths, dates or arrays reach the model."""

from datetime import date
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Chip(Model):
    chip_id: str = Field(pattern=r"^chip_[0-9]{3}_[0-9]{3}$")
    tile: str = Field(pattern=r"^[0-9]{2}[A-Z]{3}$")
    first_img_date: AwareDatetime
    middle_img_date: AwareDatetime
    last_img_date: AwareDatetime
    split: Literal["train", "held_out"]
    image: str = Field(pattern=r"^chip_[0-9]{3}_[0-9]{3}_merged\.tif$")
    mask: str = Field(pattern=r"^chip_[0-9]{3}_[0-9]{3}\.mask\.tif$")
    image_url: str = Field(pattern=r"^https://s3\.us-west-2\.amazonaws\.com/")
    mask_url: str = Field(pattern=r"^https://s3\.us-west-2\.amazonaws\.com/")
    image_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    mask_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def ordered(self) -> "Chip":
        if not self.first_img_date < self.middle_img_date < self.last_img_date:
            raise ValueError("chip dates must be ordered")
        if self.image != f"{self.chip_id}_merged.tif" or self.mask != f"{self.chip_id}.mask.tif":
            raise ValueError("chip id must match filenames")
        return self


class Dataset(Model):
    source: str
    license: str
    resolution: Literal["30 m"]
    period: Literal["2022"]
    selection: str
    held_out_tiles: list[str]
    chips: list[Chip] = Field(min_length=2, max_length=100)

    @model_validator(mode="after")
    def disjoint(self) -> "Dataset":
        train = {c.tile for c in self.chips if c.split == "train"}
        test = {c.tile for c in self.chips if c.split == "held_out"}
        if not train or not test or train & test or not test <= set(self.held_out_tiles):
            raise ValueError("train and held-out HLS tiles must be nonempty and disjoint")
        if len({c.chip_id for c in self.chips}) != len(self.chips):
            raise ValueError("duplicate chips")
        return self


class Band(Model):
    url: str = Field(pattern=r"^https://")
    date: date
    band: str
    window_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class HeroChip(Model):
    bundle_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    year: int = Field(ge=2000, le=2100)
    dates: list[date] = Field(min_length=3, max_length=3)
    location: tuple[float, float]
    geometry: dict[str, object]
    crs: str = Field(pattern=r"^EPSG:[0-9]+$")
    transform: tuple[float, float, float, float, float, float]
    sources: list[Band] = Field(min_length=21, max_length=21)
    chip_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def ordered(self) -> "HeroChip":
        if self.dates != sorted(set(self.dates)) or any(d.year != self.year for d in self.dates):
            raise ValueError("hero dates must be distinct and in the season")
        if not -90 <= self.location[0] <= 90 or not -180 <= self.location[1] <= 180:
            raise ValueError("invalid coordinates")
        if self.transform[0] != 30 or self.transform[4] != -30:
            raise ValueError("expected native north-up 30 m HLS grid")
        return self
