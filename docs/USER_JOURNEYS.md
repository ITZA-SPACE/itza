# Personas and User Journeys

Back to [PRD](../PRD.md). Feature IDs refer to [FEATURES.md](FEATURES.md).

Personas are composite archetypes built from the challenge brief and the demo-region context; they are not real individuals. They should be validated with at least one farmer and one extension officer.

---

## 1. Personas

### P1 · Rainfed family farmer (primary)

| | |
|---|---|
| **Context** | Farms ~12 ha of rainfed land on the Sétif high plains; durum wheat alternating with fallow, as the family has done for decades; keeps a small flock of sheep |
| **Goals** | Stable harvest in dry years; feed for sheep; avoid costly mistakes |
| **Frustrations** | Rain arrives late or not at all; advice is generic; apps are full of jargon |
| **Tech** | Android smartphone, intermittent 3G/4G, comfortable with messaging apps and icons, limited reading in French |
| **Language** | Darija day to day; Arabic script; some French |
| **Success looks like** | "I understand why the tool suggests chickpea instead of fallow, and I can show the card to the extension officer." |

### P2 · Commercial farm manager

| | |
|---|---|
| **Context** | Manages several hundred hectares, partly irrigated by center pivots in a Saharan wilaya; mixes cereals and forage |
| **Goals** | Reduce water use per tonne; plan rotations per field and zone; anticipate future heat |
| **Frustrations** | Rising pumping depth; heat waves at grain filling; uneven fields |
| **Tech** | Laptop and tablet; uses spreadsheets; open to data tools |
| **Success looks like** | "I can see which zones waste water and which rotation still works in 2050." |

### P3 · Extension officer / agronomist

| | |
|---|---|
| **Context** | Advises dozens of farmers across a daïra; limited time per farm |
| **Goals** | Give defensible, field-specific advice quickly; correct assumptions; document recommendations |
| **Frustrations** | No time to collect data; tools are black boxes; farmers distrust generic advice |
| **Success looks like** | "In two minutes I see the evidence, fix the soil value, and print a card for the farmer." |

### P4 · Hackathon judge (evaluation persona)

| | |
|---|---|
| **Context** | NASA, partner-agency or industry expert; reviews many projects; scores Impact, Creativity, Validity, Relevance, Presentation |
| **Goals** | Understand the problem, see real NASA data driving decisions, check scientific soundness, be convinced quickly |
| **Success looks like** | "Within the first 30 seconds I understood the idea; the science is credible; the NASA data is the engine." |

---

## 2. Journey A · Farmer chooses next season's rotation (P1)

**Trigger:** Late summer, deciding what to sow in autumn.

| Step | User action | System response | Features | Emotion / design note |
|---|---|---|---|---|
| A1 | Opens link shared by extension officer (often together with the officer) | Map centered on region; large icon prompt "Draw your field or tap it" | F-01, F-11, F-15 | Icons and visuals carry meaning; hackathon build is English only |
| A2 | Taps own field; adjusts corners with finger | Area shown; loading animation "Reading 25 years of your field from space…" | F-01, F-02 | Anticipation |
| A3 | Sees "Your field's memory": timeline of green and bare seasons | Proposed history: wheat-like / fallow alternating; "bare 7 months a year on average" | F-03 | Recognition: "Yes, that is my field" |
| A4 | Confirms seasons; corrects one year ("that was barley") | History saved as ground truth; confidence rises | F-03, F-20 | Ownership |
| A5 | Types (or taps suggestion chips): "Little water, I keep sheep, I want feed and good wheat" | Assistant answers with a pre-filled form (priority sliders, sheep toggle); farmer taps Confirm | F-15, F-05 | Effortless input; nothing changes without consent |
| A6 | Views three cards: current (wheat–fallow), wheat–chickpea, wheat–vetch/oat forage | Resilience headlines, evidence, benefits, gaps, risks, confidence | F-06, F-07, F-08 | Clarity; options, not orders |
| A7 | Taps "Ask about this" on the driest season | Assistant builds a visual answer: season snapshot, soil-water bars per rotation, observed NDVI, sources, "Show 2050" chip | F-07, F-15 | "I remember that year" |
| A8 | Moves rain slider to −20% | Rankings update; forage rotation most robust | F-09 | Agency |
| A9 | Taps "Share with my advisor" | PDF card with QR code | F-21 | Confidence to act after consultation |

**Pain points addressed:** jargon (visual answers + plain language), distrust (own field memory + evidence), connectivity (cached bundles, light cards).

## 3. Journey B · Farm manager plans irrigated fields (P2)

| Step | Action | System response | Features |
|---|---|---|---|
| B1 | Draws three pivot fields | Bundles load; GRACE card shows regional water-storage decline since 2003 | F-02, F-19 |
| B2 | Opens zones for pivot 1 | 3 zones from HLS NDVI stability, NISAR moisture, slope; zone 3 consistently weak | F-17, F-18 |
| B3 | Builds a custom 5-year rotation by drag-and-drop | Curves for water use, N, cover update live; warnings on repeats | F-13 |
| B4 | Compares against generated alternatives | Cards show irrigation need per rotation from water balance | F-07, F-08 |
| B5 | Opens 2050 mode (SSP2-4.5, SSP3-7.0) | Heat-day increase at grain filling; rotation with earlier-maturing crops keeps resilience | F-14 |
| B6 | Flies the 3D twin to show the board | Animated seasons over terrain, zone overlay | F-12 |

## 4. Journey C · Extension officer reviews a farmer's card (P3)

| Step | Action | System response | Features |
|---|---|---|---|
| C1 | Opens farmer's shared link | Same field, inputs and results restored | F-21 |
| C2 | Opens Methods and Evidence | Formulas, sources, resolutions, gaps | F-10, F-08 |
| C3 | Enters lab soil test (texture, organic matter) | Engine re-runs; available water changes; confidence moves to "high" | F-20 |
| C4 | Checks Model Arena for the worst year | Rule engine, ML model and satellite agree on stress in March; flag cleared | F-16 |
| C5 | Adds local note on disease risk for chickpea variety | Note appears in "risks for local review" | F-08 |
| C6 | Prints card for the farmer | Updated PDF | F-21 |

## 5. Journey D · Judge evaluates the project (P4)

Detailed script in [DEMO_STRATEGY.md](DEMO_STRATEGY.md).

| Moment | What the judge sees | Criterion |
|---|---|---|
| 0–10 s | The hook: "Every field has a memory. NASA has been recording it for 25 years." 3D field breathing through seasons | Presentation, Creativity |
| 10–40 s | Field drawn; history inferred; worst season detected from data | Relevance |
| 40–80 s | Season Replay of three rotations with evidence cards | Validity, Impact |
| 80–100 s | Question typed; the answer builds itself as an interactive screen with sources | Creativity, Impact |
| 100–115 s | Proof field: inferred history vs USDA crop map; ranking vs the Akron long-term trial | Validity |
| 115–130 s | 2050 replay; Model Arena agreement; disclaimers | Validity, Relevance |

## 6. Journey E · Proof field: a Great Plains farmer tests intensification (P2)

Context: a dryland farm manager near Akron, Colorado, with winter wheat alternating with fallow, considers a three-year wheat–millet–fallow or wheat–corn–fallow rotation.

| Step | What happens | Feature |
|---|---|---|
| 1 | Selects the field; Field Memory shows 20+ seasons of wheat/fallow alternation; each season sits next to the USDA crop-map label, with agreement shown | F-03, F-22 |
| 2 | Season Replay compares wheat–fallow, wheat–millet–fallow and wheat–corn–millet–fallow | F-07, F-08 |
| 3 | Validation view sets the ranking next to the published Akron trial findings, with agreement and differences explained | F-22 |
| 4 | 2050 mode shows how water stress for each rotation changes under SSP2-4.5 and SSP3-7.0 | F-14 |
| 5 | Exports the card for an extension agent | F-21 |

Outcome: the manager sees which intensified rotation would have held up in dry years, and judges see the method checked against real records.

## 7. Edge-case journeys

| Case | Expected behavior |
|---|---|
| Field smaller than one MODIS pixel | HLS used for history; MODIS shown as context with scale warning; confidence medium/low |
| Persistent clouds / missing NDVI seasons | Gaps flagged; season labeled "uncertain"; farmer asked to confirm |
| No internet after first visit | Cached field fully usable; new fields queued |
| Region without a knowledge pack | Generic global crop pack with low-confidence badges and a prompt to involve local experts |
| LLM quota exhausted | Assistant switches to template intents with predefined answer layouts (same components) |
| Irrigated field misread as rainfed | Model Arena disagreement (high NDVI despite modeled stress) prompts "Is this field irrigated?" |
| User asks for fertilizer dose | Assistant declines (non-goal) and suggests local agronomist |
