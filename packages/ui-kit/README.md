# @itza/ui-kit

Shared accessible React components and the A2UI answer catalog (schemas, examples, fallback layouts).

Owned by workstream F,L in [MVP_SCOPE.md §3](../../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents). Design: [TECHNICAL_ARCHITECTURE.md §10.2](../../docs/TECHNICAL_ARCHITECTURE.md#102-generative-ui-design).

Internal package: consumers import TypeScript source directly (`exports` points at `src/index.ts`); the app bundler compiles it.

## Answer catalog

`catalog/` holds the A2UI answer catalog `app-catalog/v1`: JSON Schemas, one example surface per component, fallback layouts per intent class, the action allow-list and the validators (schema, layout, plain text, grounding). It is plain TypeScript, imported as `@itza/ui-kit/catalog` by the web app and the SI gateway. Contract: [TECHNICAL_ARCHITECTURE.md §10.6](../../docs/TECHNICAL_ARCHITECTURE.md#106-answer-catalog-contract-packagesui-kitcatalog). Tests: `pnpm --filter @itza/ui-kit test`.
