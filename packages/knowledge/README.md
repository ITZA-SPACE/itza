# @itza/knowledge

Region knowledge packs (crops, pests, calendars) with schema and validator.

Owned by workstream H in [MVP_SCOPE.md §3](../../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents). Design: [FEATURES.md C-1](../../docs/FEATURES.md).

Internal package: consumers import TypeScript source directly (`exports` points at `src/index.ts`); the app bundler compiles it.

## Use

```ts
import { loadPack, listPacks, packForLocation } from "@itza/knowledge";

const { pack, fallback } = packForLocation(5.41, 36.19); // dz-high-plains, fallback: false
loadPack("us-central-great-plains");                     // throws UnknownPackError for other ids
listPacks();                                             // id, name, generic, reviewStatus, bbox
```

- `packForLocation(lon, lat)` returns the pack whose bounding box contains the point (edges included). Outside every region it returns the `generic` pack with `fallback: true`: label such results as generic in the UI. Impossible coordinates throw `RangeError`.
- Packs are deeply frozen. Do not mutate them; copy first.

## Packs

| Pack | Region (approximate box) | Crops | Review status |
|---|---|---|---|
| `dz-high-plains` | Algerian high plains, incl. Setif `[-1.5, 34.0, 8.5, 36.5]` | durum wheat, bread wheat, barley, oats, chickpea, lentil, faba bean, field pea, vetch-oat forage, rapeseed, spring sunflower, potato (irrigated), cover crop, fallow | **Needs expert review** |
| `us-central-great-plains` | Semi-arid rainfed Great Plains, incl. Akron `[-106.0, 36.5, -97.0, 43.5]` | winter wheat, proso millet, dryland corn, sunflower, field pea, winter triticale, fallow (the Akron long-term rotation set) | Needs expert review |
| `generic` | Everywhere else (fallback) | generic winter cereal, grain legume, oilseed, cover crop, fallow | Needs expert review; indicative only |

### Review status of the story pack

Nobody has reviewed `dz-high-plains` with a local agronomist yet. What is cited and what is not:

- **Cited, medium confidence:** crop coefficients (FAO-56 Table 12), stage lengths where an FAO row fits (Table 11), rooting depth and depletion fraction p (Table 22, range midpoints), cereal sowing months (FAO GIEWS Algeria crop calendar).
- **Adapted, low confidence:** stage lengths without an FAO row (chickpea, faba bean, field pea, vetch-oat, rapeseed, cover crop) and proxies for crops FAO-56 does not list (vetch, cover crops, triticale).
- **Team estimates, low confidence:** all temperature limits, frost and heat thresholds by stage, nitrogen credit, residue and root index, cover months, forage value, market flag, non-cereal sowing windows and every pest persistence and break interval. Each is marked `source: team_estimate`. A local agronomist must review them before any advice is based on them.

The Kc initial values are the FAO-56 group values for cereals, legumes and oil crops; winter wheat uses the frozen-soil value 0.4. The end Kc of crops with an FAO range is the midpoint.

### GAEZ suitability evidence (story pack v1.1.0)

Every story entry has `gaez_suitability`: `status: available` with an integer
`value` class, or `status: not_available` with `value: null` and an explanation
in `note`. Other packs may omit it. The validator requires complete story coverage,
checks citations, and rejects missing classes, inconsistent availability and a
crop class attached to fallow.

The source is **FAO and IIASA, GAEZ v5 (2025)**,
[RES05-SIX30AS, all-land crop suitability classes](https://data.fao.org/catalog/dataset/94c469f7-3352-457e-8025-9bae98982109),
licensed **CC BY 4.0**, accessed 2026-11-14. Conditions are rainfed, low input
(`LRLM`), historical AgERA5 climate for **2001–2020**, at **30 arc-seconds**
(approximately 1 km). Low input is a declared comparison scenario, not a statement
about the farmer's management and not a management recommendation.

The extraction uses the actual `setif-story` field centroid
**[5.7295 E, 36.11965 N]**, not Sétif city. It reads band 1 of the native raster
cell containing that point, without interpolation or aggregation. The native
zero-based row/column are **6465 / 22287**; its centre is approximately
**[5.7291667 E, 36.1208333 N]**. These are regional model results, not measurements
of the field and not ratings for the entire pack bounding box.

| Story entry | GAEZ crop | Class |
|---|---|---|
| Durum wheat, bread wheat | WHE (generic wheat proxy) | 4 — Medium |
| Barley | BRL | 5 — Moderate |
| Oats | OAT | 4 — Medium |
| Chickpea | CHK | 6 — Marginal |
| Field pea | PEA (dry pea) | 6 — Marginal |
| Rapeseed | RSD | 6 — Marginal |
| Spring sunflower | SFL (generic sunflower proxy) | 6 — Marginal |
| Irrigated potato | WPO (white potato, **rainfed comparison only**) | 6 — Marginal |
| Lentil, faba bean | No matching crop in the published layer dimensions | Not available |
| Vetch–oat forage, cover crop, fallow | No single matching cultivated crop | Not available |

Class codes follow the catalog legend: 1 very high, 2 high, 3 good, 4 medium,
5 moderate, 6 marginal, 7 very marginal, 8 not suitable. **0 is nodata and 9 is
water**; neither is a crop suitability class. Missing data never becomes class 8.
All story entries carry low confidence because the grid is coarse relative to a
field and crop mappings and local management need review. The generic wheat
layer does not distinguish durum from bread wheat. The potato entry explicitly
does not assess irrigated suitability.

Consumers can cite `crop.gaez_suitability` through `loadPack`: resolve `source`
against `pack.sources`, and retain `version`, `layer`, `period`,
`resolution_arc_seconds`, `location`, conditions and `note` with the class.
**Use only as evidence, information gaps and risks needing local review. Never
filter candidates or alter scores based on GAEZ**, including a marginal or
not-suitable class. Candidate generation is unchanged by this pack addition.
Evidence-card copy belongs in the app's English copy file.

[Offline extraction fixture](test/fixtures/gaez-setif.json) records the eight
raster samples and their URLs. The fixture was captured using Rasterio 1.5.2;
to reproduce a sample with the science-api environment, open its `url`, obtain
`row, col = dataset.index(5.7295, 36.11965)`, and read
`dataset.read(1, window=Window(col, row, 1, 1))`. Use
`GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR` for remote reads.
[FAO's platform guide](https://github.com/un-fao/gaezv5/wiki/21.-GAEZ-v5-Platform-User-Guide)
documents the file names; the catalog's dimensions JSON documents crop mappings.
Tests compare the shipped entries with this fixture and never access the network.
GAEZ v4 was evaluated but excluded because its suitability layer is CC BY-NC-SA 4.0,
which conflicts with the challenge's unrestricted-use requirement.

### Sources

- Allen, Pereira, Raes, Smith (1998). [FAO Irrigation and Drainage Paper 56](https://www.fao.org/4/x0490e/x0490e00.htm): Tables 11, 12 and 22.
- [FAO GIEWS country brief, Algeria](https://www.fao.org/giews/countrybrief/country.jsp?code=DZA): crop calendar.
- USDA NASS (1997). [Usual Planting and Harvesting Dates for U.S. Field Crops](https://esmis.nal.usda.gov/concern/publications/vm40xr56k), Agricultural Handbook 628.
- USDA ARS AgResearch (2011). [Rotations at Akron, Colorado](https://agresearchmag.ars.usda.gov/2011/jan/rotations).
- UNL Extension EC137 (2008). [Proso millet production guide](https://extensionpubs.unl.edu/publication/ec137/2008/html/view): 60 to 90 days to seed.
- USDA ARS. [Planting date effect on no-till proso millet](https://www.ars.usda.gov/ARSUserFiles/30100500/Publications%201999-1990/47%20Planting%20Date%20Effect%20on%20No-Till%20Proso%20Millet.pdf) (Akron).

Each pack lists the exact citations it uses under `sources`; every value points at one of them.

## Pack format

`packs/<id>.yaml`, schema `knowledge-pack/1.0` in [`src/schema.ts`](src/schema.ts). Every numeric value is `{ value, source, confidence, note? }`, where `source` names an entry of the pack's `sources` and `confidence` is `high`, `medium` or `low`. Besides the JSON Schema, the validator ([`src/validate.ts`](src/validate.ts)) checks that sources exist and are used, ids are unique, stage lengths add up to the season length, `t_base < t_opt < t_max`, pest hosts exist, and there is exactly one `fallow` entry.

Crops carry: family, Kc ini/mid/end, stage lengths, rooting depth (initial and maximum), depletion fraction p, base/optimal/max temperature, frost and heat thresholds by stage, sowing window, season length, N credit, residue/root index, cover months, forage value and market flag. Pests carry host families and crops, weather driver, soil persistence and minimum break interval. The calendar has the agricultural-year start month, generic autumn and spring sowing windows and the bare-NDVI threshold.

## Adding or editing a pack

1. Edit or add `packs/<id>.yaml` (the file name is the pack id; mark anything uncertain `confidence: low`).
2. Run `pnpm --filter @itza/knowledge build:packs`. It validates every pack and writes `src/generated/` (types and the pack registry). Commit the generated files.
3. `pnpm --filter @itza/knowledge test` fails when the generated files are stale or a pack is invalid.
4. Keep regional bounding boxes disjoint (a test checks it).

The app imports the generated objects, so it needs neither a YAML parser nor the validator.
