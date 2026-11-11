# ITZA

**See Earth Through Time.** ITZA reads a field's history from NASA satellite data, replays every real past season (and plausible 2050 seasons) on candidate crop rotations, and shows which rotation would have held up best and why. NASA Space Apps Challenge 2026, "Field Shift: Adapting Farms with NASA Data".

Product: [PRD.md](PRD.md) · Architecture: [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) · Build plan: [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md)

## Repository

```
apps/web                  React web app (Vite, TanStack Router + Query, Tailwind)
packages/engine           Pure TypeScript simulation engine
packages/adapters-browser NASA POWER / ORNL MODIS / CMR browser adapters
packages/knowledge        Region knowledge packs
packages/ui-kit           Shared components + generative UI catalog
services/science-api      Data & Science API (Python, FastAPI, uv)
services/si-gateway       Assistant gateway (Cloudflare Worker)
schemas/ fixtures/        Shared contracts and test data
pipelines/                Batch jobs (bundles, ML, NVIDIA Brev)
infra/                    VPS Docker Compose + Cloudflare Tunnel
docs/                     Product and technical documentation
```

pnpm workspaces + Turborepo orchestrate every package, including the Python service (through its `package.json` scripts that call uv).

## Prerequisites

- Node.js 26 (`.nvmrc`) and pnpm 12 (`corepack enable` picks the version from `package.json`)
- uv 0.13+ (installs Python 3.13 automatically)
- Docker (optional, for the VPS stack)

## Setup

```bash
pnpm install
(cd services/science-api && uv sync)
cp apps/web/.env.example apps/web/.env.local
cp services/science-api/.env.example services/science-api/.env
cp services/si-gateway/.dev.vars.example services/si-gateway/.dev.vars
```

## Development

```bash
pnpm dev
```

Starts all services: web app on http://localhost:5180, science API on http://localhost:8100 (docs at `/docs`), gateway on http://localhost:8790. Service status: http://localhost:5180/diagnostics.

| Command | Does |
|---|---|
| `pnpm dev` | Run all services with reload |
| `pnpm build` | Build every package |
| `pnpm test` | Backend unit + integration tests (coverage gate 90%) |
| `pnpm lint` | Biome (TS) and Ruff (Python) |
| `pnpm format` / `pnpm format:check` | Format / check formatting |
| `pnpm typecheck` | `tsc` and mypy (strict) |
| `pnpm check` | Lint, format check, typecheck and tests: the CI gate |
| `pnpm clean` | Remove build output and dependencies |
| `pnpm docker:up` / `pnpm docker:down` | Run the production science-api container locally |

## Workflow

- `main` is production; `dev` is integration and stays in sync with `main`.
- Branch from `dev` as `<type>/<issue>-<slug>`; open PRs against `dev`.
- One-line [Conventional Commits](https://www.conventionalcommits.org/).
- CI (GitHub Actions) runs backend tests, lint, types, builds and a Docker build on every PR to `dev` or `main`. Pushing `main` publishes `ghcr.io/itza-space/itza/science-api`.

## Coding agents

[AGENTS.md](AGENTS.md) holds the shared instructions for every coding agent; `CLAUDE.md` imports it. Skills live in `.agents/skills/` (`.claude/skills` links there), locked in `skills-lock.json`. Workflows: `/implement-issue <n>` and `/review-pr <n>`.
