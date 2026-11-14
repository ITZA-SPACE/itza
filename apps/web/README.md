# ITZA web app

React + TypeScript + Vite single-page app. Routing: TanStack Router with file-based routes. Server state: TanStack Query. Client state: Zustand. Map: MapLibre GL JS with Terra Draw and Turf. Styling: Tailwind CSS v4 with the `@itza/ui-kit` tokens. All user-facing text lives in `src/copy/en/*.json` and is read with `t(key)`.

| Path | Purpose |
|---|---|
| `src/app/` | Root layout, workspace shell (side panel and bottom sheet), flow navigation, page components |
| `src/routes/` | One file per route (file-based) |
| `src/map/` | Map, basemaps, place search, field drawing and geometry |
| `src/state/` | The field store: outline, history, inputs, priorities, scenario, ground truth |
| `src/copy/en/` | English copy, one JSON file per feature |
| `src/lib/` | Config and small shared helpers |

Feature folders from [MVP_SCOPE.md §3](../../docs/MVP_SCOPE.md#3-workstreams-for-parallel-agents) (`memory/`, `climate/`, `compare/`, `twin/`, `builder/`, `future/`, `assistant/`, `arena/`, `zones/`, `report/`, `demo/`, `data/`) are added under `src/` as each feature lands.

## Adding a route without editing a shared file

Routes are files under `src/routes/`; the route tree is generated.

- A page at its own URL: create `src/routes/<name>.tsx` with `export const Route = createFileRoute("/<name>")({ component })`.
- A step of the farmer's flow beside the map (it keeps the map mounted): create `src/routes/_workspace/<name>.tsx` with path `/_workspace/<name>`. The existing steps `field`, `history`, `inputs` and `compare` are there; a feature replaces the component of its own file (`<FlowStepPage step="history">…</FlowStepPage>` keeps the step navigation).
- Put the component in your feature folder (`src/<feature>/`), not in `src/routes/`: every file in `routes/` is a route.

`src/routeTree.gen.ts` and `src/copy/generated/keys.ts` are generated and not committed. `pnpm dev` and `pnpm build` produce them; `pnpm typecheck` runs `pnpm gen` first.

## Adding copy without editing a shared file

Create `src/copy/en/<feature>.json` with flat keys (`"feature.title": "…"`). `t("feature.title")` is typed from all the files; a key defined in two files fails the build.

## Field store

`useFieldStore` (`src/state/`) holds the selected field and everything the farmer enters for it. It is serializable (`snapshotOf`, `parseSnapshot`, the format for share links), saved per field in the browser a moment after each change and restored on reload (`restoreLast`, `startAutosave`). Components subscribe with narrow selectors (`useFieldStore((s) => s.field?.geometry)`).

- `selectField(field)` starts a different field with clean work (saved work for the same outline comes back once its `sha256:` id is computed); `updateField(field)` reshapes the selected outline and keeps its work.
- `onFieldChange(listener)` fires when the outline changes. Bundle loading hooks in here.

## Map

`MapView` is loaded with the workspace only (it is the heaviest code). Basemaps: OpenFreeMap vector style and EOX Sentinel-2 cloudless imagery (CC BY-NC-SA, attribution shown on the map). Place search uses Photon (no key), debounced to 600 ms with at least 3 characters, cached and aborted when the text changes, to respect its fair-use policy. Drawing uses Terra Draw: polygon, a point that becomes a 200 m square, and select to edit. Area, centre and perimeter come from Turf and update while a corner is dragged.

The map's tile worker is registered through Vite (`src/map/worker.ts`); MapLibre 6 cannot find it by itself once bundled.

| Task | Command |
|---|---|
| Dev server (port 5180) | `pnpm dev` |
| Production build | `pnpm build` |
| Generate route tree and copy keys | `pnpm gen` |
| Type check | `pnpm typecheck` |

Config: copy `.env.example` to `.env.local`. `/diagnostics` shows live status of the science API and the gateway.
