from typing import Any

import numpy as np
import pytest
import torch
from torch import Tensor, nn

from model import MEAN, STD, binary_labels, classify, normalize, scores

pytestmark = pytest.mark.unit


def test_label_mapping_exhausts_byte_domain() -> None:
    codes = np.arange(256, dtype=np.uint8)
    target = binary_labels(codes)
    assert set(np.flatnonzero(target == 0)) == {3, 4, 8, 9, 11, 12}
    assert set(np.flatnonzero(target == 1)) == {10}
    assert np.sum(target == -1) == 249


def test_normalization_channel_time_order_and_mean_identity() -> None:
    physical = np.broadcast_to(MEAN[None, :, None, None], (3, 6, 2, 2)).copy()
    physical[2, 4] += STD[4]
    normalized = normalize(physical.reshape(18, 2, 2))
    assert normalized.shape == (6, 3, 2, 2)
    assert normalized[4, 2].tolist() == [[1, 1], [1, 1]]
    assert np.count_nonzero(normalized) == 4


@pytest.mark.parametrize("raw", [np.zeros((6, 2, 2)), np.full((18, 2, 2), np.nan)])
def test_invalid_inputs(raw: Any) -> None:
    with pytest.raises(ValueError, match="18-band"):
        normalize(raw)


def test_metrics_known_errors_and_scale_invariance() -> None:
    matrix = np.array([[8, 2], [1, 9]], dtype=np.int64)
    result = scores(matrix)
    assert result["accuracy"] == 0.85
    assert result["iou_crop"] == pytest.approx(8 / 11)
    assert result["iou_fallow"] == pytest.approx(9 / 12)
    scaled = scores(matrix * 7)
    assert scaled["accuracy"] == result["accuracy"]
    assert scaled["mean_iou"] == result["mean_iou"]
    perfect = scores(np.eye(2, dtype=np.int64))
    assert perfect["mean_iou"] == 1


@pytest.mark.parametrize(
    "matrix",
    [
        np.zeros((2, 2), dtype=np.int64),
        -np.ones((2, 2), dtype=np.int64),
        np.ones((3, 3), dtype=np.int64),
    ],
)
def test_bad_confusion(matrix: Any) -> None:
    with pytest.raises(ValueError):
        scores(matrix)


class FakeSegmenter(nn.Module):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__()
        self.bias = nn.Parameter(torch.tensor([0.1, -0.1]))

    def forward(self, x: Tensor, temporal: Tensor, location: Tensor) -> Tensor:
        assert x.shape[-1] % 16 == 0
        assert x.shape[-2] % 16 == 0
        return self.bias[None, :, None, None].expand(x.shape[0], 2, *x.shape[-2:])


def test_inference_padding_is_cropped_to_original_extent() -> None:
    from typing import cast

    from model import Segmenter

    prediction = classify(
        cast(Segmenter, FakeSegmenter()),
        torch.ones(1, 6, 3, 11, 10),
        torch.zeros(1, 3, 2),
        torch.zeros(1, 2),
    )
    assert prediction.shape == (11, 10)
    assert np.all(prediction == 1)


def test_real_terratorch_architecture_without_network(monkeypatch: pytest.MonkeyPatch) -> None:
    from model import Segmenter

    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    torch.manual_seed(18)
    torch.set_num_threads(2)
    model = Segmenter(pretrained=False)
    result = model(
        torch.zeros(1, 6, 3, 32, 48),
        torch.tensor([[[2022.0, 60.0], [2022.0, 150.0], [2022.0, 240.0]]]),
        torch.tensor([[40.0, -103.0]]),
    )
    assert result.shape == (1, 2, 32, 48)
    torch.autograd.backward(result.sum())
    assert model.head[0].weight.grad is not None
    assert model.encoder.patch_embed.proj.weight.grad is not None
