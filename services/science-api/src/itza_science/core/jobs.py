"""In-process bundle job store: FastAPI background tasks, keyed by bundle id."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from itza_science.contracts.field_bundle_schema import FieldBundle

Status = Literal["queued", "running", "done", "error"]


@dataclass
class BundleJob:
    id: str
    status: Status
    created_at: datetime
    bundle: FieldBundle | None = None
    error: str | None = None


class BundleJobStore:
    """Jobs live only in memory; finished bundles are also written to the file cache."""

    def __init__(self) -> None:
        self._jobs: dict[str, BundleJob] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(self, bundle_id: str, now: datetime) -> tuple[BundleJob, bool]:
        """Returns ``(job, created)``; ``created`` is false when a job already existed."""
        async with self._lock:
            existing = self._jobs.get(bundle_id)
            if existing is not None:
                return existing, False
            job = BundleJob(id=bundle_id, status="queued", created_at=now)
            self._jobs[bundle_id] = job
            return job, True

    def get(self, bundle_id: str) -> BundleJob | None:
        return self._jobs.get(bundle_id)

    def put(self, job: BundleJob) -> None:
        self._jobs[job.id] = job

    def restore(self, job: BundleJob) -> None:
        """Rehydrate a job from a cached bundle after a cold start."""
        self._jobs.setdefault(job.id, job)
