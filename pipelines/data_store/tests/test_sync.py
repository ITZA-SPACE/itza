from __future__ import annotations

import copy
import datetime as dt
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
import yaml

import sync

SET: dict[str, Any] = {
    "id": "demo",
    "kind": "derived",
    "source": "demo-bundles",
    "version": "v1",
    "product": "Demo",
    "url": "https://example.org/demo",
    "spatial": ["box"],
    "temporal": {"start": "2020-01-01", "end": "2020-12-31"},
    "license": "open",
    "citation": "Someone. Demo.",
    "estimate_gb": 0.1,
    "status": "planned",
    "files": [],
}


def document(*sets: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": "dataset-store/1",
        "regions": {"box": [5.0, 36.0, 5.5, 36.5]},
        "sets": [copy.deepcopy(s) for s in (sets or (SET,))],
    }


def write(tmp_path: Path, doc: dict[str, Any]) -> Path:
    path = tmp_path / "manifest.yaml"
    path.write_text("# header comment\n" + yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")
    return path


def make_files(root: Path, prefix: str = "derived/demo-bundles/v1") -> None:
    (root / prefix / "sub").mkdir(parents=True)
    (root / prefix / "a.bin").write_bytes(b"alpha")
    (root / prefix / "sub" / "b.bin").write_bytes(b"bravo!")


@pytest.mark.unit
def test_the_committed_manifest_is_valid() -> None:
    manifest = sync.load_manifest()
    assert len(manifest.sets) >= 10
    for ds in manifest.sets:
        assert ds.raw["license"] and ds.raw["citation"] and ds.raw["url"]


@pytest.mark.unit
@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"id": "Bad Id"}, "lowercase slug"),
        ({"kind": "other"}, "kind"),
        ({"source": ""}, "source"),
        ({"license": " "}, "license"),
        ({"citation": None}, "citation"),
        ({"url": "ftp://x"}, "url"),
        ({"spatial": ["nowhere"]}, "unknown region"),
        ({"spatial": []}, "spatial"),
        ({"temporal": {"start": "2021-01-01", "end": "2020-01-01"}}, "temporal"),
        ({"temporal": {"start": "soon", "end": "later"}}, "temporal"),
        ({"fetch": {"version": "1"}}, "short_name"),
        ({"estimate_gb": -1}, "estimate_gb"),
        ({"status": "done"}, "status"),
        ({"status": "synced"}, "synced set"),
        ({"files": [{"path": "a", "bytes": 1, "sha256": "0" * 64}]}, "only planned"),
    ],
)
def test_validation_rejects_a_broken_set(change: dict[str, Any], message: str) -> None:
    with pytest.raises(sync.ManifestError, match=message):
        sync.parse_manifest(document({**SET, **change}))


@pytest.mark.unit
@pytest.mark.parametrize(
    "entry",
    [
        {"path": "../x", "bytes": 1, "sha256": "0" * 64},
        {"path": "/abs", "bytes": 1, "sha256": "0" * 64},
        {"path": "a", "bytes": -1, "sha256": "0" * 64},
        {"path": "a", "bytes": 1, "sha256": "XYZ"},
        "not a mapping",
    ],
)
def test_validation_rejects_a_broken_file_entry(entry: Any) -> None:
    synced = {**SET, "status": "synced", "retrieved": "2026-11-13", "files": [entry]}
    with pytest.raises(sync.ManifestError):
        sync.parse_manifest(document(synced))


@pytest.mark.unit
def test_validation_rejects_structural_mistakes() -> None:
    with pytest.raises(sync.ManifestError, match="version"):
        sync.parse_manifest({"version": "x"})
    bad_region = document()
    bad_region["regions"]["box"] = [10, 0, 5, 1]
    with pytest.raises(sync.ManifestError, match="bbox"):
        sync.parse_manifest(bad_region)
    with pytest.raises(sync.ManifestError, match="unique"):
        sync.parse_manifest(document(SET, SET))
    other = {**SET, "id": "other"}
    with pytest.raises(sync.ManifestError, match="share the same"):
        sync.parse_manifest(document(SET, other))
    dup = {"path": "a", "bytes": 1, "sha256": "0" * 64}
    synced = {**SET, "status": "synced", "retrieved": "2026-11-13", "files": [dup, dup]}
    with pytest.raises(sync.ManifestError, match="duplicate"):
        sync.parse_manifest(document(synced))
    with pytest.raises(sync.ManifestError, match="unknown set"):
        sync.parse_manifest(document()).get("nope")


@pytest.mark.unit
def test_register_then_verify_detects_every_kind_of_damage(tmp_path: Path) -> None:
    manifest = sync.parse_manifest(document())
    make_files(tmp_path)
    done = sync.register(manifest, tmp_path, "demo", dt.date(2026, 11, 13))
    assert done.status == "synced"
    assert [f.path for f in done.files] == ["a.bin", "sub/b.bin"]
    assert sync.verify(tmp_path, [done]) == []

    folder = tmp_path / done.prefix
    (folder / "a.bin").write_bytes(b"ALPHA")  # same size, different content
    assert "checksum mismatch" in sync.verify(tmp_path, [done])[0]
    (folder / "a.bin").write_bytes(b"alpha-longer")
    assert "size of a.bin" in sync.verify(tmp_path, [done])[0]
    (folder / "sub" / "b.bin").unlink()
    assert any("missing sub/b.bin" in p for p in sync.verify(tmp_path, [done]))


@pytest.mark.unit
def test_register_needs_files(tmp_path: Path) -> None:
    with pytest.raises(sync.ManifestError, match="no files"):
        sync.register(sync.parse_manifest(document()), tmp_path, "demo")


@pytest.mark.unit
def test_verify_ignores_planned_sets(tmp_path: Path) -> None:
    assert sync.verify(tmp_path, sync.parse_manifest(document()).sets) == []


@pytest.mark.unit
def test_save_keeps_the_header_and_round_trips(tmp_path: Path) -> None:
    path = write(tmp_path, document())
    manifest = sync.load_manifest(path)
    make_files(tmp_path)
    sync.register(manifest, tmp_path, "demo", dt.date(2026, 11, 13))
    sync.save_manifest(manifest, path)
    text = path.read_text(encoding="utf-8")
    assert text.startswith("# header comment\n")
    again = sync.load_manifest(path).get("demo")
    assert again.status == "synced" and len(again.files) == 2


@pytest.mark.unit
def test_pull_syncs_each_synced_set_and_verifies(tmp_path: Path) -> None:
    manifest = sync.parse_manifest(document(SET, {**SET, "id": "later", "version": "v2"}))
    make_files(tmp_path)
    sync.register(manifest, tmp_path, "demo")
    manifest = sync.parse_manifest(manifest.document)
    calls: list[list[str]] = []
    problems = sync.pull(manifest, tmp_path, "bkt", [], calls.append)
    assert problems == []
    assert calls == [
        [
            "rsync",
            "--recursive",
            "gs://bkt/derived/demo-bundles/v1",
            str(tmp_path / "derived/demo-bundles/v1"),
        ]
    ]


@pytest.mark.unit
def test_pull_reports_a_failed_checksum_and_a_rerun_resumes(tmp_path: Path) -> None:
    manifest = sync.parse_manifest(document())
    make_files(tmp_path)
    sync.register(manifest, tmp_path, "demo")
    manifest = sync.parse_manifest(manifest.document)
    target = tmp_path / "derived/demo-bundles/v1/a.bin"

    def partial(_args: list[str]) -> None:
        target.write_bytes(b"alp")  # an interrupted transfer

    assert sync.pull(manifest, tmp_path, "b", ["demo"], partial)

    def complete(_args: list[str]) -> None:
        target.write_bytes(b"alpha")  # rsync finishes the missing bytes on the rerun

    assert sync.pull(manifest, tmp_path, "b", ["demo"], complete) == []


@pytest.mark.unit
def test_push_refuses_a_damaged_local_copy_and_uploads_a_good_one(tmp_path: Path) -> None:
    manifest = sync.parse_manifest(document())
    make_files(tmp_path)
    sync.register(manifest, tmp_path, "demo")
    manifest = sync.parse_manifest(manifest.document)
    calls: list[list[str]] = []
    assert sync.push(manifest, tmp_path, "bkt", [], calls.append) == []
    assert calls[0][-1] == "gs://bkt/derived/demo-bundles/v1"
    (tmp_path / "derived/demo-bundles/v1/a.bin").write_bytes(b"oops!")
    calls.clear()
    assert sync.push(manifest, tmp_path, "bkt", [], calls.append)
    assert calls == []


@pytest.mark.unit
def test_fetch_needs_a_recipe_and_an_installed_extra(tmp_path: Path) -> None:
    manifest = sync.parse_manifest(document())
    with pytest.raises(sync.ManifestError, match="no fetch recipe"):
        sync.fetch(manifest, tmp_path, "demo")


@pytest.mark.unit
def test_fetch_downloads_granules_over_the_set_regions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: dict[str, Any] = {}
    megabytes = 10.0

    class Granule:
        def __init__(self, mb: float) -> None:
            self.mb = mb

        def __getitem__(self, key: str) -> Any:
            return {"concept-id": "G1"}

        @property
        def size(self) -> float:
            return self.mb

    class Auth:
        authenticated = False

    class FakeEarthaccess:
        @staticmethod
        def login(strategy: str) -> Any:
            seen.setdefault("logins", []).append(strategy)
            return Auth()

        @staticmethod
        def search_data(**query: Any) -> list[Granule]:
            seen["query"] = query
            return [Granule(megabytes)]

        @staticmethod
        def download(granules: list[Granule], folder: str) -> None:
            seen["granules"] = granules
            (Path(folder) / "g.h5").write_bytes(b"data")

    monkeypatch.setitem(sys.modules, "earthaccess", FakeEarthaccess)
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    entry = {**SET, "kind": "raw", "fetch": {"short_name": "PROD", "version": "2"}}
    manifest = sync.parse_manifest(document(entry))
    done = sync.fetch(manifest, tmp_path, "demo", dt.date(2026, 11, 13))
    assert seen["logins"] == ["netrc", "environment"]
    assert seen["query"] == {
        "short_name": "PROD",
        "version": "2",
        "temporal": ("2020-01-01", "2020-12-31"),
        "bounding_box": (5.0, 36.0, 5.5, 36.5),
    }
    assert len(seen["granules"]) == 1
    assert done.status == "synced" and done.files[0].path == "g.h5"


@pytest.mark.unit
def test_fetch_without_the_extra_explains_how_to_install_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setitem(sys.modules, "earthaccess", None)
    entry = {**SET, "fetch": {"short_name": "PROD"}}
    with pytest.raises(SystemExit, match="fetch extra"):
        sync.fetch(sync.parse_manifest(document(entry)), tmp_path, "demo")


@pytest.mark.unit
def test_each_region_is_searched_on_its_own() -> None:
    doc = document({**SET, "spatial": ["box", "far"]})
    doc["regions"]["far"] = [-103.0, 40.0, -102.9, 40.1]
    manifest = sync.parse_manifest(doc)
    assert sync._boxes(manifest, manifest.get("demo")) == [
        (5.0, 36.0, 5.5, 36.5),
        (-103.0, 40.0, -102.9, 40.1),
    ]
    glob = sync.parse_manifest(document({**SET, "spatial": ["global"]}))
    assert sync._boxes(glob, glob.get("demo")) == []


@pytest.mark.unit
def test_bucket_comes_from_the_flag_or_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(sync.BUCKET_ENV, raising=False)
    with pytest.raises(SystemExit, match="bucket"):
        sync._bucket(None)
    assert sync._bucket("gs://name/") == "name"
    monkeypatch.setenv(sync.BUCKET_ENV, "from-env")
    assert sync._bucket(None) == "from-env"


@pytest.mark.unit
def test_gcloud_runner_calls_the_cli(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[list[str]] = []
    monkeypatch.setattr(subprocess, "run", lambda cmd, check: called.append(cmd))
    sync._gcloud(["rsync", "a", "b"])
    assert called == [["gcloud", "storage", "rsync", "a", "b"]]


@pytest.mark.integration
def test_cli_end_to_end_with_a_fake_bucket(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    manifest_path = write(tmp_path, document())
    root = tmp_path / "local"
    make_files(root)
    base = ["--manifest", str(manifest_path), "--root", str(root)]
    assert sync.main(["validate", *base]) == 0
    assert sync.main(["register", "demo", *base]) == 0
    assert sync.main(["verify", *base]) == 0

    bucket = tmp_path / "bucket"

    def fake_rsync(args: list[str]) -> None:
        src, dst = args[-2], args[-1]
        source = bucket / src.split("/", 3)[3] if src.startswith("gs://") else Path(src)
        dest = bucket / dst.split("/", 3)[3] if dst.startswith("gs://") else Path(dst)
        shutil.copytree(source, dest, dirs_exist_ok=True)

    monkeypatch.setattr(sync, "_gcloud", fake_rsync)
    monkeypatch.setattr(sync.pull, "__defaults__", (fake_rsync,))
    monkeypatch.setattr(sync.push, "__defaults__", (fake_rsync,))
    assert sync.main(["push", *base, "--bucket", "b"]) == 0
    assert (bucket / "derived/demo-bundles/v1/sub/b.bin").is_file()

    other = tmp_path / "teammate"
    assert (
        sync.main(["pull", "--manifest", str(manifest_path), "--root", str(other), "--bucket", "b"])
        == 0
    )
    assert "all checksums verified" in capsys.readouterr().out

    (other / "derived/demo-bundles/v1/a.bin").write_bytes(b"XXXXX")
    assert sync.main(["verify", "--manifest", str(manifest_path), "--root", str(other)]) == 1
    assert "checksum mismatch" in capsys.readouterr().err


@pytest.mark.unit
def test_cli_reports_errors_and_validates_arguments(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    bad = write(tmp_path, document({**SET, "license": ""}))
    assert sync.main(["validate", "--manifest", str(bad)]) == 1
    assert "license" in capsys.readouterr().err
    good = write(tmp_path, document())
    with pytest.raises(SystemExit):
        sync.main(["fetch", "--manifest", str(good)])
    with pytest.raises(SystemExit):
        sync.main(["fetch", "a", "b", "--manifest", str(good)])


@pytest.mark.unit
def test_a_token_in_the_environment_skips_the_netrc_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    strategies: list[str] = []

    class Fake:
        @staticmethod
        def login(strategy: str) -> Any:
            strategies.append(strategy)

    monkeypatch.setenv("EARTHDATA_TOKEN", "t")
    sync.login_to_earthdata(Fake)
    assert strategies == ["environment"]


@pytest.mark.unit
def test_fetch_refuses_granules_far_above_the_size_estimate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Big:
        size = 1_000_000.0

        def __getitem__(self, key: str) -> Any:
            return {"concept-id": "G1"}

    class Fake:
        @staticmethod
        def login(strategy: str) -> Any:
            return type("A", (), {"authenticated": True})()

        @staticmethod
        def search_data(**query: Any) -> list[Any]:
            return [Big()]

        @staticmethod
        def download(granules: list[Any], folder: str) -> None:
            raise AssertionError("must not download")

    monkeypatch.setitem(sys.modules, "earthaccess", Fake)
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    entry = {**SET, "kind": "raw", "fetch": {"short_name": "PROD"}}
    with pytest.raises(sync.ManifestError, match="not clipped"):
        sync.fetch(sync.parse_manifest(document(entry)), tmp_path, "demo")
