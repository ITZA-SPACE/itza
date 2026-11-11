from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from itza_science.core.config import Settings
from itza_science.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(environment="test", cors_origins=["http://allowed.test"], data_dir=tmp_path)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
