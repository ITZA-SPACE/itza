"""Raw capture boundary and corruption tests; all transport is local and synthetic."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx
import pytest

import capture_fixtures as capture

pytestmark = pytest.mark.unit
URL = "https://power.larc.nasa.gov/test"


def transport(monkeypatch: pytest.MonkeyPatch, payload: bytes, *, status: int = 200) -> None:
    client = httpx.Client
    fake = httpx.MockTransport(lambda r: httpx.Response(status, content=payload))
    monkeypatch.setattr(httpx, "Client", lambda **kw: client(transport=fake, **kw))


def test_capture_roundtrip_integrity(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    transport(monkeypatch, b'{"observed":1}')
    archive = capture.Archive(tmp_path)
    assert archive.json(URL, {"b": 2, "a": 1}) == {"observed": 1}
    records = list(tmp_path.glob("*.json"))
    metadata = json.loads(records[0].read_text())
    assert metadata["params"] == {"a": 1, "b": 2}
    assert metadata["sha256"] == capture.digest(b'{"observed":1}')
    assert capture.Archive(tmp_path, offline=True).json(URL, {"a": 1, "b": 2}) == {"observed": 1}
    with pytest.raises(FileNotFoundError):
        capture.Archive(tmp_path, offline=True).get(URL, {})
    binary = next(tmp_path.glob("*.bin"))
    binary.write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="checksum"):
        capture.Archive(tmp_path, offline=True).get(URL, {"a": 1, "b": 2})
    assert archive.json(URL, {"a": 1, "b": 2}) == {"observed": 1}


@pytest.mark.parametrize(
    "url", ["http://power.larc.nasa.gov/a", "https://evil.invalid/a", URL + "?token=secret"]
)
def test_no_credentials_or_unsigned_hosts(tmp_path: Path, url: str) -> None:
    with pytest.raises(ValueError, match="unsigned"):
        capture.Archive(tmp_path).get(url, {})
    with pytest.raises(ValueError, match="credentials"):
        capture.Archive(tmp_path).get(URL, {"token": "secret"})


def test_capture_budget_and_shape(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    transport(monkeypatch, b"1234567890")
    monkeypatch.setattr(capture, "MAX_RESPONSE_BYTES", 4)
    with pytest.raises(ValueError, match="budget"):
        capture.Archive(tmp_path).get(URL, {})
    assert not list(tmp_path.glob("*.bin"))


def test_capture_bad_json_shape(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    transport(monkeypatch, b"[]")
    with pytest.raises(TypeError, match="object"):
        capture.Archive(tmp_path).json(URL, {})


def test_capture_http_failure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    transport(monkeypatch, b"error", status=500)
    with pytest.raises(httpx.HTTPStatusError):
        capture.Archive(tmp_path).get(URL, {})


def test_capture_cli(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    transport(monkeypatch, b'{"x":1}')
    monkeypatch.setattr(
        sys, "argv", ["capture", URL, "--params", '{"a":1}', "--output", str(tmp_path)]
    )
    capture.main()
    assert "Captured" in capsys.readouterr().out
    for params in ("[]", '{"a":[]}'):
        monkeypatch.setattr(sys, "argv", ["capture", URL, "--params", params])
        with pytest.raises(SystemExit):
            capture.main()


@pytest.mark.parametrize("name", ["access_token", "api_key", "secret"])
def test_reject_credential_parameter_variants(tmp_path: Path, name: str) -> None:
    with pytest.raises(ValueError, match="credentials"):
        capture.Archive(tmp_path).get(URL, {name: "synthetic"})
