<p align="center">
  <img src="docs/assets/banner.jpg" alt="ITZA written in dots above the glowing edge of the Earth seen from space" width="100%" />
</p>

# ITZA

**See Earth Through Time.** ITZA reads a field's history from NASA satellite data, replays every real past season (and plausible 2050 seasons) on candidate crop rotations, and shows which rotation would have held up best and why. NASA Space Apps Challenge 2026, "Field Shift: Adapting Farms with NASA Data".

Product: [PRD.md](PRD.md) · Architecture: [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) · Build plan: [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md)

## Design system: Night Earth

The look of ITZA comes from the banner above: a dot-matrix wordmark over the glowing edge of the Earth at night. The interface is the same scene, kept calm and readable for a farmer on a phone. Every value lives in [`packages/ui-kit/src/tokens.css`](packages/ui-kit/src/tokens.css) and the web app imports it; never hard-code a colour or size.

| Idea | How it shows up |
|---|---|
| **Deep space surfaces** | `night` `#050b18` is the page, `surface` `#070e3a` and translucent `panel` sit on top, `void` `#06060b` for the darkest edges. |
| **Atmosphere glow** | `rain` `#7fd0ff` and `space` `#2f7bff` are the accent: the blue rim of the Earth. Glows (`shadow-glow`) are soft and used only on the one thing to act on. |
| **Land and growth** | `leaf` `#79ffae` and `forest` `#00a14a` mean the field, the outline and good results; `sun` `#ffc857` is the focus ring and warnings; `harvest` `#e3b861` is crops. |
| **Glass material** | Cards are translucent glass: a 1 px light rim (`rim-card`), a specular inner edge (`shadow-glass-card`) and rounded corners (`control` 0.875 rem, `panel` 1.25 rem, `card` 1.5 rem). |
| **Plain, large type** | DM Sans for text and controls, Familjen Grotesk for titles and big numbers; body 16 px, captions never below 13 px. |
| **Honest data colour** | Categorical colours are colour-blind safe (`cat-1` to `cat-8`), and a blue-to-orange diverging ramp (`div-*`) is used for anomalies. Good, warning and risk each have a soft background and a readable ink colour. |

Rules: dark theme only; text contrast at least 4.5:1 on its surface; every control reachable by keyboard with the `sun` focus ring; motion respects `prefers-reduced-motion`; every number carries its source. Shared components live in [`packages/ui-kit`](packages/ui-kit); the web app only composes them.

## Search and sharing

[`apps/web/index.html`](apps/web/index.html) carries the title, description, canonical URL, Open Graph and Twitter card tags and `WebApplication` structured data for `https://itza.microclub.info`. The share image is [`apps/web/public/og.jpg`](apps/web/public/og.jpg) (1200 x 630), cut from the banner. `robots.txt` and `sitemap.xml` are in `apps/web/public/`. Each page also sets its own title, description and canonical URL from `apps/web/src/copy/en/seo.json` (`apps/web/src/app/PageMeta.tsx`). The web server (`apps/web/nginx.conf`) answers missing files with a real 404, so link previews never receive the app page instead of the share image. Change the domain in `index.html`, `robots.txt`, `sitemap.xml` and `PageMeta.tsx` together.

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
- CI (GitHub Actions) runs backend tests, lint, types, builds and a Docker build on every PR to `dev` or `main`. Pushing `main` builds the science-api and web images and deploys both to Google Cloud Run (see [infra/README.md](infra/README.md)).

## Coding agents

[AGENTS.md](AGENTS.md) holds the shared instructions for every coding agent; `CLAUDE.md` imports it. Skills live in `.agents/skills/` (`.claude/skills` links there), locked in `skills-lock.json`. Workflows: `/implement-issue <n>` and `/review-pr <n>`.
