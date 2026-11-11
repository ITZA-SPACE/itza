"""ASGI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from itza_science import __version__
from itza_science.api import health
from itza_science.core.config import Settings, get_settings
from itza_science.core.logging import configure_logging


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="ITZA Data & Science API",
        version=__version__,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(health.router)
    return app


app = create_app()
