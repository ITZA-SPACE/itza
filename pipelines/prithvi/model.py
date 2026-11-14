"""Small trainable segmentation head on the TerraTorch Prithvi tiny-TL encoder."""

from typing import Any, cast

import numpy as np
import numpy.typing as npt
import torch
from torch import Tensor, nn
from torch.nn import functional as F

MEAN = np.array([1087, 1342, 1433, 2734, 1958, 1363], dtype=np.float32)
STD = np.array([2248, 2179, 2178, 1850, 1242, 1049], dtype=np.float32)
BASE_REVISION = "335eadc2c45ad5abe7bd307223e1c48c5b60c41b"
CROP = [3, 4, 8, 9, 11, 12]


def binary_labels(raw: npt.NDArray[Any]) -> npt.NDArray[np.int64]:
    target = np.full(raw.shape, -1, dtype=np.int64)
    target[np.isin(raw, CROP)] = 0
    target[raw == 10] = 1
    return target


def normalize(raw: npt.NDArray[Any]) -> npt.NDArray[np.float32]:
    if raw.ndim != 3 or raw.shape[0] != 18 or not np.isfinite(raw).all():
        raise ValueError("expected finite 18-band (three dates by six bands) HLS chip")
    data = raw.astype(np.float32).reshape(3, 6, *raw.shape[-2:]).transpose(1, 0, 2, 3)
    return cast(
        npt.NDArray[np.float32], (data - MEAN[:, None, None, None]) / STD[:, None, None, None]
    )


class Segmenter(nn.Module):
    def __init__(self, *, pretrained: bool = True) -> None:
        super().__init__()
        from huggingface_hub import hf_hub_download
        from terratorch.registry import BACKBONE_REGISTRY

        checkpoint = (
            hf_hub_download(
                "ibm-nasa-geospatial/Prithvi-EO-2.0-tiny-TL",
                "Prithvi_EO_V2_tiny_TL.pt",
                revision=BASE_REVISION,
            )
            if pretrained
            else None
        )
        self.encoder = BACKBONE_REGISTRY.build(
            "prithvi_eo_v2_tiny_tl",
            pretrained=pretrained,
            num_frames=3,
            out_indices=[-1],
            ckpt_path=checkpoint,
        )
        self.head = nn.Sequential(nn.Conv2d(576, 64, 1), nn.GELU(), nn.Conv2d(64, 2, 1))

    def forward(self, x: Tensor, temporal: Tensor, location: Tensor) -> Tensor:
        h, w = x.shape[-2:]
        tokens = self.encoder(x, temporal_coords=temporal, location_coords=location)[0][:, 1:]
        features = tokens.reshape(x.shape[0], 3, h // 16, w // 16, 192)
        features = features.permute(0, 1, 4, 2, 3).reshape(x.shape[0], 576, h // 16, w // 16)
        return F.interpolate(self.head(features), size=(h, w), mode="bilinear", align_corners=False)


def classify(
    model: Segmenter, x: Tensor, temporal: Tensor, location: Tensor
) -> npt.NDArray[np.uint8]:
    """Pad to whole patches without inventing observations; crop back after inference."""
    h, w = x.shape[-2:]
    padded = F.pad(x, (0, (-w) % 16, 0, (-h) % 16, 0, 0), mode="replicate")
    with torch.inference_mode():
        logits = model(padded, temporal, location)
    return cast(
        npt.NDArray[np.uint8], logits.argmax(1)[0, :h, :w].cpu().numpy().astype(np.uint8) + 1
    )


def scores(confusion: npt.NDArray[np.int64]) -> dict[str, object]:
    if confusion.shape != (2, 2) or np.any(confusion < 0) or confusion.sum() == 0:
        raise ValueError("expected nonempty 2x2 confusion matrix")
    diagonal = np.diag(confusion)
    union = confusion.sum(0) + confusion.sum(1) - diagonal
    iou = np.divide(diagonal, union, out=np.zeros(2, dtype=float), where=union > 0)
    return {
        "confusion_matrix_true_rows": confusion.tolist(),
        "pixels": int(confusion.sum()),
        "accuracy": float(diagonal.sum() / confusion.sum()),
        "iou_crop": float(iou[0]),
        "iou_fallow": float(iou[1]),
        "mean_iou": float(iou.mean()),
    }
