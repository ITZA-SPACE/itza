# @itza/adapters-browser

Browser data adapters for NASA POWER, ORNL DAAC MODIS, CMR and SoilGrids. Series adapters return canonical series (schema: `schemas/canonical-series.schema.json`) with full provenance taken from the manifest; they never throw on partial data, timeouts or HTTP failures and return gap records instead.

Owned by workstream C in [MVP_SCOPE.md §3](../../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents). Design: [TECHNICAL_ARCHITECTURE.md §5](../../docs/TECHNICAL_ARCHITECTURE.md#5-data-layer).

| Adapter | Source | Returns |
|---|---|---|
| `PowerDailyAdapter`, `PowerClimatologyAdapter` | NASA POWER | tmax, tmin, tmean, rh, wind2m, srad, precip, et_actual (proxy), sm_rootzone (proxy) |
| `Mod13q1Adapter` | ORNL MODIS MOD13Q1 | ndvi, quality-masked, 16-day |
| `Mod16a2gfAdapter` | ORNL MODIS MOD16A2GF | et_actual, daily mm/day |
| `Mcd12q2Adapter` | ORNL MODIS MCD12Q2 | phenology dates per year (`fetchPhenology`) |
| `CmrAdapter` | NASA CMR | collection and granule availability (`collection`, `granules`) |
| `SoilGridsAdapter` | SoilGrids v2 | root-zone soil properties with source and confidence (`fetchSoil`), regional default fallback |

```ts
import { loadRegistry, HttpClient } from "@itza/adapters-browser";
import manifestText from "../../../data-sources.yaml?raw"; // Vite loads the file as text

const registry = loadRegistry(manifestText, { http: new HttpClient() });
for (const adapter of registry.seriesFor("precip")) {
  const { series, gaps } = await adapter.fetch({ lat, lon, period, variables: ["precip"] }, signal);
}
```

The registry is built from `data-sources.yaml`: each browser source needs an adapter class (the build throws otherwise), server sources are exposed as metadata only. Tests read recorded responses from `fixtures/adapters/` and never use the network (`pnpm --filter @itza/adapters-browser test`).

Internal package: consumers import TypeScript source directly (`exports` points at `src/index.ts`); the app bundler compiles it.
