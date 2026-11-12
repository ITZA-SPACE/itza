# @itza/engine

Pure TypeScript simulation engine: ET0, water balance, thermal, pests, scoring, resilience, Monte Carlo, scenarios, candidates and evidence. No DOM dependencies; runs in a Web Worker and in Node.

Owned by workstream B in [MVP_SCOPE.md §3](../../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents). Design: [TECHNICAL_ARCHITECTURE.md §6](../../docs/TECHNICAL_ARCHITECTURE.md#6-simulation-engine).

Internal package: consumers import TypeScript source directly (`exports` points at `src/index.ts`); the app bundler compiles it.

## Modules

| Import | What |
|---|---|
| `@itza/engine/contracts` | Generated types and `validate(schemaId, data)` |
| `@itza/engine/physics` | `et0Daily`, crop calendar and Kc (`kcAt`, `stageAt`, `rootDepthAt`), `soilParams`, `stepWaterBalance`, `simulateTimeline`, `thermalStress`, `buildDailyForcing` |
| `@itza/engine/climate` | `climateFingerprint(bundle, { yearStartMonth })`: indicators per season and month, worst seasons |
| `@itza/engine/replay` | `simulateReplay({ bundle, input })` replays rotations through every usable season with Monte Carlo draws; `scoreReplay(run, priorities)` scores, ranks and bands them (re-scoring needs no simulation) |
| `@itza/engine/decisions` | `generateCandidates` and `explainExclusion`; `applyScenario`, `sliderScenario`, `presetScenario`, `robustness`; `parseProjection`, `projectionShifts`; `confidenceFor`; `buildEvidenceCards` |
| `@itza/engine/memory` | `analyseFieldMemory({ series, calendar, crops, reference })` turns HLS and MODIS NDVI into seasons (green-up, peak, senescence, bare windows), labels (`winter_crop`, `summer_crop`, `double_crop`, `fallow_or_bare`, `uncertain`), a month × year bare matrix, an inferred rotation and structured insights; `phenology` is the bundle member. `crops` maps each class to the pack's typical crop id (`{ winter_crop: "durum_wheat" }`), so `inferred.crop` and `rotation.crops` are pack ids (fallow is `fallow`; an unmapped class keeps its class name). `fieldAverage` weights pixels by field overlap. Seasons need 60 % valid grid points; a bare window straddling the agricultural-year start is split in two |
| `@itza/engine/worker` | Message protocol, `createReplayHandler`, and `createReplayClient(worker)` with `runReplay`, `rescore`, `compare`, `reweigh`, `timeline` and `whyNot`; the worker script is `@itza/engine/worker/entry` |

Run the performance budgets (not part of `pnpm test`, because coverage instrumentation distorts timing) with `pnpm --filter @itza/engine bench`.

All functions are pure (no DOM, wall clock or locale). Crop parameters come from `@itza/knowledge`. Equations and assumptions: [TECHNICAL_ARCHITECTURE.md §6.2](../../docs/TECHNICAL_ARCHITECTURE.md#62-core-equations).
