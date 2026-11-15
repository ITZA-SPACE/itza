"""Build per-cell NEX-GDDP-CMIP6 monthly climatologies for `/v1/projection`.

For every hero field's 0.25 degree cell, writes one `BaselineRecord` JSON with, per model, the
1995-2014 monthly baseline and the 2041-2060 monthly future for each SSP. The science API divides
or subtracts them into change factors (`itza_science.core.factors`).

Source: NASA NEX-GDDP-CMIP6 v2.0 daily files on the AWS Open Data bucket `nex-gddp-cmip6`
(us-west-2, no sign-in). Each file is a global grid for one model, variable and year (~245 MB),
so every file is downloaded once, all cells are read from it, and it is deleted. Run it on a
machine close to the bucket (a short-lived VM in us-west1, see pipelines/README.md); the full set
is 6 models x 7 variables x (20 baseline + 3 x 20 future) years.

    uv run --project pipelines python pipelines/projection_baselines.py --out /tmp/baselines
"""

from __future__ import annotations

import argparse
import json
import re
import tempfile
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from statistics import fmean
from typing import Any

import yaml
from itza_science.clients.baseline import (
    BASELINE_PERIOD,
    FUTURE_PERIOD,
    BaselineRecord,
    cell_center,
)

BUCKET_URL = "https://nex-gddp-cmip6.s3.us-west-2.amazonaws.com"
PREFIX = "NEX-GDDP-CMIP6"
VERSION = "nex-gddp-cmip6-v2.0-monthly-1"
HERO_FIELDS = Path(__file__).parent / "hero_fields.yaml"

# Science API model keys (POWER Projection names) -> NEX-GDDP model and ensemble member.
MODELS: dict[str, tuple[str, str]] = {
    "cesm2": ("CESM2", "r4i1p1f1"),
    "ec_earth3": ("EC-Earth3", "r1i1p1f1"),
    "gfdl_esm4": ("GFDL-ESM4", "r1i1p1f1"),
    "giss_e2_1_g": ("GISS-E2-1-G", "r1i1p1f2"),
    "ipsl_cm6a_lr": ("IPSL-CM6A-LR", "r1i1p1f1"),
    "mpi_esm1_2_lr": ("MPI-ESM1-2-LR", "r1i1p1f1"),
}
SSPS = ("ssp126", "ssp245", "ssp370")
BASELINE_YEARS = range(1995, 2015)
FUTURE_YEARS = range(2041, 2061)


def _kelvin(v: float) -> float:
    return v - 273.15


def _per_day(v: float) -> float:
    return v * 86400.0


def _same(v: float) -> float:
    return v


# Canonical name -> NEX-GDDP variable and conversion to the POWER Projection unit the API pairs it
# with (°C, mm/day, %, m/s). Shortwave stays in W/m2: its change factor is a ratio, and POWER
# Projection's ALLSKY_SFC_SW_DWN values are W/m2-sized despite their MJ/m^2/day label (checked
# against these records, see pipelines/README.md).
VARIABLES: dict[str, tuple[str, Callable[[float], float]]] = {
    "tmax": ("tasmax", _kelvin),
    "tmin": ("tasmin", _kelvin),
    "tmean": ("tas", _kelvin),
    "precip": ("pr", _per_day),
    "rh": ("hurs", _same),
    "wind": ("sfcWind", _same),
    "srad": ("rsds", _same),
}

_NONLEAP = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
_LEAP = (31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def month_lengths(days: int) -> tuple[int, ...]:
    """Month lengths of a model year from its day count (360-day, no-leap or leap calendar)."""
    if days == 360:
        return (30,) * 12
    if days == 365:
        return _NONLEAP
    if days == 366:
        return _LEAP
    raise ValueError(f"unexpected year length {days}")


def monthly_means(values: list[float]) -> list[float]:
    """Twelve monthly means of one year of daily values."""
    out: list[float] = []
    start = 0
    for length in month_lengths(len(values)):
        out.append(fmean(values[start : start + length]))
        start += length
    return out


def pick_key(keys: Iterable[str], year: int, where: str = "") -> str:
    """The file for `year`: the corrected `_v2.0` release when it exists, else the original."""
    pattern = re.compile(rf"_{year}(_v2\.0)?\.nc$")
    keys = list(keys)
    found = sorted(k for k in keys if pattern.search(k))
    if not found:
        raise LookupError(f"no file for {year} in {where or 'listing'} ({len(keys)} keys listed)")
    v2 = [k for k in found if k.endswith("_v2.0.nc")]
    return (v2 or found)[0]


@dataclass(frozen=True)
class Task:
    model: str
    experiment: str
    variable: str
    year: int


def tasks(
    models: Iterable[str],
    variables: Iterable[str],
    absent: frozenset[tuple[str, str]] = frozenset(),
) -> list[Task]:
    out: list[Task] = []
    for m in models:
        for v in variables:
            if (m, v) in absent:
                continue
            out += [Task(m, "historical", v, y) for y in BASELINE_YEARS]
            out += [Task(m, ssp, v, y) for ssp in SSPS for y in FUTURE_YEARS]
    return out


def list_keys(model: str, experiment: str, variable: str) -> list[str]:
    nex_model, member = MODELS[model]
    nex_var = VARIABLES[variable][0]
    prefix = f"{PREFIX}/{nex_model}/{experiment}/{member}/{nex_var}/"
    keys: list[str] = []
    token = ""
    while True:
        url = f"{BUCKET_URL}/?list-type=2&prefix={prefix}{token}"
        with urllib.request.urlopen(url, timeout=120) as r:
            body = r.read().decode()
        keys += re.findall(r"<Key>([^<]+)</Key>", body)
        nxt = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", body)
        if not nxt:
            return keys
        token = "&continuation-token=" + urllib.parse.quote(nxt.group(1), safe="")


def nearest_index(axis: list[float], value: float) -> int:
    return min(range(len(axis)), key=lambda i: abs(axis[i] - value))


def read_points(
    path: Path, variable: str, cells: list[tuple[float, float]]
) -> dict[tuple[float, float], list[float]]:
    """Daily values at each cell centre from one downloaded file (longitudes 0-360 in NEX)."""
    import h5py

    nex_var, convert = VARIABLES[variable]
    out: dict[tuple[float, float], list[float]] = {}
    with h5py.File(path, "r") as f:
        lats = [float(x) for x in f["lat"][:]]
        lons = [float(x) for x in f["lon"][:]]
        data = f[nex_var]
        for lat, lon in cells:
            i = nearest_index(lats, lat)
            j = nearest_index(lons, lon % 360.0)
            out[(lat, lon)] = [convert(float(x)) for x in data[:, i, j]]
    return out


def run_task(
    task: Task, key: str, cells: list[tuple[float, float]], workdir: Path
) -> tuple[Task, dict[tuple[float, float], list[float]]]:
    target = workdir / Path(key).name
    try:
        urllib.request.urlretrieve(f"{BUCKET_URL}/{key}", target)
        daily = read_points(target, task.variable, cells)
    finally:
        target.unlink(missing_ok=True)
    return task, {cell: monthly_means(values) for cell, values in daily.items()}


def absent_pairs(keys: dict[tuple[str, str, str], list[str]]) -> frozenset[tuple[str, str]]:
    """(model, variable) pairs the archive does not publish in at least one experiment.

    NEX-GDDP-CMIP6 v2.0 has no tasmax/tasmin for CESM2 at all. Such a pair is dropped from every
    experiment (a baseline without its future is unusable) and recorded as a gap; a folder that
    exists but lacks some years still fails in `pick_key`.
    """
    return frozenset((m, v) for (m, _e, v), found in keys.items() if not found)


def assemble(
    results: list[tuple[Task, dict[tuple[float, float], list[float]]]],
    cells: list[tuple[float, float]],
    absent: frozenset[tuple[str, str]] = frozenset(),
) -> dict[tuple[float, float], dict[str, Any]]:
    """Average the yearly monthly means into baseline and per-SSP future climatologies."""
    acc: dict[tuple[tuple[float, float], str, str, str], list[list[float]]] = {}
    for task, by_cell in results:
        for cell, months in by_cell.items():
            acc.setdefault((cell, task.model, task.experiment, task.variable), []).append(months)
    records: dict[tuple[float, float], dict[str, Any]] = {}
    for cell in cells:
        models: dict[str, Any] = {}
        for (c, model, experiment, variable), years in sorted(acc.items()):
            if c != cell:
                continue
            clim = [round(fmean(month), 4) for month in zip(*years, strict=True)]
            entry = models.setdefault(model, {"baseline": {}, "future": {}})
            if experiment == "historical":
                entry["baseline"][variable] = clim
            else:
                entry["future"].setdefault(experiment, {})[variable] = clim
        gaps = [
            f"{model} {variable}: not published in NEX-GDDP-CMIP6 v2.0"
            for model, variable in sorted(absent)
        ]
        record = {
            "version": VERSION,
            "cell_lat": cell[0],
            "cell_lon": cell[1],
            "models": models,
            "gaps": gaps,
        }
        BaselineRecord.model_validate(record)
        records[cell] = record
    return records


def hero_cells(path: Path = HERO_FIELDS) -> list[tuple[float, float]]:
    """Distinct 0.25 degree cells of the hero fields' centroids."""
    fields = yaml.safe_load(path.read_text())["fields"]
    cells: set[tuple[float, float]] = set()
    for field in fields:
        ring = field["geometry"]["coordinates"][0]
        lon = fmean(p[0] for p in ring[:-1])
        lat = fmean(p[1] for p in ring[:-1])
        cells.add(cell_center(lat, lon))
    return sorted(cells)


def complete(
    records: dict[tuple[float, float], dict[str, Any]],
    expected: int,
    absent: frozenset[tuple[str, str]] = frozenset(),
) -> list[str]:
    """Missing model, period or variable entries beyond the recorded absent pairs.

    An empty list means every record holds every published model and variable.
    """
    problems: list[str] = []
    for cell, record in records.items():
        for model in MODELS:
            entry = record["models"].get(model)
            if entry is None:
                problems.append(f"{cell} {model}: missing")
                continue
            want = expected - sum(1 for m, _v in absent if m == model)
            if len(entry["baseline"]) != want:
                problems.append(f"{cell} {model}: baseline has {len(entry['baseline'])} variables")
            for ssp in SSPS:
                if len(entry["future"].get(ssp, {})) != want:
                    problems.append(f"{cell} {model} {ssp}: future incomplete")
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True, help="Directory for <lat>_<lon>.json.")
    parser.add_argument("--workers", type=int, default=12, help="Files downloaded at once.")
    parser.add_argument("--models", nargs="*", default=list(MODELS))
    parser.add_argument("--variables", nargs="*", default=list(VARIABLES))
    args = parser.parse_args()

    cells = hero_cells()
    print(f"cells: {cells}; baseline {BASELINE_PERIOD}, future {FUTURE_PERIOD}", flush=True)
    keys: dict[tuple[str, str, str], list[str]] = {}
    for m in args.models:
        for e in ("historical", *SSPS):
            for v in args.variables:
                keys[(m, e, v)] = list_keys(m, e, v)
    absent = absent_pairs(keys)
    for model, variable in sorted(absent):
        print(f"gap: {model} {variable} is not published; recorded and skipped", flush=True)
    todo = tasks(args.models, args.variables, absent)
    results: list[tuple[Task, dict[tuple[float, float], list[float]]]] = []
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(args.workers) as pool:
        futures = [
            pool.submit(
                run_task,
                t,
                pick_key(
                    keys[(t.model, t.experiment, t.variable)],
                    t.year,
                    f"{t.model}/{t.experiment}/{t.variable}",
                ),
                cells,
                Path(tmp),
            )
            for t in todo
        ]
        for n, done in enumerate(as_completed(futures), 1):
            results.append(done.result())
            if n % 50 == 0 or n == len(futures):
                print(f"{n}/{len(futures)} files", flush=True)

    records = assemble(results, cells, absent)
    problems = complete(records, len(args.variables), absent)
    if problems:
        raise SystemExit("incomplete records:\n" + "\n".join(problems))
    args.out.mkdir(parents=True, exist_ok=True)
    for (lat, lon), record in records.items():
        (args.out / f"{lat:.3f}_{lon:.3f}.json").write_text(json.dumps(record, indent=1) + "\n")
        print(f"wrote {lat:.3f}_{lon:.3f}.json", flush=True)


if __name__ == "__main__":
    main()
