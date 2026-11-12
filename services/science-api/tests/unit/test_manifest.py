import pytest

from itza_science.core.manifest import MANIFEST_PATH, PACKAGED_MANIFEST_PATH, load_manifest

pytestmark = pytest.mark.unit


def test_precip_chain_prefers_final_over_late() -> None:
    manifest = load_manifest()
    assert manifest.chain("precip") == ["gpm_imerg_final_daily", "gpm_imerg_late_daily"]


def test_smap_l4_resolution_and_variables() -> None:
    manifest = load_manifest()
    entry = manifest.sources["smap_l4"]
    assert entry.resolution_m == 9000.0
    assert entry.variables["sm_surface"].source_var == "sm_surface"
    assert entry.variables["sm_rootzone"].unit == "m3/m3"


def test_hls_vi_entry() -> None:
    manifest = load_manifest()
    entry = manifest.sources["hls_vi"]
    assert entry.auth == "earthdata"
    assert entry.variables["ndvi"].unit == "-"


def test_unknown_variable_has_no_chain() -> None:
    manifest = load_manifest()
    assert manifest.chain("tmax") == []


def test_wheel_manifest_snapshot_matches_shared_source() -> None:
    assert MANIFEST_PATH.read_text() == PACKAGED_MANIFEST_PATH.read_text(), (
        "Run cp data-sources.yaml services/science-api/src/itza_science/core/data-sources.yaml"
    )
