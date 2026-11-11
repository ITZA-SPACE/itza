import json
from pathlib import Path
from typing import Any

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "power"


def load_fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / name).read_text())
    return data


SYNTHETIC_DIR = Path(__file__).resolve().parents[3] / "fixtures" / "synthetic"


def load_synthetic(name: str) -> Any:
    return json.loads((SYNTHETIC_DIR / name).read_text(encoding="utf-8"))
