# Demo and Judging Strategy

How we present ITZA to local and global judges: the story, the live demo script, the 30-second video, the 7-slide deck, criterion-by-criterion tactics, and rehearsal plan.

Back to [PRD](../PRD.md). Judging criteria analysis: [PROBLEM_ANALYSIS §3](PROBLEM_ANALYSIS.md#3-judging-criteria).

---

## 1. What judges see

| Channel | Format | Weight |
|---|---|---|
| Project submission page | Summary, description, NASA data, SI usage, links | Majority of evaluation |
| Demo | At most 7 slides (incl. title and intro) **or** a video of 30 seconds or less; exceeding either limit makes the project ineligible ([2026 rules](CHALLENGE_RULES_2026.md#2-eligibility-for-global-judging-mandatory)) | Strongly affects Presentation score |
| Final project link | Live web app + repository | Validity, usability |
| Local event pitch (Boumerdes) | Live presentation per local format | Local judging → Global Nominee |

The 2026 Judging & Awards Guide reminds teams to give equal attention to Presentation; judges score it from the demo and the full project. We prepare **both** the video and the deck, and a live demo for the local pitch.

## 2. The story

**Name line (title slide, opening and close):** _"ITZA SPACE: See Earth Through Time."_

**Name story (10 seconds, say it once):** _"The Maya, and the Itzá people, looked from Earth to the sky to understand the seasons. ITZA looks from space to Earth to understand what comes next."_ It bridges straight into the hook and explains past, present and future in one breath.

**Hook (one line):** _"Every field has a memory. NASA has been recording it for 25 years. We let farmers replay it before they plant."_

**Narrative arc**

1. **The farmer's dilemma.** A wheat field on the Sétif high plains. Every autumn the same question: wheat again, leave it fallow, or try something new? A wrong guess costs a whole year.
2. **The field remembers.** The 3D field breathes green and brown through 25 seasons. ITZA has read its history from NASA satellites, including the bare months.
3. **Replay the past.** The worst season in the record (detected from data) replays on three rotations. Soil water drains fastest under the current one; the legume rotation holds.
4. **Ask, and see the answer.** The farmer asks: "Why chickpea and not fallow?" The answer builds itself on screen: chickpea and fallow side by side, the soil-water chart of the dry year, an evidence card with NASA sources. One tap on "Try barley instead" reruns the comparison.
5. **Fly into 2050.** The same rotations replay under NASA climate projections. One stays robust.
6. **Same dilemma, two continents.** The globe flies to a wheat–fallow field on the US Great Plains. There, official crop maps exist: the inferred history is scored against them season by season, and the rotation ranking is compared with a 20-year USDA field trial (results shown whatever they are). Validated where truth exists, applied where it doesn't.
7. **Honest by design.** Gaps, risks and "check with your agronomist" are always visible. Three independent methods agree or flag disagreement.
8. **Close.** _"Not a prediction. A rehearsal. For every field on Earth, starting with ours."_

**Story constraints:** use real data for both hero fields; report the proof-field agreement whatever its value; pick the replay season from the data (the worst season detected by the Climate Fingerprint), never from assumption; label counterfactuals; no invented testimonials.

## 3. Live demo script (3 minutes, local pitch)

Runs in guided demo mode (C-3), offline-capable.

| Time | Screen | Spoken line (summary) | Proof point |
|---|---|---|---|
| 0:00–0:15 | Globe → zoom to Algeria → Sétif plains (3D) | The hook | NASA terrain, cinematic open |
| 0:15–0:35 | Draw field; "Reading 25 years…"; Field Memory timeline | "It found 9 fallow seasons and 7 bare months a year" (values from data) | MODIS + HLS history |
| 0:35–0:50 | Climate Fingerprint; worst season auto-flagged | "This season had the deepest soil-moisture deficit on record" | POWER, IMERG, SMAP |
| 0:50–1:20 | Season Replay of 3 rotations; Evidence Cards | Read one card: why, evidence, benefit, gap, risk | FAO-56 engine, provenance chips |
| 1:20–1:40 | Typed question; generative UI answer assembles (comparison + chart + evidence card); tap "Try barley"; open tool trace | "The assistant doesn't just talk, it builds the answer from our own charts, and every number comes from a tool, with its source" | Generative UI assistant + POWER MCP |
| 1:40–1:55 | Rain slider −20%; ranking shifts; robust rotation | "Options, not orders" | Live re-ranking |
| 1:55–2:15 | 2050 mode (SSP2-4.5 / SSP3-7.0) | "The legume rotation stays robust; heat at grain filling rises" | NEX-GDDP-CMIP6 |
| 2:15–2:35 | Globe flies to the proof field (Great Plains); history vs USDA crop map; ranking vs Akron trial | "Same dilemma, two continents. Where official records exist, our history matches X% of seasons" (value from data) | MODIS/HLS vs CDL; USDA-ARS trial |
| 2:35–2:45 | Model Arena + zones + NISAR snapshot (back on the story field) | "Three methods agree; the newest NASA radar sees the wet corner" | LightGBM, satellite, NISAR 2026 |
| 2:45–3:00 | Printable card; disclaimer; close | The close | Real-world handoff |

Backup: a screen recording of the same script, and static screenshots in the deck.

**Implementation notes (guided demo mode, `apps/web/src/demo/`).** The script runs as ten
keyboard-advanced steps (→ / space forward, ← back, Reset returns to step one with the field
deselected). Every step is a real screen, never a recording: Field Memory, Climate Fingerprint,
Season Replay, the sliders and 2050 reuse the same components the rest of the app uses, with fixed
inputs (the story field, history scenario, accepted defaults, then −20% rainfall) applied before
each is shown. The assistant step runs the real offline template path (`answerOffline`, no network,
no model) with that path's own worked example question ("Why is the top rotation ranked first?")
rather than the illustrative "why chickpea" line above, since the exact crop pairing is not
guaranteed to be the field's real top rotation; the resulting evidence card, scores and provenance
are genuinely computed. It does not include the "Try barley instead" action chip, because the
offline template builder does not generate one for any intent yet — a presenter wanting that moment
live can open the real assistant panel and ask a follow-up question. The proof-field step (2:15–2:35) flies the 3D view to the first Akron proof field and shows the
validation view (#39), which reads the three real proof fields (`akron-proof-1` to `-3`, with USDA
CDL histories): the history check agrees on 78 % of seasons (below the 80 % target) and the
ranking check disagrees with the Akron trial's direction, both shown as measured. The Arena step
returns to the story field. The Model Arena, zones and NISAR/GRACE/GEDI/ECOSTRESS panels read the
hero field's precomputed `ml.json`, `zones.json` and `context.json` (`data/precomputed.ts`) and only
ask the science API for a field that has no precomputed files, so the whole script runs with no
network.

Each step has a time slot (`DEMO_STEP_SECONDS`: 15, 20, 15, 30, 20, 15, 20, 20, 10, 10 s, 175 s in
total, under the three-minute limit; a test checks the sum). The header shows the slot, and **P**
(or the Play button) runs the script by itself on that schedule and stops on the last step;
→ / space, ←, and Reset work as before. Measured so far: the schedule adds up, the step logic is
tested, and the run has not yet been timed with a person presenting on a real browser.

## 4. 30-second video

Constraints (2026 Submission Guide): 30 seconds or less, public link with no login, English (or English subtitles), no copyrighted music without license, no likeness of persons under 18, any SI-generated imagery or video carries a visible SI watermark, and SI-generated content contains no NASA logos, flags or mission identifiers. The guide's suggested beat sheet (name and team, challenge, project title, how it works with NASA data, future) fits the plan below.

| Sec | Visual | Text on screen / voice-over |
|---|---|---|
| 0–4 | Night globe → sunrise over a field (3D twin) | "Every field has a memory." |
| 4–9 | Field Memory time-lapse: green/brown seasons, NASA mission labels | "NASA has recorded it for 25 years." |
| 9–15 | Three rotations replaying the worst season; soil-water bars draining | "We replay every real season on every rotation." |
| 15–20 | Question → interactive answer assembling itself (chart, comparison, sources) | "Ask a question. The answer builds itself, from real data." |
| 20–23 | Slider to 2050; robust rotation highlighted | "Then we fly into 2050." |
| 23–25 | Globe swings to a Great Plains field; "Checked against USDA records: X% of seasons agree" badge (value from data) | "Same dilemma, two continents." |
| 25–30 | Printable card + "Supports, never replaces, local expertise"; end card "ITZA SPACE: See Earth Through Time." | "Not a prediction. A rehearsal." |

Production: screen capture at 60 fps from guided demo mode; English subtitles; royalty-free or original audio; final export 1080p.

## 5. Seven-slide deck

| # | Slide | Content |
|---|---|---|
| 1 | **The dilemma** | One farmer, one field, one question; Sétif cereal–fallow context (1.5 Mha cereals alternating with fallow; import dependence); the same wheat–fallow dilemma on the US Great Plains |
| 2 | **The insight** | "Every field has a memory": NASA has 25 years of it; nobody lets farmers use it |
| 3 | **The product** | Field Memory → Season Replay → Evidence Cards → 2050 → Generative UI assistant (one screenshot each) |
| 4 | **NASA data as the engine** | Mission-to-decision map (POWER, IMERG, SMAP, MODIS, HLS, NASADEM, NISAR, GRACE, ECOSTRESS, GEDI, NEX-GDDP, Prithvi) |
| 5 | **Science and honesty** | Proof field: history vs USDA crop map and ranking vs the Akron long-term trial; FAO-56 water balance, phenology, Model Arena agreement, uncertainty, five mandatory card fields |
| 6 | **Impact** | Who benefits (farmers, extension services), global pipeline, local validation, path to pilots |
| 7 | **Demo and team** | QR to live app, 30-second video link, team, SI usage disclosure; close on "ITZA SPACE: See Earth Through Time." |

The 2026 guide requires the deck to show the **team name, team members' names and the selected challenge**, and to be in English; slide 7 carries the team and slide 1 names the challenge.

Design: high-contrast, large type, real screenshots, one idea per slide. Slide 1 title: "ITZA SPACE" with the tagline; the name story is spoken, not a slide of its own. Say "inspired by the Itzá"; no Maya imagery as decoration.

## 6. Criterion tactics

| Criterion | Tactics | Evidence to show |
|---|---|---|
| **Impact** | Anchor in a real national problem; show the same dilemma on a second continent; show scale (global pipeline) and the human handoff (printable card for extension officers) | FAO/USDA figures, two hero fields |
| **Creativity** | Lead with the "replay, don't predict" framing; field memory; generative UI answers; 2050 replay | Distinctive visuals (3D breathing field, replay bars) |
| **Validity** | Name methods (FAO-56, NDVI phenology), show cross-checks and uncertainty, working product | Validation view (proof field vs CDL and Akron trial), Methods drawer, Model Arena, golden tests, farmer labels on the story field |
| **Relevance** | Walk the brief: ≥ 3 rotations incl. current; five fields; bare periods; vulnerable seasons; SI comparison; uncertainty; harmonization; sliders | Requirement map ([PROBLEM_ANALYSIS §2](PROBLEM_ANALYSIS.md#2-requirement-decomposition)), data matrix |
| **Presentation** | Story-first, two hero fields with distinct jobs (story, proof), rehearsed timing, subtitles, crisp visuals | Video, deck, live script |

Award categories to mention in the submission narrative: Best Use of Data, Best Use of Science, Local Impact, Galactic Impact, Best Storytelling, Art & Technology.

## 7. Submission page copy plan

- **High-level summary (≤ 3 sentences):** problem → solution → why it matters.
- **Detailed description:** modules, how it works, benefits, tech stack, limitations.
- **NASA data:** one line per product: name, version, resolution, role.
- **Space Agency Partner data and other references:** every dataset, tile service, library, model, font and image, each with its license (mandatory in 2026; see [CHALLENGE_RULES_2026.md §6](CHALLENGE_RULES_2026.md#6-licensing-and-attribution-mandatory)). Credit ESA/Copernicus Sentinel-2 (used through HLS S30) as partner data.
- **SI usage:** coding agents used to build; Gemini (or other) for the generative UI assistant with tool grounding and catalog-restricted UI; LightGBM and Prithvi for modeling; human review of all outputs.

## 8. Anticipated judge questions

| Question | Answer outline |
|---|---|
| "Why two fields?" | The story field shows the real local need; the proof field shows the method is right where public records exist. Same dilemma, two continents |
| "Isn't SMAP/POWER too coarse for a field?" | Yes; we show pixel footprints, use them as context, take field-scale signals from HLS 30 m, NISAR 200 m and terrain, and lower confidence when scale mismatches |
| "Is this a yield prediction?" | No. Relative, model-based comparison of stress and soil-health proxies across real seasons; labeled counterfactual |
| "How do you know the field history is right?" | On the proof field, the inferred history is scored season by season against the USDA Cropland Data Layer and shown live; on the story field, the farmer confirms; uncertain seasons are flagged |
| "Where does the crop knowledge come from?" | FAO-56, ECOCROP, local studies; each value tagged with source and confidence; reviewed by a local expert |
| "What does the SI actually do?" | Statistical stress model with SHAP, optional Prithvi foundation model, and a grounded assistant that can only quote tool results |
| "Does it work outside Algeria?" | Same pipeline globally; region packs add local crops; the US Great Plains proof field is part of the demo |
| "How would farmers access it?" | Mobile web with tap-to-ask visual answers (English now; localization is the next step), printable card through extension officers; offline cache |

## 9. Rehearsal plan

- Three full timed rehearsals after G5 (feature freeze); one with a non-technical listener.
- Test on the venue projector and Wi-Fi early; run offline mode once deliberately.
- Assign roles: narrator, driver, Q&A lead (science), Q&A lead (tech).
- Keep a printed one-page cheat sheet with key numbers from both hero fields (filled from real outputs).
- Lead the global submission page with the validated proof field and the Boumerdes pitch with the Sétif story field.
