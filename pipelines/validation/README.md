# Proof-field cross-checks (#105)

Reproduction from the repository root (no new packages required):

```sh
node pipelines/validation/replay.mjs
uv run --project pipelines python pipelines/validation/build.py
uv run --project pipelines python pipelines/validation/build.py --check
uv run --project pipelines pytest
uv run --project pipelines ruff check pipelines/validation/*.py
uv run --project pipelines mypy --config-file pipelines/pyproject.toml
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
all source products used by the report. No runtime source API or service
worker cache is needed for the report: Vite includes it in the app's JavaScript.
The existing CI pipeline job runs these validation tests, lint and strict types too.

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
Without a key, an existing validated OpenET snapshot is retained with its original
retrieval date; if none exists, the capture records the source as unavailable. HTTP errors fail;
they never produce invented measurements. OpenET accepts at most 10 years per
request, so the capture asks for 2008–2016 and 2017–2025 and joins the monthly rows.

## Statistics and missingness

- Rain: the official NASA GPM IMERG Final **monthly** product (`GPM_3IMERGM`, V07)
  provides mean precipitation rates in mm/hour. Multiplying by the exact calendar
  hours in each month (including leap February) gives monthly water depths; all twelve
  months are required for a September–August season. Missing months are never zero.
  The fallback for bundles with a complete IMERG Final daily series retains its strict
  daily completeness rule. POWER and the weekly sampled dataset store are not used
  for this comparison. The replay still uses its bundle's POWER weather: this check
  compares rainfall products, not the model's selected forcing. IMERG Final is gauge
  adjusted and PRISM is station based; shared gauge observations limit independence.
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

OpenET (captured 2026-11-14): 216 months per proof field; 204 complete months pair
with the replay. Spearman 0.685 / 0.771 / 0.785, bias −3.0 / −5.7 / −2.9 mm/month,
RMSE 27.3 / 22.1 / 20.3 mm/month (ITZA minus OpenET).

IMERG Final Monthly: 213 observed months, January 2008–September 2025. The provider
has no October–December 2025 granules in the captured CMR query; the normalized
captures retain those three requested months as null, not zero. All **17 complete
September–August seasons ending 2009–2025** pair with PRISM on every proof field.
Spearman correlations are 0.838 / 0.814 / 0.850; bias (IMERG minus PRISM) is
+32.9 / +17.6 / +20.0 mm/season and RMSE is 61.7 / 57.4 / 51.5 mm/season.
The three nearby proof fields share one IMERG grid cell. They are not independent
rainfall validation sites. Every comparison is shown, including the positive biases.

## IMERG refresh

```sh
uv run --project pipelines python pipelines/validation/capture_imerg.py --env-file services/science-api/.env
uv run --project pipelines python pipelines/validation/build.py
```

This optional online step uses the existing Earthdata credentials from a service env
file or process environment. It searches CMR for the full 2008–2025 record and fetches
small OPeNDAP point subsets at all three proof-field centroids. The containing
0.1-degree grid cell and longitude/latitude are checked; the source metadata must
confirm mm/hour. Query URLs, source responses, coordinates and SHA-256 digests are
preserved in `data/raw/imerg-monthly.json`; no credentials are written. Four workers,
bounded response sizes and retries handle transient provider errors. Every successful
month is checkpointed, so rerunning resumes failures. The report is entirely offline.
All three requested cross-checks are now measured on all three proof fields; #105
can close with this PR once the final checks and merge approval are complete.
