import os
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import Mock

import pytest

from itza_science.adapters.granules import EarthaccessGranuleReader, GranuleAccessError

pytestmark = [pytest.mark.unit, pytest.mark.anyio]
DAY = date(2025, 5, 2)


class Result(dict[str, Any]):
    def __init__(self, urls: list[str], day: str = "2025-05-02") -> None:
        super().__init__(
            umm={"TemporalExtent": {"RangeDateTime": {"BeginningDateTime": f"{day}T00:00:00Z"}}}
        )
        self.urls = urls

    def data_links(self, **kwargs: object) -> list[str]:
        assert kwargs == {"access": "external"}
        return self.urls


@pytest.fixture(autouse=True)
def no_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ("EARTHDATA_TOKEN", "EARTHDATA_USERNAME", "EARTHDATA_PASSWORD"):
        monkeypatch.delenv(key, raising=False)


async def test_token_login_filters_and_pairs_real_hls_assets(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credential_value = "dummy-access-value"

    def login(**kwargs: object) -> Mock:
        assert kwargs == {"strategy": "environment", "persist": False}
        assert os.environ["EARTHDATA_TOKEN"] == credential_value
        return Mock(authenticated=True)

    monkeypatch.setattr("earthaccess.login", login)
    search = Mock(
        return_value=[
            Result(
                [
                    "https://nasa.test/scene.NDVI.tif",
                    "https://nasa.test/scene.Fmask.tif",
                    "https://nasa.test/scene.EVI.tif",
                    "https://nasa.test/scene.xml",
                ]
            ),
            Result(["https://nasa.test/old.NDVI.tif"], day="2025-05-01"),
        ]
    )
    monkeypatch.setattr("earthaccess.search_data", search)

    def download(urls: list[str], folder: str, **kwargs: object) -> list[Path]:
        assert urls == ["https://nasa.test/scene.NDVI.tif", "https://nasa.test/scene.Fmask.tif"]
        assert kwargs == {"threads": 1, "show_progress": False}
        paths = [Path(folder) / url.rsplit("/", 1)[-1] for url in urls]
        for path in paths:
            path.touch()
        return paths

    monkeypatch.setattr("earthaccess.download", download)
    reader = EarthaccessGranuleReader(tmp_path, credentials={"EARTHDATA_TOKEN": credential_value})
    assert reader.credentials_available()
    granules = await reader.search_day("HLSS30_VI", "2.0", (-104.0, 40.0, -103.0, 41.0), DAY)
    assert len(granules) == 1
    assert granules[0].path.name == "scene.NDVI.tif"
    assert granules[0].qa_path == tmp_path / "scene.Fmask.tif"
    assert granules[0].data_date == DAY
    assert "EARTHDATA_TOKEN" not in os.environ
    assert search.call_args.kwargs["count"] == 65
    previous_value = "earlier-access-value"
    monkeypatch.setenv("EARTHDATA_TOKEN", previous_value)
    await reader.search_day("HLSS30_VI", "2.0", (-104.0, 40.0, -103.0, 41.0), DAY)
    assert os.environ["EARTHDATA_TOKEN"] == previous_value


async def test_native_netcdf_and_hdf_assets_exclude_ancillary_files(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("earthaccess.login", Mock(return_value=Mock(authenticated=True)))
    search = Mock(return_value=[Result(["https://nasa.test/file.h5", "https://nasa.test/file.qa"])])
    monkeypatch.setattr("earthaccess.search_data", search)
    download = Mock(return_value=[tmp_path / "file.h5"])
    monkeypatch.setattr("earthaccess.download", download)
    reader = EarthaccessGranuleReader(tmp_path)
    assert not reader.credentials_available()
    monkeypatch.setenv("EARTHDATA_USERNAME", "dummy-user")
    monkeypatch.setenv("EARTHDATA_PASSWORD", "dummy-password")
    assert reader.credentials_available()
    result = await reader.search_day("SPL4SMGP", "008", (-104.0, 40.0, -103.0, 41.0), DAY)
    assert result[0].qa_path is None
    assert download.call_args.args[0] == ["https://nasa.test/file.h5"]
    search.return_value = [Result(["https://nasa.test/metadata.xml"])]
    assert await reader.search_day("SPL4SMGP", "008", (-104.0, 40.0, -103.0, 41.0), DAY) == []


@pytest.mark.parametrize("failure", ["auth", "download", "limit", "upstream"])
async def test_access_errors_are_safe_and_environment_is_restored(
    failure: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "earthaccess.login", Mock(return_value=Mock(authenticated=failure != "auth"))
    )
    search = Mock(return_value=[Result(["https://nasa.test/file.nc4"])])
    if failure == "limit":
        search.return_value *= 65
    if failure == "upstream":
        search.side_effect = RuntimeError("private-token-in-upstream-error")
    monkeypatch.setattr("earthaccess.search_data", search)
    monkeypatch.setattr("earthaccess.download", Mock(return_value=[]))
    reader = EarthaccessGranuleReader(tmp_path, credentials={"EARTHDATA_TOKEN": "dummy-value"})
    with pytest.raises(GranuleAccessError) as captured:
        await reader.search_day("GPM_3IMERGDF", "07", (-104.0, 40.0, -103.0, 41.0), DAY)
    assert "private-token" not in str(captured.value)
    assert "EARTHDATA_TOKEN" not in os.environ
