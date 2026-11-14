# Proof-field cross-checks (#105)

Reproduction from the repository root (no new packages required):

```sh
node pipelines/validation/replay.mjs
uv run --project pipelines python pipelines/validation/build.py
uv run --project pipelines python pipelines/validation/build.py --check
uv run --project pipelines pytest -o addopts='' pipelines/validation/test_validation.py
uv run --project pipelines ruff check pipelines/validation/*.py
uv run --project pipelines mypy --strict --follow-imports=silent pipelines/validation/build.py pipelines/validation/capture.py pipelines/validation/test_validation.py
```

`replay.mjs` uses the existing Vite installation to load the TypeScript engine in Node.
It validates the three proof bundles against their shared schema and exports a fixed
continuous winter-wheat replay: the US Central Great Plains knowledge pack, default
soil, equal priority weights, no irrigation, historical weather, seed 42 and no Monte
Carlo draws. This is a counterfactual, not the inferred or actual field rotation.
Scores are matched to county winter wheat yield by the season's harvest year.
Monthly modeled actual ET uses the same crop plan and FAO-56 timeline as that replay;
the first initialization year and months containing filled weather are omitted.
The exported input and bundle hashes are retained in `data/replay.json`.

`build.py` is entirely offline. It validates source captures, rejects mismatched
sources, duplicate dates, invalid units, nonfinite and negative observations, and
refuses stale replay inputs when a bundle changes. It writes the bundled report to
`apps/web/src/validation/data/cross-checks.json`. The report records SHA-256 digests,
source resolutions, access dates, coverage, paired observations and missing periods.
The register in `sources.json` records provider terms, license and citation, including
sources for which no usable capture is available. No runtime source API or service
worker cache is needed for the report: Vite includes it in the app's JavaScript.

## Online refresh

```sh
uv run --project pipelines python pipelines/validation/capture.py
```

The explicit capture step retrieves PRISM monthly precipitation (4 km cell at each
centroid, SI units, no interpolation, January 2008 through December 2025), then uses
the public Quick Stats website's Spreadsheet export for Washington County, Colorado
(FIPS 08121), survey winter wheat yields in bushels per harvested acre, all practices,
2008–2025. It preserves the original PRISM responses and county CSV. Quick Stats raw
captures are reused when both `data/raw/quickstats.csv` and `quickstats-url.txt` exist;
move those files aside to request a newer release. Source retrieval dates are attached
to each capture; when reusing an older CSV, preserve its original retrieval date.
Suppression codes remain missing observations; irrigated/non-irrigated subsets and
other domains are excluded. The three fields share the same county series; they are
not three independent validation trials.

OpenET capture uses `OPENET_API_KEY` from the process environment (free account required,
no card). Never put a key in this directory, the browser, a command argument or Git.
The API request is a monthly polygon mean, Ensemble ET v2.0, gridMET reference, mm.
A missing key produces an explicit unavailable capture. HTTP errors fail the capture;
they never produce invented measurements. The authenticated OpenET branch has not
been exercised against the live service because no account key is configured.

## Statistics and missingness

- Rain: only IMERG Final daily precipitation is eligible; POWER is never relabeled.
  Complete months are summed into complete September–August seasons (harvest year).
  A missing or flagged-missing day excludes the month and thus its entire season.
- Water agreement: ITZA minus reference bias and RMSE in mm, and Spearman correlation.
- County context: tie-aware Spearman rank correlation and agreement of year-on-year
  direction on adjacent harvest years only. Tied changes are excluded and counted.
  No bias/RMSE is calculated between unlike units (scores and yield).
- Correlation is undefined with fewer than three pairs or either series constant.
  No significance or predictive skill is claimed. All paired rows can be inspected.

## Captured result (2026-11-14)

PRISM: 216 months per proof field, yielding 17 complete reference seasons.
Quick Stats: 16 annual records; 15 overlap replay seasons (2009–2025; 2019 and 2024
are absent from the source export). Correlations are 0.596962, 0.591600, 0.591600;
direction agrees in 7 of 12 adjacent non-tied changes on every field.

**The full scientific acceptance criterion for #105 remains unmet.** The current
bundles have NASA POWER precipitation and no IMERG series, and no authenticated
OpenET capture is available. The view displays both missing comparisons with zero
paired observations and the reasons. Providing complete IMERG daily series in the
bundles and running OpenET capture with a valid key, then rerunning the exporter and
builder, enables the implemented water comparisons. Neither an unavailable comparison
nor a synthetic test fixture counts as measured agreement. Keep the issue open until
all three measured cross-checks are present on all three fields.
