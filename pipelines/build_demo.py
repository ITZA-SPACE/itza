"""Builds precomputed hero-field bundles for the demo (#17).

Reuses the science API's own modules directly (adapters, `SpatialService`, the CDL client): the
same code path a running service would take, with no HTTP in between. Idempotent and resumable:
a field already written is skipped unless `--refresh` is given.

    uv run python build_demo.py --years 1 --fields semi-arid-winter-cereal   # quick, one field
    uv run python build_demo.py                                              # full run, all fields

Output: `apps/web/public/bundles/<id>/{bundle.json, frames/, terrain/, terrain.json, zones.json,
cdl.json}`. Brev never serves (TECHNICAL_ARCHITECTURE.md §4.4): this writes static files for the
web app to read, nothing more.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml
from itza_science.adapters.base import DataAdapter, Period
from itza_science.adapters.granules import EarthaccessGranuleReader
from itza_science.adapters.hls_vi import HlsViAdapter
from itza_science.adapters.imerg import ImergAdapter
from itza_science.adapters.smap_l4 import SmapL4Adapter
from itza_science.api.bundles import (
    SUPPORTED_VARS,
    BundleRequest,
    PeriodInput,
    add_terrain,
    build_bundle,
)
from itza_science.clients.cdl import CdlClient
from itza_science.clients.http import UpstreamClient, build_client
from itza_science.contracts.field_bundle_schema import Gap, MultiPolygon, Polygon
from itza_science.core.config import Settings
from itza_science.core.errors import UpstreamError
from itza_science.core.field import field_id
from itza_science.terrain.service import SpatialService
from itza_science.terrain.sources import EarthdataSpatialSource

ROOT = Path(__file__).resolve().parents[1]
SCIENCE_API = ROOT / "services" / "science-api"
HERO_FIELDS_YAML = Path(__file__).resolve().parent / "hero_fields.yaml"
BUNDLES_OUT = ROOT / "apps" / "web" / "public" / "bundles"
MAX_BUNDLE_BYTES = 5 * 1024 * 1024
MARKER = "generated_at"

log = logging.getLogger("build_demo")


@dataclass(frozen=True)
class HeroField:
    id: str
    role: str
    region_pack: str
    rationale: str
    geometry: Polygon | MultiPolygon


def load_hero_fields(path: Path = HERO_FIELDS_YAML) -> list[HeroField]:
    document = yaml.safe_load(path.read_text())
    fields: list[HeroField] = []
    for entry in document["fields"]:
        geometry_type = entry["geometry"]["type"]
        geometry_model = Polygon if geometry_type == "Polygon" else MultiPolygon
        fields.append(
            HeroField(
                id=entry["id"],
                role=entry["role"],
                region_pack=entry["region_pack"],
                rationale=entry["rationale"].strip(),
                geometry=geometry_model.model_validate(entry["geometry"]),
            )
        )
    return fields


def already_built(out_dir: Path) -> bool:
    bundle_path = out_dir / "bundle.json"
    return bundle_path.is_file() and MARKER in json.loads(bundle_path.read_text())


def directory_bytes(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


async def build_one(
    field: HeroField,
    period: Period,
    adapters: list[DataAdapter],
    spatial: SpatialService,
    cdl: CdlClient,
    out_root: Path,
    *,
    refresh: bool,
) -> None:
    out_dir = out_root / field.id
    if already_built(out_dir) and not refresh:
        log.info("%s: already built, skipping (--refresh to rebuild)", field.id)
        return
    out_dir.mkdir(parents=True, exist_ok=True)

    the_field_id = field_id(field.geometry)
    request = BundleRequest(
        geometry=field.geometry,
        period=PeriodInput(start=period.start, end=period.end),
        refresh=refresh,
    )
    log.info("%s: fetching weather, soil moisture and vegetation series...", field.id)
    bundle = await build_bundle(request, the_field_id, SUPPORTED_VARS, adapters)
    log.info("%s: fetching terrain...", field.id)
    await add_terrain(bundle, spatial)

    log.info("%s: building frame index...", field.id)
    bundle.layers.ndvi_frames = "frames/index.json"
    frames = await spatial.frame_index(the_field_id, bundle, refresh)
    frames_dir = out_dir / "frames"
    frames_dir.mkdir(exist_ok=True)
    frame_group = "frames-" + the_field_id
    for frame in frames.frames:
        name = Path(frame.href).name
        shutil.copyfile(spatial.asset(frame_group, name), frames_dir / name)
        frame.href = name
    (frames_dir / "index.json").write_text(
        json.dumps(frames.model_dump(mode="json", by_alias=True, exclude_none=True), indent=None)
    )

    log.info("%s: building terrain overlays...", field.id)
    terrain = await spatial.terrain(field.geometry, href_base="")
    terrain_dir = out_dir / "terrain"
    terrain_group = "terrain-" + the_field_id.removeprefix("sha256:")
    if terrain.available:
        terrain_dir.mkdir(exist_ok=True)
        for key, name in list(terrain.layers.items()):
            if not name.endswith(".png"):
                continue  # numeric GeoTIFFs are analysis-only; the demo ships previews only
            shutil.copyfile(spatial.asset(terrain_group, name), terrain_dir / name)
            terrain.layers[key] = f"terrain/{name}"
    (out_dir / "terrain.json").write_text(
        json.dumps(terrain.model_dump(mode="json", by_alias=True, exclude_none=True), indent=None)
    )

    log.info("%s: finding management zones...", field.id)
    zones = await spatial.management_zones(field.geometry, period, None, refresh)
    bundle.layers.zones = "zones.json"
    (out_dir / "zones.json").write_text(
        json.dumps(zones.model_dump(mode="json", by_alias=True, exclude_none=True), indent=None)
    )

    if field.role == "proof":
        log.info("%s: reading USDA NASS CDL per season...", field.id)
        lon, lat = bundle.field.centroid
        labels = []
        gaps: list[str] = []
        for year in range(period.start.year, period.end.year + 1):
            try:
                label = await cdl.value_at(lon, lat, year)
            except UpstreamError as exc:  # the service is unreliable; never fail the whole bundle
                gaps.append(f"{year}: {exc}")
                continue
            if label is not None:
                labels.append(label.model_dump(mode="json"))
        if labels:
            bundle.layers.cdl = "cdl.json"
            (out_dir / "cdl.json").write_text(json.dumps(labels, indent=None))
        else:
            bundle.gaps.append(
                Gap(
                    var="cdl",
                    reason="USDA NASS CropScape returned no usable label for any season"
                    + (f" ({'; '.join(gaps[:3])})" if gaps else ""),
                    severity="warning",
                )
            )

    document = bundle.model_dump(mode="json", by_alias=True, exclude_none=True)
    document["field"].update(
        elevation_m=bundle.field.elevation_m, slope_mean_deg=bundle.field.slope_mean_deg
    )
    (out_dir / "bundle.json").write_text(json.dumps(document, indent=None))

    size = directory_bytes(out_dir)
    if size > MAX_BUNDLE_BYTES:
        log.warning("%s: %d bytes, over the %d budget", field.id, size, MAX_BUNDLE_BYTES)
    else:
        log.info("%s: done, %d bytes", field.id, size)


async def run(args: argparse.Namespace) -> None:
    settings = Settings(_env_file=SCIENCE_API / ".env")
    if not settings.data_dir.is_absolute():
        settings.data_dir = SCIENCE_API / settings.data_dir
    fields = load_hero_fields()
    if args.fields:
        wanted = set(args.fields)
        unknown = wanted - {f.id for f in fields}
        if unknown:
            raise SystemExit(f"unknown field ids: {sorted(unknown)}")
        fields = [f for f in fields if f.id in wanted]

    end = date.today()
    if args.days:
        start = date.fromordinal(end.toordinal() - args.days)
    else:
        start = date(end.year - args.years, end.month, end.day)
    period = Period(start=start, end=end)

    async with build_client(settings) as client:
        upstream = UpstreamClient(client, settings)
        granule_reader = EarthaccessGranuleReader(
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
        adapters: list[DataAdapter] = [
            ImergAdapter(granule_reader),
            SmapL4Adapter(granule_reader),
            HlsViAdapter(granule_reader),
        ]
        spatial = SpatialService(
            settings.data_dir, EarthdataSpatialSource(granule_reader, settings.data_dir)
        )
        cdl = CdlClient(upstream)

        for field in fields:
            try:
                await build_one(
                    field, period, adapters, spatial, cdl, args.out, refresh=args.refresh
                )
            except Exception:
                log.exception("%s: failed, continuing with the remaining fields", field.id)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", type=int, default=11, help="Years of history to fetch.")
    parser.add_argument(
        "--days", type=int, help="Override --years with an exact day count (testing)."
    )
    parser.add_argument("--fields", nargs="*", help="Only these field ids (default: all).")
    parser.add_argument("--refresh", action="store_true", help="Rebuild even if already present.")
    parser.add_argument(
        "--out",
        type=Path,
        default=BUNDLES_OUT,
        help="Output directory (default: apps/web/public/bundles, the served path). A short "
        "--days run with --refresh would otherwise overwrite a good full-period bundle with a "
        "thin one; point a trial run somewhere else with this flag.",
    )
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
