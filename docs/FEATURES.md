# Feature Specifications

Feature IDs match the functional requirement IDs in the [PRD §6.1](../PRD.md#61-functional-requirements) (F-07 implements FR-07, and so on). Each spec states user value, behavior, data, acceptance criteria and priority.

Data independence: the "Core NASA data" column and per-feature **Data** lines name the current candidate sources for each information need ([PRD §8](../PRD.md#8-information-requirements-data-independent)). Sources may be replaced or added on November 13 without changing a feature's behavior or acceptance criteria.

Priority: **P0** must be in the submitted demo · **P1** planned for the event build · **P2** stretch. Release tiers: [MVP_SCOPE.md](MVP_SCOPE.md). Architecture references: [TECHNICAL_ARCHITECTURE.md](TECHNICAL_ARCHITECTURE.md). Data references: [NASA_DATA_SOURCES.md](NASA_DATA_SOURCES.md).

---

## Overview

| ID | Feature | Priority | Wow | Core NASA data |
|---|---|---|---|---|
| F-01 | Map workspace | P0 | ● | Basemap + NASA layers |
| F-02 | Field data bundle | P0 | | POWER, IMERG, SMAP, MODIS, HLS, NASADEM |
| F-03 | Field Memory | P0 | ●● | MODIS MOD13Q1, HLS VI |
| F-04 | Climate Fingerprint | P0 | ● | POWER, IMERG, SMAP |
| F-05 | Farmer inputs | P0 | | SoilGrids (non-NASA) |
| F-06 | Candidate rotation generator | P0 | | Engine + knowledge packs |
| F-07 | Season Replay backtest | P0 | ●●● | All weather/moisture inputs |
| F-08 | Evidence Cards | P0 | ●● | All, with provenance |
| F-09 | Priority and scenario sliders | P0 | ●● | Engine |
| F-10 | Glossary and provenance tags | P0 | | — |
| F-11 | Plain-English UI | P0 | ● | — |
| F-12 | 3D Field Twin | P1 | ●●● | NASADEM, HLS, SMAP, NISAR |
| F-13 | Drag-and-drop Rotation Builder | P1 | ●● | Engine |
| F-14 | Your Field in 2050 | P1 | ●●● | NEX-GDDP-CMIP6 (POWER Projection) |
| F-15 | Generative UI assistant | P1 | ●●● | POWER MCP, CMR MCP, engine tools |
| F-16 | Model Arena | P1 | ●● | MODIS/HLS, SMAP, POWER |
| F-17 | Management zones | P1 | ●● | HLS, NISAR, NASADEM |
| F-18 | NISAR soil-moisture snapshot | P1 | ●● | NISAR L3 SME2 |
| F-19 | Landscape context cards (GRACE, GEDI, ECOSTRESS) | P1 | ● | GRACE-FO, GEDI, ECOSTRESS |
| F-20 | Ground-truth input | P1 | | — |
| F-21 | Share link and rotation card PDF | P1 | ● | — |
| F-22 | Validation view (proof field) | P1 | ●● | MODIS/HLS vs USDA CDL; engine vs published trial |
| F-23 | Prithvi crop/fallow layer | P2 | ●● | HLS, Prithvi-EO-2.0 |
| F-24 | Click-to-field boundary detection | P2 | ● | HLS / Sentinel-2 imagery |
| F-25 | Economics layer | P2 | | — |
| F-26 | Offline PWA | P2 | | — |

Cross-cutting capabilities used by many features: **C-1 Knowledge packs** (crops, pests, calendars), **C-2 Provenance and confidence**, **C-3 Guided demo mode**. Specified at the end.

---

## F-01 Map workspace · P0

**Value:** One place to find a field, see its conditions and launch analysis.

**Behavior**
- Basemap: vector street/terrain style plus satellite imagery toggle; place search (geocoder).
- Draw, edit and delete polygons; click-point mode creates a default 200 m square field.
- Derived on draw: area (ha), centroid, perimeter, mean slope, elevation.
- Layer panel: NDVI (latest / chosen date), soil-moisture anomaly, rainfall anomaly, heat days, frost days, bare-soil frequency, slope/erosion, NISAR moisture, zones. Each layer shows a one-sentence plain-language caption and a source/resolution chip.
- Timeline scrubber (month/season/year) synchronizes map layers and charts.
- Split/compare slider to compare two dates or two layers.
- Pixel footprint overlay: draws the SMAP 9 km cell, POWER grid cell and MODIS 250 m pixels over the field to make scale visible.

**Acceptance**
- Field drawn anywhere on land yields area and centroid instantly and starts bundle loading.
- Every visible layer has caption + source + resolution + date.
- Pixel footprint overlay renders for SMAP, POWER and MODIS.
- Works at 375 px width (mobile) with a bottom-sheet layout.

## F-02 Field data bundle · P0

**Value:** All the data the engine needs, for any field, with provenance.

**Behavior**
- On field creation, the client requests a **Field Data Bundle** (schema in TECHNICAL_ARCHITECTURE §5.3).
- Hero fields (story and proof) load from precomputed bundles (no network).
- New fields: browser fetches no-auth CORS sources directly (POWER daily 1981–present, ORNL MODIS NDVI 2000–present); the Python service adds authenticated sources (IMERG, SMAP L4, HLS VI, NISAR) when available. Results stream in progressively.
- Missing or failed sources degrade gracefully: the bundle records the gap; confidence drops; the UI shows "not available".
- Bundles are cached (IndexedDB client-side, file/object cache server-side) keyed by geometry hash + source versions.

**Acceptance**
- Demo field bundle loads in ≤ 1 s from cache.
- New field: weather + NDVI core available ≤ 60 s; additional sources appear progressively.
- Every series in the bundle carries `source`, `product`, `version`, `resolution_m`, `period`, `quality`.
- Killing network after first load still allows full analysis of that field.

## F-03 Field Memory · P0

**Value:** "Your field remembers." Shows when the field was green, bare or fallow, and proposes its rotation history.

**Behavior**
- Series: MODIS MOD13Q1 NDVI (16-day, 250 m, 2000–present) for long history; HLS VI NDVI (30 m, 2013/2015–present) for field-scale recent years; QA-masked, field-averaged (pixel weighting by overlap).
- Smoothing: Savitzky–Golay (fallback: harmonic fit) with cloud/QA gaps interpolated and flagged.
- Season segmentation by agricultural year (configurable start month per region; default September for Mediterranean winter cereals).
- Per season: green-up date, peak date and value, senescence, bare window (NDVI below region threshold, default 0.2, for ≥ 30 days), amplitude, integral.
- Label per season: `winter_crop`, `summer_crop`, `double_crop`, `fallow_or_bare`, `uncertain`, using rules on timing and amplitude; P2 upgrade via Prithvi (F-23).
- Proposed history timeline with icons; farmer taps to confirm/edit each season (crop chosen from pack).
- Summary insights: "Your field was bare for an average of 7 months per year"; "Fallow in 9 of 25 seasons"; "Green-up arrived 3 weeks later in dry years".

**Acceptance**
- For demo fields, ≥ 80% of seasons match the confirmed history.
- Bare-window statistic shown per season and as a multi-year heat strip (month × year).
- Each season label shows its confidence and the NDVI curve on tap.
- Confirmed seasons are stored and used by F-07 as the baseline rotation.

## F-04 Climate Fingerprint · P0

**Value:** Turns decades of weather and moisture into the few numbers that matter for crops.

**Behavior**
- Inputs: POWER daily (T2M_MAX, T2M_MIN, T2M, RH2M, WS2M, ALLSKY_SFC_SW_DWN, PRECTOTCORR, GWETROOT), IMERG daily precipitation, SMAP L4 root-zone and surface soil moisture.
- Reference ET0 by FAO-56 Penman–Monteith from POWER variables (cross-checked with POWER's own ET outputs where available).
- Per season/month: rainfall total, max daily intensity, dry-spell length, frost days (< 0 °C, and < −2 °C), heat days (> 30/35 °C, crop thresholds), growing degree days, ET0, rain − ET0, soil-moisture anomaly vs climatology (z-score).
- Precipitation source policy: IMERG Final where available, IMERG Late for recent months, POWER PRECTOTCORR as fallback; per-day source recorded.
- Worst-season detection: lowest rainfall, highest heat, deepest soil-moisture anomaly, worst frost; top 3 offered for replay.
- Climate stripes and anomaly calendar visual.

**Acceptance**
- All indicators computed for every season with usable observations (target ≥ 20) on both hero fields.
- Worst seasons identified automatically and listed with their key anomaly.
- Each indicator explains itself in one sentence and shows source.

## F-05 Farmer inputs · P0

**Value:** Captures what only the farmer knows.

**Behavior**
- Current rotation: prefilled from Field Memory; editable.
- Soil: texture, organic carbon, pH, available water capacity, depth. Prefilled from SoilGrids (REST; fallback WCS or regional default), each value tagged with source; farmer soil test overrides.
- Priorities (0–5 sliders): save water, soil health/organic matter, nitrogen, erosion control, forage, income/market, pest-cycle break.
- Constraints (hard filters): irrigation available (none / supplemental / full, with mm cap), equipment limits (e.g., no row-crop planter), livestock (yes/no), market access per crop (yes/no), crops to exclude.
- Natural-language entry via the assistant (F-15): typing "10 ha, little water, I keep sheep" returns a pre-filled `ConfirmForm`; values apply only after the user confirms.

**Acceptance**
- No analysis runs with an unset rotation or soil; defaults are visible and labeled as defaults.
- Every soil value displays its source; overrides persist.

## F-06 Candidate rotation generator · P0

**Value:** Brings good options the farmer may not have considered.

**Behavior**
- Enumerates sequences of 2–5 seasons from the region crop pack (C-1).
- Filters: planting window vs climate (frost-free days, season length), temperature range, hard constraints, pest break intervals.
- Pre-scores with the engine; keeps top N diverse candidates (diversity by family composition), default N = 6, shows top 2–4 plus current.
- Always includes the confirmed current rotation as baseline.

**Acceptance**
- Generates ≥ 2 feasible alternatives for demo fields.
- No candidate violates a hard constraint (property-tested).
- Generation + scoring of ≤ 500 candidates < 500 ms in a Web Worker.

## F-07 Season Replay backtest · P0 (signature)

**Value:** Shows how each rotation would actually have fared in every real season, including the worst ones.

**Behavior**
- For each rotation × historical season: daily simulation (TECHNICAL_ARCHITECTURE §6):
  - FAO-56 root-zone water balance (Kc curves by stage, TAW from soil + rooting depth, depletion, Ks stress, deep percolation, runoff via curve-number simplification).
  - Thermal: frost/heat events weighted by stage sensitivity.
  - Nitrogen credit, residue/root biomass, ground-cover months.
  - Pest pressure: host-family returns within break interval × weather risk (wet spells for fungal, warm dry spells for insects).
  - Erosion index: slope × IMERG intensity × (1 − cover).
- Outputs per rotation: per-season criterion scores; composite score; **resilience profile** (seasons with severe water stress, frost/heat hits; worst-season score; median; P10–P90 spread; win rate vs baseline).
- **Replay view:** pick a season (e.g., auto-selected worst) → animated side-by-side timeline of soil water, stress days and cover for each rotation, synchronized with the real NDVI observed that season.
- Monte Carlo (seeded, ~200 draws) over uncertain parameters (Kc ±10%, TAW ±20%, sowing date ±10 days) yields confidence bands.
- Labels: "model-based counterfactual, not measured yield".

**Acceptance**
- 10 rotations × 25 seasons × daily steps + Monte Carlo completes < 1 s in the browser.
- Engine is deterministic for a given seed (golden tests).
- Water-balance outputs within tolerance of a reference implementation (FAO-56 worked examples; optional AquaCrop-OSPy comparison) on test cases.
- Replay view plays any season for ≥ 3 rotations simultaneously.

## F-08 Evidence Cards · P0

**Value:** A comparison the farmer and the agronomist can trust.

**Behavior**
- ≥ 3 cards side by side (stacked on mobile); baseline pinned and labeled.
- Mandatory fields: **why suggested, evidence, benefits, information gaps, risks needing local review**; plus score, resilience headline, confidence label, per-criterion contribution bar.
- Evidence items are structured objects (`indicator`, `value`, `comparison`, `source`, `resolution`, `period`), rendered as plain-English sentences from templates; tap to see the chart.
- Information gaps auto-generated from bundle gaps, scale mismatch, trait confidence, missing soil test.
- Risks from rule hits (pest, frost, waterlogging, market) and Model Arena disagreements.
- "Why not X?" button for any excluded crop: shows the filter or criterion that removed it.

**Acceptance**
- Schema validation rejects any card missing a mandatory field or with an evidence item lacking source.
- Contribution bars sum to the composite score.

## F-09 Priority and scenario sliders · P0

**Value:** "What if I care more about water?" "What if rain drops 20%?"

**Behavior**
- Priority sliders re-weight criteria; rankings and explanations update in < 100 ms.
- Scenario sliders: rainfall −30% to +30%; temperature 0 to +4 °C; applied as deltas to the historical series, then full replay.
- Presets: "drought year", "hot spring", "wet spring".
- Robustness readout: rotation with the smallest score drop across scenarios.

**Acceptance**
- Moving a slider visibly changes ranking/explanations for demo fields.
- Scenario re-runs complete < 1 s.

## F-10 Glossary and provenance tags · P0

**Behavior:** Hover/tap any term (NDVI, ET, Kc, anomaly, frost risk, water balance, SSP) for a plain-language definition with an icon; every number has a provenance chip (source · resolution · period). A "Methods" drawer documents formulas and assumptions.

**Acceptance:** All glossary terms from PRD §14 available; no number without provenance.

## F-11 Plain-English UI · P0

**Behavior:** One English interface, written for non-specialists: short sentences, everyday words, icons next to key terms, metric units. All generated sentences come from English templates. UI strings live in one file, so localization can be added after the event without code changes (not in scope now).

**Acceptance:** Full flow usable in English by a non-technical tester; no missing string keys or jargon without a glossary link; copy reviewed once end to end.

---

## F-12 3D Field Twin · P1 (wow)

**Value:** Makes the field's history visible and emotional: the field breathes green and brown through the years in 3D.

**Behavior**
- 3D terrain from NASADEM/SRTM-derived terrain tiles; vertical exaggeration control.
- Draped textures: HLS NDVI (30 m) per date via dynamic tiles (TiTiler-CMR) or precomputed PNG sequence; soil moisture (SMAP/NISAR) as a translucent layer.
- Time-lapse player: animates seasons/years; play, pause, speed, loop; synced with Field Memory timeline.
- Overlays: flow paths and accumulation from DEM (erosion risk), slope classes, frost-pocket hint (low-lying concavities), zones (F-17).
- Camera presets: orbit, field close-up, "drone fly-in" for demo.
- "Replay mode" link: while F-07 replays a season, the twin shows the observed NDVI of that season.

**Acceptance**
- 60 fps target (≥ 30 fps minimum) on a mid-range laptop for a hero field.
- Time-lapse of ≥ 10 years plays smoothly with preloaded frames.
- 2D fallback renders the same layers when WebGL2 is unavailable.

## F-13 Drag-and-drop Rotation Builder · P1 (wow)

**Value:** The farmer designs their own rotation and sees consequences instantly.

**Behavior**
- Crop palette (icons, family color) → drag onto a 3- to 10-year season timeline (winter/summer slots per year; fallow and cover crops allowed).
- Live curves: soil water stress days, nitrogen balance, ground-cover months, pest pressure, optional margin.
- Inline warnings: "Wheat after wheat: take-all risk", "Chickpea sown too late for your frost-free window".
- "Score my design": runs full replay and adds the design as a card in F-08.
- Keyboard and touch accessible.

**Acceptance**
- Drag, reorder, remove with mouse, touch and keyboard.
- Curves update < 150 ms after each change.

## F-14 Your Field in 2050 · P1 (wow)

**Value:** Shows which rotation stays robust as the climate shifts.

**Behavior**
- Data: NASA NEX-GDDP-CMIP6 via POWER Projection API (daily/monthly, 0.25°, SSP1-2.6/2-4.5/3-7.0, ensemble or chosen model); fallback to NEX-GDDP-CMIP6 files (AWS S3 open data / NCCS THREDDS subsetting) processed by the Python service.
- Method: delta-change. Monthly change factors (model 2041–2060 vs model historical baseline) applied to the field's observed 2001–2025 daily weather; replay all rotations; report shift in resilience profile.
- UI: time-travel slider (Today → 2050); scenario selector; "climate stripes" of the future; side-by-side resilience change per rotation; model spread shown as range.
- Labels: "scenario, not forecast"; model and scenario named on every number.

**Acceptance**
- Demo field shows 2050 results for 3 SSPs with a model-spread range.
- Delta method and baseline period shown in Methods drawer.

## F-15 Generative UI assistant · P1 (wow)

**Value:** A farmer asks a question and gets an answer they can *see and touch*, not a wall of text. The answer is a small interactive screen built from the same charts and cards as the rest of the app.

**What "generative UI" means here.** The assistant does not only write text. For each question it chooses and arranges components from a fixed, approved catalog, binds them to computed data, and the app renders them natively. This follows the 2026 "declarative" generative-UI pattern (the agent describes UI as data, the client renders its own trusted components), not the open-ended pattern where a model writes HTML ([CopilotKit guide, 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026), [A2UI](https://a2ui.org/)).

**Behavior**
- **Input:** typed text in any language the LLM understands (English expected; Arabic, Darija or French accepted as best effort, no extra work); suggested-question chips per screen; **"Ask about this"** on any chart bar, season, card or map zone (sends that element as context).
- **Output language:** always English, whatever the question language.
- **Reasoning:** LLM with tool calling (Gemini free tier default; provider-agnostic). Data tools: `get_field_summary`, `run_backtest`, `compare_rotations`, `explain_exclusion(crop)`, `get_season(year)`, `define_term`, plus NASA POWER MCP (climatology, point statistics) and NASA CMR MCP (dataset discovery, citations). UI tool: `render_answer(surface)`, which returns a declarative answer surface.
- **Answer catalog (the only components the assistant may place):**

| Component | Shows | Bound to |
|---|---|---|
| `Caption` | 1–3 plain-language sentences | Text (numbers checked by validator) |
| `ReplayBars` | Seasons with water/heat/frost stress per rotation | `run_backtest` output |
| `RotationCompare` | 2–4 rotations side by side (resilience, soil, risk) | `compare_rotations` output |
| `EvidenceCard` | Why · evidence · benefits · gaps · risks · confidence | Engine evidence object |
| `SeasonSnapshot` | One year: rain, frost, heat, soil moisture vs normal | `get_season` output |
| `ClimateStrip` | Monthly anomaly strip, worst years highlighted | Climate fingerprint |
| `FutureToggle` | Today vs 2050 (SSP choice) for one rotation | Scenario backtest |
| `MapFocus` | Mini map or main-map layer change (zones, NDVI, moisture) | Bundle layers |
| `ConfirmForm` | Pre-filled priorities/constraints with sliders and a Confirm button | Proposed values (not applied until confirmed) |
| `ActionChips` | Follow-ups such as "Try barley instead", "Show 2050", "Open in 3D" | Each chip maps to one allowed tool or navigation |
| `SourceChips` + `TraceDrawer` | Data sources, tools called, local-review note | Tool provenance |

- **Grounding by binding:** numbers in components are *bound* to tool results (data paths), not typed by the LLM. The LLM picks layout and writes captions; the grounding validator checks every number in captions against the turn's tool outputs.
- **Validation and fallback:** each surface is schema-checked against the catalog before rendering. On failure, the error goes back to the model once for self-correction; on a second failure the app shows the **predefined layout** for that intent (static GenUI). With no LLM available, the top 10 intents are matched by templates and render the same components.
- **Human in the loop:** anything that changes state (priorities, constraints, the current rotation) appears as a `ConfirmForm`; nothing is applied until the user taps Confirm. Read-only actions (open 2050, compare barley) run directly.
- **Keep the answer:** "Pin" adds an answer surface to the workspace; "Add to card" puts it in the printable rotation card (F-21).
- **Consistency and access:** catalog components are the app's own components, so answers share styling, keyboard access and color-blind-safe palettes (NFR-07). Answers stream in progressively (skeleton first, then data).
- **Never:** model-written HTML/JavaScript, iframes or remote UI in the farmer app; prescriptions (doses, products, schedules).

**Acceptance**
- Scripted demo questions answered in English, each with ≥ 1 data-tool call and a rendered surface using ≥ 2 catalog components.
- 100% of generated surfaces pass catalog schema validation or fall back to the predefined layout (never a broken screen).
- Automated check: no numeric token in a caption absent from tool outputs (grounding test); all chart numbers come from bindings.
- "Try barley instead" chip in a `RotationCompare` answer reruns the backtest and updates the surface in < 2 s on a hero field.
- Works offline / without an LLM via templates for the top 10 intents.

## F-16 Model Arena · P1

**Value:** Answers the brief's "compare different SI or statistical approaches" and shows uncertainty honestly.

**Behavior**
- Three opinions per field-season: (1) **rule engine** (F-07), (2) **ML stress model**: gradient-boosted trees (LightGBM) trained on regional pixels/seasons to predict seasonal NDVI peak anomaly from weather/moisture features (POWER, IMERG, SMAP), with SHAP explanations, (3) **satellite observation**: actual NDVI and SMAP anomalies.
- Agreement matrix and "disagreement flags" (e.g., model predicts stress but NDVI stayed high → irrigation or data issue → local review).
- Feeds the confidence label (C-2).
- Optional 4th opinion from Prithvi (F-23).

**Acceptance**
- Arena view for any demo season shows three opinions, agreement score and SHAP top drivers.
- Model card documents training data, period, validation score (spatial/temporal holdout), and limitations.

## F-17 Management zones · P1

**Value:** "Not all of your field behaves the same."

**Behavior**
- Inputs on a 30 m grid clipped to the field: multi-year HLS NDVI statistics (mean, CV, peak timing), NISAR 200 m moisture (resampled, flagged as coarser), slope/flow accumulation (NASADEM).
- Clustering: k-means (k = 2–4, chosen by silhouette) with zone-stability check across years; fuzzy c-means optional.
- Per-zone notes: "Zone 2 (low, wet in spring): waterlogging and root-rot risk; consider a later-sown crop"; per-zone mini-backtest using zone-adjusted soil water parameters.
- Minimum field size (e.g., ≥ 3 ha / ≥ 30 HLS pixels); otherwise disabled with explanation.

**Acceptance**
- Demo field shows 2–4 zones with stability score and per-zone notes.
- Zones exportable as GeoJSON.

**Web implementation (#23):** the field step lists zones with stability, notes and a provenance chip,
draws them on the map, replays one reference crop per zone (zone slope and soil water, no Monte Carlo)
and downloads the GeoJSON. Zones come from `layers.zones` of the bundle, else `POST /v1/zones`.

**Service implementation (#14):** The backend returns field-clipped GeoJSON with
source provenance, retained-pixel coverage, silhouette and annual stability.
It disables analysis below 3 ha / 30 usable HLS pixels or without two comparable
years. Optional zone runoff scenarios preserve caller AWC and adjust only curve
number for slope, explicitly labeled low-confidence scenarios. Engine mini-backtest
execution is a downstream consumer. See [spatial methods and API](../services/science-api/README.md#terrain-frame-sequences-and-management-zones)
for observation sufficiency, local unfilled D8, missing-source handling and coarse
NISAR limits. F-12's backend frame index supplies transparent geographic PNGs with
source/date/bounds; every image is bounded to 150,000 bytes.

## F-18 NISAR soil-moisture snapshot · P1

**Value:** The newest NASA mission (launched 2025; science data public since July 2026) shows moisture at 200 m.

**Behavior**
- Fetch NISAR L3 SME2 provisional granules intersecting the field (2026-06-17 onward); show latest and a small gallery; compare with SMAP 9 km for the same date.
- "Provisional product" badge and quality flags.

**Acceptance**
- Demo field displays at least one NISAR snapshot with date, quality and SMAP comparison.

## F-19 Landscape context cards · P1

**Behavior**
- **GRACE/GRACE-FO:** terrestrial water storage anomaly trend (JPL mascon RL06.3) for the field's region, 2002–present, with plain message ("regional water storage has declined by X cm since 2003"); strongest for irrigated Saharan fields.
- **GEDI:** canopy height/cover footprints within ~2 km: detect tree rows, windbreaks, orchards; crop-height evidence where footprints fall on the field (tall vs short crop). Shown as context with sparse-coverage disclaimer.
- **ECOSTRESS:** Evaporative Stress Index / LST scenes at 70 m when available for the field; used as evidence of water stress in specific dates.

**Acceptance:** Each card shows data date, resolution, coverage note and a one-sentence takeaway; missing coverage shown explicitly.

## F-20 Ground-truth input · P1

**Behavior:** Farmer/agronomist enters soil test, planting/harvest dates, yields per season, irrigation events; these override satellite/derived values, re-run the engine, and raise confidence; changes logged with "observed by user" provenance.

**Acceptance:** Entering a soil test changes TAW and visibly updates replay results and confidence.

## F-21 Share link and rotation card PDF · P1

**Behavior:** One-page printable card per field (English): map thumbnail, 3 rotations, resilience headlines, evidence, gaps, risks, disclaimer, QR code to the live view. Share link encodes field + inputs (no personal data).

**Acceptance:** PDF renders cleanly on A4 and Letter; share link restores identical results.

## F-22 Validation view (proof field) · P1

**Value:** Shows judges and agronomists that the method works where the truth is known, before it is applied where it is not.

**Behavior**
- **History check:** on the proof field (semi-arid US Central Great Plains, wheat–fallow), the Field Memory label per season is shown next to the public crop-type label for the same field and year (USDA NASS Cropland Data Layer, or any official labels provided on November 13). A confusion summary gives agreement per class (crop / fallow) and overall.
- **Ranking check:** the Season Replay ranking of rotations that match those of the USDA-ARS Akron long-term rotation study (wheat–fallow vs more intensive rotations) is set next to the direction of the published findings. Agreement and disagreement are both shown, with the likely reasons.
- **Transfer statement:** a plain sentence explains what this proves and what it does not prove for the story field (no public ground truth there; farmer confirmation is used instead).
- Available as one step in guided demo mode (C-3) and as a tab in the Methods drawer.

**Data:** IN-03 vegetation history and IN-13 ground-truth labels ([PRD §8](../PRD.md#8-information-requirements-data-independent)); published trial summaries ([USDA ARS, 2011](https://agresearchmag.ars.usda.gov/2011/jan/rotations); [2014 abstract](https://scisoc.confex.com/crops/2014am/webprogram/Paper86202.html)).

**Acceptance**
- Per-season agreement with ground truth computed for ≥ 15 seasons on at least 3 proof fields; result shown whatever its value (no cherry-picking).
- Ranking comparison names the trial, its rotations and its period, and labels the comparison as directional (the trial measured yields and income; ITZA compares stress and soil-health proxies).
- Works offline from precomputed results.

---

## F-23 Prithvi crop/fallow layer · P2

**Behavior:** Fine-tune Prithvi-EO-2.0 (tiny-TL or 100M-TL for CPU inference) via TerraTorch on HLS multi-temporal chips for crop/fallow (and cereal/legume where labels exist; labels from confirmed fields and public datasets). Output per-season class map as a 4th opinion in Model Arena and an alternative Field Memory labeler.

**Acceptance:** Validation metrics reported on held-out fields; inference for a hero field < 30 s on CPU or precomputed.

## F-24 Click-to-field boundary detection · P2

**Behavior:** Click inside a field → Fields of The World pretrained model (or HLS-based segmentation) proposes the polygon; user accepts/edits.

**Acceptance:** Proposed boundary within the hero-field regions accepted without edits for ≥ 70% of test clicks.

## F-25 Economics layer · P2

**Behavior:** User or regional prices and costs per crop → indicative margin per rotation and per season in replay; clearly labeled as proxy.

## F-26 Offline PWA · P2

**Behavior:** Installable app; cached fields and engine fully functional offline; sync when online.

---

## Cross-cutting capabilities

### C-1 Knowledge packs

Versioned YAML/JSON packs per region, validated by JSON Schema (implementation, sources and review status: [`packages/knowledge/README.md`](../packages/knowledge/README.md)):

- **Crops:** family, Kc (ini/mid/end) and stage lengths, rooting depth, depletion fraction p, base/optimal/max temperature, frost and heat thresholds by stage, sowing window, season length, N credit, residue/root biomass index, cover months, forage value, market flag; each value with `source` and `confidence`.
- **Pests/diseases:** pathogen → host families/crops, soil persistence (years), weather drivers, minimum break interval.
- **Calendar:** agricultural-year start month, regional sowing windows.
- **Story pack (Algeria high plains, initial set to validate):** durum wheat, bread wheat, barley, oats, chickpea, lentil, faba bean, field pea, vetch–oat forage, rapeseed, sunflower (spring), potato (irrigated), plus fallow and cover-crop options.
- **Proof pack (US Central Great Plains, semi-arid rainfed):** winter wheat, proso millet, corn (dryland), sunflower, field pea, triticale, plus fallow; values sourced from FAO-56 and US extension and USDA-ARS publications. This set covers the rotations of the Akron long-term study so F-22 can compare like with like.

### C-2 Provenance and confidence

- Every value: `source`, `product`, `version`, `resolution_m`, `period`, `quality`, `derived_from`.
- Confidence = f(data coverage, resolution vs field size, model–satellite agreement, trait confidence, ground truth present), mapped to high/medium/low with the reasons listed.

### C-3 Guided demo mode

A scripted, resettable walkthrough over the two hero fields (story field in Sétif, proof field in the US Central Great Plains), with fixed inputs and camera paths, for judges and recording; each step can be advanced by keyboard; works fully offline.
