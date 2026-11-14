"""Liveness endpoint used by Docker health checks and the diagnostics panel."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from itza_science import __version__

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok"]
    service: Literal["science-api"]
    version: str


@router.get("/health")
def health() -> Health:
    return Health(status="ok", service="science-api", version=__version__)
