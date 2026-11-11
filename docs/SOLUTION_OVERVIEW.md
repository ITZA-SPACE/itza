# Solution Overview

What ITZA is, how it works, how NASA data drives it, and why it is different.

> **ITZA SPACE: See Earth Through Time.** Named after the Itzá, a Maya people famed for astronomy and calendars. The Maya looked from Earth to the sky to understand the seasons; ITZA looks from space to Earth to understand what comes next: the land's past, its present and its possible futures. Full story: [PRD §0.3](../PRD.md#03-brand-itza).

Back to [PRD](../PRD.md). Feature specifications: [FEATURES.md](FEATURES.md).

---

## 1. Concept

> **A flight simulator for crop rotations.** Pilots train on simulators before risking a real aircraft. Farmers risk a whole season every time they choose what to plant. ITZA lets them "fly" each rotation through the real weather of the last 25 years and through plausible futures, using NASA's record of their own field, before they commit.

Four ideas make it distinctive:

1. **The field remembers.** Satellites have watched every field on Earth for decades. ITZA reads that memory: when the field was green, bare or fallow, how wet the soil was, how hot the summers got.
2. **Replay, don't predict.** Instead of a single forecast, each rotation is replayed through every real season on record. The farmer sees a distribution of outcomes, including the worst year, not a promise.
3. **Validated where truth exists.** The method is checked on a US Great Plains wheat–fallow field against official crop maps and a long-term rotation trial, then applied to fields without such records, like the Sétif high plains.
4. **Answers you can see.** Ask a question and the assistant builds a small interactive screen (replay chart, comparison, evidence card) with its reasons, sources, gaps and risks, in plain English.

## 2. Product modules

```
            ┌────────────────────────────────────────────────────────────┐
            │                        The farmer                          │
            │  draws a field · confirms its history · sets priorities    │
            └──────────────┬─────────────────────────────────▲───────────┘
                           │                                 │ cards, 3D, visual answers, PDF
┌──────────────────────────▼───────────┐     ┌───────────────┴──────────────────────┐
│ 1 FIELD MEMORY                       │     │ 6 EVIDENCE CARDS + MODEL ARENA       │
│ 25 yrs NDVI → seasons, bare windows, │     │ why · evidence · benefits · gaps ·   │
│ inferred rotation (MODIS, HLS)       │     │ risks · confidence; rule vs ML vs    │
├──────────────────────────────────────┤     │ satellite agreement                  │
│ 2 CLIMATE FINGERPRINT                │     ├──────────────────────────────────────┤
│ POWER, IMERG, SMAP → frost, heat,    │     │ 7 IMMERSIVE VIEWS                    │
│ dry spells, ET0, anomalies, worst yrs│     │ 3D twin · zones · 2050 · GRACE/GEDI  │
├──────────────────────────────────────┤     ├──────────────────────────────────────┤
│ 3 ROTATION LAB                       │     │ 8 ASSISTANT                          │
│ candidates + drag-and-drop builder   │     │ generative UI answers, grounded tools│
├──────────────────────────────────────┤     │ NASA POWER MCP + CMR MCP             │
│ 4 SEASON REPLAY ENGINE               │────▶└──────────────────────────────────────┘
│ FAO-56 water balance + thermal, pest,│
│ N, cover, erosion → resilience       │
├──────────────────────────────────────┤
│ 5 FUTURE REPLAY                      │
│ NEX-GDDP-CMIP6 SSP scenarios 2050    │
└──────────────────────────────────────┘
```

### 2.1 Field Memory

Draw a field, or click and let a field-boundary model suggest one. ITZA pulls MODIS NDVI (250 m, 2000–present) and HLS NDVI (30 m, 2013/2015–present) for the polygon, smooths the series, and splits it into seasons. For each season it reports: green-up, peak, senescence, bare-soil window, and a label (winter cereal-like, summer crop-like, fallow, uncertain). The result is a proposed rotation history ("2019 wheat-like, 2020 fallow, 2021 wheat-like…"). The farmer confirms or edits it; confirmed seasons become ground truth that improves confidence.

**Why it matters:** answers the brief's "times when fields are typically bare" directly from the field's own record, and removes the need to type the current rotation.

### 2.2 Climate Fingerprint

From NASA POWER daily weather (1981–present), GPM IMERG precipitation and SMAP soil moisture, ITZA computes per season: rainfall total and intensity, dry-spell length, frost days, heat days (crop-specific thresholds), reference ET, simple water balance, soil-moisture anomaly. It automatically flags the worst seasons (driest, hottest, most frost-hit) for replay.

### 2.3 Rotation Lab

The engine proposes candidate rotations from the region's crop pack, filtered by climate window (planting window, temperature range), farmer constraints (irrigation, equipment, livestock, market) and pest break rules. The farmer can also drag crops onto a 3- to 10-year timeline; curves for soil water, nitrogen, cover, pest pressure and (optionally) margin update live.

### 2.4 Season Replay engine (signature)

Each rotation is simulated day by day through each real season:

- **Water:** FAO-56 root-zone balance with crop coefficient curves, soil available water, depletion and stress coefficient.
- **Thermal:** frost and heat events in each crop's sensitive stages.
- **Soil health proxies:** legume nitrogen credit, residue and root biomass, months of ground cover.
- **Pest pressure:** host-family returns within break intervals, scaled by wet or warm spells.
- **Erosion:** slope × rainfall intensity × cover index.

Output per rotation: a **resilience profile**: how many seasons had severe water stress, frost or heat damage risk, the worst-year outcome, median and spread of the composite score, and win rate against the current rotation. Example headline: _"Across 25 real seasons, Rotation B ran short of water in 4 seasons; your current rotation did in 11."_

### 2.5 Future Replay ("Your field in 2050")

The same engine replays 2041–2060 seasons built from NASA NEX-GDDP-CMIP6 projections (SSP1-2.6, SSP2-4.5, SSP3-7.0) using a delta-change method on the field's observed weather. The farmer sees which rotation stays robust as conditions shift. Projections are labeled as scenarios, not forecasts.

### 2.6 Evidence Cards and Model Arena

At least three rotations appear side by side, the current rotation pinned as baseline. Each card has five mandatory fields:

| Field | Example (illustrative values) |
|---|---|
| **Why suggested** | "Replaces bare fallow with a legume that fits your winter rainfall window." |
| **Evidence** | "Soil water fell below the stress threshold in March in 11 of 25 seasons for wheat–fallow; 4 of 25 for wheat–chickpea (FAO-56, POWER + IMERG)." |
| **Benefits** | "~40 kg N/ha credit for next wheat; 5 more months of ground cover; breaks cereal disease cycle." |
| **Information gaps** | "No local soil test; SMAP pixel (9 km) larger than field; chickpea market price from national average." |
| **Risks for local review** | "Ascochyta blight risk in wet springs (2 of 25 seasons); confirm variety and sowing date with extension service." |

A confidence label (high/medium/low) is computed from data coverage, resolution vs field size, model–satellite agreement and trait confidence. The **Model Arena** shows where independent methods agree or disagree: rule engine vs ML stress model vs what satellites actually observed.

### 2.7 Immersive views

- **3D field twin:** NASA terrain (NASADEM/SRTM) in 3D with animated NDVI and soil-moisture draped over it; scrub through seasons and years; see bare periods, stress hotspots on slopes and flow paths.
- **Management zones:** multi-year HLS NDVI stability, NISAR 200 m moisture and slope split the field into zones with per-zone notes.
- **Landscape context:** GRACE/GRACE-FO water-storage trend for the region's aquifer; GEDI canopy structure (tree rows, windbreaks, orchards) around the field; ECOSTRESS evaporative stress when scenes exist.

### 2.8 Assistant

A generative UI assistant answers questions such as "Why not chickpea?" or "What happened in the dry year?" typed (or tapped from suggestions); questions can be typed in any language, and answers are in English. Instead of a block of text, it assembles an interactive answer from the app's own approved components: a replay chart of the dry year, chickpea and fallow side by side, an evidence card, source chips, and follow-up buttons such as "Try barley instead" or "Show 2050" that run real comparisons. It calls engine tools and NASA data tools (NASA POWER MCP, NASA CMR MCP); chart numbers are bound to those tool results and captions are checked, so it never invents a figure. From a sentence ("10 hectares, little water, I keep sheep") it shows a pre-filled form that the farmer confirms. It never writes code or free-form screens; if a generated answer is invalid, a predefined layout is shown.

## 3. How NASA data contributes

| NASA source | Role in the decision |
|---|---|
| **NASA POWER** (daily, 1981–present) | Temperature, humidity, radiation, wind → reference ET, frost/heat days, disease weather; backbone of every replay |
| **NASA POWER Projection** (NEX-GDDP-CMIP6) | 2050 scenario replay |
| **GPM IMERG** | Daily rainfall, intensity, dry spells, erosion driver |
| **SMAP L3/L4** | Soil-moisture anomalies; independent check on the modeled water balance |
| **MODIS MOD13Q1 / MOD16** | 25-year vegetation history (Field Memory); ET cross-check |
| **HLS 30 m (Landsat + Sentinel-2)** | Field-scale NDVI, zones, 3D time-lapse texture |
| **NASADEM / SRTM** | Slope, aspect, flow paths, erosion, 3D terrain, frost-pocket hint |
| **NISAR** (2026) | 200 m soil-moisture snapshot for within-field differences |
| **GRACE / GRACE-FO** | Regional groundwater/water-storage trend (irrigation sustainability context) |
| **ECOSTRESS** | 70 m evaporative stress / LST evidence when scenes exist |
| **GEDI** | Landscape structure and crop-height context |
| **Prithvi-EO-2.0** (NASA/IBM) | Foundation-model crop/fallow classification as an independent opinion |

## 4. Differentiation

| Typical agri dashboard | ITZA |
|---|---|
| Shows current NDVI and weather | Reads 25 years of the field's own history and infers its rotation |
| One recommendation or score | ≥ 3 options with distributions across every real season |
| Averages | Worst years, spread, win rate, future scenarios |
| Black-box | Five-field evidence cards, per-criterion contributions, model cross-checks |
| English, desktop | Plain English, visual answers, mobile, printable |
| One dataset per screen | Multi-mission fusion with provenance on every number |

## 5. Why it can win

| Criterion | Argument |
|---|---|
| Impact | Food and water security in a wheat-import-dependent, drought-exposed country; the same dilemma shown on a second continent; global by design; usable by extension services at scale |
| Creativity | "Season Replay" and "the field remembers" are new framings anyone understands; 2050 replay and answers that build themselves as interactive screens are memorable |
| Validity | FAO-56, published phenology methods, cross-validation against SMAP and NDVI, explicit uncertainty; history validated against USDA ground truth and ranking compared with a 20-year USDA-ARS rotation trial on the proof field; a working product, not slides |
| Relevance | Covers every element of the brief; ≥ 6 NASA products in the decision path; uses data released in 2026 (NISAR) and NASA's own MCP servers |
| Presentation | Two hero fields, one dilemma: a Sétif field tells the story (worst recorded season, then 2050, a question answered with a live visual); a Great Plains field proves the method. _"Same dilemma, two continents."_ |

## 6. What it deliberately does not do

No yield guarantees, no input prescriptions, no subsidy advice, no replacement of agronomists. ITZA shows options and evidence; people decide. See PRD §3.2.
