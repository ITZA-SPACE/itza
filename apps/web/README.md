# ITZA web app

React + TypeScript + Vite single-page app. Routing: TanStack Router (code-based route tree in `src/app/router.tsx`). Server state: TanStack Query. Styling: Tailwind CSS v4. All user-facing text lives in `src/copy/en.json` and is read with `t(key)`.

| Path | Purpose |
|---|---|
| `src/app/` | Shell, layout, router (workstream E) |
| `src/copy/` | English UI copy (workstream F) |
| `src/lib/` | Config and small shared helpers |
| `src/routes/` | Route components |

Feature folders from [MVP_SCOPE.md §3](../../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents) (`map/`, `memory/`, `climate/`, `compare/`, `twin/`, `builder/`, `future/`, `assistant/`, `arena/`, `zones/`, `report/`, `demo/`, `data/`) are added under `src/` as each feature lands.

Config: copy `.env.example` to `.env.local`. `/diagnostics` shows live status of the science API and the gateway.

| Task | Command |
|---|---|
| Dev server (port 5180) | `pnpm dev` |
| Production build | `pnpm build` |
| Type check | `pnpm typecheck` |
