# References

All sources cited across the documentation set, grouped by topic. Links were checked between **2026-11-08** and **2026-11-10**; the official Space Apps pages in §1 were re-read on **2026-11-13**.

Back to [PRD](../PRD.md).

**Access legend:** ✓ opened or returned HTTP 200 · ◐ publisher blocks automated access (403), content confirmed through search abstracts · ✗ not reachable from our network; claim taken from search abstracts only · ⏳ not yet published.

---

## 1. NASA Space Apps Challenge

| Source | Use | Access |
|---|---|---|
| [Field Shift: Adapting Farms with NASA Data, challenge details](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=details) | Challenge statement, objectives, considerations | ✓ |
| [Challenge resources tab](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=resources) | Official datasets (mapped in [CHALLENGE_RULES_2026.md §7](CHALLENGE_RULES_2026.md#7-official-resources-for-field-shift-and-itza-coverage)) | ✓ (published 2026-11-13) |
| [Participant FAQs (2026)](https://www.spaceappschallenge.org/resources/participant-faqs/) | Dates (Nov 14–15), SI terminology and disclosure, guide release dates | ✓ |
| [Judging & Awards Guide 2026](https://www.spaceappschallenge.org/resources/judging-awards-guide/) | Eligibility, five criteria, phases, ten Global Awards | ✓ (dated 2026-11-12) |
| [Project Submission Guide 2026](https://www.spaceappschallenge.org/resources/project-submission-guide/) | Submission window, form fields, demo limits, SI disclosure and watermark rules | ✓ (dated 2026-11-12) |
| [Participant Terms and Conditions 2026](https://www.spaceappschallenge.org/legal/) | OSI licensing, third-party materials, citation, media rules | ✓ (updated 2026-08-07) |
| [2025 Global Winners](https://www.spaceappschallenge.org/2025/awards/global-winners/) | Precedents | ✓ |
| [Zumorroda-X, Henry's Farm Adventures (2025)](https://www.spaceappschallenge.org/2025/find-a-team/zumorroda-x/?tab=project) | Agriculture storytelling winner | ✓ |
| [AgriGuard (Space Apps 2024), GitHub](https://github.com/esr-style/agriguard) | Prior agriculture project using NASA POWER | ✓ |

## 2. NASA data, APIs and tools

| Source | Use | Access |
|---|---|---|
| [NASA POWER API docs](https://power.larc.nasa.gov/docs/services/api/) | Daily, climatology endpoints | ✓ (live calls verified) |
| [NASA POWER Projection API](https://power.larc.nasa.gov/docs/services/api/projection/) | NEX-GDDP-CMIP6 2015–2100 via REST | ✓ (live calls; −999 at Sétif test point) |
| [NASA POWER MCP](https://power.larc.nasa.gov/docs/services/super-intelligence/mcp/) · [endpoint](https://power.larc.nasa.gov/mcp/) | SI tool access | ✓ (healthcheck alive) |
| [NASA earthdata-mcp (CMR MCP)](https://github.com/nasa/earthdata-mcp) · `https://cmr.earthdata.nasa.gov/mcp/v1` | SI dataset discovery | ✓ (endpoint responds; session required) |
| [CMR Search API](https://cmr.earthdata.nasa.gov/search/) | Granule/collection discovery (live checks of SMAP, IMERG, HLS, NISAR, GRACE, FLDAS, OPERA) | ✓ |
| [ORNL DAAC MODIS/VIIRS Land Product Subsets REST](https://modis.ornl.gov/rst/ui/) | No-login MODIS NDVI, ET, phenology | ✓ (live calls) |
| [NISAR L-band data now publicly available](https://www.earthdata.nasa.gov/data/alerts-outages/nisar-l-band-data-now-publicly-available) | Release dates, product list | ✓ |
| [NISAR Provisional Soil Moisture V1 catalog](https://www.earthdata.nasa.gov/data/catalog/asf-nisar-l3-sme2-provisional-v1-1) | 200 m soil moisture product | ✓ |
| [Transition from MODIS to VIIRS](https://www.earthdata.nasa.gov/data/alerts-outages/transition-from-modis-viirs) | Continuity planning | ✓ |
| [Terra: The End of an Era (NASA Science)](https://science.nasa.gov/science-research/earth-science/terra-the-end-of-an-era/) | MODIS end-of-science dates | ✓ |
| [ECOSTRESS mission site](https://ecostress.jpl.nasa.gov/) | Mission status/extension | ✓ |
| [Summary of the 2025 GEDI Science Team Meeting](https://science.nasa.gov/uncategorized/summary-of-the-2025-gedi-science-team-meeting) | GEDI operating status | ✓ |
| [NEX-GDDP-CMIP6 on AWS Open Data](https://registry.opendata.aws/nex-gddp-cmip6/) | Projection archive fallback | ✓ |
| [NEX-GDDP-CMIP6 at NCCS](https://www.nccs.nasa.gov/services/data-collections/land-based-products/nex-gddp-cmip6) | THREDDS subsetting | ✓ |
| [earthaccess documentation](https://earthaccess.readthedocs.io/) | Authenticated NASA access in Python | ✓ |
| [AppEEARS](https://appeears.earthdatacloud.nasa.gov/) | Point/area extraction | ✓ |
| [Earthdata Search](https://search.earthdata.nasa.gov/) | Discovery | ✓ |
| [Giovanni](https://giovanni.gsfc.nasa.gov/) | No-code exploration | ✓ |
| [TiTiler-CMR (GitHub)](https://github.com/developmentseed/titiler-cmr) · [NASA Earthdata blog](https://www.earthdata.nasa.gov/news/blog/visualizing-earth-data-demand-nasas-titiler-cmr-delivers-imagery-without-wait) | Dynamic HLS/IMERG tiles | ✓ |
| [Prithvi-EO-2.0 paper (arXiv 2412.02732)](https://arxiv.org/pdf/2412.02732) · [GitHub](https://github.com/NASA-IMPACT/Prithvi-EO-2.0) · [Hugging Face org](https://huggingface.co/ibm-nasa-geospatial) | Geospatial foundation model | ✓ |

## 3. Science and agronomy

| Source | Use | Access |
|---|---|---|
| Allen, Pereira, Raes & Smith (1998), [FAO Irrigation and Drainage Paper 56](https://www.fao.org/4/x0490e/x0490e00.htm) | ET0, Kc, water balance, Ks | ✓ |
| [Andales et al. 2016 poster (Ks formulation summary)](https://scisoc.confex.com/scisoc/2016am/webprogram/Handout/Paper101215/Andales%20et%20al%202016%20DroughtCIG%20poster.pdf) | Secondary summary of FAO-56 stress coefficient | ✓ |
| Recuero et al. (2019), [Fallowing temporal patterns from MODIS NDVI autocorrelation, IJAEOG 82](https://doi.org/10.1016/j.jag.2019.05.023) | Crop–fallow rotation detection precedent | ◐ |
| [Multi-sensor NDVI crop/fallow classification (PMC12473680)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12473680/) | Field-level aggregation accuracy | ✓ |
| [Tigray cultivation monitoring (arXiv 2312.10819)](https://arxiv.org/pdf/2312.10819) | Fallow vs crop confusion caveat | ✓ |
| [Sunflower subfield zones with Sentinel-2 NDVI and k-means (Heliyon 2023)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10558738/) | Management zones method | ✓ |
| [Multi-year Sentinel-2/Landsat zoning (Remote Sensing 2025)](https://www.mdpi.com/2072-4292/17/22/3709) | Management zones | ◐ |
| [Multi-sensor zoning comparison (AgriEngineering 2025)](https://mdpi-res.com/d_attachment/agriengineering/agriengineering-07-00092/article_deploy/agriengineering-07-00092.pdf) | Management zones | ✓ |
| [GEDI for cropland classification (arXiv 2109.06972)](https://arxiv.org/pdf/2109.06972) | GEDI crop-height use | ✓ |
| [Fields of The World (AAAI 2025)](https://ojs.aaai.org/index.php/AAAI/article/view/35034) · [arXiv](https://arxiv.org/abs/2409.16252) | Field boundary model | ✓ |
| [AquaCrop-OSPy (PyPI)](https://pypi.org/project/aquacrop) | Reference crop-water model | ✓ |
| [FAO ECOCROP](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en) | Crop climatic ranges | ✓ |

## 4. Hero-field context (Algeria story field, US proof field)

| Source | Use | Access |
|---|---|---|
| [Agroclimatic drought on the Sétif / Bordj Bou Arreridj high plains (CIGR Journal, 2025)](https://cigrjournal.org/index.php/Ejounral/article/download/9973/4499/46523) | 1.5 Mha cereals alternating with fallow; climate exposure | ✓ |
| [Legume rotations and durum wheat at Sétif (Agricultural Science Digest, 2024)](https://arccjournals.com/journal/agricultural-science-digest/DF-438) | Local rotation evidence | ✓ |
| [FAO GIEWS country brief: Algeria](https://www.fao.org/giews/countrybrief/country.jsp?code=DZA) | Cereal production, import requirements | ✓ |
| [Milling MEA: USDA forecast of Algeria wheat imports 2025/26](https://millingmea.com/algeria-to-maintain-wheat-imports-at-9-2-mmt-in-2025-26-usda/) | Import figure | ✓ |
| [ScienceDaily: GRACE study of NWSAS recharge (2013)](https://sciencedaily.com/releases/2013/07/130722123014.htm) | Aquifer overexploitation context | ✓ |
| [FAO WaPOR Algeria activities](https://www.fao.org/in-action/remote-sensing-for-water-productivity/country-activities/algeria/fr) | Mitidja 20 m pilot | ✓ |
| [FAO WaPOR data](https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data/en) | ET data levels | ✓ |
| [USDA ARS AgResearch (2011): rotations at Akron, Colorado](https://agresearchmag.ars.usda.gov/2011/jan/rotations) | Proof field: long-term wheat–fallow vs intensive rotation study; 14–18 in precipitation; income result | ✓ |
| [ASA-CSSA-SSSA 2014 abstract: Akron alternative rotations 1994–2013](https://scisoc.confex.com/crops/2014am/webprogram/Paper86202.html) | Proof field: published ranking to compare against | ✓ (via search abstract) |
| [USDA NASS Cropland Data Layer](https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php) | Proof-field ground truth (IN-13) | ✓ |

## 5. Existing solutions

| Source | Use | Access |
|---|---|---|
| [OneSoil help: web vs mobile apps](https://help.onesoil.ai/en/articles/5237584-how-the-onesoil-web-and-mobile-apps-differ) | Competitor features | ✓ |
| [EOSDA Crop Monitoring key functions](https://eos.com/eos-crop-monitoring/key-functions/) | Competitor features | ✓ |
| [MCCC Cover Crop Selector (MSU)](https://www.canr.msu.edu/cover_crops/getting_started_and_management/selector-tool) | Public decision tool | ✓ |
| [Bachinger & Zander 2007, ROTOR](https://orgprints.dk/id/eprint/7206/2/7206_Bachinger.pdf) | Rule-based rotation generator precedent | ✓ |
| [CropRota discussion paper (BOKU)](https://boku.ac.at/fileadmin/data/H03000/H73000/H73100/Diskussionspapiere_ab_2004/452009.pdf) | Optimization approach | ✓ |
| [Fenz et al. 2023, SI- and data-driven crop rotation planning](https://repositum.tuwien.at/bitstream/20.500.12708/188010/2/Fenz-2023-European%20Journal%20of%20Agronomy-vor.pdf) | Academic data-driven planning | ✓ |

## 6. SI services and free tiers

| Source | Use | Access |
|---|---|---|
| [Groq free tier listing (developersdigest)](https://www.developersdigest.tech/models/free-api/groq) | Groq free-tier limits for the fallback LLM (third-party; verify) | ✓ |

### 6.1 Generative UI

| Source | Use | Access |
|---|---|---|
| [CopilotKit: The Developer's Guide to Generative UI in 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026) | Definition; static / declarative / open-ended patterns and trade-offs | ✓ |
| [A2UI project site](https://a2ui.org/) · [v0.9.1 specification](https://a2ui.org/specification/v0.9.1-a2ui/) · [GitHub](https://github.com/google/A2UI) | Catalog security model, message types, JSON Pointer bindings, validation loop, renderers, version status | ✓ |
| [Google Developers Blog: A2UI v0.9](https://developers.googleblog.com/a2ui-v0-9-generative-ui/) | v0.9 release, React renderer, transports | ✓ |
| [InfoQ: Google A2UI v0.9 (Jul 2026)](https://infoq.com/news/2026/07/google-a2ui-genui) | v0.9.1 production / v1.0 RC status; criticisms and fallback advice | ✓ |
| [AG-UI: Generative UI specs](https://docs.ag-ui.com/concepts/generative-ui-specs) · [Introduction](https://docs.ag-ui.com/introduction) | AG-UI vs UI specs; frontend tools, human-in-the-loop, supported frameworks | ✓ |
| [MCP blog: MCP Apps (2026-01-26)](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/) | Open-ended pattern; sandboxed iframe security; supported hosts | ✓ |
| [NN/g: Generative UI and Outcome-Oriented Design](https://www.nngroup.com/articles/generative-ui/) | Usability risks: consistency, predictability, learnability, trust | ✓ |
| [Google Research: Generative UI (Nov 2025)](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/) | Fully generated pages; latency and accuracy limits | ✓ |

## 7. Product practice

| Source | Use | Access |
|---|---|---|
| [ChatPRD: PRD template](https://www.chatprd.ai/learn/prd-template) | PRD structure | ✓ |
| [Writing PRDs (Lenny-style skill)](https://skills.sh/liqiongyu/lenny_skills_plus/writing-prds) | Non-goals, metrics | ✓ |
| [PRD template guide (prodmgmt.world)](https://www.prodmgmt.world/blog/prd-template-guide) | Common sections across top teams | ✓ |
| [Cagan, How To Write a Good PRD (SVPG)](https://www.svpg.com/assets/Files/goodprd.pdf) | Leave implementation flexibility to engineering; requirements traceability to objectives; product principles | ✓ |
| [Plane: How to write a PRD that engineers actually read](https://plane.so/blog/how-to-write-a-prd-that-engineers-actually-read) | Section list; technical design belongs in a separate design doc | ✓ |
| [Aha!: PRD templates](https://www.aha.io/roadmapping/guide/requirements-management/what-is-a-good-product-requirements-document-template) | Common sections (objective, assumptions, scope, constraints, open questions); avoid being overly prescriptive | ✓ |

## 8. Hosting and compute

| Source | Use | Access |
|---|---|---|
| [NVIDIA Brev: GPU instances](https://docs.nvidia.com/brev/latest/concepts/gpu-instances.md) | Per-hour billing, stop/delete behavior, credit exhaustion, restart capacity | ✓ |
| [NVIDIA Launchables / Brev pricing](https://www.nvidia.com/en-us/launchables/pricing) | Indicative hourly rates (estimates) | ✓ |
| [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) | Free plan: 25 MiB per asset, 20,000 assets, 100,000 requests/day, 10 ms CPU | ✓ |
| [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) | Outbound-only connector; no inbound ports | ✓ |
| [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) | Dev-only limits (200 in-flight, no SSE) | ✓ |
| [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) | Free tier amounts; payment-method requirement not stated on page | ✓ |

## 9. Software (versions observed on npm/PyPI, 2026-11-08)

Frontend: react 19.3.1 · vite 8.3.6 · typescript 7.0.2 · maplibre-gl 6.17.0 · deck.gl 9.4.1 · terra-draw 1.39.0 · @turf/turf 7.4.0 · echarts 6.1.0 · @dnd-kit/react 0.5.3 · tailwindcss 4.3.5 · zustand 5.1.0 · @tanstack/react-query 5.107.1 · @tanstack/react-router 1.170.46 · ai 7.0.165 · cesium 1.147.0 (alternative). Generative UI (observed 2026-11-10): @a2ui/react 0.15.0 · @ai-sdk/react 4.0.170 · @ag-ui/client 1.0.4 and @copilotkit/react-core 1.85.0 (alternatives) · @json-render/core 0.22.0 (alternative).

Backend/science: fastapi 0.162.2 · pydantic 2.14.3 · earthaccess 0.19.0 · asf-search 14.1.0 · xarray 2026.9.0 · rioxarray 0.24.0 · rasterio 1.5.2 · polars 2.1.0 · duckdb 2.0.0 · geopandas 1.2.0 · lightgbm 4.7.0 · shap 0.54.1 · terratorch 1.2.14 · aquacrop 3.1.0 · pydantic-ai 2.66.0 · mcp 2.3.0.

## 10. Sources that could not be used

| Item | Status |
|---|---|
| CIHEAM Options Méditerranéennes PDFs on forage legumes replacing fallow at Sétif | ✗ Not reachable from our network; claim removed from the documents |
| MODIS science-team abstract page for Recuero et al. | ✗ Host unreachable; replaced by the DOI |
| SoilGrids REST API | Unstable during checks (502, then null values); WCS reachable |
| POWER Projection API for the Sétif test point | Returned fill values (−999) in beta; fallback planned |
