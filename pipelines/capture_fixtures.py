"""Bounded raw HTTP/raster archive for reproducible demo builds and offline tests.

Run with --help for the explicit capture command. No credentials or signed URLs are
accepted. Requests are content-addressed; manifests retain source, parameters and hash.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx

MAX_RESPONSE_BYTES = 2_000_000
ALLOWED_HOSTS = {
    "power.larc.nasa.gov",
    "modis.ornl.gov",
    "pdi.scinet.usda.gov",
    "maps.isric.org",
}


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n")
    temporary.replace(path)


class Archive:
    def __init__(self, root: Path, *, offline: bool = False) -> None:
        self.root, self.offline = root, offline

    def get(self, url: str, params: dict[str, str | int | float]) -> bytes:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS or parsed.query:
            raise ValueError("only public, unsigned source URLs are allowed")
        if any(k.lower() in {"token", "key", "password", "authorization"} for k in params):
            raise ValueError("credentials cannot be archived")
        request = {"url": url, "params": dict(sorted(params.items()))}
        key = digest(json.dumps(request, sort_keys=True).encode())
        path = self.root / (key + ".bin")
        metadata = self.root / (key + ".json")
        if path.exists() and metadata.exists():
            record = json.loads(metadata.read_text())
            payload = path.read_bytes()
            if digest(payload) == record["sha256"] and len(payload) <= MAX_RESPONSE_BYTES:
                return payload
            if self.offline:
                raise ValueError("archive checksum mismatch")
        if self.offline:
            raise FileNotFoundError(f"uncaptured source request {key}")
        for attempt in range(4):
            try:
                payload = self._download(url, params)
                break
            except (httpx.TransportError, httpx.HTTPStatusError):
                if attempt == 3:
                    raise
                time.sleep(2**attempt)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(payload)
        temporary.replace(path)
        write_json(
            metadata,
            {
                **request,
                "retrieved": datetime.now(UTC).isoformat(),
                "sha256": digest(payload),
                "bytes": len(payload),
            },
        )
        return payload

    @staticmethod
    def _download(url: str, params: dict[str, str | int | float]) -> bytes:
        with (
            httpx.Client(timeout=120) as client,
            client.stream("GET", url, params=params) as response,
        ):
            response.raise_for_status()
            chunks: list[bytes] = []
            size = 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > MAX_RESPONSE_BYTES:
                    raise ValueError("raw response exceeds capture budget")
                chunks.append(chunk)
        return b"".join(chunks)

    def json(self, url: str, params: dict[str, str | int | float]) -> dict[str, Any]:
        value = json.loads(self.get(url, params))
        if not isinstance(value, dict):
            raise TypeError("source response must be an object")
        return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--params", required=True, help="JSON object of public request parameters")
    parser.add_argument("--output", type=Path, default=Path("fixtures/demo/recorded"))
    args = parser.parse_args()
    params = json.loads(args.params)
    if not isinstance(params, dict) or any(
        not isinstance(v, (str, int, float)) for v in params.values()
    ):
        parser.error("params must be an object of scalar request values")
    payload = Archive(args.output).get(args.url, params)
    print(f"Captured {len(payload)} bytes, sha256:{digest(payload)}")


if __name__ == "__main__":
    main()
