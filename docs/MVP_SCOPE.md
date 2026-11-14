# MVP Scope and Build Plan

What ships in the hackathon submission, how the work is split across parallel coding agents, the integration gates, and the definition of done.

Back to [PRD](../PRD.md). Feature specs: [FEATURES.md](FEATURES.md). Architecture: [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md).

---

## 1. Scope philosophy

The team builds with multiple coding agents in parallel, so raw build time is not the binding constraint. **Integration, data correctness and demo polish are.** Scope is therefore broad (all signature features are in), but sequenced so that:

1. a complete, honest end-to-end flow exists early (T0 spine);
2. every signature feature plugs into the same contracts (T1);
3. stretch work (T2) never blocks polish of what judges see.

## 2. Release tiers

### T0: Spine (must work before any T1 merge is demoed)

| Feature | ID |
|---|---|
| Map workspace (draw, layers, timeline, pixel footprints) | F-01 |
| Field data bundle (hero fields precomputed; live POWER + ORNL for any field) | F-02 |
| Field Memory | F-03 |
| Climate Fingerprint | F-04 |
| Farmer inputs | F-05 |
| Candidate generator | F-06 |
| Season Replay engine + replay view | F-07 |
| Evidence Cards (≥ 3, five mandatory fields, confidence) | F-08 |
| Priority and scenario sliders | F-09 |
| Glossary, provenance, Methods drawer | F-10 |
| Plain-English UI | F-11 |
| Knowledge packs (story: Algeria high plains; proof: US Central Great Plains) | C-1 |
| Provenance and confidence | C-2 |

**Exit criterion:** On both hero fields (story field in Sétif, proof field in the US Central Great Plains), a user selects the field, confirms history, sets priorities, and sees ≥ 3 evidence cards from a full season replay, in English, offline.

### T1: Signature (the wow layer; all planned for the event build)

| Feature | ID |
|---|---|
| 3D Field Twin with time-lapse | F-12 |
| Drag-and-drop Rotation Builder | F-13 |
| Your Field in 2050 | F-14 |
| Generative UI assistant (grounded, catalog-restricted) | F-15 |
| Model Arena (rule vs LightGBM vs satellite) | F-16 |
| Management zones | F-17 |
| NISAR snapshot | F-18 |
| GRACE / GEDI / ECOSTRESS context cards | F-19 |
| Ground-truth input | F-20 |
| Share link + rotation card PDF | F-21 |
| Validation view (proof field vs ground truth and published trial) | F-22 |
| Guided demo mode | C-3 |

**Exit criterion:** The full demo script in [DEMO_STRATEGY.md](DEMO_STRATEGY.md) runs start to finish without manual steps, offline-capable, in under 3 minutes.

### T2: Stretch

| Feature | ID |
|---|---|
| Prithvi-EO-2.0 crop/fallow layer (fine-tuning on Brev GPU credits makes this realistic) | F-23 |
| Click-to-field boundary detection | F-24 |
| Economics layer | F-25 |
| Offline PWA install | F-26 |
| Additional region packs (e.g., Mitidja irrigated, Saharan pivots) beyond the two hero packs | C-1 |
| Assistant answers pinned to workspace and added to the printable card | F-15 ext. |

**Rule:** T2 work merges only if it passes all gates and does not degrade T0/T1 performance or stability.

## 3. Workstreams for parallel agents

Each workstream has one owner (human lead + agent sessions), a clear directory boundary, and consumes/produces versioned contracts. Agents never edit another workstream's directory; cross-cutting changes go through the contracts workstream.

| WS | Name | Owns (paths) | Consumes | Produces | Tier |
|---|---|---|---|---|---|
| **A** | Contracts & fixtures | `schemas/`, `fixtures/`, `data-sources.yaml` | Docs | JSON Schemas, generated TS/Py types, fixtures for test fields | T0 (first) |
| **B** | Engine | `packages/engine/` | Schemas, fixtures, knowledge pack | Simulation, scoring, resilience, MC, scenarios, candidates, evidence | T0 |
| **C** | Browser adapters & bundle client | `packages/adapters-browser/`, `apps/web/src/data/` | Schemas, manifest | Canonical series from POWER/ORNL/CMR; bundle loader + IndexedDB cache | T0 |
| **D** | Science API & pipelines | `services/science-api/`, `pipelines/` | Schemas, manifest | Bundles (IMERG, SMAP, HLS, NISAR, GRACE, GEDI, NASADEM derivatives), demo bundle build, projection factors, tiles | T0→T1 |
| **E** | Map & app shell | `apps/web/src/map/`, `apps/web/src/app/` | Bundle client | Map workspace, layers, timeline, routing, layout (mobile/desktop) | T0 |
| **F** | Cards, sliders, copy, glossary | `apps/web/src/compare/`, `apps/web/src/copy/en/`, `packages/ui-kit/` | Engine outputs | Evidence cards, sliders, Methods drawer, plain-English copy | T0 |
| **G** | Field Memory & Climate views | `apps/web/src/memory/`, `apps/web/src/climate/` | Bundle, engine | History timeline, confirmation UI, heat strips, climate stripes, replay view | T0 |
| **H** | Knowledge packs | `packages/knowledge/` | Literature, local expert | Story pack (Algeria high plains) and proof pack (US Central Great Plains), crops, pests, calendar, with sources/confidence | T0 (human-in-loop) |
| **I** | 3D Field Twin | `apps/web/src/twin/` | Frames, terrain, zones | 3D view, time-lapse, flow paths, camera paths | T1 |
| **J** | Rotation Builder | `apps/web/src/builder/` | Engine | DnD timeline, live curves, warnings | T1 |
| **K** | Future 2050 | `apps/web/src/future/` + projection endpoint in D | Projection factors, engine scenarios | Time-travel view, SSP comparison | T1 |
| **L** | Assistant & SI gateway | `apps/web/src/assistant/`, `services/si-gateway/` | Engine tools, MCP | A2UI answer catalog (with ui-kit), tools, render pipeline, schema + grounding validators, fallback layouts | T1 |
| **M** | ML & Model Arena | `pipelines/ml/`, ML endpoints in D, `apps/web/src/arena/` | Bundles | LightGBM model + model card, SHAP, Arena view, validation view (F-22); Prithvi (T2) | T1 |
| **N** | Zones & context | `apps/web/src/zones/`, zone/context endpoints in D | HLS, NISAR, DEM, GRACE, GEDI | Zones, NISAR layer, context cards | T1 |
| **O** | Report, share, demo mode | `apps/web/src/report/`, `apps/web/src/demo/` | All views | PDF card, share links, guided demo | T1 |
| **P** | QA, performance & infra | `e2e/`, CI config, `infra/` (VPS compose, tunnel, Brev job scripts) | Everything | E2E, a11y, visual snapshots, perf checks, grounding eval | Continuous |

### Contract freeze

Workstream A publishes `schemas v1.0` first (Field Data Bundle, Knowledge Pack, Engine Input/Output, Evidence Card, Assistant Tool I/O). After freeze, changes require a version bump and a migration note; all consumers update in the same PR.

### Coordination rules for agent sessions

- One branch per workstream; small PRs; CI must pass (lint, types, unit, golden, schema, conformance).
- Every agent session starts by reading `PRD.md`, its workstream row, the relevant feature specs and schemas.
- No network access in tests; use `fixtures/`.
- Integration owner (human) merges in gate order and runs the demo script after each gate.

## 4. Sequencing and integration gates

Times are relative to the official event start.

| Gate | Target | Must be true | Workstreams |
|---|---|---|---|
| **G0 Contracts** | H+2 | Schemas v1.0 frozen; fixtures for 3 story fields (Sétif) + 3 proof fields (US Central Great Plains, with CDL labels); repo scaffold and CI green | A |
| **G1 Engine on fixtures** | H+8 | Engine produces resilience profiles and evidence cards from fixture bundles; golden tests pass | B, H |
| **G2 Spine** | H+14 | T0 exit criterion met with demo bundles | C, D, E, F, G |
| **G3 Live data** | H+18 | New field anywhere → POWER + MODIS live; science API adds IMERG/SMAP/HLS for both hero fields; official resource list mapped ([CHALLENGE_RULES_2026.md §7](CHALLENGE_RULES_2026.md#7-official-resources-for-field-shift-and-itza-coverage)) | C, D |
| **G4 Signature alpha** | H+26 | 3D twin, builder, 2050, assistant, Arena, zones, validation view each working on the hero fields | I–N |
| **G5 Feature freeze** | H+34 | T1 exit criterion; only fixes and polish after this | All |
| **G6 Story lock** | H+38 | Demo video recorded, 7-slide deck final, project page text drafted | O + presenters |
| **G7 Submission** | Before local deadline | Public links verified in a private browser; SI-usage and NASA-data fields completed | All |

Adjust hour targets to the Boumerdes local event schedule once announced.

## 5. Cut-line policy

If a T1 feature misses G4:

1. Ship it in **demo mode only** (precomputed outputs for the hero fields) if it is honest and labeled.
2. If not demo-ready by G5, hide it behind a flag; do not show half-working features to judges.
3. Priority order to protect: F-07 replay → F-08 cards → F-22 validation → F-12 3D → F-15 assistant → F-14 2050 → F-16 Arena → F-13 builder → F-17 zones → others.

## 6. Pre-event preparation (data and tooling readiness)

- Create free accounts: NASA Earthdata Login, Google AI Studio (Gemini key), Groq, Cloudflare, GitHub, NVIDIA Brev (redeem team credits).
- Prepare the team VPS and domain: domain DNS on Cloudflare, Docker installed, `cloudflared` ready (see [TECHNICAL_ARCHITECTURE §4.4](TECHNICAL_ARCHITECTURE.md#44-hosting-and-compute)).
- Confirm free-tier limits and card requirements for chosen hosts.
- Official Resources tab read on November 13 and mapped ([CHALLENGE_RULES_2026.md §7](CHALLENGE_RULES_2026.md#7-official-resources-for-field-shift-and-itza-coverage)); new sources follow the resource intake checklist ([NASA_DATA_SOURCES §6](NASA_DATA_SOURCES.md#6-plug-in-model-for-the-official-resources)).
- Shortlist hero-field locations (story: Sétif; proof: near Akron, Colorado, with CDL labels) and the local reviewer (agronomist/farmer) for the story-field case.

## 7. Definition of done (per feature)

- Meets acceptance criteria in [FEATURES.md](FEATURES.md).
- Every number shows provenance; gaps and risks populated where applicable.
- Runs from demo bundles offline; degrades gracefully with live data failures.
- Unit/golden/conformance tests added; E2E path covered for user-visible flows.
- Performance budget respected ([TECHNICAL_ARCHITECTURE §13](TECHNICAL_ARCHITECTURE.md#13-performance-budgets)).
- Accessible (keyboard, contrast, screen-reader labels).

## 8. Submission checklist

Based on the 2026 Project Submission Guide and Judging & Awards Guide (both dated 2026-11-12); details in [CHALLENGE_RULES_2026.md](CHALLENGE_RULES_2026.md).

- [ ] All team members registered on the same Local Event (Boumerdes), not waitlisted, and listed on the Members tab.
- [ ] Pre-hackathon work question answered in writing by the Local Lead or GO Team ([CHALLENGE_RULES_2026.md §2](CHALLENGE_RULES_2026.md#work-done-before-the-hackathon)).
- [ ] Project name and high-level summary (what it is, how it addresses the challenge, why it matters).
- [ ] Demo link: video of 30 seconds or less **or** at most 7 slides incl. title and intro, in English, showing team name, members and challenge; public, no login (we prepare both; see [DEMO_STRATEGY.md](DEMO_STRATEGY.md)).
- [ ] Final project link (public web app + public repository), tested in a private window; FortiGuard classification requested for the app domain.
- [ ] Detailed description: what it does, how it works, benefits, goals, tools, languages, hardware and software.
- [ ] NASA data: every NASA product with version and role (at least one is required for a Global Award).
- [ ] Space Agency Partner data and other references: every dataset, tile service, library, model, font and image, each with its license.
- [ ] Repository under an OSI-approved license; no third-party material with a usage restriction.
- [ ] SI-use answer completed; SI-generated images and video watermarked; SI-generated code, data and audio acknowledged in descriptive text and metadata; no NASA branding in SI-generated content.
- [ ] No likeness of persons under 18 in any material.
- [ ] Both checkboxes ticked (terms; original work and complete references) and "Submit for Judging" clicked before Sunday November 15, 23:59 local time.
