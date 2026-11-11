# @itza/adapters-browser

Browser data adapters for NASA POWER, ORNL MODIS and CMR that return canonical series with provenance.

Owned by workstream C in [MVP_SCOPE.md §3](../../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents). Design: [TECHNICAL_ARCHITECTURE.md §5](../../docs/TECHNICAL_ARCHITECTURE.md#5-data-layer).

Internal package: consumers import TypeScript source directly (`exports` points at `src/index.ts`); the app bundler compiles it.
