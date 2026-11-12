"""ASGI application factory."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from itza_science import __version__
from itza_science.adapters.base import DataAdapter
from itza_science.adapters.granules import EarthaccessGranuleReader
from itza_science.adapters.hls_vi import HlsViAdapter
from itza_science.adapters.imerg import ImergAdapter
from itza_science.adapters.smap_l4 import SmapL4Adapter
from itza_science.api import bundles, frames, health, projection, zones
from itza_science.cache.files import FileCache
from itza_science.clients.baseline import BaselineStore
from itza_science.clients.http import UpstreamClient, build_client
from itza_science.clients.power_projection import PowerProjectionClient
from itza_science.core.config import Settings, get_settings
from itza_science.core.errors import register_error_handlers
from itza_science.core.jobs import BundleJobStore
from itza_science.core.logging import configure_logging
from itza_science.terrain.service import SpatialService
from itza_science.terrain.sources import EarthdataSpatialSource


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with build_client(settings) as client:
            app.state.cache = FileCache(settings.data_dir)
            app.state.baselines = BaselineStore(settings.data_dir)
            app.state.power_projection = PowerProjectionClient(
                UpstreamClient(client, settings), settings
            )
            granule_reader = EarthaccessGranuleReader(
                settings.data_dir / "granules",
                credentials={
                    name: value.get_secret_value()
                    for name, value in (
                        ("EARTHDATA_TOKEN", settings.earthdata_token),
                        ("EARTHDATA_USERNAME", settings.earthdata_username),
                        ("EARTHDATA_PASSWORD", settings.earthdata_password),
                    )
                    if value is not None and value.get_secret_value()
                },
            )
            bundle_adapters: list[DataAdapter] = [
                ImergAdapter(granule_reader),
                SmapL4Adapter(granule_reader),
                HlsViAdapter(granule_reader),
            ]
            app.state.spatial = SpatialService(
                settings.data_dir, EarthdataSpatialSource(granule_reader, settings.data_dir)
            )
            app.state.bundle_adapters = bundle_adapters
            app.state.bundle_jobs = BundleJobStore()
            yield

    app = FastAPI(
        lifespan=lifespan,
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
    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(projection.router)
    app.include_router(bundles.router)
    app.include_router(frames.router)
    app.include_router(zones.router)
    return app


app = create_app()
