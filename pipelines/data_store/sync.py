"""Shared dataset store on Google Cloud Storage: manifest, checksums and team sync (issue #103).

Team members run `pull` and `verify`. The data maintainer runs `fetch` (or `register` for derived
products), then `push`. Credentials never appear here: Earthdata comes from EARTHDATA_TOKEN, ~/.netrc or
the environment, Google Cloud from the caller's `gcloud auth login` or a workload identity.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import os
import re
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

MANIFEST = Path(__file__).with_name("manifest.yaml")
DEFAULT_ROOT = Path(__file__).with_name("data")
BUCKET_ENV = "ITZA_DATA_BUCKET"
SLUG = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
KINDS = ("raw", "derived")
STATUSES = ("planned", "synced")
CHUNK = 1 << 20

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
    found = sorted(p for p in folder.rglob("*") if p.is_file()) if folder.is_dir() else []
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


def _union(manifest: Manifest, ds: DataSet) -> tuple[float, float, float, float] | None:
    boxes = [manifest.regions[n] for n in ds.spatial if n in manifest.regions]
    if not boxes:
        return None
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


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
    are skipped, so an interrupted fetch resumes. Clip derived products with the pipelines.
    """
    ds = manifest.get(set_id)
    if ds.fetch is None:
        raise ManifestError(f"{set_id}: no fetch recipe; build it, then run `register {set_id}`")
    try:
        import earthaccess
    except ImportError as error:
        raise SystemExit("Install the fetch extra: uv sync --extra fetch") from error
    login_to_earthdata(earthaccess)
    query: dict[str, Any] = {
        "short_name": ds.fetch["short_name"],
        "temporal": ds.temporal,
    }
    if "version" in ds.fetch:
        query["version"] = ds.fetch["version"]
    box = _union(manifest, ds)
    if box:
        query["bounding_box"] = box
    folder = root / ds.prefix
    folder.mkdir(parents=True, exist_ok=True)
    earthaccess.download(earthaccess.search_data(**query), str(folder))
    return register(manifest, root, set_id, today)


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
