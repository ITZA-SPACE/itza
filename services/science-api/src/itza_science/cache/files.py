"""Content-addressed JSON file cache under the configured data directory."""

import hashlib
import json
import os
from pathlib import Path
from typing import Any


class FileCache:
    def __init__(self, root: Path) -> None:
        self._root = root

    @staticmethod
    def key(namespace: str, source_version: str, params: dict[str, Any]) -> str:
        canonical = json.dumps(
            {"ns": namespace, "v": source_version, "p": params},
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode()).hexdigest()

    def _path(self, namespace: str, key: str) -> Path:
        return self._root / "cache" / namespace / f"{key}.json"

    def get(self, namespace: str, key: str) -> Any | None:
        path = self._path(namespace, key)
        try:
            return json.loads(path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def set(self, namespace: str, key: str, value: Any) -> None:
        path = self._path(namespace, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(value))
        tmp.replace(path)
