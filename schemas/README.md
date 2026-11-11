# Shared JSON Schemas

Source of truth for cross-language contracts: Field Data Bundle, Engine Input/Output, Evidence Card and Assistant Tool I/O (the Knowledge Pack schema is owned by the knowledge workstream). TypeScript and Python types are generated from these files. Owned by workstream A ([MVP_SCOPE.md §3](../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents)).

| Schema | Purpose |
|---|---|
| `provenance` | Source, product, version, resolution, period, quality, derived-from (C-2) |
| `canonical-series` | One canonical variable series; provenance is mandatory |
| `field-bundle` | Field Data Bundle (`field-bundle/1.0`, TECHNICAL_ARCHITECTURE §5.3) |
| `engine-input` / `engine-output` | Rotation, soil, priorities, constraints, scenario, seed; scores, resilience, Monte Carlo bands |
| `evidence-card` | F-08 card; every mandatory field and an evidence source are required |
| `assistant-tools` | Input and output of the assistant tools (§10.3) |

`projection.schema.json` is generated from the Pydantic model of `/v1/projection` and is not part of this set.

## Conventions

- JSON Schema draft 2020-12. `$id` is `https://schemas.itza.space/<name>.schema.json`; files refer to each other by relative file name (`"$ref": "provenance.schema.json"`).
- The version lives in the annotation keyword `x-schema-version` (and in the `schema` constant of the bundle, `field-bundle/1.0`).
- Objects use `additionalProperties: false`. Every schema carries `examples` that the tests validate.

## Generated code

`pnpm schemas:generate` writes:

- `packages/engine/src/contracts/types.generated.ts` (json-schema-to-typescript)
- `services/science-api/src/itza_science/contracts/` (datamodel-code-generator, Pydantic v2)

Commit the output. `pnpm schemas:check` (part of `pnpm check` and CI) fails when the committed files are stale. Validate in TypeScript with `validate(schemaId, data)` from `@itza/engine/contracts`, and in Python with the generated models.

## Change rules

- Before the contract freeze (gate G0), edit freely and regenerate.
- After the freeze, a breaking change (removed or renamed field, tighter constraint, new required field) needs a version bump (`x-schema-version`, and `field-bundle/1.1` style constants) and a migration note below. Additive optional fields do not need a bump.
- Never edit generated files by hand.

## Migration notes

None yet. Current version: `1.0` for every schema.
