# Product Requirements Document

**Product:** **ITZA** (ITZA SPACE) · _See Earth Through Time._
**Challenge:** NASA Space Apps Challenge 2026: _Field Shift: Adapting Farms with NASA Data_
**Event:** November 14–15, 2026 · Local event: Boumerdes, Algeria
**Status:** v1 (pre-event product definition) · 2026-11-11
**Owners:** Product, Engineering, Data/Science, Design (team roles to be assigned)

> **One-line pitch:** ITZA is a flight simulator for crop rotations. It reads a field's own history from space, replays every real season of the past (and plausible seasons of 2050) on each candidate rotation, and shows the farmer which rotation would have held up best and why.

---

## 0. About this document

### 0.1 Scope of the PRD

This PRD says **what** the product must do, **for whom**, **why**, and **how success is measured**. It deliberately does **not** choose technologies, frameworks, hosting, specific datasets or algorithms. Those decisions belong to engineering and live in the linked documents, so they can change without changing the product definition. This follows common PRD practice: describe each feature and the user experience clearly "while leaving as much flexibility to the engineering team as possible" ([Cagan, SVPG](https://www.svpg.com/assets/Files/goodprd.pdf)), and keep technical design in a separate design document ([Plane](https://plane.so/blog/how-to-write-a-prd-that-engineers-actually-read)).

One property is intentional and must be preserved in future edits:

- **Data-independent.** Requirements are written against **information needs** (§8), not named datasets. Any dataset in the official challenge resources (released November 13) that meets an information need can be used without changing a requirement, a feature or the non-technical explanation of the solution.

### 0.2 Document map

| Document | Purpose |
|---|---|
| [docs/PROBLEM_ANALYSIS.md](docs/PROBLEM_ANALYSIS.md) | Challenge breakdown, judging criteria, root-cause analysis, regional context |
| [docs/RESEARCH.md](docs/RESEARCH.md) | Existing solutions, science, data landscape, review of the original team PRD |
| [docs/SOLUTION_OVERVIEW.md](docs/SOLUTION_OVERVIEW.md) | Concept, modules, differentiation, why it can win |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature specifications, priorities, acceptance criteria |
| [docs/USER_JOURNEYS.md](docs/USER_JOURNEYS.md) | Personas and end-to-end journeys |
| [docs/NASA_DATA_SOURCES.md](docs/NASA_DATA_SOURCES.md) | Candidate datasets per information need, live-verified status, plug-in model, test fields |
| [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) | Engineering design: stack, data adapters, engine methods, ML, SI, hosting, security |
| [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md) | Release tiers, agent workstreams, build sequencing, definition of done |
| [docs/DEMO_STRATEGY.md](docs/DEMO_STRATEGY.md) | Demo script, 30-second video, 7-slide deck, judging strategy |
| [docs/REFERENCES.md](docs/REFERENCES.md) | All sources and useful links |

### 0.3 Brand: ITZA

**Name:** ITZA (full form **ITZA SPACE**) · **Tagline:** _See Earth Through Time._

**Story behind the name.** ITZA is inspired by the Itzá, a Maya people known for their remarkable knowledge of astronomy, celestial movements and calendars. The Maya observed the Sun, stars and sky to understand time, seasons and life on Earth. That is the connection to this project: **the Maya looked from Earth to the sky to understand the seasons; ITZA looks from space to Earth to understand what comes next.** Using NASA satellite data, ITZA explores the land's past, analyzes its present and simulates possible futures to help farmers make better decisions.

**How the brand maps to the product**

| Brand idea | Product capability |
|---|---|
| The land's past | Field Memory: decades of satellite history of the field |
| Its present | Climate Fingerprint and current field state |
| Possible futures | Season Replay of each rotation and the 2050 mode |
| Better decisions | Evidence Cards: options, never orders |

**Usage rules:** write the name in capitals (ITZA, ITZA SPACE); use the tagline with the name on the title slide, video end card and printable card; "inspired by" is the wording for the Itzá reference (no Maya imagery or symbols used as decoration). Logo, colors and typography are still open (§13).

Terminology: Space Apps 2026 uses **SI (Super Intelligence)** in place of "AI". These documents follow that convention.

---

## 1. Problem

**Who:** Farmers and farm managers, especially in rainfed and water-limited regions, who decide each season what to plant on a specific field; and the extension officers who advise them.

**Pain:** Weather is less predictable, water is scarcer and soils are degrading. Choosing a rotation means trading off water use, soil health, pest cycles, income and timing, with no way to see how a choice would actually have performed on _this_ field under _its_ real weather. Advice is generic (regional calendars, tradition), and the data that could help (decades of NASA Earth observations) is locked behind expert tools.

**Evidence of the problem (story region, Algeria):** On the Sétif and Bordj Bou Arreridj high plains, cereals occupy about 1.5 million ha a year, alternating with a similar area of fallow, and rainfed cereal farming is directly exposed to climate variation ([CIGR Journal, 2025](https://cigrjournal.org/index.php/Ejounral/article/download/9973/4499/46523)). Algeria remains one of the world's largest wheat importers, with wheat import needs of 8.5–9.2 Mt depending on season and source ([FAO GIEWS](https://www.fao.org/giews/countrybrief/country.jsp?code=DZA), [USDA FAS via Milling MEA](https://millingmea.com/algeria-to-maintain-wheat-imports-at-9-2-mmt-in-2025-26-usda/)). Local trials show wheat yields higher after legumes than in wheat monoculture under semi-arid conditions ([Agricultural Science Digest, 2024](https://arccjournals.com/journal/agricultural-science-digest/DF-438)).

**Evidence that the problem is global (proof region, USA):** The same wheat–fallow dilemma exists on the semi-arid US Central Great Plains. A USDA-ARS rotation study at Akron, Colorado (about 14–18 inches of yearly precipitation) has compared wheat–fallow with more intensive rotations for about two decades; no-till wheat–millet could raise net income by up to $1,300 a year over no-till wheat–fallow on a 160-acre farm ([USDA ARS AgResearch, 2011](https://agresearchmag.ars.usda.gov/2011/jan/rotations); [ASA-CSSA-SSSA abstract, 2014](https://scisoc.confex.com/crops/2014am/webprogram/Paper86202.html)).

The opportunity is real on two continents; the decision support is missing. Full analysis: [docs/PROBLEM_ANALYSIS.md](docs/PROBLEM_ANALYSIS.md).

---

## 2. Vision and product principles

**Vision:** Every farmer can stress-test a planting decision against the real history, and plausible future, of their own field before committing a season to it.

**Principles**

1. **Evidence before advice.** Every claim traces to a measured value, its source and its spatial resolution.
2. **Options, never orders.** At least three rotations, including the current one; the farmer decides.
3. **Honest uncertainty.** Confidence is computed, information gaps are listed, and items needing local review are explicit.
4. **The field's own memory first.** Use the field's observed history before generic tables.
5. **Plain language.** One polished English interface; icons, suggested questions and visual answers for low-literacy users; no unexplained jargon.
6. **Wow with substance.** Every visual (3D field, time-lapse, 2050 mode) is driven by real data and serves a decision.
7. **Data-independent by design.** Features depend on information needs, never on one specific dataset; better data improves results without changing the product.
8. **Validated where truth exists, applied where it doesn't.** Methods are checked on fields with public ground truth before being trusted on fields without it.

---

## 3. Goals, non-goals and success metrics

### 3.1 Goals

| ID | Goal |
|---|---|
| G1 | Let a farmer compare at least 3 rotation strategies (current + alternatives) for a selected field, with why, evidence, benefits, information gaps and risks for each. |
| G2 | Ground every comparison in NASA Earth observations used as the core input, not decoration. |
| G3 | Quantify resilience by replaying rotations against every real season on record and against 2050 climate scenarios. |
| G4 | Reveal field-level vulnerability: bare-soil windows, stress seasons, erosion-prone slopes, within-field zones. |
| G5 | Be usable by non-technical farmers, in plain English with answers shown as visuals they can tap, not walls of text. |
| G6 | Be scientifically defensible: published methods, stated assumptions, cross-checks, and validation against ground truth. |

### 3.2 Non-goals

- Yield guarantees, financial forecasts or insurance-grade predictions.
- Fertilizer, pesticide or irrigation prescriptions (doses, products, schedules).
- Legal, subsidy or land-tenure advice.
- Replacing an agronomist's field visit or a soil laboratory test.
- Real-time sensor management (ITZA accepts manual ground observations only).
- A farm management or accounting system.

### 3.3 Success metrics

Hackathon-level metrics (measured at demo time):

| Metric | Target |
|---|---|
| Time from selecting a hero field to seeing a 3-rotation comparison | ≤ 5 s |
| Time for a new field anywhere on Earth (no cache) | ≤ 60 s for core results; progressive loading |
| Comparison cards with all five mandatory fields filled | 100% |
| Indicators shown with source, resolution and date | 100% |
| Seasons replayed per rotation (hero fields) | Every season with usable observations; target ≥ 20 |
| Distinct NASA data sources meaningfully used in the decision path | ≥ 6 |
| Non-technical tester completes the core flow unaided | < 5 min |
| Inferred field history matches public ground truth (proof field) | ≥ 80% of seasons |
| Inferred field history matches farmer-confirmed history (story field) | ≥ 80% of seasons |
| Rotation ranking on the proof field is consistent with published long-term trial findings | Direction of top/bottom rotations agrees; differences explained |
| Assistant question answered with a visual answer built only from approved components, with grounded numbers (no unsupported figures) | 100% of scripted demo questions |

Product-level metrics (post-hackathon pilot): weekly active fields, share of users who export or share a rotation card, share of comparisons reviewed by an extension officer, user-reported decision confidence before/after.

---

## 4. Users and contexts

### 4.1 Personas

| Persona | Need | Primary surfaces |
|---|---|---|
| **Smallholder / family farmer** (primary) | "What should I plant next on this field, and what could go wrong?" | Map, rotation cards, visual assistant, printable card |
| **Commercial farm manager** | Compare rotations across fields, quantify water risk, plan zones | Season replay, zones, 2050 mode, rotation builder |
| **Extension officer / agronomist** | Review evidence quickly, correct assumptions, advise many farmers | Evidence panel, assumptions editor, shared links, printable card |
| **Hackathon judge** | See scientific validity, NASA data depth, usability and story in minutes | Guided demo mode, methods panel, validation view |

Detailed personas and journeys: [docs/USER_JOURNEYS.md](docs/USER_JOURNEYS.md).

### 4.2 Hero fields (demo contexts)

The product works for any field on Earth. Two hero fields anchor the demo, each with a distinct job:

| Hero field | Role | Why |
|---|---|---|
| **Story field:** rainfed cereal–fallow field, Sétif high plains, Algeria | Carries the human story: the farmer's dilemma, local context, local impact | Real national problem; local judges; strongest Local Impact narrative |
| **Proof field:** rainfed wheat–fallow field, semi-arid US Central Great Plains (near Akron, Colorado) | Carries the scientific proof: inferred history checked against public crop-type ground truth; ranking checked against a published long-term rotation trial | Same farming system and dilemma on another continent, with rich public ground truth |

Pitch line: _"Same dilemma, two continents. Validated where ground truth exists, then applied where it doesn't."_ Exact field locations are chosen from data during the event ([docs/NASA_DATA_SOURCES.md](docs/NASA_DATA_SOURCES.md)). Further optional fields (irrigated desert pivots, coastal plains) may be added.

---

## 5. Solution concept

ITZA combines seven capabilities into one flow. Full description: [docs/SOLUTION_OVERVIEW.md](docs/SOLUTION_OVERVIEW.md).

1. **Field Memory.** The user draws or selects a field; years of satellite vegetation history reveal when it was cropped, fallow or bare, and infer the current rotation. The farmer confirms or corrects.
2. **Climate Fingerprint.** Decades of weather, rainfall and soil-moisture observations become frost days, heat days, dry spells, water balance and anomalies, with the worst seasons picked automatically.
3. **Rotation Lab.** ITZA proposes candidate rotations that fit the field; the farmer can drag crops onto a multi-year timeline to build their own.
4. **Season Replay.** Each rotation is replayed through every real season with a crop water, heat, frost, pest, soil-health and erosion assessment, producing a resilience profile ("water stress in 4 of 25 seasons vs 11 for your current rotation").
5. **Evidence Cards and Model Arena.** Ranked cards with why, evidence, benefits, gaps, risks and computed confidence; independent methods (rule-based simulation, a statistical model, direct satellite observation) cross-check each other.
6. **Immersive views.** A 3D field with animated vegetation and moisture over real terrain, within-field management zones, landscape context (groundwater trend, vegetation structure), and a "Your field in 2050" mode driven by climate projections.
7. **Visual (generative-interface) assistant.** Type or tap a question such as "why not chickpea?" (questions may be typed in any language; answers are always in English). The assistant answers by assembling an interactive visual answer on the spot (a replay chart, a side-by-side comparison, an evidence card, a map layer, a short form to confirm) from ITZA's own approved building blocks, with a short caption. Every number shown comes from computed results and data sources, never from the assistant itself. Buttons inside an answer ("try barley instead", "show 2050") run real comparisons.

---

## 6. Requirements

Priorities: **P0** = must exist in the submitted demo; **P1** = planned for the event build; **P2** = stretch / post-event. Detailed specs and acceptance criteria: [docs/FEATURES.md](docs/FEATURES.md). Release tiers and build plan: [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md).

### 6.1 Functional requirements

| ID | Requirement | Goals | Priority |
|---|---|---|---|
| FR-01 | Map with place search, field draw/edit, point select, layer toggles, timeline | G1, G5 | P0 |
| FR-02 | Field information assembly: all P0 information needs (§8) gathered for any field on Earth, with provenance | G2 | P0 |
| FR-03 | Field Memory: per-season vegetation profile, bare-soil windows, inferred rotation history with farmer confirmation | G2, G4 | P0 |
| FR-04 | Climate Fingerprint: frost, heat, dry spells, crop water demand, water balance, anomalies, worst-season detection | G2, G3 | P0 |
| FR-05 | Farmer inputs: current rotation, soil (auto-filled, editable), priorities, constraints | G1 | P0 |
| FR-06 | Candidate rotation generation filtered by climate window and constraints | G1 | P0 |
| FR-07 | Season Replay across all historical seasons with resilience metrics | G3 | P0 |
| FR-08 | Comparison of ≥ 3 rotations (current always included) with five mandatory fields and confidence | G1, G6 | P0 |
| FR-09 | Priority and scenario sliders (rain %, temperature) with live re-ranking | G1, G3 | P0 |
| FR-10 | Plain-language glossary and per-indicator source/resolution tags | G5, G6 | P0 |
| FR-11 | Plain-English interface: every screen, generated sentence, card and printout in clear, jargon-free English | G5 | P0 |
| FR-12 | 3D field view: terrain, animated vegetation/moisture over time, stress hotspots, water flow paths | G4 | P1 |
| FR-13 | Drag-and-drop multi-year rotation builder with live simulation curves | G1 | P1 |
| FR-14 | "Your field in 2050" mode across several emissions scenarios | G3 | P1 |
| FR-15 | Generative-interface assistant: typed or tapped questions answered with interactive visual answers composed from approved components, grounded in computed results; accepts questions in any language, answers in English | G5, G6 | P1 |
| FR-16 | Model Arena: independent methods compared, with per-factor explanations | G6 | P1 |
| FR-17 | Within-field management zones with per-zone notes | G4 | P1 |
| FR-18 | Within-field soil-moisture layer from the finest-resolution source available | G4 | P1 |
| FR-19 | Landscape context cards: regional groundwater trend, vegetation structure, crop water use | G2, G4 | P1 |
| FR-20 | Ground-truth input (soil test, planting dates, yields) overriding satellite estimates | G6 | P1 |
| FR-21 | Shareable link and printable one-page rotation card with QR code | G5 | P1 |
| FR-22 | Validation view: inferred history vs public ground truth, and ranking vs published trial findings (proof field) | G6 | P1 |
| FR-23 | Automated crop/fallow classification layer from imagery | G4, G6 | P2 |
| FR-24 | Automatic field boundary detection (click-to-field) | G1 | P2 |
| FR-25 | Simple economics layer (user prices, break-even proxy) | G1 | P2 |
| FR-26 | Offline use for cached fields, installable on a phone | G5 | P2 |

### 6.2 Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Location-agnostic:** any field on Earth runs through the same flow; region knowledge packs hold crops, pests and calendars. |
| NFR-02 | **Provenance end-to-end:** every value carries source, version, resolution, date range and quality flag. |
| NFR-03 | **Deterministic results:** the same inputs give the same ranking and breakdown; random spreads are reproducible. |
| NFR-04 | **Data independence:** adding, replacing or removing a data source for an information need requires configuration and a source connector only; no feature, requirement or user-facing explanation changes. |
| NFR-05 | **Demo resilience:** hero fields run fully without a live network connection. |
| NFR-06 | **Responsiveness:** re-ranking after a slider change feels instant (< 1 s for 10 rotations × 25 seasons); the interface never freezes during computation. |
| NFR-07 | **Accessibility:** WCAG 2.2 AA contrast and keyboard navigation; color-blind-safe palettes. |
| NFR-08 | **Low bandwidth:** core comparison usable on a 3G mobile connection; heavy layers load on demand. |
| NFR-09 | **Security and privacy:** no personal data required; secrets never exposed to the browser; field geometry shared with third parties only as needed for data queries. |
| NFR-10 | **Cost:** runs without paid services or credit cards; paid options are documented as optional only. |
| NFR-11 | **Grounded SI:** generative features may rephrase and route but never state a number that was not computed or retrieved by ITZA. |
| NFR-12 | **Graceful degradation:** when an information need has no usable source for a location, the affected feature says so, lowers confidence and continues. |
| NFR-13 | **Safe, consistent generated interfaces:** assistant answers are built only from a fixed set of approved, accessible components; the assistant never produces executable code or free-form page markup; any change to user settings requires the user's explicit confirmation; an invalid generated answer falls back to a predefined answer layout. |

---

## 7. Release criteria

| Tier | Contents | Exit criterion |
|---|---|---|
| **T0: Spine** | FR-01 to FR-11 | On both hero fields, a user selects the field, confirms history, sets priorities and sees ≥ 3 evidence cards from a full season replay, in English, offline |
| **T1: Signature** | FR-12 to FR-22 | The full demo script runs start to finish without manual steps, in under 3 minutes |
| **T2: Stretch** | FR-23 to FR-26, more region packs | Optional; never blocks T1 polish |

Workstreams, sequencing and definition of done: [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md).

---

## 8. Information requirements (data-independent)

Features depend on **information needs**, not on named datasets. Each need is satisfied by one or more ranked sources; the current candidates, verification status and the November 13 intake checklist are in [docs/NASA_DATA_SOURCES.md](docs/NASA_DATA_SOURCES.md).

| ID | Information need | Minimum to be useful | Used by | Priority |
|---|---|---|---|---|
| IN-01 | Daily weather history (temperature min/max, humidity, wind, solar radiation) | Global, daily, ≥ 20 years | FR-04, FR-07 | P0 |
| IN-02 | Daily precipitation history | Global, daily, ≥ 20 years | FR-04, FR-07 | P0 |
| IN-03 | Vegetation greenness time series | Field-relevant resolution, ≥ 16-day revisit, ≥ 20 years (coarser long record + finer recent record acceptable) | FR-03, FR-12 | P0 |
| IN-04 | Soil moisture (surface and/or root zone) | Daily to weekly, ≥ 5 years | FR-04, FR-16, FR-18 | P0 |
| IN-05 | Terrain elevation and slope | ≤ 30 m | FR-12, FR-17, erosion | P0 |
| IN-06 | Soil properties (texture, water holding capacity) | Point estimate, user-editable | FR-05, FR-07 | P0 |
| IN-07 | Crop knowledge (calendars, water needs by stage, temperature limits, pest hosts) | Per region pack, sourced | FR-06, FR-07 | P0 |
| IN-08 | Climate projections for mid-century | Daily or monthly, ≥ 2 emissions scenarios | FR-14 | P1 |
| IN-09 | Within-field moisture or vegetation variability | Finer than field size | FR-17, FR-18 | P1 |
| IN-10 | Regional groundwater / water-storage trend | Regional | FR-19 | P1 |
| IN-11 | Vegetation structure (height, canopy) | Sampled footprints acceptable | FR-19 | P1 |
| IN-12 | Actual crop water use (evapotranspiration) | ≤ 1 km | FR-16, FR-19 | P1 |
| IN-13 | Ground-truth crop type history | Any region with public labels | FR-22 | P1 |

Rules:

- Every source records its own resolution, period, latency and quality; the product shows them to the user.
- When several sources meet a need, the best available one is used per location and date, and the others serve as fallback or cross-check.
- At least one NASA source must serve each of IN-01 to IN-05 and IN-08, so NASA data stays the core of every decision.

---

## 9. Scientific validity requirements

- Crop water stress, heat and frost risk use **published, citable methods**; the chosen methods and formulas are documented in [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md).
- Every modeled quantity is cross-checked against an independent observation where one exists (e.g., modeled soil water vs observed soil moisture; modeled season vs observed vegetation).
- Inferred field history is validated against public ground truth on the proof field and against farmer confirmation on the story field.
- Results are relative comparisons labeled as counterfactual ("would have"), never forecasts.
- Assumptions are visible and editable; each crop parameter carries its source and confidence.

---

## 10. Constraints

- **Challenge rules:** NASA data must be central; SI use must be disclosed; submission follows the official Space Apps 2026 guides (to be re-checked on November 13).
- **Brand:** product name ITZA (ITZA SPACE), tagline "See Earth Through Time" (§0.3).
- **Cost:** no paid service or credit card required for the submitted product.
- **Language:** English only for the interface and all outputs. Questions to the assistant may be typed in any language. Localization (e.g., Arabic, French) is a post-event option and is not part of any release criterion.

---

## 11. Assumptions and dependencies

- The team uses multiple coding agents in parallel; scope is set by integration quality, not raw build time.
- A free NASA Earthdata Login account is available for authenticated datasets.
- Free SI language services are available without a credit card; otherwise predefined answer layouts (templates) are used.
- A local agronomist or experienced farmer can review the story-field case before submission.
- Public ground-truth crop maps exist for the proof-field region.

---

## 12. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Coarse data resolution vs field size | Certain | Medium | Show resolution; treat coarse data as context; use the finest available source for field-scale signals; confidence penalizes scale mismatch |
| Live data latency, outages or login friction during the demo | Medium | High | Hero fields precomputed and offline; live calls cached |
| Official challenge resources differ from assumptions | Medium | Medium | Information-need model (§8): new sources plug in without changing features |
| A data source has gaps for one region (e.g., projections missing at a point) | Observed | Medium | Ranked fallback sources per need; feature degrades honestly (NFR-12) |
| Crop and pest knowledge quality for the story region | Medium | High | Source + confidence per value; small curated crop set; local expert review |
| Story field lacks public ground truth | Certain | Medium | Proof field carries validation; story field uses farmer confirmation |
| Over-claiming (yields, guarantees) | Medium | High | Relative rankings only; counterfactual labels; mandatory gaps and risks fields |
| SI stating unsupported numbers | Medium | High | Only computed numbers allowed (NFR-11); visible sources; template fallback |
| Free-service terms change | Medium | Medium | Cost constraint enforced by design; paid options optional only |
| Scope breadth across many parallel agents | Medium | High | Contract-first interfaces, workstream ownership, integration gates ([MVP_SCOPE](docs/MVP_SCOPE.md)) |

Product disclaimers shown in the app:

- ITZA supports farmer judgment and local agricultural expertise; it does not replace either.
- Rankings are relative comparisons from historical data, projections and simplified models, not forecasts or guarantees.
- Every recommendation lists information gaps and risks that need local review.
- Satellite estimates differ from ground measurements; soil tests and field observations take precedence.

---

## 13. Open questions

- [ ] Which datasets and tools appear in the official Resources tab (Nov 13), and which information needs do they serve?
- [ ] Who on the team validates crop traits and pest rules for the story region?
- [ ] Exact polygons for the story field (Sétif) and the proof field (Central Great Plains)?
- [ ] Which 10 questions get predefined visual answer layouts for the offline/no-SI fallback?
- [ ] ITZA logo, color palette and typography.

---

## 14. Glossary

| Term | Plain meaning |
|---|---|
| **Vegetation greenness (e.g., NDVI)** | A satellite score from 0 to 1; higher means more living plants. |
| **Evapotranspiration (ET)** | Water leaving the field through soil evaporation and plant breathing. |
| **Reference ET (ET0)** | How much water a standard grass field would use in today's weather. |
| **Crop coefficient (Kc)** | How thirsty a crop is compared with standard grass, by growth stage. |
| **Soil moisture anomaly** | How much wetter or drier the soil is than normal for that date. |
| **Water balance** | Rain and stored soil water minus what the crop needs. |
| **Frost risk** | Chance of temperatures low enough to damage a crop at a sensitive stage. |
| **Fallow** | A season when the field is left unplanted. |
| **Season Replay** | Testing a rotation against real past weather to see how it would have performed. |
| **Emissions scenario (SSP)** | A standard climate-future storyline (low, middle or high emissions). |
| **Management zone** | A part of a field that behaves consistently differently from the rest. |
| **Ground truth** | Independently recorded facts (e.g., official crop maps) used to check ITZA's estimates. |
| **Information need** | A kind of data the product requires (e.g., daily rainfall), independent of which dataset provides it. |
| **Generative interface (GenUI)** | An assistant that answers by assembling interactive screens (charts, cards, forms) from approved building blocks, instead of replying with text only. |
