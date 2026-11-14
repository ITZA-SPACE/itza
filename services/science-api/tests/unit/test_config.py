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


def test_dataset_store_dir_is_off_by_default_and_read_from_the_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ITZA_DATASET_STORE_DIR", raising=False)
    assert Settings(_env_file=None).dataset_store_dir is None
    monkeypatch.setenv("ITZA_DATASET_STORE_DIR", "/data/store")
    assert str(Settings().dataset_store_dir) == "/data/store"
