# @itza/engine

Pure TypeScript simulation engine: ET0, water balance, thermal, pests, scoring, resilience, Monte Carlo, scenarios, candidates and evidence. No DOM dependencies; runs in a Web Worker and in Node.

Owned by workstream B in [MVP_SCOPE.md §3](../../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents). Design: [TECHNICAL_ARCHITECTURE.md §6](../../docs/TECHNICAL_ARCHITECTURE.md#6-simulation-engine).

Internal package: consumers import TypeScript source directly (`exports` points at `src/index.ts`); the app bundler compiles it.
