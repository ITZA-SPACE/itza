import json
from pathlib import Path
from typing import Any

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "power"


def load_fixture(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / name).read_text())
    return data
