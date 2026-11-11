# Test fixtures

Raw API responses and clipped rasters captured for tests. Tests never call the network; they read from here. Owned by workstream A.

## `synthetic/`

Hand-made, deterministic Field Data Bundles (`field-bundle/1.0`). They are **synthetic**: values come from simple seasonal formulas, carry `"synthetic": true` and `source: synthetic` for soil, and must never be shown as real data. Real hero bundles come from the bundle service.

| File | Site | Seasons |
|---|---|---|
| `semiarid-winter-cereal.bundle.json` | Semi-arid highland, winter cereal every year (Setif-like) | 2021, 2022, 2023 |
| `fallow-heavy.bundle.json` | Great Plains wheat-fallow site | 2021 crop, 2022 fallow, 2023 crop |

Both validate against `schemas/field-bundle.schema.json` (checked by the Ajv tests in `packages/engine` and the Pydantic tests in `services/science-api`).
