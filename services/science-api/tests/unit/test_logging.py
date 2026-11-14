import json
import logging
import sys

import pytest

from itza_science.core.logging import JsonFormatter

pytestmark = pytest.mark.unit


def _record(**extra: object) -> logging.LogRecord:
    record = logging.makeLogRecord({"name": "itza", "levelname": "INFO", "msg": "hello %s"})
    record.args = ("world",)
    record.__dict__.update(extra)
    return record


def test_formats_record_as_json_with_extra_fields() -> None:
    payload = json.loads(JsonFormatter().format(_record(bundle_id="abc")))
    assert payload["msg"] == "hello world"
    assert payload["level"] == "INFO"
    assert payload["bundle_id"] == "abc"


def test_includes_exception_text() -> None:
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        record = _record()
        record.exc_info = sys.exc_info()
    payload = json.loads(JsonFormatter().format(record))
    assert "RuntimeError: boom" in payload["exc"]
