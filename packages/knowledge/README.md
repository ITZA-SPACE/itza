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
