import os
from datetime import date
from pathlib import Path
from unittest.mock import Mock

import pytest

from itza_science.adapters.base import Period
from itza_science.adapters.context_archive import EarthdataArchive, Scene, Search
from itza_science.adapters.granules import EarthaccessGranuleReader, GranuleAccessError
from tests.unit.adapters.test_granule_reader import Result

pytestmark = [pytest.mark.unit, pytest.mark.anyio]


@pytest.mark.parametrize("product", ["NISAR_L3_SME2_PROVISIONAL_V1", "ECO_L2T_LSTE"])
async def test_recent_search_filters_assets_and_removes_downloads(
    product: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    credential_value = "dummy-access-value"
    result = Result(
        [
            "https://nasa.test/file.h5",
            "https://nasa.test/scene_LST.tif",
            "https://nasa.test/scene_QC.tif",
            "https://nasa.test/scene_cloud.tif",
            "https://nasa.test/scene_LST_err.tif",
            "https://nasa.test/browse.png",
        ]
    )
    result["umm"]["GranuleUR"] = "native-scene"
    monkeypatch.setattr("earthaccess.login", Mock(return_value=Mock(authenticated=True)))
    search = Mock(return_value=[result, result])
    monkeypatch.setattr("earthaccess.search_data", search)
    paths: list[Path] = []

    def download(urls: list[str], folder: str, **kwargs: object) -> list[Path]:
        assert os.environ["EARTHDATA_TOKEN"] == credential_value
        received = [Path(folder) / url.rsplit("/", 1)[-1] for url in urls]
        for path in received:
            path.touch()
        paths.extend(received)
        return received

    monkeypatch.setattr("earthaccess.download", download)
    archive = EarthdataArchive(
        EarthaccessGranuleReader(tmp_path, credentials={"EARTHDATA_TOKEN": credential_value}),
        tmp_path / "scratch",
    )

    def decode(scenes: list[Scene], truncated: bool) -> int:
        assert truncated
        assert len(scenes) == 1
        assert all(path.exists() for path in scenes[0].assets.values())
        if product.startswith("ECO"):
            assert set(scenes[0].assets) == {"scene_LST.tif", "scene_QC.tif", "scene_cloud.tif"}
        else:
            assert set(scenes[0].assets) == {"file.h5"}
        return 10

    period = Period(date(2025, 5, 1), date(2025, 5, 3))
    assert await archive.read(Search(product, "1", (5, 36, 6, 37), period, 1), decode) == 10
    assert search.call_args.kwargs["count"] == 2
    # earthaccess 0.19 accepts only a scalar CMR sort key; a list raises ValueError.
    assert search.call_args.kwargs["sort_key"] == "-start_date"
    assert all(not p.exists() for p in paths)
    assert list((tmp_path / "scratch").iterdir()) == []


async def test_auth_missing_download_failure_and_decode_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    credential_value = "dummy-session-value"
    for key in ("EARTHDATA_TOKEN", "EARTHDATA_USERNAME", "EARTHDATA_PASSWORD"):
        monkeypatch.delenv(key, raising=False)
    reader = EarthaccessGranuleReader(tmp_path)
    archive = EarthdataArchive(reader, tmp_path / "scratch")
    query = Search("GEDI02_A", "002", (5, 36, 6, 37), None, 1)
    with pytest.raises(GranuleAccessError, match="credentials"):
        await archive.read(query, lambda scenes, truncated: None)
    monkeypatch.setenv("EARTHDATA_TOKEN", credential_value)
    monkeypatch.setattr("earthaccess.login", Mock(return_value=Mock(authenticated=True)))
    result = Result(["https://nasa.test/file.h5"])
    result["umm"]["GranuleUR"] = "scene"
    # SingleDateTime is a supported UMM temporal form as well.
    result["umm"]["TemporalExtent"] = {"SingleDateTime": "2025-05-02T00:00:00Z"}
    monkeypatch.setattr("earthaccess.search_data", Mock(return_value=[result]))
    monkeypatch.setattr("earthaccess.download", Mock(return_value=[]))
    with pytest.raises(GranuleAccessError, match="access failed"):
        await archive.read(query, lambda scenes, truncated: None)
    assert not list((tmp_path / "scratch").iterdir())
    monkeypatch.setattr("earthaccess.download", Mock(return_value=[tmp_path / "unused.h5"]))

    def bad_decode(scenes: list[Scene], truncated: bool) -> None:
        raise ValueError("synthetic decoding failure")

    with pytest.raises(ValueError, match="synthetic"):
        await archive.read(query, bad_decode)
    assert not list((tmp_path / "scratch").iterdir())
    assert os.environ["EARTHDATA_TOKEN"] == credential_value
