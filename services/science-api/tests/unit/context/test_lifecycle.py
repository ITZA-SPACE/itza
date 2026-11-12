import asyncio
import os
import time
from pathlib import Path

import pytest

from itza_science.context.models import PointQuery, SceneQuery
from itza_science.context.service import ContextService
from tests.context_support import BOUNDS, FixtureArchive

pytestmark = [pytest.mark.unit, pytest.mark.anyio]


async def test_inflight_capacity_is_bounded_and_retries_deduplicate(tmp_path: Path) -> None:
    archive = FixtureArchive(delay=0.04)
    service = ContextService(tmp_path, archive, wait_seconds=0.001)
    queries = [PointQuery(lat=36.12, lon=5.33 + i / 100) for i in range(5)]
    first = await service.grace(queries[0])
    assert first.status == "pending"
    results = await asyncio.gather(*(service.grace(q) for q in queries[1:]))
    assert all(r.status == "pending" for r in results)
    assert len(service.tasks) == 4
    assert len(archive.queries) == 4
    await service.close()
    assert (await service.grace(queries[0])).status == "ok"
    assert len(archive.queries) == 4


async def test_pruning_and_missing_cached_asset_recovery(tmp_path: Path) -> None:
    archive = FixtureArchive()
    service = ContextService(tmp_path, archive)
    query = SceneQuery.model_validate(
        {"bbox": ",".join(map(str, BOUNDS)), "from": "2026-06-17", "to": "2026-11-12"}
    )
    result = await service.scenes("nisar", query)
    assert result.scenes
    path = service.asset(result.scenes[0].href.rsplit("/", 1)[-1])
    path.unlink()
    before = len(archive.queries)
    rebuilt = await service.scenes("nisar", query)
    assert len(archive.queries) > before
    assert service.asset(rebuilt.scenes[0].href.rsplit("/", 1)[-1]).exists()
    old = service.asset("expired.png")
    old.write_bytes(b"expired")
    os.utime(old, (time.time() - 8 * 86400,) * 2)
    service.prune()
    assert not old.exists()
    # Sparse test files exercise the disk-size bound without allocating image buffers.
    for name in ("large-a.png", "large-b.png"):
        with service.asset(name).open("wb") as file:
            file.truncate(33 * 1024 * 1024)
    service.prune()
    assert sum(p.stat().st_size for p in service.asset("").glob("*.png")) <= 64 * 1024 * 1024
    await service.close()


async def test_identical_image_writes_from_parallel_requests_are_safe(tmp_path: Path) -> None:
    service = ContextService(tmp_path, FixtureArchive())
    urls = await asyncio.gather(
        *(asyncio.to_thread(service._store, b"synthetic asset bytes") for _ in range(8))
    )
    assert len(set(urls)) == 1
    assert service.asset(urls[0].rsplit("/", 1)[-1]).read_bytes() == b"synthetic asset bytes"
    assert not list(service.asset("").glob("*.tmp"))
