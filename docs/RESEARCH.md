# Research

Research behind the product direction: existing solutions, relevant science, data and tooling landscape (as of November 2026), lessons from past Space Apps winners, and a critical review of the team's original PRD.

Back to [PRD](../PRD.md). All sources are listed in [REFERENCES.md](REFERENCES.md).

**Method.** We read the official challenge, FAQ and archived 2025 guides; searched scientific literature, product sites, GitHub/Hugging Face and NASA documentation; and verified key APIs with live requests on 2026-11-08 (results recorded in [NASA_DATA_SOURCES.md](NASA_DATA_SOURCES.md)). Where a claim could not be verified, it is marked.

**Inaccessible at time of writing:** the challenge Resources tab ("Resources will be available on Friday, November 13"), the 2026 Judging & Awards Guide and the 2026 Project Submission Guide (both due November 13). 2025 versions were used as proxies.

---

## 1. Existing solutions

### 1.1 Commercial and free farmer apps

| Product | What it does | Rotation support | Gap vs our concept |
|---|---|---|---|
| **OneSoil** | Free web/mobile field maps, NDVI every few days (cloud permitting), scouting | Web version analyzes previous seasons and suggests crops for the next season ([OneSoil help](https://help.onesoil.ai/en/articles/5237584-how-the-onesoil-web-and-mobile-apps-differ)) | No climate backtest, no water balance, no explanation of evidence or uncertainty, no projections |
| **EOSDA Crop Monitoring** | Paid satellite platform: vegetation indices, growth stages, weather, crop rotation data ([EOSDA](https://eos.com/eos-crop-monitoring/key-functions/)) | Records rotation history | Monitoring-oriented; no scenario comparison for farmers; paid |
| **Climate FieldView / Cropwise-type FMS** | Farm management, machinery data, imagery | Record keeping | Built for mechanized markets; not decision support for rotations under climate risk |

### 1.2 Public and research decision tools

| Tool | Approach | Notes |
|---|---|---|
| **MCCC Cover Crop Selector** (US Midwest) | Recommends cover crops and seeding dates by county, goals and historical weather ([MSU](https://www.canr.msu.edu/cover_crops/getting_started_and_management/selector-tool)) | County-level, US-only; strong example of goal-driven selection |
| **ROTOR** (ZALF, Germany) | Rule-based generation and evaluation of organic rotations ([Bachinger & Zander 2007](https://orgprints.dk/id/eprint/7206/2/7206_Bachinger.pdf)) | Validates the rule-based generator + evaluator pattern; desktop database, access-restricted |
| **CropRota** (Austria) | Optimization model generating rotations weighted by observed crop mixes ([BOKU discussion paper](https://boku.ac.at/fileadmin/data/H03000/H73000/H73100/Diskussionspapiere_ab_2004/452009.pdf)) | Regional planning, not a farmer UI |
| **Fenz et al. 2023** | SI- and data-driven crop rotation planning ([European Journal of Agronomy](https://repositum.tuwien.at/bitstream/20.500.12708/188010/2/Fenz-2023-European%20Journal%20of%20Agronomy-vor.pdf)) | Shows academic interest in data-driven rotation planning |
| **FAO AquaCrop / AquaCrop-OSPy** | Crop water productivity model; open-source Python port ([PyPI](https://pypi.org/project/aquacrop)) | Expert model; we use its concepts (FAO-56) and can use the package for validation |
| **FAO WaPOR v3** | Remote-sensing ET and water productivity; 300 m global, 100 m Africa/Near East, 20 m pilot areas incl. Mitidja ([FAO WaPOR](https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data/en)) | Data portal, not a rotation tool; useful complementary ET source |

### 1.3 Past Space Apps projects

| Project | Year | Relevance |
|---|---|---|
| **AgriGuard** (Agronauts) | 2024 | NASA POWER precipitation for irrigation needs and crop recommendations; no rotation or NDVI ([GitHub](https://github.com/esr-style/agriguard)) |
| **Henry's Farm Adventures** (Zumorroda-X, Cairo) | 2025 | Global Winner, Art & Technology; story-driven game turning NASA data into farmer adaptation missions ([project](https://www.spaceappschallenge.org/2025/find-a-team/zumorroda-x/?tab=project)) |
| **QUEÑARIS** (Arequipa) | 2025 | Global Winner, Local Impact; phenology from Earth observation for local reforestation ([2025 winners](https://www.spaceappschallenge.org/2025/awards/global-winners/)) |

**Lesson:** winners pair a concrete local story with NASA data made tangible. Generic dashboards rarely win.

### 1.4 White space

No identified tool combines all of:

1. a field's **own** multi-decade satellite history (vegetation, moisture, weather) to infer its rotation and bare periods;
2. **backtesting** multiple rotations against every real past season with a published water-balance method;
3. **future replay** under CMIP6 scenarios in the same interface;
4. **evidence-first explanations** with computed uncertainty and local-review flags;
5. **farmer-grade access**: plain language, visual answers, mobile, printable output.

That combination is the product.

## 2. Science foundations

### 2.1 Crop water balance (FAO-56)

FAO Irrigation and Drainage Paper 56 defines crop evapotranspiration as ETc = Kc × ET0, with crop coefficients by growth stage, and water-stress adjustment ETc,adj = Ks × Kc × ET0, where Ks = (TAW − Dr) / ((1 − p) × TAW) once root-zone depletion Dr exceeds the readily available water p × TAW ([FAO-56](https://www.fao.org/4/x0490e/x0490e00.htm); summary in secondary sources such as [Andales et al. 2016 poster](https://scisoc.confex.com/scisoc/2016am/webprogram/Handout/Paper101215/Andales%20et%20al%202016%20DroughtCIG%20poster.pdf)). It is the standard, explainable basis for comparing crop water demand under real weather. Known caveats: Kc and depletion fraction p may need local calibration.

### 2.2 Field history from NDVI time series

- Smoothing (Savitzky–Golay or harmonic fitting) followed by phenology features (peak, amplitude, autocorrelation) and classification is the established pipeline for crop vs fallow discrimination.
- Recuero et al. (2019) used the autocorrelation of MODIS 250 m NDVI series (2001–2012) with a random forest to map crop–fallow rotation patterns (fallow every two or three years) across rainfed mainland Spain, agreeing with field records at > 80% overall accuracy ([doi:10.1016/j.jag.2019.05.023](https://doi.org/10.1016/j.jag.2019.05.023)). This is the closest published analogue to Field Memory.
- Aggregating pixels to fields raised accuracy from 75% to 85% in one study ([PMC12473680](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12473680/)).
- Caveat: fallow with weeds can resemble poor crops ([Tigray study, arXiv 2312.10819](https://arxiv.org/pdf/2312.10819)). We therefore ask the farmer to confirm inferred seasons.

### 2.3 Management zones

Multi-year NDVI statistics with k-means or fuzzy c-means clustering are widely used to delineate within-field zones from Sentinel-2/Landsat ([Heliyon 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10558738/), [Remote Sensing 2025](https://www.mdpi.com/2072-4292/17/22/3709), [AgriEngineering 2025](https://mdpi-res.com/d_attachment/agriengineering/agriengineering-07-00092/article_deploy/agriengineering-07-00092.pdf)). HLS (Landsat + Sentinel-2 harmonized at 30 m) is NASA's natural input; k-means may not suit every field, so we show zone stability across years.

### 2.4 Rotation agronomy

- Legumes fix nitrogen and break cereal disease cycles; local Sétif evidence supports legume inclusion (see [PROBLEM_ANALYSIS §5](PROBLEM_ANALYSIS.md#51-story-field-algeria)).
- Same-family repeats carry shared pathogens (e.g., cereals: take-all, crown rot; Solanaceae: blights; legumes: Fusarium, Ascochyta). Family-level rules are a simplification; broad-host pathogens need local review.
- Trait sources: FAO ECOCROP (discontinued ~2015, now accessible via the GAEZ platform) for temperature and rainfall ranges ([FAO](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en)); FAO-56 tables for Kc and rooting depth; extension guides for break intervals.

### 2.5 SI and foundation models for Earth observation

- **Prithvi-EO-2.0** (NASA/IBM) is a multi-temporal geospatial foundation model pretrained on HLS; official repo provides TerraTorch fine-tuning configs including multi-temporal crop segmentation ([arXiv 2412.02732](https://arxiv.org/pdf/2412.02732), [GitHub](https://github.com/NASA-IMPACT/Prithvi-EO-2.0)). Hugging Face hosts 300M/600M backbones and, since September 2025, **tiny-TL** and **100M-TL** variants suited to CPU inference; a Prithvi-EO-1.0 multi-temporal crop classification checkpoint also exists ([Hugging Face org](https://huggingface.co/ibm-nasa-geospatial)).
- **Fields of The World (FTW)**: global field-boundary benchmark (24 countries, 70,462 samples) with pretrained models that transfer zero-shot to new countries ([AAAI 2025](https://ojs.aaai.org/index.php/AAAI/article/view/35034), [arXiv](https://arxiv.org/pdf/2409.16252)).
- **Gradient boosting + SHAP** remains the pragmatic, explainable choice for tabular stress prediction from weather features.

### 2.6 GEDI in cropland

GEDI was designed for forests, but a study found it separates tall crops (maize > 2 m) from short crops (rice, soybean) and transfers across regions better than optical features ([arXiv 2109.06972](https://arxiv.org/pdf/2109.06972)). Footprints are sparse (25 m, along tracks). Our use: landscape structure (tree rows, windbreaks, orchards around fields) and opportunistic crop-height evidence, presented as context, not as a field-wide layer.

### 2.7 Generative UI for the assistant (state in November 2026)

- **Definition.** Generative UI (GenUI) means parts of the interface are generated, selected or controlled by an AI agent at runtime instead of being fully predefined ([CopilotKit guide, Jan 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026)). NN/g frames it as interfaces generated in real time for each user's need, and warns about lost consistency, predictability and learnability, plus inherited hallucination risk ([NN/g](https://www.nngroup.com/articles/generative-ui/)).
- **Three patterns.** *Static* (agent picks predefined components), *declarative* (agent returns a UI description as data; the client renders its own trusted components: A2UI, Open-JSON-UI) and *open-ended* (full HTML in a sandboxed iframe: MCP Apps). More freedom costs consistency and safety ([CopilotKit](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026), [AG-UI docs](https://docs.ag-ui.com/concepts/generative-ui-specs)).
- **A2UI (Google, Apache-2.0).** Declarative JSON, never executable code; agents may only place components registered in the client's catalog; streaming; renderers for React, Lit, Angular, Flutter, SwiftUI; transports include MCP, WebSockets, REST, AG-UI and A2A. v0.9 (April 2026) made it bidirectional; v0.9.1 is the production line and v1.0 is a release candidate ([Google blog](https://developers.googleblog.com/a2ui-v0-9-generative-ui/), [InfoQ, Jul 2026](https://infoq.com/news/2026/07/google-a2ui-genui), [repo](https://github.com/google/A2UI)). Messages: `createSurface`, `updateComponents`, `updateDataModel` (JSON Pointer bindings), `deleteSurface`; client sends `action` and `VALIDATION_FAILED` errors for a prompt-generate-validate loop ([v0.9.1 spec](https://a2ui.org/specification/v0.9.1-a2ui/)).
- **AG-UI** is not a UI spec but the event protocol between agent and app (streaming, shared state, frontend tools, human-in-the-loop interrupts); it carries A2UI and is supported by LangGraph, Google ADK, pydantic-ai, Mastra and others ([AG-UI](https://docs.ag-ui.com/introduction)).
- **MCP Apps** became the first official MCP extension on 2026-01-26: tools return `ui://` HTML resources rendered in sandboxed iframes in Claude, ChatGPT, VS Code and Goose ([MCP blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)). Useful for exposing a product inside chat apps, not for a farmer-facing app's own UI.
- **Fully generated pages.** Google Research showed LLMs can generate whole interactive pages (Gemini "dynamic view"), but generation can take a minute or more and output is sometimes inaccurate ([Google Research, Nov 2025](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)).
- **Practitioner advice.** Constrain generation rather than review output; keep fixed catalogs with deterministic fallback when validation fails; criticisms include UI-impersonation risk and look-alike interfaces ([InfoQ](https://infoq.com/news/2026/07/google-a2ui-genui)).
- **Our decision.** Declarative GenUI (A2UI catalog of the app's own components) with static fallback layouts; no open-ended HTML. It shows evidence visually to low-literacy users, keeps numbers bound to tool results. See [TECHNICAL_ARCHITECTURE.md §10.2](TECHNICAL_ARCHITECTURE.md#102-generative-ui-design) and [FEATURES.md F-15](FEATURES.md#f-15-generative-ui-assistant--p1-wow).

## 3. Data and tooling landscape (November 2026 highlights)

Details and live checks: [NASA_DATA_SOURCES.md](NASA_DATA_SOURCES.md). Highlights that shaped decisions:

| Finding | Why it matters |
|---|---|
| **NISAR** L-band data public since July 20, 2026, including a **provisional 200 m soil moisture** product (observations from June 17, 2026) ([Earthdata](https://www.earthdata.nasa.gov/data/alerts-outages/nisar-l-band-data-now-publicly-available)); > 100 granules over the Sétif area verified via CMR | Newest NASA mission; field-scale moisture; strong novelty for judges |
| **NASA POWER Projection API** serves NEX-GDDP-CMIP6 daily/monthly 2015–2100, three SSPs, 0.25° ([POWER docs](https://power.larc.nasa.gov/docs/services/api/projection/)) | 2050 mode without bulk downloads (fallback needed: fill values observed for Sétif in beta) |
| **NASA POWER MCP server** (free, no key) and **NASA CMR MCP** endpoint ([POWER MCP](https://power.larc.nasa.gov/docs/services/super-intelligence/mcp/), [earthdata-mcp](https://github.com/nasa/earthdata-mcp)) | SI assistant can query NASA data through official tools |
| **ORNL DAAC MODIS/VIIRS REST** works without login and with CORS ([ORNL](https://modis.ornl.gov/rst/ui/)) | Browser can fetch 25 years of field NDVI directly |
| **HLS Vegetation Indices v2.0** (HLSL30_VI, HLSS30_VI) at 30 m | Field-scale NDVI without computing indices ourselves |
| **TiTiler-CMR** (Development Seed, used in NASA VEDA/Worldview) renders HLS and IMERG tiles on the fly from CMR ([Earthdata blog](https://www.earthdata.nasa.gov/news/blog/visualizing-earth-data-demand-nasas-titiler-cmr-delivers-imagery-without-wait)) | Animated 30 m layers for the 3D twin without preprocessing |
| **MODIS end of science** projected Terra ~Feb 2027, Aqua ~Sep 2027; VIIRS is the successor ([NASA Science](https://science.nasa.gov/science-research/earth-science/terra-the-end-of-an-era/), [Earthdata](https://www.earthdata.nasa.gov/data/alerts-outages/transition-from-modis-viirs)) | Design for continuity with VIIRS/HLS adapters |
| **SMAP** radiometer operating in extended mission; L3 and L4 current to November 2026 (CMR) | Reliable moisture context |
| **IMERG Final V07** daily ends 2025-09-30 in CMR; Late run is ongoing | Use Final for history, Late for recent months |

## 4. Review of the original team PRD ("Field Shift PRD", Nov 5, 2026)

### 4.1 Strengths kept

- Clear mapping to the brief; "decision support, not a recommender" stance.
- Five fixed explanation fields per rotation (why, evidence, benefits, gaps, risks).
- Rule-based, explainable scoring with farmer-weighted criteria.
- Pest and disease compatibility matrix with weather-scaled risk.
- Historical-year robustness ("ranked first in 7 of 10 years"), drought replay, scenario sliders.
- Source and confidence tags on every trait; disclaimers; ground-truth input.
- Signature ideas: 3D field twin, rotation builder, 2050 mode, AI assistant, ML comparison, zones.

### 4.2 Weaknesses addressed

| Issue | Our change |
|---|---|
| "Drought replay" and robustness lacked a computable crop-water model | Daily FAO-56 water balance engine underpins every replay |
| Did not use the field's own history; current rotation typed manually | Field Memory infers rotation and bare windows from NDVI; farmer confirms |
| Eight datasets "fused on one grid" without design | Two-tier harmonization (field time series + 30 m zone grid) with adapter registry and provenance |
| ML component vague ("ML compared") | Concrete Model Arena: LightGBM + SHAP stress model, satellite cross-check, Prithvi layer, disagreement flags |
| 2050 mode had no data path | POWER Projection API with NEX-GDDP-CMIP6 S3/THREDDS fallback; delta-change replay |
| AI assistant could hallucinate | Tool-grounded generative UI assistant: chart numbers bound to tool results, captions validated, catalog-only components; NASA MCP servers |
| GEDI assigned to cropland biomass | Reframed as landscape-structure and crop-height context |
| No data access plan, no demo region decided | Live-verified access matrix; two hero fields (Sétif story field, US Great Plains proof field); precomputed bundles |
| Missing newest NASA data | NISAR 200 m soil moisture (2026), HLS VI v2, POWER Projection API, NASA MCP |
| Success criteria not measurable | Quantified targets (PRD §3.3) |
| All features "core" with no sequencing | Tiered release (T0/T1/T2) and contract-first agent workstreams |

### 4.3 Ideas removed or reframed

- Generic "ECOSTRESS hotspots" as a main layer: ECOSTRESS revisit is irregular; kept as an evidence layer (ESI/LST snapshots) when scenes exist.
- Single-number score as the headline: replaced by resilience profile (distribution across seasons) plus score.
- Text-only assistant answers: reframed as a generative UI assistant that answers with interactive visuals built from approved components.

## 5. PRD practice applied

Modern PRDs lead with problem and measurable outcomes, state explicit non-goals, record assumptions and open questions, and stay living documents ([ChatPRD guide](https://www.chatprd.ai/learn/prd-template), [Lenny-style PRD skill](https://skills.sh/liqiongyu/lenny_skills_plus/writing-prds), [prodmgmt.world](https://www.prodmgmt.world/blog/prd-template-guide)). This set follows that structure: the PRD is the contract; specs live in linked documents; requirements carry priority and acceptance criteria.
