import numpy as np
import pytest

from itza_science.geo.qa import hls_fmask_invalid

pytestmark = pytest.mark.unit


def test_clear_pixel_is_valid() -> None:
    assert hls_fmask_invalid(np.array([[0]]))[0, 0] is np.bool_(False)


@pytest.mark.parametrize(
    "bit_value", [0b0000_0010, 0b0000_0100, 0b0000_1000, 0b0001_0000, 0b0010_0000]
)
def test_masked_bits_are_invalid(bit_value: int) -> None:
    assert bool(hls_fmask_invalid(np.array([[bit_value]]))[0, 0]) is True


def test_cirrus_alone_is_valid() -> None:
    assert bool(hls_fmask_invalid(np.array([[0b0000_0001]]))[0, 0]) is False


def test_fill_value_is_invalid() -> None:
    assert bool(hls_fmask_invalid(np.array([[255]]))[0, 0]) is True


def test_vectorized_over_a_grid() -> None:
    fmask = np.array([[0, 0b0000_0010], [0b0010_0000, 0]])
    invalid = hls_fmask_invalid(fmask)
    assert invalid.tolist() == [[False, True], [True, False]]
