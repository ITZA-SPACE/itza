# Technical Architecture

System design, technology choices, data-adapter layer, simulation engine, ML, SI assistant, 3D rendering, deployment, security and testing.

Back to [PRD](../PRD.md). Data catalog: [NASA_DATA_SOURCES.md](NASA_DATA_SOURCES.md). Build plan: [MVP_SCOPE.md](MVP_SCOPE.md).

---

## 1. Architecture principles

1. **Browser-first engine.** The simulation engine runs client-side in a Web Worker: sliders re-rank instantly, the demo works offline, and server cost stays at zero.
2. **Contracts before code.** JSON Schemas define the Field Data Bundle, knowledge packs, engine inputs/outputs and evidence cards. Parallel agents build against schemas and fixtures.
3. **Adapters isolate data sources.** The engine sees canonical variables only. Adding or replacing a dataset is a manifest entry plus an adapter.
4. **Precompute what is slow, fetch what is cheap.** Authenticated, heavy rasters (HLS, NISAR, SMAP, IMERG, GRACE) are processed by Python and cached as bundles; light no-auth APIs (POWER, ORNL MODIS, CMR) are called directly from the browser (CORS verified).
5. **Provenance is data.** Source, version, resolution, period and quality travel with every value end to end.
6. **Grounded SI.** Language models route and phrase; tools compute. No tool, no number.
7. **Free by default.** Every core component runs on free tiers without a credit card; paid options are documented as optional.
8. **Boring where possible, novel where it shows.** Mainstream stack; novelty is in the product (replay, field memory, 2050, 3D, generative UI assistant).

## 2. System context

```
                         ┌───────────────────────────────┐
     Farmer / advisor ──▶│        Web app (browser)       │◀── Judge (guided demo)
       (mobile/desktop)  │ React UI · MapLibre/deck.gl    │
                         │ Engine Web Worker · IndexedDB  │
                         └──┬──────────┬───────────┬──────┘
          no-auth, CORS     │          │           │ HTTPS
   ┌────────────────────────▼─┐  ┌─────▼──────┐  ┌─▼───────────────────────┐
   │ NASA POWER (daily, clim., │  │ SI gateway │  │ Data & Science service  │
   │ projection) · ORNL MODIS  │  │ (serverless│  │ (Python, FastAPI)       │
   │ REST · CMR search · tiles │  │  worker)   │  │ earthaccess · rasterio  │
   └───────────────────────────┘  └──┬───┬─────┘  │ xarray · ML · TiTiler   │
                                     │   │        └──┬──────────┬───────────┘
                           LLM APIs ◀┘   └▶ NASA MCP │          │ Earthdata Login
                     (Gemini, Groq)     (POWER, CMR) │          ▼
                                                     │   NASA Earthdata Cloud / DAACs
                                                     │   (IMERG, SMAP, HLS, NISAR,
                                                     ▼    GRACE, GEDI, ECOSTRESS),
                                           Static bundle store  NEX-GDDP (AWS S3)
                                           (precomputed demo +
                                            cached fields)
```

## 3. Containers and responsibilities

| Container | Responsibility | Tech | Runs on |
|---|---|---|---|
| **Web app** | UI, map, 3D, charts, state, offline cache, guided demo | React + TypeScript + Vite | Cloudflare edge (static assets) |
| **Engine (`@itza/engine`)** | Pure functions: ET0, water balance, thermal, pest, N, cover, erosion, scoring, resilience, Monte Carlo, delta-change, candidate generation, evidence generation | TypeScript, no DOM deps | Web Worker (browser) and Node (tests, server-side render of PDFs if needed) |
| **Browser adapters** | Fetch POWER, ORNL MODIS, CMR metadata, tiles; normalize to canonical series | TypeScript | Browser |
| **Data & Science service** | Authenticated NASA access, raster clipping/aggregation, bundle building, zones, NISAR/HLS processing, projection fallback, ML inference, PDF rendering (optional) | Python 3.12+, FastAPI | Team VPS (Docker) behind Cloudflare Tunnel |
| **Pipelines** | Batch precompute demo bundles; ML training; fixture capture | Python scripts/notebooks (uv) | Developer machines, CI, NVIDIA Brev batch instances |
| **Tile service** | On-the-fly HLS/IMERG tiles for 3D/2D layers | TiTiler-CMR | Same container as service, or precomputed PNG frames |
| **SI gateway** | Hide API keys; proxy LLM; host MCP client to NASA POWER MCP and CMR MCP; validate generated UI surfaces against the catalog; rate-limit | TypeScript serverless (Cloudflare Workers) | Cloudflare edge (free plan) |
| **Bundle store** | Precomputed Field Data Bundles, frames, zone GeoJSON | Static files (Parquet/JSON/PNG) | Cloudflare static assets (hero fields); VPS for cached and large files |

## 4. Technology stack

Versions are the latest published on npm/PyPI on 2026-11-08; pin exact versions at repository creation.

### 4.1 Frontend

| Concern | Choice | Version | Why | Alternatives |
|---|---|---|---|---|
| Framework | **React** + **TypeScript** | react 19.3, TS 7.0 | Team familiarity, ecosystem, agents generate it well | Svelte, Vue |
| Build | **Vite** | 8.3 | Fast dev server, static output | Next.js (unnecessary SSR) |
| Routing / data fetching | TanStack Router + TanStack Query | 1.170 / 5.107 | Typed routes; caching, retries, progressive loading | React Router |
| State | **Zustand** | 5.1 | Small, simple global state (field, inputs, scenario) | Redux Toolkit |
| Styling / UI | **Tailwind CSS** + headless accessible primitives (Radix-based component kit) | 4.3 | Fast iteration, accessible primitives | CSS modules |
| Map | **MapLibre GL JS** | 6.17 | Open source, no token, 3D terrain, globe projection (since v5) | Mapbox GL (token, terms), Leaflet (no 3D) |
| 3D / analytics layers | **deck.gl** (interleaved with MapLibre) | 9.4 | TerrainLayer, BitmapLayer, GPU heatmaps; strong MapLibre pairing | CesiumJS 1.147 (heavier, globe/3D Tiles), three.js |
| Drawing | **Terra Draw** + MapLibre adapter | 1.39 / 1.5 | Maintained, multi-mode drawing, works with MapLibre | mapbox-gl-draw 1.5 |
| Geospatial utils | **Turf** | 7.4 | Area, centroid, buffers, intersections | — |
| Charts | **ECharts** | 6.1 | Large time series, animations, heat strips | Recharts 3.10 (simpler), Observable Plot |
| Drag and drop | **dnd-kit** (`@dnd-kit/react`) | 0.5 (core 6.3) | Accessible (keyboard/touch) DnD for the rotation builder | react-beautiful-dnd (unmaintained) |
| UI copy | One English strings file (`en.json`), plain typed lookup; no i18n library | — | English only; keeps a seam for post-event localization at zero cost | i18next (post-event, if localized) |
| SI client | **Vercel AI SDK** (`ai`, `@ai-sdk/react`) | 7.0 / 4.0 | Streaming chat, tool calling with client-side tool execution, typed tool parts for static generative UI, provider-agnostic | Direct REST |
| Generative UI | **A2UI** protocol v0.9.1 + `@a2ui/react` renderer with the app's own catalog (§10.2) | 0.15 | Declarative, catalog-restricted, streaming UI from the assistant; no model-written code | CopilotKit + AG-UI, json-render |
| Offline | IndexedDB (via idb-keyval) + service worker (vite PWA plugin) | — | Cache bundles; P2 installable PWA | — |
| PDF | Browser print stylesheet → PDF (P1); server-side WeasyPrint 70 if needed | — | Fonts and layout handled by browser | jsPDF |

Basemaps and terrain: OpenFreeMap vector style (no key), EOX Sentinel-2 cloudless imagery (attribution, non-commercial), AWS Terrain Tiles (Terrarium encoding, SRTM-derived, no key). All returned HTTP 200 on 2026-11-08.

### 4.2 Backend and science

| Concern | Choice | Version | Why |
|---|---|---|---|
| Runtime / packaging | Python 3.12+ with **uv** | — | Fast, reproducible environments |
| API | **FastAPI** + Uvicorn + Pydantic v2 | 0.162 / 0.54 / 2.14 | Typed, OpenAPI generated, team knows it (QFarm backend uses FastAPI) |
| NASA access | **earthaccess** | 0.19 | Official community library: Earthdata Login, CMR search, cloud/HTTPS download, streaming |
| SAR (NISAR) search | **asf_search** | 14.1 | ASF DAAC search/download |
| STAC | pystac-client | 0.9 | HLS via CMR-STAC |
| Rasters / arrays | **xarray**, **rioxarray**, **rasterio**, h5netcdf, zarr | 2026.9 / 0.24 / 1.5 / 1.8 / 3.4 | HDF5/NetCDF/COG handling, clipping, resampling |
| Vector | geopandas, shapely | 1.2 / 2.2 | Field geometry ops |
| Tabular | **Polars** (+ pandas 3 where libraries require) | 2.1 | Fast series aggregation |
| Local analytics store | **DuckDB** (spatial extension) | 2.0 | Query cached bundles/Parquet without a server DB |
| Tiles | **TiTiler-CMR** | 1.0.x | Dynamic HLS/IMERG tiles straight from CMR |
| ML | **LightGBM**, **SHAP**, scikit-learn | 4.7 / 0.54 / 1.9 | Explainable tabular stress model |
| Foundation model | **TerraTorch** + Prithvi-EO-2.0 (tiny-TL / 100M-TL) | 1.2 | NASA/IBM GeoFM fine-tuning and inference |
| Reference crop model (validation) | **AquaCrop-OSPy** (`aquacrop`) | 3.1 | Cross-check water-balance behavior |
| SI agent (server-side option) | **pydantic-ai** with MCP client | 2.66 | If agent logic moves server-side |

No relational database is needed for the hackathon: bundles are immutable files keyed by hash; user edits live in the browser and in share links. A hosted DB is a post-event option.

### 4.3 SI services (all optional, with fallbacks)

| Capability | Default (free, no card) | Fallback | Paid option (not required) |
|---|---|---|---|
| LLM with tool calling and structured output (A2UI surfaces) | Gemini API free tier (Google AI Studio key; limits shown per project in AI Studio) | Groq free tier (Llama/Qwen models), or template intents with predefined layouts | Claude, GPT, Gemini paid tiers |
| NASA data tools | NASA POWER MCP (no key), NASA CMR MCP (no key) | Direct REST via engine tools | — |

Free-tier limits change frequently (reported Gemini free-tier reductions in Dec 2025 and 2026); the gateway enforces per-session budgets and falls back automatically.

### 4.4 Hosting and compute

**Split:** NVIDIA Brev for batch jobs, the team VPS for serving, Cloudflare for static files and the edge. Each place does the job it is best at, and none of them is a single point of failure for the demo.

```
 Browser ──HTTPS──▶ Cloudflare edge (team domain, free plan)
                     ├─ app.<domain>  Workers Static Assets: web app + hero-field bundles
                     ├─ si.<domain>   Worker: SI gateway (LLM proxy, MCP client, UI validation)
                     └─ api.<domain>  Cloudflare Tunnel ──▶ team VPS (no open inbound ports)
                                                            └─ Docker Compose:
                                                               science-api · titiler-cmr ·
                                                               bundle files · cloudflared
 NVIDIA Brev (ephemeral GPU/CPU instances) ── batch outputs ──▶ VPS / repository
```

| Layer | Runs | Why here | Key facts (checked 2026-11-09) |
|---|---|---|---|
| **Cloudflare edge** (free plan) | Web app and hero-field bundles as Workers Static Assets (Cloudflare Pages is an equivalent option); SI gateway Worker; DNS for the team domain; Cloudflare Tunnel to the VPS | Global CDN, free unlimited static requests, secrets kept off the client, no inbound ports on the VPS | Static asset requests are free and unlimited; free plan allows 25 MiB per asset and 20,000 assets per version; Workers free plan: 100,000 requests/day and 10 ms CPU per request (the gateway is I/O-bound, so 10 ms CPU is enough) ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). Tunnel: `cloudflared` opens an outbound-only connection, so inbound traffic can be blocked at the firewall ([Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)) |
| **Team VPS** (always on for the event and judging period) | Data & Science service (FastAPI), TiTiler-CMR tiles, cached and large bundles, Earthdata credentials, `cloudflared` | Persistent process for live new-field requests; holds secrets; predictable, no cold starts, no card needed beyond what the team already pays | Docker Compose with `restart: unless-stopped` and health checks. Size: 4 vCPU / 8 GB RAM recommended for live raster work; 2 GB is enough if it only serves precomputed files. Large responses use `Cache-Control` so the Cloudflare edge caches them |
| **NVIDIA Brev** (batch only) | Hero-field bundle precomputation (HLS, NISAR, zones, frames), Prithvi-EO-2.0 fine-tuning and inference (F-23), ML training sweeps | GPU on demand, paid per running hour from team credits; nothing idles | Billing per hour while running; stopped instances have no compute charge but disk is still billed; when credits run out Brev may stop instances and later delete resources; a restart can fail if the GPU type has no capacity ([Brev GPU instances](https://docs.nvidia.com/brev/latest/concepts/gpu-instances.md)). One job per instance; multi-GPU only within one instance. Indicative rates on NVIDIA's page are estimates (e.g., L4 about $0.17/h, A10G about $1.01/h, CPU 4×16 about $0.15/h) ([pricing](https://www.nvidia.com/en-us/launchables/pricing)); check the console for live prices |

**Rules**

- **Brev never serves.** Every Brev job writes its outputs (bundles, model weights, frames, metrics) to the VPS or the repository, then the instance is stopped, and deleted once outputs are verified. The live demo never depends on a Brev instance.
- **Pick the Brev provider/region with care.** If an AWS `us-west-2` instance is offered, prefer it for jobs that read Earthdata Cloud: NASA's in-region S3 access is fastest and cheapest there. Otherwise use HTTPS access via `earthaccess`.
- **Budget the credits.** With $50 per member, plan roughly: Prithvi fine-tune and inference on L4/A10G (≈ 10–20 h), bundle precompute on CPU instances, keep ≥ 30% in reserve. Track spend in the Brev console after each job.
- **The VPS is the only origin for `api.<domain>`.** The tunnel keeps the VPS IP private; no inbound ports are opened. A Caddy reverse proxy with automatic HTTPS is the fallback if the tunnel is unavailable.
- **Quick tunnels are for development only.** `trycloudflare.com` needs no account but has no uptime guarantee, a random hostname, a limit of 200 in-flight requests and no Server-Sent Events ([Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)).
- **Object storage is optional.** Cloudflare R2 has a free tier (10 GB-month, free egress) ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)), but several 2026 guides report that activating R2 asks for a payment method; it is not required because static assets and the VPS cover bundle storage.

**Failure behavior**

| Failure | Effect | What still works |
|---|---|---|
| VPS down | Live new-field heavy layers (HLS, NISAR, zones) unavailable | Hero fields fully (static bundles); new fields with browser-side sources (POWER, ORNL MODIS) |
| SI gateway quota exhausted | LLM answers unavailable | Template intents rendering predefined answer layouts |
| Brev credits exhausted | No new batch jobs | Everything already precomputed |

**Paid options (not required):** Brev top-up credits, a larger VPS, Cloudflare Workers Paid ($5/month) for higher limits, Fly.io / Railway / Google Cloud Run / AWS (`us-west-2` for in-region Earthdata Cloud access).

Because the hero fields are fully precomputed and served from the edge, the submitted project link works even if the VPS is offline.

## 5. Data layer

### 5.1 Adapter contract

Each data source implements one adapter. Python (server) and TypeScript (browser) versions share the same manifest and output schema.

```python
class DataAdapter(Protocol):
    id: str                      # "nasa_power_daily"
    manifest: SourceManifest     # loaded from data-sources.yaml

    def capabilities(self) -> Capabilities: ...
    #   canonical variables, spatial/temporal coverage, resolution, auth, latency class

    def fetch(self, geometry: Geometry, period: Period,
              variables: list[CanonicalVar]) -> list[CanonicalSeries]: ...
    #   returns field-tier series with provenance; never raises on partial data,
    #   returns Gap records instead

    def fetch_grid(self, geometry: Geometry, when: DateOrRange,
                   variable: CanonicalVar, target_grid: Grid) -> GridLayer | None: ...
    #   optional, for zone tier and map layers
```

```ts
interface BrowserAdapter {
  id: string;
  capabilities(): Capabilities;
  fetch(req: FetchRequest, signal: AbortSignal): Promise<CanonicalSeries[]>;
}
```

### 5.2 Manifest (`data-sources.yaml`)

```yaml
sources:
  - id: nasa_power_daily
    provider: NASA LaRC POWER
    product: POWER Daily API
    version: "v2.10"
    runtime: browser            # browser | server
    auth: none
    endpoint: https://power.larc.nasa.gov/api/temporal/daily/point
    variables:
      tmax:   { source_var: T2M_MAX, unit: degC }
      tmin:   { source_var: T2M_MIN, unit: degC }
      precip: { source_var: PRECTOTCORR, unit: mm/day }
    resolution_m: 55000
    coverage: { start: 1981-01-01, end: near_real_time }
  - id: gpm_imerg_final_daily
    product: GPM_3IMERGDF
    version: "07"
    runtime: server
    auth: earthdata
    variables: { precip: { source_var: precipitation, unit: mm/day } }
    resolution_m: 11000

priority:
  precip: [gpm_imerg_final_daily, gpm_imerg_late_daily, nasa_power_daily]
  ndvi:   [hls_vi, modis_mod13q1_ornl, viirs_vnp13a1]
  sm_rootzone: [smap_l4, nasa_power_daily_gwetroot]
```

Adding an official resource on November 13 = new manifest entry + adapter class + conformance test (fixture in, schema-valid canonical series out).

As implemented (`packages/adapters-browser/src/manifest.ts` validates the real file; unknown variables are rejected):

- `kind` (default `series`) says what an entry returns: `series` (canonical variables), `soil` (`clay_pct`, `sand_pct`, `silt_pct`, `soc_pct`, `ph`, `awc_mm_per_m`), `phenology` (`greenup`, `peak`, `dormancy`) or `catalog` (CMR availability only: no variables, `resolution_m: 0`).
- `priority` holds the server chains and is read by `services/science-api`, which walks those ids as granule sources, so browser ids must not appear there. `browser_priority` holds the browser chains per canonical variable; the client tries `priority` through the server bundle first, then `browser_priority` in order.
- Browser entries: `nasa_power_daily`, `nasa_power_climatology`, `ornl_modis_mod13q1`, `ornl_modis_mod16a2gf`, `ornl_modis_mcd12q2`, `cmr`, `soilgrids`. POWER `EVPTRNS` maps to `et_actual` through a latent-heat conversion (2.45 MJ/kg) and `GWETROOT` to `sm_rootzone` as a 0-1 wetness index (unit `fraction`, quality capped at low). MOD16A2GF 8-day composites are expanded to a daily mm/day rate because the series cadence set has no 8-day step.
- Browser adapters return `{ series, gaps }` and never throw: timeouts and HTTP failures become gap records with the reason.

### 5.3 Field Data Bundle (core contract)

```jsonc
{
  "schema": "field-bundle/1.0",
  "field": { "id": "sha256:…", "geometry": { /* GeoJSON */ }, "area_ha": 12.4,
             "centroid": [5.33, 36.12], "elevation_m": 980, "slope_mean_deg": 3.1 },
  "generated_at": "2026-11-14T10:00:00Z",
  "series": [
    { "var": "precip", "unit": "mm/day", "cadence": "daily",
      "start": "2001-01-01", "values": [/* … */],
      "quality": [/* per-step flags */],
      "provenance": { "source": "gpm_imerg_final_daily", "version": "07",
                      "resolution_m": 11000, "method": "area_weighted",
                      "retrieved": "2026-11-10" },
      "segments": [ { "start": "2025-10-01", "source": "gpm_imerg_late_daily" } ] }
  ],
  "phenology": [ /* per-season Field Memory output */ ],
  "layers": { "zones": "zones.geojson", "ndvi_frames": "frames/index.json",
              "nisar": [ { "date": "2026-10-02", "href": "nisar_20261002.png" } ] },
  "context": { "grace_tws_trend_cm_per_yr": -0.8, "gedi_footprints": 14 },
  "soil": { "clay_pct": { "value": 34, "source": "soilgrids", "confidence": "medium" } },
  "gaps": [ { "var": "sm_surface", "reason": "cell larger than field", "severity": "info" } ]
}
```

Storage: Parquet for long series (client decodes with a WASM Parquet reader or receives Arrow/JSON chunks), JSON for metadata, PNG/WebP frames for 3D textures, GeoJSON for zones.

The bundle, its series and provenance, the engine input/output, the evidence card and the assistant tool I/O are defined as JSON Schemas (draft 2020-12) in `schemas/`, each with an `$id` and a version label. `pnpm schemas:generate` writes TypeScript types to `packages/engine/src/contracts/generated/` (import from `@itza/engine/contracts`) and Pydantic models to `services/science-api/src/itza_science/contracts/`; `pnpm schemas:check` fails when they are stale. A series without provenance, or an evidence card or item missing a mandatory field, fails validation. Change rules: [schemas/README.md](../schemas/README.md).

### 5.4 Caching

- Key = hash(geometry rounded to 1e-5) + manifest versions + period.
- Browser: IndexedDB; server: content-addressed files (+ DuckDB index).
- Demo bundles are committed build artifacts (or released assets), regenerated by `pipelines/build_demo.py`.

## 6. Simulation engine

### 6.1 Module layout

```
packages/engine/src
  physics/        import from `@itza/engine/physics`
    et0.ts          FAO-56 Penman–Monteith ET0 from canonical weather
    crops.ts        Kc curve, stage calendar, root growth and sowing day per crop (knowledge-pack params)
    soil.ts         texture class, hydrologic group, REW/TEW from the bundle `soil` block
    waterBalance.ts daily root-zone balance, Ks, runoff, deep percolation, bare-soil evaporation, WSI
    thermal.ts      frost/heat events by stage sensitivity, GDD
    forcing.ts      bundle series to daily forcing with ET0 and a documented gap policy
  climate/        Climate Fingerprint (F-04), import from `@itza/engine/climate`
  replay/         Season Replay (F-07), import from `@itza/engine/replay`
    soilHealth.ts   N credit score, residue/root score, canopy and residue ground cover by month
    pests.ts        host-family returns within the break window × weather risk
    erosion.ts      slope × rain intensity × uncovered share of erosive rain
    simulate.ts     rotation × usable season loop over the physics, one parameter draw at a time
    score.ts        criteria, priority→criterion weights, composite and contributions
    resilience.ts   per-rotation distribution metrics, win rate, ranking order
    montecarlo.ts   seeded parameter draws (mulberry32)
    run.ts          `simulateReplay` (simulate nominal + draws) and `scoreReplay` (weights only)
  worker/         Web Worker protocol, handler, client and entry (`@itza/engine/worker`, `/worker/entry`)
  scenarios.ts    delta-change (sliders, 2050)
  candidates.ts   generation, constraint filtering, diversity
  evidence.ts     structured evidence, gaps, risks, confidence
  contracts/      generated types and the Ajv `validate(schemaId, data)` helper (schemas live in /schemas)
```

### 6.2 Core equations

**Reference ET (FAO-56 Penman–Monteith, daily):**

$$
ET_0 = \frac{0.408\,\Delta (R_n - G) + \gamma \frac{900}{T+273} u_2 (e_s - e_a)}{\Delta + \gamma (1 + 0.34 u_2)}
$$

computed from POWER Tmax/Tmin/Tmean, RH, 2 m wind, shortwave radiation and elevation; G ≈ 0 at daily step.

**Crop ET and water balance (single crop coefficient):**

$$
ET_c = K_c(t)\,ET_0,\qquad ET_{c,adj} = K_s\,K_c(t)\,ET_0
$$

$$
D_{r,i} = D_{r,i-1} - (P_i - RO_i) - I_i + ET_{c,adj,i} + DP_i
$$

$$
TAW = 1000\,(\theta_{FC} - \theta_{WP})\,Z_r,\quad RAW = p\,TAW,\quad
K_s = \begin{cases} 1 & D_r \le RAW \\ \dfrac{TAW - D_r}{(1-p)\,TAW} & D_r > RAW \end{cases}
$$

Kc follows the FAO-56 four-stage curve (initial, development, mid, late); bare/fallow periods use a soil-evaporation coefficient. Runoff RO uses an SCS curve-number simplification by soil group and cover; deep percolation DP is water above field capacity. Root depth Zr grows with stage.

**Seasonal water-stress index per crop:** `WSI = 1 − Σ ETc,adj / Σ ETc` over the season, weighted by stage sensitivity (FAO yield-response concept, used as a relative stress indicator, not a yield).

**Thermal:** for each stage s with thresholds (Tfrost_s, Theat_s), count days with Tmin < Tfrost_s and Tmax > Theat_s, weighted by stage sensitivity.

**Pest pressure:** for each pathogen k shared by crops in positions i < j with gap (j − i) < persistence_k: add w_k × (persistence_k − gap)/persistence_k; scaled by weather risk r_k(season) ∈ [0.5, 1.5] (wet spells for fungal, warm dry spells for insects); normalized to [0, 1].

**Erosion index:** `E = slope_factor(S) × R_intensity(IMERG p95 daily) × (1 − cover_fraction)`, monthly, normalized; inspired by RUSLE factors without claiming soil-loss tonnes.

**Implementation notes: physics and climate (`packages/engine/src/physics`, `climate`).** Checked against FAO-56 Examples 17 and 18 (ET0 within 0.1 mm/day) and Example 37 (Ks and Dr day by day).

- *ET0:* the cloudiness ratio Rs/Rso is kept between 0.3 and 1; humidity comes from `ea`, else RHmax/RHmin, else mean RH (POWER RH2M), else a dew point near Tmin.
- *Depletion fraction:* p is adjusted for the day's ETc (`p + 0.04 (5 − ETc)`, limited to 0.1 to 0.8, FAO-56 Table 22 note); the option can be switched off.
- *Root zone:* Zr grows linearly from the emergence depth to the maximum by the end of development. When Zr changes, Dr is rescaled with TAW (the new soil is as depleted as the old). Bare fallow keeps a nominal 1 m profile, so rain stored in fallow counts.
- *Runoff:* SCS curve number interpolated between bare fallow soil and well-covered small grain (cover from Kc) by hydrologic soil group (from texture), adjusted for antecedent wetness (CN I, II, III by root-zone water), initial abstraction 0.2 S.
- *Bare soil:* FAO-56 two-stage evaporation: Ke = Kr Kcmax with Kcmax 1.2, TEW and REW from Table 19 midpoints by texture; the topsoil is taken as dry after harvest.
- *Stage sensitivity weights* (engine defaults, not pack data), initial/development/mid/late: water 0.2/0.5/1/0.6, frost 0.3/0.5/1/0.6, heat 0.2/0.4/1/0.7. WSI and the thermal indices use them.
- *Gaps:* temperatures take the nearest valid day, rain is 0 mm, and a day without ET0 inputs gets the mean ET0 of that day of year; the filled days are counted in `gaps` and `observed`.
- *Fingerprint:* seasons are agricultural years from the pack's start month; a season is usable with at least 90% observed days. Dry day: rain below 1 mm. Heat score: days above 30 °C plus days above 35 °C; frost score: days below 0 °C plus days below −2 °C. Worst seasons per hazard (top 3 among usable seasons) show value, mean, deviation and z-score. Every period carries `Provenance` with `derived_from` the input series and their `segments`.

**Implementation notes: Season Replay (`packages/engine/src/replay`, `worker`).**

- *Seasons and rotations:* the replay covers the usable agricultural years of the weather record (same 90 % rule as the Fingerprint). The season of the n-th usable year takes position n mod N of the rotation, so a rotation repeats through the record and every crop meets about 1/N of the years. Seasons whose crop would run past the record (including the largest Monte Carlo shift) are left out, and consecutive crop seasons that overlap are rejected. Sowing is the middle of the pack window (or the `sowing_doy` override) inside the agricultural year. The baseline is replayed too and appears in the results when it is not already one of the rotations. Constraints (irrigation, markets, exclusions) are applied by the candidate generator, not here: the replay is rainfed. Only the `history` scenario is replayed here; slider and 2050 scenarios adjust the forcing first (`scenarios.ts`) and are rejected with a clear error until then.
- *Criteria* f_k, all in [0, 1] and **higher is better** (so "pest pressure" and "bare exposure" are inverted): `climate_fit = exp(-(frost + heat index)/5)` with the stage-weighted day counts of the thermal module (1 for fallow); `water_balance = 1 - WSI` for a crop, and the share of the year's rain that soaks in for fallow; `soil_nitrogen` from the *previous* position's N credit, `0.5 + credit/120` limited to [0, 1] (a legume before a cereal helps the cereal); `organic_matter` = residue/root index; `erosion_control = 1 - erosion index`; `bare_exposure` = months with at least 20 % ground cover ÷ 12; `pest_pressure` = 1 - pressure; `forage_income = 0.5 forage value + 0.5 market flag` (a proxy; money comes with the economics layer). Ground cover is the canopy (Kc − 0.15, limited to [0, 1]) while the crop grows and residue (index × 0.6) for as many months after sowing as `cover_months`; stubble from the previous crop is not counted. Erosion index = slope factor (RUSLE-style polynomial, 1 at 10 % slope) × intensity (wet-day p95 rain ÷ 30 mm, limited to 1) × share of the year's rain erosivity (sum of squared daily rain) falling in uncovered months.
- *Pest pressure:* for a pest the crop hosts (listed crop or family), each earlier host season within the window W = max(soil persistence, minimum break) seasons adds (W − gap + 1)/W, capped at 1 per pest. This differs from the formula in §6.2 by the "+ 1": with the strict form (gap < persistence) a one-year persistence would ignore a cereal after a cereal, the case the packs describe. Weather risk r is the year's wet days (fungal) or warm dry days (insects) against the median year, from 0.5 to 1.5; pressure per pest = min(1, inoculum × r), and pests combine as independent chances. The rotation is treated as repeating, so position 0 looks back to the end of the cycle.
- *Weights:* the seven sliders are normalized, then spread over the eight criteria: water → water balance 0.7 and climate fit 0.3; soil health → organic matter 0.6 and bare exposure 0.4; nitrogen, erosion and pest break → their own criterion; forage and income → forage/income. All sliders at 0 give equal weights. Criteria do not depend on the weights, so `rescore` needs no simulation.
- *Scores and ranking:* the composite is the sum of the contributions w_k f_k, so they add up to it. Values are rounded to 6 decimals so outputs are identical across platforms. A rotation's `score` and `resilience.median` are the composite of its **lower-median** season, a real season, so the reported `contributions` (that season's) sum to the score; P10/P90 interpolate, with P10 ≤ median ≤ P90 kept. Severe water stress is WSI > 0.3; a frost/heat hit is a season with a stage-weighted day index of at least 1. Win rate is the share of common seasons with a strictly higher composite than the baseline (null for the baseline itself and without one). Results are sorted by median, then P10, then request order. The label constant `REPLAY_LABEL` ("model-based counterfactual, not measured yield") travels with the results in the UI.
- *Monte Carlo:* 200 seeded draws by default (`monte_carlo_draws`, 0 turns bands off) of Kc ±10 %, TAW ±20 %, sowing ±10 days, p ±0.1, shared by all rotations so they are compared under the same parameters. A season's band is the P10/median/P90 of its composite across draws; a rotation's band is the same for its score. The sowing shift is clamped per rotation so no season leaves the weather record.
- *Worker:* a plain `postMessage` protocol (`runReplay`, `rescore`), no extra dependency. `runReplay({ bundle, input, packId? })` validates the bundle and the input against their schemas, simulates, validates the output and keeps the criteria; `rescore({ priorities })` re-ranks from them. `createReplayClient(worker)` gives a promise API; the worker script is `@itza/engine/worker/entry`. In Vite: `import ReplayWorker from "@itza/engine/worker/entry?worker"`.
- *Performance:* 10 rotations × 25 seasons × daily steps with 200 draws takes about 0.7 s and a re-score about 15 ms on an Apple M-series laptop (Node 26); `pnpm --filter @itza/engine bench` checks the 1 s and 100 ms budgets. They are not part of `pnpm test` because V8 coverage instrumentation slows the replay about nine times. Nearly all the time is the daily water balance (2,010 timelines of 9,131 days), so the physics has fast paths with the same results: `stepInPlace` on a flat array (the object-returning `stepWaterBalance` wraps it), per-crop daily curves shared through `cropCurves`, an exact shortcut for a dry bare day on a dry topsoil, and `daily: false` on `simulateTimeline` to skip the per-day output arrays.

### 6.3 Scoring and resilience

Per rotation R and season y, criteria `f_k(R, y) ∈ [0,1]`: climate fit, water balance, soil nitrogen, organic matter, erosion control, bare-field exposure, pest pressure (inverted), forage/income.

$$
S_y(R) = \sum_k w_k\, f_k(R,y), \qquad \sum_k w_k = 1
$$

Weights from priority sliders (normalized). Resilience profile per R: median S, P10/P90, worst-season S, count of seasons with severe water stress (WSI > threshold), frost/heat hits, **win rate** vs baseline = share of seasons with S_y(R) > S_y(baseline). Headline ranking uses median S with a robustness tie-breaker (P10).

### 6.4 Uncertainty

- **Parameter Monte Carlo:** 200 seeded draws over Kc (±10%), TAW (±20%), sowing date (±10 days), p (±0.1) → bands on all outputs.
- **Data uncertainty:** gaps and scale mismatch lower confidence.
- **Confidence score:** weighted combination of coverage (share of days with primary-source data), scale ratio (field area vs coarsest critical source), model–satellite agreement (correlation of modeled root-zone depletion with SMAP L4 anomaly; modeled vs observed season timing), trait confidence, ground truth presence → high/medium/low with reasons.

### 6.5 Scenarios

- **Sliders:** precipitation × (1 + Δp); temperatures + ΔT; ET0 recomputed.
- **2050 delta-change:** monthly factors from NEX-GDDP (2041–2060 vs 1995–2014 model baseline, per SSP, ensemble and per-model spread): additive for temperature, multiplicative for precipitation (capped), applied to observed 2001–2025 daily series → 25 synthetic future seasons → full replay.

### 6.6 Determinism and validation

- Pure functions; seeded PRNG; no wall-clock or locale dependence.
- Golden tests: fixed bundles → expected outputs (JSON snapshots).
- Reference checks: ET0 against FAO-56 worked examples; water balance against a Python reference notebook and AquaCrop-OSPy on test fields (tolerance documented).
- Property tests: no candidate violates hard constraints; scores in [0,1]; contributions sum to composite.

## 7. Field Memory algorithm

1. Fetch NDVI series (HLS VI 30 m where available; MOD13Q1 250 m for 2000+); apply QA masks; field-average with pixel-overlap weights.
2. Merge sensors on a common 8-day grid (HLS preferred where both exist; bias-adjust MODIS to HLS over overlap years with linear fit).
3. Smooth (Savitzky–Golay, window 5–7 composites); interpolate gaps ≤ 32 days; flag longer gaps.
4. Segment agricultural years (region start month).
5. Detect phenology: green-up (crossing 20% of seasonal amplitude), peak, senescence (crossing back), bare window (NDVI < threshold ≥ 30 days); cross-check with MCD12Q2 dates.
6. Label seasons by rules on timing/amplitude (winter crop: peak Feb–May; summer crop: peak Jun–Sep; fallow: amplitude < threshold or weedy low peak; uncertain otherwise).
7. Infer rotation pattern (e.g., periodicity of fallow) and propose history; farmer confirmation overrides.
8. Validation: US control fields against USDA CDL; Algerian fields against farmer-confirmed history.

## 8. Machine learning

### 8.1 ML stress model (Model Arena)

- **Target:** seasonal NDVI peak anomaly (z-score vs pixel/field climatology) for cropped seasons.
- **Features:** stage-aggregated rain, dry-spell length, ET0, rain − ET0, frost/heat days, SMAP root-zone anomaly, previous-season state, soil AWC, slope.
- **Data:** thousands of field/pixel-seasons sampled across the region (MODIS 250 m pixels classified as cropland), 2001–2025.
- **Model:** LightGBM with spatial-block and leave-one-year-out cross-validation; SHAP values for explanations.
- **Use:** an independent "statistical opinion" of how stressful a season was; disagreements with the rule engine and with observed NDVI become review flags.
- **Model card:** data, period, metrics, limits (irrigation confounding, mixed pixels).

### 8.2 Prithvi-EO-2.0 (P2)

- Fine-tune `Prithvi-EO-2.0-100M-TL` (or `tiny-TL` for CPU) with TerraTorch on multi-temporal HLS chips for crop vs fallow (and cereal vs legume where labels exist). Start from the official multi-temporal crop config in the Prithvi-EO-2.0 repo.
- Labels: farmer-confirmed seasons, US CDL for transfer pretraining, any official challenge labels.
- Inference precomputed for demo fields; served as raster layer and as 4th opinion.

### 8.3 Field boundaries (P2)

Fields of The World pretrained models via its CLI on Sentinel-2/HLS imagery around the click; polygonize; user confirms.

## 9. 3D field twin rendering

- **Base:** MapLibre GL JS 6 with `raster-dem` terrain source (Terrarium tiles) and hillshade; pitch/bearing camera animations; globe projection for the opening shot.
- **Draped data:** deck.gl interleaved layers: `TerrainLayer` with texture = NDVI frame for the current timestep (colorized PNG/WebP from HLS via TiTiler-CMR or precomputed); `BitmapLayer`/`TerrainExtension` for moisture, zones, flow paths draped on terrain.
- **Animation:** frame index driven by the global timeline store; frames preloaded (decoded `ImageBitmap`s) to avoid flicker; 4–12 fps playback, interpolated cross-fade.
- **Derived terrain products:** slope, flow accumulation and flow lines computed server-side from NASADEM (D8) and shipped as GeoJSON/PNG.
- **Fallback:** WebGL2 unavailable → 2D map with the same animated layers.
- **Alternative:** CesiumJS if true globe/3D Tiles become necessary (heavier bundle; not default).

## 10. SI assistant

### 10.1 Flow

```
typed text · suggested chip · "Ask about this" (element context)
   │
   ▼
AI SDK chat (browser) ─▶ SI gateway (Worker) ─▶ LLM (Gemini | Groq)
                              │
          tool calls ◀────────┘
client data tools (engine)       server data tools (NASA POWER MCP, CMR MCP)
          │                                │
          └────────── results ─────────────┘
                    │  written to the surface data model (bindings)
                    ▼
LLM calls render_answer(A2UI messages: createSurface · updateComponents)
                    │
                    ▼
catalog schema check (gateway + client) ── fail ─▶ one self-correction ─▶ predefined layout
                    │ pass
                    ▼
caption grounding validator ─▶ A2UI React renderer (app catalog) ─▶ interactive answer
                    ▲                                                       │
                    └──────── A2UI `action` (chip tap, Confirm) ◀───────────┘
```

### 10.2 Generative UI design

**Pattern choice (checked 2026-11-10).** 2026 practice names three generative-UI patterns: *static* (agent picks predefined components, frontend owns UI), *declarative* (agent returns a UI description as data; client renders its own trusted components) and *open-ended* (agent or server returns full HTML in a sandboxed iframe, e.g., MCP Apps) ([CopilotKit guide](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026), [AG-UI generative UI specs](https://docs.ag-ui.com/concepts/generative-ui-specs)). The guidance is to pick the least-freedom pattern that meets the need. We use **declarative as the main path, static as the fallback, and no open-ended UI** in the farmer app:

| Layer | Choice | Why |
|---|---|---|
| UI description | **A2UI v0.9.1** (production line; v1.0 is a release candidate) ([spec](https://a2ui.org/specification/v0.9.1-a2ui/), [repo](https://github.com/google/A2UI)) | Declarative JSON, never executable code; agent can only place components registered in our catalog; streaming; Apache-2.0; official React renderer |
| Renderer | `@a2ui/react` with a custom catalog `app-catalog/v1` mapping to `packages/ui-kit` components | Answers look exactly like the rest of the app; accessibility comes for free |
| Transport and chat | Vercel AI SDK 7 (already used): the `render_answer` tool input carries A2UI messages; typed tool parts render static components for single-result answers | A2UI is transport-agnostic (MCP, WebSockets, REST, AG-UI, A2A) ([Google blog](https://developers.googleblog.com/a2ui-v0-9-generative-ui/)); no new runtime needed |
| Data binding | Tool results written with `updateDataModel` at JSON Pointer paths (e.g., `/backtest/rot_b/stress_years`); components bind to paths | Numbers in charts never pass through the LLM's text, which makes grounding structural |
| User actions | A2UI `action` messages (`name`, `sourceComponentId`, `context`) mapped by an allow-list to tools or navigation | Chips and forms are real interactions; unknown actions are dropped |
| Validation | Catalog JSON Schema (`@cfworker/json-schema`, draft 2020-12; Ajv compiles with `new Function`, which Workers forbid) at the gateway and client; A2UI `VALIDATION_FAILED` error returned to the model once | Prompt-generate-validate loop recommended by the spec |

**Catalog** (`packages/ui-kit/catalog/`): `Caption`, `ReplayBars`, `RotationCompare`, `EvidenceCard`, `SeasonSnapshot`, `ClimateStrip`, `FutureToggle`, `MapFocus`, `ConfirmForm`, `ActionChips`, `SourceChips`, `TraceDrawer`, plus layout primitives (`Column`, `Row`, `Card`). Each entry has a JSON Schema, one example surface (few-shot) and a predefined fallback layout per intent.

**Layout rules (consistency).** Max one surface per answer; caption first, then at most 3 data components, then chips and sources; fixed ordering per intent class. This addresses the main generative-UI usability risk: interfaces that change unpredictably and must be relearned ([NN/g](https://www.nngroup.com/articles/generative-ui/)).

**Alternatives considered:** CopilotKit + AG-UI (`@copilotkit/react-core` 1.85, `@ag-ui/client` 1.0.4) if agent logic moves server-side (pydantic-ai, Google ADK and others speak AG-UI; AG-UI carries A2UI) ([AG-UI](https://docs.ag-ui.com/introduction)); Vercel json-render (0.22) as a lighter catalog renderer; MCP Apps (official MCP extension since 2026-01-26) only if ITZA is later exposed as a tool inside third-party chat apps ([MCP blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)).

### 10.3 Tools

| Tool | Executes | Returns |
|---|---|---|
| `get_field_summary()` | Browser (engine) | Area, history, climate fingerprint highlights |
| `compare_rotations(ids?)` | Browser | Ranked cards (structured) |
| `run_backtest(rotation, scenario?)` | Browser | Resilience profile |
| `get_season(year)` | Browser | That season's indicators and replay |
| `explain_exclusion(crop)` | Browser | Filter/criterion that excluded the crop |
| `set_priorities(...)`, `set_constraints(...)` | Browser, only through a confirmed `ConfirmForm` action | Updated state |
| `render_answer(messages)` | Gateway validates, browser renders | A2UI surface (catalog components bound to tool data) |
| `navigate(view, params)` | Browser | UI action (open 2050, 3D, zones) |
| `define_term(term)` | Browser (glossary) | Plain definition |
| NASA POWER MCP tools (`get_climatology_data`, `get_point_statistics`, …) | Gateway | Climate facts with POWER provenance |
| NASA CMR MCP tools (keyword mapping, collection search, citations) | Gateway | Dataset references and DOIs |

### 10.4 Guardrails

- **System policy:** answer only about the field, rotations, data and methods; refuse prescriptions (doses, pesticides), legal/financial advice; always mention local review for risky items.
- **Grounding validator:** extracts numbers/dates from the draft answer and checks each against tool outputs in the turn (tolerance for rounding/unit conversion); on failure, regenerate once, then fall back to a template answer.
- **Language:** questions accepted in any language; answers and captions always in plain English.
- **Budget:** per-session token and request caps at the gateway; graceful degradation to template intents.
- **Transparency:** "How I got this" trace lists tools and sources.
- **UI safety:** only catalog components; no HTML, scripts, iframes or URLs from the model; component props length-limited; actions allow-listed; state changes need a user tap on Confirm.

### 10.5 Gateway contract (`services/si-gateway`)

| Item | Value |
|---|---|
| Endpoint | `POST /chat`, body `{ messages: UIMessage[] }` (user and assistant roles only), header `X-Session-Id`; response is an AI SDK UI message stream |
| Providers | Gemini free tier, then Groq when the first fails before output; keys only from Wrangler secrets |
| Server tools | NASA POWER MCP (`power_*`) and CMR MCP (`cmr_*`); results `{ untrusted_data, provenance }`; unreachable server = gap |
| Client tools | Declared without `execute`; the browser runs them |
| Limits | 20 req/min per IP; 30 requests and 60k tokens per session; 64 KB body; 40 messages; counters per Worker isolate (best effort) |
| Error signals | `429 rate_limited` (+ `Retry-After`), `429 budget_exhausted` and `503 no_provider` (both carry `fallback: "templates"`), `413`, `400`, `403` |

### 10.6 Answer catalog contract (`packages/ui-kit/catalog`)

Plain TypeScript (no DOM, no React), imported by the gateway and the web app as `@itza/ui-kit/catalog`.

| Item | Rule |
|---|---|
| Messages | A2UI v0.9: `{ version: "v0.9", createSurface \| updateComponents \| updateDataModel }`, catalog `app-catalog/v1`; one surface per answer; flat component list with a `root` layout component |
| Components | `Caption`, data components (`ReplayBars`, `RotationCompare`, `EvidenceCard`, `SeasonSnapshot`, `ClimateStrip`, `FutureToggle`, `MapFocus`, `ConfirmForm`), footer components (`ActionChips`, `SourceChips`, `TraceDrawer`), layout (`Column`, `Row`, `Card`); each has a JSON Schema with length-limited props |
| Bindings | Data props are `{ path }` JSON Pointers into the data model; the app writes tool results at the standard paths in `DATA_PATHS` |
| Layout | Leaf order: one `Caption`, then at most 3 data components, then footer components; nesting depth ≤ 4; ≤ 40 components |
| Text | Every model-written string must be plain: no `<`, `>`, links, script or data URLs, control characters |
| Actions | `ACTION_ALLOWLIST` maps chip action names to one browser tool or navigation; `resolveAction` validates the context; unknown actions are dropped (an emptied chip block is removed). State changes only through `ConfirmForm` |
| Grounding | `checkGrounding(texts, toolOutputs)`: every number or date in a caption (and every number the model writes with `updateDataModel`) must appear in a tool output of the turn; rounding to the written precision, percent, ×10/÷10 and ×1000/÷1000 unit changes, and array lengths are accepted |
| Fallback | `fallbackSurface(intent, caption)` for each of the 10 `INTENT_CLASSES`; caption copy keys in `FALLBACK_CAPTION_KEYS` (`apps/web/src/copy/en.json`) |
| `render_answer` | Runs in the gateway (`src/render.ts`): schema or grounding failure returns `status: "error"` with `VALIDATION_FAILED` / `GROUNDING_FAILED` once; a second failure in the same turn returns `status: "fallback"` (with the optional `intent`) and the client shows the predefined layout. Failures are counted across requests from the messages |

## 11. Service API (Data & Science)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/bundles` | Body: field GeoJSON + options → job id; builds or returns cached bundle |
| `GET` | `/v1/bundles/{id}` | Bundle status/metadata; links to parts |
| `GET` | `/v1/bundles/{id}/series/{var}` | Series (Arrow/JSON) |
| `GET` | `/v1/bundles/{id}/frames` | NDVI/moisture frame index for 3D |
| `POST` | `/v1/zones` | Field → zones GeoJSON + stats |
| `GET` | `/v1/bundles/{id}/terrain` | Provenanced terrain stats, GeoTIFF/PNG layer URLs and clipped D8 flow lines |
| `GET` | `/v1/nisar?bbox=&from=&to=` | NISAR SME2 snapshots clipped to field |
| `GET` | `/v1/projection?lat=&lon=&ssp=` | Monthly change factors (POWER Projection or archive fallback) |
| `POST` | `/v1/ml/stress` | Season features → prediction + SHAP |
| `GET` | `/v1/context/grace?lat=&lon=` | TWS anomaly series and trend |
| `GET` | `/v1/context/gedi?bbox=` | Footprint summary |
| `GET` | `/tiles/...` | TiTiler-CMR endpoints |
| `GET` | `/health` | Liveness + upstream checks |

OpenAPI is generated by FastAPI; TypeScript client generated from it.


### 11.1 Native field-bundle ingestion and verification

The bundle API retains `{geometry,period,variables?}` and its `queued/running/done/error`
job states. Optional `refresh: true` rebuilds completed cached results; errored jobs
can be retried by POST. In-flight jobs are lost on restart, so clients must POST
again; completed bundles are restored from the file cache. Cache keys include
source versions and variable mappings. Cache-write failures become safe job errors.

Earthdata tokens and username/password pairs can be loaded from server `.env`
settings. Auth/search/download are serialized off the event loop; credentials and
raw upstream errors never enter responses. The reader groups native granule assets
and downloads only required NetCDF/HDF5 or NDVI/Fmask files, with a daily granule cap.
IMERG V07 uses `precipitation` and named dimension transposition. SMAP L4 uses its
native `Geophysical_Data` group/EASE-Grid and all available three-hourly samples for
daily means, flagging incomplete sampling. HLS VI uses separate scaled NDVI/QA COGs,
windowed reads, and native CRS-aware, equal-area pixel-overlap weighting. Days
between HLS visits are represented by nulls, not acquisition-failure warnings.

Missing terrain is null with explicit gaps in the shared bundle contract. Generated
consumers are updated together; the engine rejects missing elevation before ET0.
Real clips from all five collections, two SMAP timestamps and native QA assets are
replayed in offline unit/integration tests; source provenance and a manual live
verification record accompany them in `fixtures/earthdata/recorded/`. Synthetic
fixtures remain separate. See the [science service README](../services/science-api/README.md#field-bundles-and-native-nasa-inputs)
for configuration, manifest packaging, retries and verification limits.

### 11.2 Terrain, frame and zone implementation

The science service now derives bundle elevation/slope and local terrain products
from NASADEM/SRTM on a buffered 30 m UTM grid. D8 routes downhill without filling
pits; flow is local to the buffer. Concavity is a relative elevation hint, not a
frost forecast. Numerical GeoTIFFs and colorized PNG previews are served separately.
NDVI/moisture frame indexes include source, date, bounds and byte size; transparent
geographic PNGs are bounded to 150,000 bytes. Missing sources remain explicit gaps.

`POST /v1/zones` requires ≥3 ha, ≥30 usable HLS pixels and ≥2 comparable years.
Standardized multi-year NDVI mean/CV/circular peak timing plus available terrain
and coarse NISAR moisture feed deterministic k=2–4 silhouette selection. Annual
adjusted Rand index and matched membership retention describe stability; GeoJSON
is field-clipped and reports retained-pixel coverage. Caller AWC remains unchanged;
optional curve-number scenarios use Williams' documented slope correction, with
low confidence and baseline provenance. These parameters support later mini-backtests.

The [science API spatial contract and methods](../services/science-api/README.md#terrain-frame-sequences-and-management-zones)
document request/response models, palettes, thresholds, source limits, precomputed
numeric moisture manifests, cache/refresh behavior and scientific limitations.
The route models are published in OpenAPI; no shared bundle schema changed.

## 12. Repository structure (monorepo)

```
/
├─ apps/
│  └─ web/                    React app (map, 3D, cards, builder, assistant, English copy)
├─ packages/
│  ├─ engine/                 Pure TS engine + JSON Schemas + golden tests
│  ├─ adapters-browser/       POWER, ORNL MODIS, CMR adapters (TS)
│  ├─ knowledge/              Region packs (YAML) + schema + validator
│  └─ ui-kit/                 Shared accessible components; catalog/ (A2UI catalog schemas, examples, fallback layouts)
├─ services/
│  ├─ science-api/            FastAPI: bundles, zones, NISAR, projection, ML, tiles
│  └─ si-gateway/             Cloudflare Worker: LLM proxy, MCP client, A2UI catalog validation
├─ pipelines/                 build_demo.py, capture_fixtures.py, train_stress.py, prithvi/
├─ infra/                     docker-compose.yml (VPS), cloudflared config, wrangler config, brev/ job scripts
├─ fixtures/                  Raw API responses + clipped rasters for tests
├─ data-sources.yaml          Adapter manifest
├─ schemas/                   Shared JSON Schemas (source of truth)
└─ docs/                      This documentation
```

Tooling: pnpm workspaces + Turborepo (JS), uv (Python), Biome or ESLint+Prettier, Ruff, Vitest, Playwright, pytest. CI: GitHub Actions (lint, type-check, unit, golden, schema, adapter conformance against fixtures, build).

## 13. Performance budgets

| Item | Budget |
|---|---|
| Initial JS (gzipped, excluding map/3D chunks) | ≤ 300 KB |
| Time to interactive (demo, cached) | ≤ 2.5 s on mid laptop |
| Backtest 10 rotations × 25 seasons + 200 MC draws | ≤ 1 s (Web Worker) |
| Slider re-rank (weights only) | ≤ 100 ms |
| 3D time-lapse | ≥ 30 fps, frames ≤ 150 KB each |
| Demo bundle per field | ≤ 5 MB total |

## 14. Security and privacy

- No accounts required; no personal data collected. Field geometry is sent only to data providers needed to answer the query.
- Secrets (Earthdata credentials, LLM keys) live only in the Python service and the SI gateway; never in the client bundle.
- Gateway: origin allow-list, per-IP and per-session rate limits, request size limits, prompt-injection-resistant system prompt (tool outputs treated as data), no arbitrary URL fetching.
- Input validation: GeoJSON size/vertex limits, bbox limits, date-range limits (Pydantic models).
- Dependency hygiene: lockfiles, automated audit in CI; licenses recorded (EOX imagery non-commercial clause, model licenses).
- Share links encode inputs only; no server-side storage of user data in the hackathon build.

## 15. Reliability and observability

- **Demo mode:** zero network dependency (bundles, frames, template assistant answers recorded as fallback).
- **Timeouts and fallbacks:** every adapter has timeout, retry with backoff, and fallback chain; failures become gaps, not crashes.
- **Health page:** upstream status (POWER, ORNL, CMR, Earthdata, gateway) shown in a hidden diagnostics panel.
- **Logging:** structured logs in the service; client error boundary with local log export.

## 16. Testing strategy

| Level | What | Tools |
|---|---|---|
| Schema | Bundles, packs, cards validate | Ajv (TS), Pydantic/JSON Schema (Py) |
| Engine unit + golden | Equations, simulation, scoring, determinism | Vitest |
| Adapter conformance | Fixture in → canonical series out; provenance present | Vitest, pytest |
| Science validation | ET0 vs FAO-56 examples; water balance vs reference; Field Memory vs CDL/farmer labels; ML CV metrics | pytest, notebooks |
| Grounding | Assistant answers contain only tool-sourced numbers | Scripted eval set |
| Generative UI | Every scripted question yields a catalog-valid surface or the predefined fallback; actions allow-listed; visual snapshots of answer surfaces | JSON Schema validator, Vitest, Playwright |
| E2E | Draw field → cards → replay → 2050 → PDF | Playwright |
| Visual / a11y | Visual snapshots, contrast, keyboard | Playwright + axe |
| Performance | Engine timing, fps checks | Benchmarks in CI |

## 17. Architecture decision log

| ADR | Decision | Rationale | Trade-off |
|---|---|---|---|
| 001 | Engine in TypeScript, in the browser | Instant interaction, offline demo, zero server cost, one implementation for UI and assistant tools | ML and raster work stay in Python; need cross-language schemas |
| 002 | MapLibre + deck.gl over CesiumJS | Lighter, open, strong 2.5D terrain and analytic layers | No true 3D Tiles globe (not needed) |
| 003 | Two-tier harmonization instead of one grid | Avoids false precision from upsampling coarse data; keeps field-scale where it exists | Two code paths (series + zone grid) |
| 004 | Precomputed demo bundles | Demo cannot fail on network or quotas | Build step; bundles must be regenerated after data changes |
| 005 | Adapter manifest + canonical variables | Official resources plug in on Nov 13 without engine changes | Small upfront abstraction cost |
| 006 | FAO-56 single Kc water balance (not full crop model) | Transparent, fast, published, explainable to judges | Not a yield model; dual Kc / AquaCrop used only for validation |
| 007 | LightGBM + SHAP for ML opinion; Prithvi as stretch | Explainable, trainable in hours on CPU; GeoFM adds NASA-native SI | Prithvi fine-tuning needs labels and compute |
| 008 | Tool-grounded assistant with validator | Prevents fabricated numbers | Extra latency; template fallback needed |
| 009 | No server database in hackathon build | Fewer moving parts | No multi-user persistence (post-event) |
| 010 | Edge-first hosting: static app and gateway on Cloudflare, Python service on the team VPS behind Cloudflare Tunnel | Free edge, no open ports, persistent service without a card | Live new-field heavy layers depend on VPS availability |
| 013 | Google Cloud Run hosts the web app and Data & Science API (continuous delivery from `main`) | Team has GCP credits; scales to zero; no VPS to maintain; supersedes the VPS part of 010 for serving | Cold starts; the SI gateway stays a Cloudflare Worker |
| 011 | NVIDIA Brev for batch compute only | GPU on demand from team credits; nothing idles; demo never depends on an ephemeral instance | Outputs must be copied off before stop/delete; capacity can be unavailable at restart |
| 012 | Generative UI assistant (declarative A2UI catalog) | Visual answers suit low-literacy users better than long text, show the evidence directly, and reuse the app's components | Catalog must be designed and kept in sync with ui-kit; LLM must produce valid structured output (fallback layouts cover failures) |
