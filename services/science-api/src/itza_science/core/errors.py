"""Upstream failures surfaced as HTTP 502 with a gap-style body."""

from typing import Literal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class Gap(BaseModel):
    var: str
    reason: str
    severity: Literal["info", "warning", "error"]


class GapBody(BaseModel):
    gaps: list[Gap]


class UpstreamError(Exception):
    def __init__(self, var: str, reason: str) -> None:
        super().__init__(f"{var}: {reason}")
        self.gap = Gap(var=var, reason=reason, severity="error")


async def _upstream_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, UpstreamError)  # noqa: S101
    return JSONResponse(status_code=502, content=GapBody(gaps=[exc.gap]).model_dump())


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(UpstreamError, _upstream_error_handler)
