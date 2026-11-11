import pytest

from itza_science.core.config import Settings

pytestmark = pytest.mark.unit


def test_cors_origins_parsed_from_comma_separated_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ITZA_CORS_ORIGINS", "https://app.example, http://localhost:5173 ,")
    assert Settings().cors_origins == ["https://app.example", "http://localhost:5173"]


def test_docs_disabled_in_production() -> None:
    assert Settings(environment="production").docs_enabled is False
    assert Settings(environment="development").docs_enabled is True


def test_invalid_environment_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ITZA_ENVIRONMENT", "staging")
    with pytest.raises(ValueError, match="environment"):
        Settings()
