# Shared JSON Schemas

Source of truth for cross-language contracts: Field Data Bundle, Knowledge Pack, Engine Input/Output, Evidence Card and Assistant Tool I/O. TypeScript and Python types are generated from these files. Owned by workstream A ([MVP_SCOPE.md §3](../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents)); after the contract freeze, changes need a version bump and a migration note.

## Files

| File | Contract | Spec |
|---|---|---|
| `common.schema.json` | Shared defs: period, confidence level, criteria, soil value | C-2, F-05 |
| `provenance.schema.json` | Where a number came from | C-2 |
| `canonical-series.schema.json` | Time series in the canonical variable vocabulary | TECHNICAL_ARCHITECTURE §5.3 |
| `field-bundle.schema.json` | Field Data Bundle (`field-bundle/1.0`) | §5.3 |
| `engine-input.schema.json` / `engine-output.schema.json` | Rotations, soil, priorities, constraints, scenario, seed; replay results | F-05 to F-09 |
| `evidence-card.schema.json` | Evidence card | F-08 |
| `assistant-tools.schema.json` | Browser-side assistant tool input and output | §10.3 |

All files use JSON Schema draft 2020-12, an absolute `$id` under `https://itza.app/schemas/`, and an `x-version` such as `field-bundle/1.0`. Data documents repeat the version in their `schema` field.

## Generated code

```bash
pnpm schemas:generate   # TypeScript -> packages/engine/src/contracts, Pydantic -> services/science-api/src/itza_science/contracts
pnpm schemas:check      # regenerates and fails if generated files differ (runs in CI)
```

Never edit generated files by hand. Validate in TypeScript with `validate(schemaId, data)` from `@itza/engine/contracts`; in Python use the generated Pydantic models. Synthetic fixtures live in `fixtures/synthetic/`.

## Change rules

- Before the freeze (gate G0) fix schemas in place.
- After the freeze, every change bumps the version in `x-version`, the `$id`-matching `schema` const, and adds a migration note below. Additive optional fields are a minor bump; anything else is a major bump.
- All consumers update in the same PR, and `pnpm schemas:generate` output is committed with it.

## Migration notes

None yet (initial version 1.0).
