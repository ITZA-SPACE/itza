"""Shared dataset store on Google Cloud Storage: manifest, checksums and team sync (issue #103).

Team members run `pull` and `verify`. The data maintainer runs `fetch` (or `register` for derived
products), then `push`. Credentials never appear here: Earthdata comes from EARTHDATA_TOKEN,
~/.netrc or the environment, Google Cloud from the caller's `gcloud auth login` or a workload
identity.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from clip import CLIPPERS

MANIFEST = Path(__file__).with_name("manifest.yaml")
DEFAULT_ROOT = Path(__file__).with_name("data")
BUCKET_ENV = "ITZA_DATA_BUCKET"
SLUG = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
KINDS = ("raw", "derived")
STATUSES = ("planned", "synced")
CHUNK = 1 << 20
# A fetch stops before downloading more than this multiple of the set's size estimate.
SIZE_GUARD = 3
# Granules downloaded, clipped and deleted per step of a clipped fetch (scratch = BATCH x size).
BATCH = 24

Runner = Callable[[list[str]], None]


class ManifestError(ValueError):
    """The manifest breaks a rule; the message lists every problem found."""


@dataclass(frozen=True)
class StoredFile:
    path: str
    bytes: int
    sha256: str


@dataclass(frozen=True)
class DataSet:
    id: str
    kind: str
    source: str
    version: str
    status: str
    files: tuple[StoredFile, ...]
    fetch: dict[str, str] | None
    spatial: tuple[str, ...]
    temporal: tuple[str, str]
    raw: dict[str, Any]

    @property
    def prefix(self) -> str:
        return f"{self.kind}/{self.source}/{self.version}"


@dataclass(frozen=True)
class Manifest:
    regions: dict[str, tuple[float, float, float, float]]
    sets: tuple[DataSet, ...]
    document: dict[str, Any]

    def get(self, set_id: str) -> DataSet:
        for s in self.sets:
            if s.id == set_id:
                return s
        raise ManifestError(f"unknown set {set_id!r}")

    def select(self, ids: Sequence[str]) -> tuple[DataSet, ...]:
        return tuple(self.get(i) for i in ids) if ids else self.sets


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _date(value: object) -> dt.date | None:
    if isinstance(value, dt.date):
        return value
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError:
        return None


def _bbox(value: object) -> tuple[float, float, float, float] | None:
    if not isinstance(value, list) or len(value) != 4:
        return None
    if not all(isinstance(v, int | float) and not isinstance(v, bool) for v in value):
        return None
    w, s, e, n = (float(v) for v in value)
    return (w, s, e, n) if -180 <= w < e <= 180 and -90 <= s < n <= 90 else None


def _check_file(entry: object, where: str, problems: list[str]) -> StoredFile | None:
    if not isinstance(entry, dict):
        problems.append(f"{where}: a file entry must be a mapping")
        return None
    path = entry.get("path")
    size = entry.get("bytes")
    digest = entry.get("sha256")
    ok = True
    if not isinstance(path, str) or not path or path.startswith("/") or ".." in Path(path).parts:
        problems.append(f"{where}: path must be a relative path without '..'")
        ok = False
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        problems.append(f"{where}: bytes must be a non-negative integer")
        ok = False
    if not isinstance(digest, str) or not SHA256.match(digest):
        problems.append(f"{where}: sha256 must be 64 lowercase hex characters")
        ok = False
    return StoredFile(str(path), int(size), str(digest)) if ok and isinstance(size, int) else None


def _check_set(
    entry: object, regions: dict[str, Any], index: int, problems: list[str]
) -> DataSet | None:
    if not isinstance(entry, dict):
        problems.append(f"sets[{index}]: must be a mapping")
        return None
    sid = str(entry.get("id", f"#{index}"))
    start = len(problems)

    def need(key: str, ok: bool, message: str) -> None:
        if not ok:
            problems.append(f"{sid}: {key} {message}")

    for key in ("product", "license", "citation"):
        value = entry.get(key)
        need(key, isinstance(value, str) and bool(value.strip()), "is required")
    need("id", bool(SLUG.match(sid)), "must be a lowercase slug")
    for key in ("source", "version"):
        value = str(entry.get(key, ""))
        need(key, bool(SLUG.match(value)), "must be a lowercase slug (letters, digits, . _ -)")
    need("kind", entry.get("kind") in KINDS, f"must be one of {KINDS}")
    need("status", entry.get("status") in STATUSES, f"must be one of {STATUSES}")
    url = str(entry.get("url", ""))
    need("url", url.startswith(("https://", "http://")), "must be the original URL or DOI link")
    spatial = entry.get("spatial")
    ok_spatial = isinstance(spatial, list) and bool(spatial)
    if ok_spatial:
        for name in spatial or []:
            need(
                "spatial", name == "global" or name in regions, f"names an unknown region {name!r}"
            )
    else:
        need("spatial", False, "must list regions or 'global'")
    temporal = entry.get("temporal")
    t0 = _date(temporal.get("start")) if isinstance(temporal, dict) else None
    t1 = _date(temporal.get("end")) if isinstance(temporal, dict) else None
    need("temporal", t0 is not None and t1 is not None and t0 <= t1, "needs start <= end dates")
    fetch = entry.get("fetch")
    need(
        "fetch",
        fetch is None or (isinstance(fetch, dict) and "short_name" in fetch),
        "needs a short_name",
    )
    if isinstance(fetch, dict) and "clip" in fetch:
        need("fetch.clip", fetch["clip"] in CLIPPERS, f"must be one of {sorted(CLIPPERS)}")
        every = fetch.get("every_days", 1)
        need("fetch.every_days", isinstance(every, int) and every >= 1, "must be an integer >= 1")
        cap = fetch.get("max_download_gb")
        need("fetch.max_download_gb", isinstance(cap, int | float) and cap > 0, "is required")
        need("kind", entry.get("kind") == "derived", "must be derived for a clipped set")
    estimate = entry.get("estimate_gb")
    need("estimate_gb", isinstance(estimate, int | float) and estimate >= 0, "is required")

    files_raw = entry.get("files", [])
    files: list[StoredFile] = []
    if not isinstance(files_raw, list):
        problems.append(f"{sid}: files must be a list")
    else:
        for i, f in enumerate(files_raw):
            checked = _check_file(f, f"{sid}.files[{i}]", problems)
            if checked:
                files.append(checked)
        paths = [f.path for f in files]
        need("files", len(paths) == len(set(paths)), "has duplicate paths")
        if entry.get("status") == "synced":
            need("files", bool(files_raw), "must list every object of a synced set")
            need("retrieved", _date(entry.get("retrieved")) is not None, "is required when synced")
        elif entry.get("status") == "planned":
            need("files", not files_raw, "must be empty while the set is only planned")
    if len(problems) > start:
        return None
    return DataSet(
        id=sid,
        kind=str(entry["kind"]),
        source=str(entry["source"]),
        version=str(entry["version"]),
        status=str(entry["status"]),
        files=tuple(files),
        fetch={str(k): str(v) for k, v in fetch.items()} if isinstance(fetch, dict) else None,
        spatial=tuple(str(s) for s in spatial or []),
        temporal=(str(t0), str(t1)),
        raw=entry,
    )


def parse_manifest(document: object) -> Manifest:
    problems: list[str] = []
    if not isinstance(document, dict) or document.get("version") != "dataset-store/1":
        raise ManifestError("version must be dataset-store/1")
    regions: dict[str, tuple[float, float, float, float]] = {}
    for name, box in (document.get("regions") or {}).items():
        parsed = _bbox(box)
        if parsed is None:
            problems.append(f"region {name}: bbox must be [west, south, east, north] in degrees")
        else:
            regions[str(name)] = parsed
    sets: list[DataSet] = []
    for i, entry in enumerate(document.get("sets") or []):
        checked = _check_set(entry, regions, i, problems)
        if checked:
            sets.append(checked)
    ids = [s.id for s in sets]
    if len(ids) != len(set(ids)):
        problems.append("set ids must be unique")
    prefixes = [s.prefix for s in sets]
    if len(prefixes) != len(set(prefixes)):
        problems.append("two sets share the same kind/source/version path")
    if problems:
        raise ManifestError("\n".join(problems))
    return Manifest(regions=regions, sets=tuple(sets), document=document)


def load_manifest(path: Path = MANIFEST) -> Manifest:
    return parse_manifest(yaml.safe_load(path.read_text(encoding="utf-8")))


def save_manifest(manifest: Manifest, path: Path = MANIFEST) -> None:
    """Rewrite the manifest, keeping the leading comment block."""
    header = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("#"):
            break
        header.append(line)
    body = yaml.safe_dump(manifest.document, sort_keys=False, width=100, allow_unicode=True)
    path.write_text("\n".join(header) + "\n" + body, encoding="utf-8")


def verify(root: Path, datasets: Sequence[DataSet]) -> list[str]:
    """Recompute every checksum of the synced sets; returns the problems found."""
    problems: list[str] = []
    for ds in datasets:
        if ds.status != "synced":
            continue
        for f in ds.files:
            target = root / ds.prefix / f.path
            if not target.is_file():
                problems.append(f"{ds.id}: missing {f.path}")
            elif target.stat().st_size != f.bytes:
                problems.append(
                    f"{ds.id}: size of {f.path} is {target.stat().st_size}, not {f.bytes}"
                )
            elif sha256_file(target) != f.sha256:
                problems.append(f"{ds.id}: checksum mismatch for {f.path}")
    return problems


def _gcloud(args: list[str]) -> None:
    subprocess.run(["gcloud", "storage", *args], check=True)


def _bucket(value: str | None) -> str:
    bucket = value or os.environ.get(BUCKET_ENV, "")
    if not bucket:
        raise SystemExit(f"Set the bucket name with --bucket or the {BUCKET_ENV} variable.")
    return bucket.removeprefix("gs://").rstrip("/")


def pull(
    manifest: Manifest, root: Path, bucket: str, ids: Sequence[str], run: Runner = _gcloud
) -> list[str]:
    """Download the synced sets (rsync, so a rerun resumes) and verify their checksums."""
    chosen = [s for s in manifest.select(ids) if s.status == "synced"]
    for ds in chosen:
        (root / ds.prefix).mkdir(parents=True, exist_ok=True)
        run(["rsync", "--recursive", f"gs://{bucket}/{ds.prefix}", str(root / ds.prefix)])
    return verify(root, chosen)


def push(
    manifest: Manifest, root: Path, bucket: str, ids: Sequence[str], run: Runner = _gcloud
) -> list[str]:
    """Verify the local copy first, then upload it (rsync, so a rerun resumes)."""
    chosen = [s for s in manifest.select(ids) if s.status == "synced"]
    problems = verify(root, chosen)
    if problems:
        return problems
    for ds in chosen:
        run(["rsync", "--recursive", str(root / ds.prefix), f"gs://{bucket}/{ds.prefix}"])
    return []


def register(manifest: Manifest, root: Path, set_id: str, today: dt.date | None = None) -> DataSet:
    """Checksum every file under the set's folder and record them in the manifest."""
    ds = manifest.get(set_id)
    folder = root / ds.prefix
    found = (
        sorted(
            p
            for p in folder.rglob("*")
            if p.is_file() and not any(part.startswith(".") for part in p.relative_to(folder).parts)
        )
        if folder.is_dir()
        else []
    )
    if not found:
        raise ManifestError(f"{set_id}: no files under {folder}")
    entry = ds.raw
    entry["files"] = [
        {
            "path": p.relative_to(folder).as_posix(),
            "bytes": p.stat().st_size,
            "sha256": sha256_file(p),
        }
        for p in found
    ]
    entry["status"] = "synced"
    entry["retrieved"] = (today or dt.date.today()).isoformat()
    return parse_manifest(manifest.document).get(set_id)


def _boxes(manifest: Manifest, ds: DataSet) -> list[tuple[float, float, float, float]]:
    """One box per region: the union of far-apart regions would span an ocean."""
    return [manifest.regions[n] for n in ds.spatial if n in manifest.regions]


def _granule_id(granule: Any) -> str:
    return str(granule["meta"]["concept-id"])


def login_to_earthdata(earthaccess: Any) -> None:
    """Earthdata login without prompts: EARTHDATA_TOKEN, then ~/.netrc, then username/password."""
    if os.environ.get("EARTHDATA_TOKEN"):
        earthaccess.login(strategy="environment")
        return
    if not earthaccess.login(strategy="netrc").authenticated:
        earthaccess.login(strategy="environment")


def fetch(manifest: Manifest, root: Path, set_id: str, today: dt.date | None = None) -> DataSet:
    """Download one set from its original source with earthaccess, then register it.

    Granules that intersect the set's regions and period are selected; files already present
    are skipped, so an interrupted fetch resumes. A set whose granules exceed three times its size
    estimate is refused before any download, because fetch does not clip rasters.
    """
    ds = manifest.get(set_id)
    if ds.fetch is None:
        raise ManifestError(f"{set_id}: no fetch recipe; build it, then run `register {set_id}`")
    try:
        import earthaccess
    except ImportError as error:
        raise SystemExit("Install the fetch extra: uv sync --extra fetch") from error
    login_to_earthdata(earthaccess)
    if "clip" in ds.fetch:
        return _fetch_clipped(manifest, root, ds, earthaccess, today)
    query: dict[str, Any] = {
        "short_name": ds.fetch["short_name"],
        "temporal": ds.temporal,
    }
    if "version" in ds.fetch:
        query["version"] = ds.fetch["version"]
    folder = root / ds.prefix
    folder.mkdir(parents=True, exist_ok=True)
    found: dict[str, Any] = {}
    boxes: list[tuple[float, float, float, float] | None] = [*_boxes(manifest, ds)] or [None]
    for box in boxes:
        search = {**query, "bounding_box": box} if box else query
        for granule in earthaccess.search_data(**search):
            found[_granule_id(granule)] = granule
    granules = list(found.values())
    megabytes = sum(float(g.size) for g in granules)  # earthaccess: size in MB, a property
    limit = float(ds.raw["estimate_gb"]) * 1024 * SIZE_GUARD
    if megabytes > limit:
        raise ManifestError(
            f"{set_id}: {len(granules)} granules are {megabytes / 1024:.1f} GB, over {SIZE_GUARD}x "
            f"the {ds.raw['estimate_gb']} GB estimate. Granules are not clipped by fetch: clip "
            "with the owning pipeline and register the result as a derived set."
        )
    earthaccess.download(granules, str(folder))
    return register(manifest, root, set_id, today)


def _granule_day(granule: Any) -> dt.date:
    begin = granule["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
    return dt.date.fromisoformat(str(begin)[:10])


def _sample(granules: Sequence[Any], start: dt.date, every_days: int) -> list[Any]:
    """The first granule of every `every_days`-th day counted from the start of the period."""
    chosen: dict[dt.date, Any] = {}
    for granule in sorted(granules, key=lambda g: str(g["umm"]["TemporalExtent"])):
        day = _granule_day(granule)
        if (day - start).days % every_days == 0:
            chosen.setdefault(day, granule)
    return [chosen[day] for day in sorted(chosen)]


def _granule_name(granule: Any) -> str:
    return str(granule.data_links()[0]).rsplit("/", 1)[-1]


def _is_clipped(granule: Any, folder: Path, regions: Sequence[str]) -> bool:
    name = _granule_name(granule)
    return all((folder / region / name).exists() for region in regions)


def _clip_files(
    downloads: Sequence[Any],
    folder: Path,
    boxes: dict[str, tuple[float, float, float, float]],
    clip: Callable[[Path, Path, tuple[float, float, float, float]], None],
) -> int:
    """Clip every download for every region; returns how many granules could not be clipped.

    A damaged download (for example a truncated file or an error page) is skipped and reported;
    a rerun fetches it again because only finished clips count as done.
    """
    failed = 0
    for download in downloads:
        source = Path(str(download))
        try:
            for region, box in boxes.items():
                target = folder / region / source.name
                if target.exists():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                part = target.with_name(target.name + ".part")
                clip(source, part, box)
                part.replace(target)
        except (OSError, ValueError) as error:
            failed += 1
            for part in folder.glob(f"*/{source.name}.part"):
                part.unlink()
            print(f"skipped {source.name}: {error}", file=sys.stderr, flush=True)
    return failed


def _clip_batch(
    earthaccess: Any,
    granules: Sequence[Any],
    folder: Path,
    boxes: dict[str, tuple[float, float, float, float]],
    clip: Callable[[Path, Path, tuple[float, float, float, float]], None],
    workers: int,
) -> int:
    """Download a batch (earthaccess parallelises one call itself), clip it, delete the globals."""
    with tempfile.TemporaryDirectory(dir=folder, prefix=".scratch-") as scratch:
        wanted = {_granule_name(g) for g in granules}
        # earthaccess also fetches sidecar files (.qa, .iso.xml); only the data file is clipped.
        downloads = [
            d
            for d in earthaccess.download(list(granules), scratch, threads=workers)
            if Path(str(d)).name in wanted
        ]
        with ThreadPoolExecutor(max_workers=workers) as pool:
            return sum(pool.map(lambda d: _clip_files([d], folder, boxes, clip), downloads))


def _fetch_clipped(
    manifest: Manifest, root: Path, ds: DataSet, earthaccess: Any, today: dt.date | None
) -> DataSet:
    """Stream sampled global granules, keep only the region clips, then register them."""
    assert ds.fetch is not None
    clip = CLIPPERS[ds.fetch["clip"]]
    query: dict[str, Any] = {"short_name": ds.fetch["short_name"], "temporal": ds.temporal}
    if "version" in ds.fetch:
        query["version"] = ds.fetch["version"]
    start = dt.date.fromisoformat(ds.temporal[0])
    granules = _sample(
        earthaccess.search_data(**query), start, int(ds.fetch.get("every_days", "1"))
    )
    gigabytes = sum(float(g.size) for g in granules) / 1024
    cap = float(ds.fetch["max_download_gb"])
    if gigabytes > cap:
        raise ManifestError(
            f"{ds.id}: {len(granules)} granules are {gigabytes:.0f} GB to download, over the "
            f"{cap:.0f} GB max_download_gb of the recipe"
        )
    boxes = {n: manifest.regions[n] for n in ds.spatial if n in manifest.regions}
    folder = root / ds.prefix
    folder.mkdir(parents=True, exist_ok=True)
    workers = int(os.environ.get("ITZA_FETCH_WORKERS", "8"))
    todo = [g for g in granules if not _is_clipped(g, folder, list(boxes))]
    skipped = 0
    for i in range(0, len(todo), BATCH):
        skipped += _clip_batch(earthaccess, todo[i : i + BATCH], folder, boxes, clip, workers)
        print(f"{ds.id}: {min(i + BATCH, len(todo))}/{len(todo)} granules clipped", flush=True)
    if skipped:
        print(f"{ds.id}: {skipped} granules skipped; run fetch again to retry them", flush=True)
    for leftover in folder.glob("*.part"):
        leftover.unlink()
    shutil.rmtree(folder / ".tmp", ignore_errors=True)
    return register(manifest, root, ds.id, today)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=["validate", "verify", "pull", "push", "fetch", "register"]
    )
    parser.add_argument("sets", nargs="*", help="set ids (default: all synced sets)")
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="local data folder")
    parser.add_argument("--bucket", help=f"bucket name (default: ${BUCKET_ENV})")
    args = parser.parse_args(argv)

    try:
        manifest = load_manifest(args.manifest)
        if args.command == "validate":
            print(f"{len(manifest.sets)} sets, manifest valid")
            return 0
        if args.command == "verify":
            problems = verify(args.root, manifest.select(args.sets))
        elif args.command == "pull":
            problems = pull(manifest, args.root, _bucket(args.bucket), args.sets)
        elif args.command == "push":
            problems = push(manifest, args.root, _bucket(args.bucket), args.sets)
        else:
            if len(args.sets) != 1:
                parser.error(f"{args.command} takes exactly one set id")
            action = fetch if args.command == "fetch" else register
            done = action(manifest, args.root, args.sets[0])
            save_manifest(manifest, args.manifest)
            print(f"{done.id}: {len(done.files)} files registered")
            return 0
    except (ManifestError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        return 1
    for problem in problems:
        print(problem, file=sys.stderr)
    print("all checksums verified" if not problems else f"{len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
