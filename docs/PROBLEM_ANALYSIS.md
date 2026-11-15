# Problem Analysis

This document breaks down the challenge statement, the judging criteria and the real-world problem. It maps each requirement to our product response so nothing in the brief is missed.

Back to [PRD](../PRD.md).

---

## 1. The challenge in one paragraph

_Field Shift: Adapting Farms with NASA Data_ asks teams to build a decision-support tool that combines NASA Earth observations with local soil information, crop characteristics and farmer priorities, so that farmers can explore crop-rotation strategies that strengthen soil health and resilience to changing weather and water conditions. The tool should support, not replace, farmer judgment and local expertise ([challenge page](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=details)).

Challenge metadata: difficulty Intermediate/Advanced; subjects Earth Science, Software, Arts & Multimedia. The Arts & Multimedia tag signals that visual storytelling and presentation are valued.

## 2. Requirement decomposition

The brief uses "you may" throughout. We treat every item as a scoring opportunity and map it explicitly.

### 2.1 Objectives

| # | Brief element | Product response | Where |
|---|---|---|---|
| O1 | Combine NASA Earth observations with local agricultural information (app, model, map or other tool) | Web app with interactive map, simulation engine and knowledge packs | [SOLUTION_OVERVIEW](SOLUTION_OVERVIEW.md) |
| O2 | Explore SMAP, ECOSTRESS, GPM, Landsat, MODIS, NASA POWER, GRACE/GRACE-FO, SRTM | All eight used, each with a defined role in the decision path | [NASA_DATA_SOURCES](NASA_DATA_SOURCES.md) |
| O3 | Analyze temperature, heat stress, rainfall, soil moisture, evaporation, frost risk, extreme precipitation, vegetation stress, long-term water trends | Climate Fingerprint indicators + Field Memory + GRACE card | [FEATURES](FEATURES.md) F-03, F-04, F-19 |
| O4 | Consider soil information, crop characteristics, farmer priorities (water use, forage, N-fixing, erosion, organic matter, market) | Soil auto-fill with override, crop trait pack, priority sliders and constraints | F-05, F-06, C-1 |
| O5 | Highlight when fields are typically bare | NDVI-based bare-window detection per season, from the field's own history | F-03 |
| O6 | Highlight seasons when current crops appear more vulnerable | Stress calendar from backtest: which stage, which year, which hazard | F-04, F-07 |
| O7 | Rotations that interrupt pest cycles, reduce water demand, improve infiltration, add income | Pest break rules, water balance, root depth/cover scoring, optional economics | F-07, F-25 |
| O8 | Compare at least three strategies including the existing rotation | Current rotation always pinned as baseline + ≥ 2 alternatives | F-06, F-08 |
| O9 | For each: why suggested, evidence, benefits, information gaps, risks needing local review | Five mandatory, schema-enforced fields on every card | F-08 |
| O10 | Supportive tool, not a replacement for judgment | Disclaimers, review flags, farmer confirmation loops, ground-truth override | F-08, F-20 |

### 2.2 Potential considerations

| Area | Brief element | Product response |
|---|---|---|
| Conditions & data | Relate temperature, moisture, rain, evaporation, vegetation stress to vulnerability and soil health | Backtest links each hazard to crop stages and to soil-health proxies |
| | Explain ET, soil moisture anomalies, NDVI, frost risk, water balance | Inline glossary, "explain this" tooltips, assistant answers in plain language |
| | Satellite vs ground measurements; combining both | Resolution badges, scale-mismatch confidence penalty, ground-truth input, model-vs-satellite cross-check |
| SI, modeling & fusion | Compare SI or statistical approaches on historical patterns | Model Arena: rule engine vs LightGBM stress model vs satellite observation; Prithvi foundation model layer |
| | SI to highlight seasonal transitions, bare-field periods, stressed periods | NDVI phenology detection (green-up, peak, senescence, bare), anomaly detection |
| | How the model interprets uncertainty; where local expertise is needed | Monte Carlo spread, agreement-based confidence, explicit gap list, "review locally" flags |
| | Harmonize datasets to a common analysis grid (SMAP, ECOSTRESS, GPM, Landsat/MODIS, GEDI, soil) | Two-tier harmonization: field-level time series on a common daily/seasonal axis; within-field 30 m zone grid |
| Rotation exploration | Compare by nutrient cycling, erosion, organic matter, pest disruption, water use, forage, market | Eight scored criteria with per-criterion contributions |
| | Map rotation ideas to priorities (water, income, soil structure) | Priority sliders re-weight live; rankings re-sort with explanation |
| | Explain N-fixing, cover, deep-rooting, drought-tolerant crops | "Why this crop" explainers tied to trait values |
| Mapping & visualization | Interactive maps of long-term trends (soil moisture, heat waves, water storage) | Timeline layers, GRACE trend, anomaly maps |
| | Field-level vulnerabilities: erosion zones, water-stress hotspots, frost-prone areas | Zones module, 3D twin with slope/flow paths, frost-pocket hint from terrain |
| | Timelines, overlays, scenario sliders | Timeline scrubber, dataset overlay compare, rain/temperature sliders, 2050 mode |
| Farmer-centered design | Interpretable for low technical skill | Plain-language cards, icons, visual answers |
| | Farmer priorities and constraints (water, equipment, market) | Constraint inputs act as hard filters |
| | Reminders that the tool supports local expertise | Persistent disclaimer, review flags, printable card for agronomist |

## 3. Judging criteria

The [2026 Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) scores every project 1–5 on five criteria at every judging level. Full rules: [CHALLENGE_RULES_2026.md §5](CHALLENGE_RULES_2026.md#5-judging-criteria-and-awards).

| Criterion | What "5" looks like (paraphrased from the 2026 guide) | How we target it |
|---|---|---|
| **Impact** | Addresses a significant problem; extensive reach; could change the world; quality far exceeds expectations | Food security + water scarcity in a wheat-import-dependent country; global pipeline; farmer and extension-officer use |
| **Creativity** | Groundbreaking, never-attempted approach; original and inventive | "Season Replay" backtesting framing; field's own satellite memory; 2050 replay; generative UI answers |
| **Validity** | Scientifically sound, technically feasible, fully developed, usable and user-friendly | FAO-56, NDVI phenology, model cross-checks, honest uncertainty, working product |
| **Relevance** | Fully addresses the challenge; NASA data is integral, not superficial | Every brief element mapped; ≥ 6 NASA products in the decision path; newest NASA data (NISAR 2026) |
| **Presentation** | Well-structured, compelling storytelling; judged from the demo and the full project | Story-first 30-second video and 7-slide deck; guided demo mode |

The guide asks teams to give Presentation equal attention. The [2026 Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) requires a demo (video of 30 seconds or less, or at most 7 slides; exceeding either makes the project ineligible), a public project link, a NASA data description, a complete References field and an SI-use answer, all in English.

Global awards (2026): Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology, Local Impact. We can credibly target Best Use of Data, Best Use of Science, Galactic Impact, Local Impact, Best Storytelling and Art & Technology.

Precedent: the 2025 Art & Technology global winner (Zumorroda-X, Cairo) answered an agriculture challenge with a story-driven game built on NASA data ([project page](https://www.spaceappschallenge.org/2025/find-a-team/zumorroda-x/?tab=project)). Judges reward agriculture projects that make NASA data emotionally understandable, not only technically correct.

## 4. Root-cause analysis

Why do farmers lack rotation decision support today?

| Symptom | Root cause | Product lever |
|---|---|---|
| Decisions rely on tradition and regional calendars | No field-specific evidence on how options behave under local weather | Field-specific backtest |
| Satellite data is unused by farmers | Data is fragmented across portals, formats, logins and units; needs expertise | One adapter layer and plain-language outputs |
| Advice ignores variability | Tools show averages, not distributions or bad years | Distribution of outcomes over 25 seasons + worst-year replay |
| Low trust in digital tools | Black-box recommendations and over-claiming | Evidence trail, uncertainty, farmer confirmation, local-review flags |
| Literacy and jargon barriers | Tools text-heavy, jargon-filled, desktop-only | Plain English, icons, visual tap-to-ask answers, mobile-first (localization post-event) |
| Future risk is invisible | Climate projections are expert-only | 2050 replay in the same interface |

## 5. Hero-field context

Two hero fields share one dilemma (rainfed cereal with fallow, under semi-arid climate) on two continents. The story field carries the human and local case; the proof field carries validation against public ground truth.

### 5.1 Story field: Algeria

- **System:** On the Sétif–Bordj Bou Arreridj high plains, cereals cover about 1.5 million ha a year, alternating with a similar area of fallow; rainfed cereals are directly exposed to climate variation ([CIGR Journal, 2025](https://cigrjournal.org/index.php/Ejounral/article/download/9973/4499/46523)).
- **Agronomic evidence:** A Sétif study (2016/17–2018/19) found that adding legumes (lentil, pea) to the rotation improved durum wheat performance compared with wheat monoculture, with larger differences in the 2016–17 drought season under no-till ([Agricultural Science Digest, 2024](https://arccjournals.com/journal/agricultural-science-digest/DF-438)).
- **National stakes and volatility:** FAO forecasts 2026 cereal production at about 5 Mt, nearly 30% above average after a wet season, with wheat import requirements still expected at 8.5 Mt for 2026/27; USDA FAS projected about 9.2 Mt of wheat imports for 2025/26. Large swings between drought and wet years are exactly the variability a season-by-season replay makes visible ([FAO GIEWS](https://www.fao.org/giews/countrybrief/country.jsp?code=DZA), [Milling MEA](https://millingmea.com/algeria-to-maintain-wheat-imports-at-9-2-mmt-in-2025-26-usda/)).
- **Water:** Irrigated Saharan agriculture draws on the North Western Sahara Aquifer System. A GRACE-based study estimated recharge around 1.4 km³/yr yet concluded the system remains overexploited, with about 60% of withdrawals uncompensated ([ScienceDaily summary of GRL 2013 study](https://sciencedaily.com/releases/2013/07/130722123014.htm)).
- **Local tie-in:** Boumerdes borders the Mitidja plain, which is FAO WaPOR's 20 m pilot area in Algeria ([FAO WaPOR Algeria](https://www.fao.org/in-action/remote-sensing-for-water-productivity/country-activities/algeria/fr)), useful for an optional coastal demo field.

### 5.2 Proof field: US Central Great Plains

- **Same system:** Winter wheat alternating with fallow is the traditional dryland rotation of the semi-arid Central Great Plains. At the USDA-ARS Central Great Plains Research Station in Akron, Colorado (about 14–18 inches, roughly 355–455 mm, of yearly precipitation), a long-term study has compared wheat–fallow with more intensive no-till rotations (wheat, corn, millet, pea, sunflower, triticale, fallow) since about 1990 ([USDA ARS AgResearch, 2011](https://agresearchmag.ars.usda.gov/2011/jan/rotations)).
- **Published findings to compare against:** Over 1994–2013, the economically most favorable sequences were no-till wheat–millet–fallow, wheat–corn–millet–fallow and wheat–millet; soil quality was best in continuously cropped rotations and poorest in wheat–fallow ([ASA-CSSA-SSSA 2014 abstract](https://scisoc.confex.com/crops/2014am/webprogram/Paper86202.html)). No-till wheat–millet could raise net income by up to $1,300 a year over no-till wheat–fallow on a 160-acre farm ([USDA ARS, 2011](https://agresearchmag.ars.usda.gov/2011/jan/rotations)).
- **Public ground truth:** The USDA NASS Cropland Data Layer labels crop type per 30 m pixel every year, so Field Memory can be scored season by season ([CDL](https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php)).
- **Data completeness:** The NASA POWER Projection API returned values for an Akron point (40.15 N, 103.15 W) for all three scenarios, where it returned fill values for the Sétif test point.

The product is global. Algeria gives the human, local worked case; the Great Plains give the proof. Together: _"Same dilemma, two continents. Validated where ground truth exists, then applied where it doesn't."_

## 6. Problem statement (final)

> Farmers in water-limited regions must choose crop rotations under rising climate variability without field-specific evidence of how each option would perform. ITZA gives them a tool that replays the real, satellite-measured history and plausible future of their own field on each candidate rotation, and explains, in plain language and with honest uncertainty, which options are most resilient and why.
