from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from itza_science.core.config import Settings
from itza_science.main import create_app


@pytest.fixture
def settings() -> Settings:
    return Settings(environment="test", cors_origins=["http://allowed.test"])


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client
