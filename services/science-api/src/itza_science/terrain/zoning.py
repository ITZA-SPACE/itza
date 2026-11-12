"""Reproducible multi-year zone clustering, stability and labeled runoff scenarios."""

from dataclasses import dataclass
from itertools import combinations
from math import exp, radians, tan

import numpy as np
from numpy.typing import NDArray
from rasterio.features import shapes
from scipy.optimize import linear_sum_assignment
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

from itza_science.terrain.derivatives import Terrain
from itza_science.terrain.grid import FloatArray, Grid, project
from itza_science.terrain.models import (
    SoilBaseline,
    SoilScenario,
    ZoneCollection,
    ZoneFeature,
    ZoneProperties,
)
from itza_science.terrain.sources import Inputs, Observation, gap


def select_k(features: FloatArray) -> tuple[NDArray[np.int64], float]:
    """Standardized k=2..4; deterministic stratified silhouette sample caps pairwise work."""
    scaled = StandardScaler().fit_transform(features)
    unique = np.unique(scaled, axis=0).shape[0]
    best: tuple[NDArray[np.int64], float] | None = None
    for k in range(2, min(4, unique, len(features) - 1) + 1):
        labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(scaled)
        rng = np.random.default_rng(42)
        chosen = np.concatenate(
            [
                rng.choice(
                    np.flatnonzero(labels == i),
                    min(int(np.count_nonzero(labels == i)), max(1, 2000 // k)),
                    replace=False,
                )
                for i in range(k)
            ]
        )
        score = float(silhouette_score(scaled[chosen], labels[chosen]))
        if best is None or score > best[1]:
            best = np.asarray(labels, dtype=np.int64), score
    if best is None:
        raise ValueError("HLS observations do not distinguish at least two zones")
    return best


def stability_score(
    reference: NDArray[np.int64], annual: list[NDArray[np.int64]]
) -> tuple[float | None, dict[int, float | None]]:
    if len(annual) < 2:
        return None, {int(i): None for i in np.unique(reference)}
    scores = [max(0.0, float(adjusted_rand_score(a, b))) for a, b in combinations(annual, 2)]
    retention: dict[int, list[float]] = {int(i): [] for i in np.unique(reference)}
    k = len(retention)
    for labels in annual:
        counts = np.array(
            [
                [np.count_nonzero((reference == i) & (labels == j)) for j in range(k)]
                for i in range(k)
            ]
        )
        rows, cols = linear_sum_assignment(-counts)
        matched = {int(i): int(j) for i, j in zip(rows, cols, strict=True)}
        for i, retained in retention.items():
            retained.append(float(np.mean(labels[reference == i] == matched[i])))
    return float(np.mean(scores)), {i: float(np.mean(v)) for i, v in retention.items()}


def soil_scenario(baseline: SoilBaseline | None, slope: float | None) -> SoilScenario | None:
    if baseline is None or slope is None:
        return None
    cn2 = baseline.curve_number
    cn3 = cn2 * exp(0.00673 * (100 - cn2))
    fraction = tan(radians(slope))
    adjusted = cn2 + (cn3 - cn2) / 3 * (1 - 2 * exp(-13.86 * fraction))
    return SoilScenario(
        awc_mm_per_m=baseline.awc_mm_per_m,
        curve_number=max(30.0, min(98.0, adjusted)),
        baseline_source=baseline.source,
    )


def annual_statistics(observations: list[Observation]) -> dict[int, dict[str, FloatArray]]:
    result = {}
    for year in sorted({o.day.year for o in observations}):
        frames = [o for o in observations if o.day.year == year and o.variable == "ndvi"]
        if not frames:
            continue
        data = np.stack([o.values for o in frames])
        count = np.isfinite(data).sum(axis=0)
        mean = np.divide(
            np.nansum(data, axis=0), count, out=np.full(data.shape[1:], np.nan), where=count >= 2
        )
        variance = np.divide(
            np.nansum((data - mean) ** 2, axis=0),
            count,
            out=np.full_like(mean, np.nan),
            where=count >= 2,
        )
        cv = np.divide(
            np.sqrt(variance),
            np.abs(mean),
            out=np.full_like(mean, np.nan),
            where=np.abs(mean) > 1e-6,
        )
        peak = np.argmax(np.where(np.isfinite(data), data, -np.inf), axis=0)
        doy = np.asarray([o.day.timetuple().tm_yday for o in frames], dtype=float)[peak]
        doy[count < 2] = np.nan
        result[year] = {
            "mean": mean,
            "cv": cv,
            "sin": np.sin(doy * 2 * np.pi / 366),
            "cos": np.cos(doy * 2 * np.pi / 366),
        }
    return result


def _mean(arrays: list[FloatArray]) -> FloatArray:
    data = np.stack(arrays)
    count = np.isfinite(data).sum(axis=0)
    return np.asarray(
        np.divide(
            np.nansum(data, axis=0), count, out=np.full(data.shape[1:], np.nan), where=count > 0
        ),
        dtype=np.float64,
    )


def zones(
    grid: Grid, inputs: Inputs, terrain: Terrain | None, baseline: SoilBaseline | None
) -> ZoneCollection:
    annual = annual_statistics(inputs.observations)
    result = ZoneCollection(
        enabled=False,
        reason="at least two years of valid HLS observations are required",
        years=sorted(annual),
        gaps=inputs.gaps.copy(),
    )
    result.provenance = list(
        {
            s.model_dump_json(): s
            for s in (
                [o.source for o in inputs.observations]
                + ([inputs.dem_source] if inputs.dem_source else [])
            )
        }.values()
    )
    if len(annual) < 2:
        return result
    names = ("mean", "cv", "sin", "cos")
    means = {n: _mean([y[n] for y in annual.values()]) for n in names}
    valid = grid.mask & (
        np.stack([np.isfinite(y["mean"]) & np.isfinite(y["cv"]) for y in annual.values()]).sum(
            axis=0
        )
        >= 2
    )
    extra: list[FloatArray] = []
    if terrain is not None and np.isfinite(terrain.slope[valid]).all():
        extra = [terrain.slope, np.log1p(terrain.accumulation)]
    wet = [o.values for o in inputs.observations if o.variable == "moisture"]
    moisture = _mean(wet) if wet else None
    if moisture is not None and np.isfinite(moisture[valid]).all():
        extra.append(moisture)
    features = [means[n] for n in names] + extra
    valid &= np.logical_and.reduce([np.isfinite(f) for f in features])
    if int(valid.sum()) < 30:
        result.reason = "at least 30 HLS pixels with multi-year observations are required"
        return result
    result.coverage = float(valid.sum() / grid.mask.sum())
    if result.coverage < 1:
        result.gaps.append(gap("zones", "pixels without comparable multi-year data are excluded"))
    x = np.column_stack([f[valid] for f in features])
    try:
        labels, score = select_k(x)
    except ValueError as exc:
        result.reason = str(exc)
        return result
    k = len(np.unique(labels))
    # Display numbering follows mean greenness; stability ignores label permutations.
    order = sorted(range(k), key=lambda i: float(np.mean(means["mean"][valid][labels == i])))
    labels = np.asarray([order.index(int(i)) for i in labels], dtype=np.int64)
    annual_labels = []
    for year in annual.values():
        matrix = np.column_stack([year[n][valid] for n in names] + [f[valid] for f in extra])
        if np.isfinite(matrix).all() and len(np.unique(matrix, axis=0)) >= k:
            annual_labels.append(
                np.asarray(
                    KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(
                        StandardScaler().fit_transform(matrix)
                    ),
                    dtype=np.int64,
                )
            )
    stability, per_zone = stability_score(labels, annual_labels)
    raster = np.zeros(grid.shape, dtype=np.int32)
    raster[valid] = labels + 1
    features_out = _features(
        grid, inputs, terrain, baseline, ZoneData(means, raster, per_zone, moisture)
    )
    result.enabled, result.reason, result.features = True, None, features_out
    result.k, result.silhouette, result.stability = k, score, stability
    if baseline is None:
        result.gaps.append(
            gap("soil_water", "supply baseline AWC and curve number for zone runoff scenarios")
        )
    if stability is None:
        result.gaps.append(gap("stability", "too few comparable annual clusterings"))
    return result


@dataclass
class ZoneData:
    means: dict[str, FloatArray]
    raster: NDArray[np.int32]
    per_zone: dict[int, float | None]
    moisture: FloatArray | None


def _features(
    grid: Grid,
    inputs: Inputs,
    terrain: Terrain | None,
    baseline: SoilBaseline | None,
    data: ZoneData,
) -> list[ZoneFeature]:
    means, raster, per_zone, moisture = data.means, data.raster, data.per_zone, data.moisture
    valid = raster > 0
    k = len(per_zone)
    features_out = []
    for i in range(k):
        geometries = [
            shape(g)
            for g, value in shapes(raster, mask=raster == i + 1, transform=grid.affine)
            if int(value) == i + 1
        ]
        geometry = unary_union(geometries).intersection(grid.field)
        pixels = valid & (raster == i + 1)
        slope = (
            float(np.mean(terrain.slope[pixels]))
            if terrain is not None and np.isfinite(terrain.slope[pixels]).all()
            else None
        )
        flow = (
            float(np.mean(terrain.accumulation[pixels]))
            if terrain is not None and np.isfinite(terrain.accumulation[pixels]).all()
            else None
        )
        wet_value = (
            float(np.mean(moisture[pixels]))
            if moisture is not None and np.isfinite(moisture[pixels]).all()
            else None
        )
        notes = ["Observed vegetation patterns differ here; a zone is not a soil measurement."]
        if terrain is not None and float(np.mean(terrain.concavity[pixels])) < 0:
            notes.append(
                "Low, convergent terrain may retain water or cold air; check field observations."
            )
        if slope is not None and slope >= 5:
            notes.append("Steeper ground may have greater runoff and erosion exposure.")
        if any(o.source.coarse for o in inputs.observations if o.variable == "moisture"):
            notes.append("Moisture is a coarser covariate; resampling adds no field-scale detail.")
        peak = float(
            np.mod(
                np.arctan2(np.mean(means["sin"][pixels]), np.mean(means["cos"][pixels])), 2 * np.pi
            )
            * 366
            / (2 * np.pi)
        )
        properties = ZoneProperties(
            zone=i + 1,
            area_ha=geometry.area / 10000,
            pixels=int(pixels.sum()),
            ndvi_mean=float(np.mean(means["mean"][pixels])),
            ndvi_cv=float(np.mean(means["cv"][pixels])),
            peak_doy=peak,
            slope_deg=slope,
            flow_accumulation_cells=flow,
            moisture=wet_value,
            stability=per_zone[i],
            notes=notes,
            soil_water=soil_scenario(baseline, slope),
        )
        features_out.append(
            ZoneFeature.model_validate(
                {
                    "geometry": mapping(
                        project(geometry, grid.crs, "EPSG:4326").intersection(
                            project(grid.field, grid.crs, "EPSG:4326")
                        )
                    ),
                    "properties": properties,
                }
            )
        )
    return features_out
