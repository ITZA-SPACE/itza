# ITZA: agent instructions

ITZA is a "flight simulator for crop rotations": it reads a field's history from NASA satellite data, replays every real past season (and plausible 2050 seasons) on candidate rotations, and shows which rotation would have held up best and why. Built for NASA Space Apps 2026, challenge "Field Shift".

This file is the single source of instructions for every coding agent (Claude Code reads it through `CLAUDE.md`). Skills live in `.agents/skills/` (`.claude/skills` is a symlink to it).

## Source of truth

Read before designing anything; never invent requirements.

- `PRD.md`: goals, functional (FR-xx) and non-functional (NFR-xx) requirements, constraints.
- `docs/FEATURES.md`: feature specs (F-xx) with acceptance criteria.
- `docs/TECHNICAL_ARCHITECTURE.md`: stack, contracts, engine equations, service API, ADRs.
- `docs/MVP_SCOPE.md`: tiers T0/T1/T2, workstreams and their owned paths, definition of done.
- `docs/NASA_DATA_SOURCES.md`: datasets, access, verification status.

Hard constraints: English-only UI (all copy in `apps/web/src/copy/en.json`); free services with no credit card; every number carries provenance; no fertilizer, pesticide or irrigation prescriptions.

## Repository map

| Path | What | Stack |
|---|---|---|
| `apps/web` | React SPA: map, replay, cards, 3D twin, assistant | React 19, Vite 8, TanStack Router + Query, Tailwind 4 |
| `packages/engine` | Pure simulation engine (Web Worker + Node) | TypeScript, no DOM |
| `packages/adapters-browser` | NASA POWER / ORNL MODIS / CMR adapters | TypeScript |
| `packages/knowledge` | Region knowledge packs + validator | TypeScript, YAML |
| `packages/ui-kit` | Accessible components + A2UI answer catalog | React |
| `services/science-api` | Data & Science API (NASA auth, bundles, zones, ML) | Python 3.13, FastAPI, uv |
| `services/si-gateway` | LLM proxy, MCP client, A2UI validation | Cloudflare Worker |
| `schemas/`, `fixtures/` | Shared JSON Schemas; captured test data | JSON |
| `pipelines/` | Batch jobs (bundles, ML, Brev) | Python |
| `infra/` | VPS Docker Compose, Cloudflare Tunnel | Docker |

Workstream boundaries (MVP_SCOPE §3) are real: change files outside your issue's paths only when the issue says so. Cross-cutting contract changes go through `schemas/`.

## Commands

Run from the repository root (Node 26, pnpm 12, uv 0.13+).

| Task | Command |
|---|---|
| Install | `pnpm install && (cd services/science-api && uv sync)` |
| Start everything (web :5180, science-api :8100, gateway :8790) | `pnpm dev` |
| All checks (what CI runs) | `pnpm check` |
| Lint / format / types / tests / build | `pnpm lint` · `pnpm format` · `pnpm typecheck` · `pnpm test` · `pnpm build` |
| One package | `pnpm --filter @itza/<name> <script>` |
| Backend tests only | `pnpm --filter @itza/science-api test` · `pnpm --filter @itza/si-gateway test` |
| VPS stack locally | `pnpm docker:up` / `pnpm docker:down` |

## Engineering rules

- **Testing.** Backend (`services/*`): unit and integration tests are mandatory for every change; coverage gate is 90%. Python tests use markers `unit` / `integration`. Frontend: no mandatory tests; verify manually. Tests never call the network: use `fixtures/`.
- **Tooling wins over skill defaults.** Python: uv, Ruff, mypy (strict), pytest. TypeScript: Biome, `tsc` (strict). Do not add ty, ESLint, Prettier or another runner.
- **Types.** Strict everywhere. Validate every external input at the boundary (Pydantic in Python; typed parsing in TS).
- **Simplicity.** No speculative abstractions, no new dependency without a clear need, no placeholder implementations.
- **Security.** Secrets only in `services/` env files or Wrangler secrets; never in the client bundle or the repo. Keep `.env.example` files current.
- **Docs.** When behavior or a contract changes, update the matching file in `docs/`. Never delete or rewrite docs you do not understand.

## Git workflow

- `main` = production. `dev` = integration: always `main` plus the implementations stacked on top. Never commit features directly to either. The `sync-dev` workflow merges every push to `main` into `dev`; if it fails (conflict), merge `main` into `dev` by hand before anything else.
- Assign yourself to an issue (`gh issue edit <n> --add-assignee @me`) when you start it; `/implement-issue` does this.
- Branch from `dev`: `<type>/<issue-number>-<short-slug>` (e.g., `feat/12-power-adapter`). PRs target `dev`.
- Conventional Commits, one line, imperative, lower case: `feat(engine): add fao-56 et0`. Types: feat, fix, refactor, perf, test, docs, build, ci, chore.
- No co-author trailers and no mention of AI tools in commits, PR titles, PR bodies or project metadata.
- Release: PR from `dev` to `main`; pushing `main` publishes the science-api image.

## Workflows (skills)

- `/implement-issue <n>`: issue to PR on `dev`.
- `/review-pr <n>`: review, fix, then merge only after the user confirms CI is green.

Installed skills (`skills-lock.json`): `fastapi`, `modern-python`, `property-based-testing`, `differential-review`, `vercel-react-best-practices`, `web-design-guidelines`, `workers-best-practices`, `wrangler`, `brev-cli`. Restore with `npx skills experimental_install`.
