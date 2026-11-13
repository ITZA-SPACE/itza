# Challenge Rules and Official Resources (2026)

What the official 2026 NASA Space Apps sources require of ITZA: eligibility, submission, judging, licensing and attribution, and how every resource listed for our challenge maps to ITZA. This is the compliance reference; product requirements stay in the [PRD](../PRD.md).

Back to [PRD](../PRD.md). Dataset catalog: [NASA_DATA_SOURCES.md](NASA_DATA_SOURCES.md). Demo plan: [DEMO_STRATEGY.md](DEMO_STRATEGY.md).

> **Sources and date.** Everything below was read on **2026-11-13** from the official pages listed in [§9](#9-official-sources). Where this document and an official page disagree, the official page wins. Re-read the Project Submission Guide on the morning of November 14.

---

## 1. Key dates

| When | What |
|---|---|
| Sat **Nov 14, 9:00** (Local Event time zone) | Hackathon starts; the team page's **Project** tab and project submission open |
| Sun **Nov 15, 23:59** (Local Event time zone) | **Hard deadline** to click "Submit for Judging"; anything saved or submitted later is not judged |
| Dec 3, 2026 | Global Nominees announced |
| Dec 17, 2026 | Global Finalists and Honorable Mentions announced |
| Jan 26, 2027 | Global Winners announced |

Local judging and local awards may follow a different schedule; check with the Boumerdes Local Lead.

## 2. Eligibility for Global Judging (mandatory)

From the Judging & Awards Guide and the Project Submission Guide:

| # | Requirement | ITZA status |
|---|---|---|
| E1 | Respond to one official 2026 challenge | _Field Shift: Adapting Farms with NASA Data_ |
| E2 | 1 to 6 team members, all registered, all on the **same Local Event** (not waitlisted), all listed on the team's Members tab; no members can be added after submission closes | To confirm by the team owner before Nov 14 |
| E3 | Every required field on the Project page completed | See [§4](#4-project-page-fields) |
| E4 | A demo: **video of 30 seconds or less**, or a **slide deck of at most 7 slides** including title and intro; exceeding either limit makes the project ineligible | [DEMO_STRATEGY §4–5](DEMO_STRATEGY.md#4-30-second-video) |
| E5 | **English** on the project page and in every linked material; a video in another language needs English subtitles; slides must be in English | ITZA is English-only (PRD §10) |
| E6 | Submitted before Sun Nov 15, 23:59 local time | |
| E7 | Two checkboxes: (a) read the Submission Guide and agree to the Terms and Privacy Policy; (b) the project is the team's **original work** and **every external resource (code, text, images, even open source) is listed in the References field**, with no copyrighted material used without permission | Attribution register: [§6](#6-licensing-and-attribution-mandatory) |
| E8 | No images, video, audio or likeness of persons under 18 in the demo or project | Demo uses screen capture only |
| E9 | NASA's China funding restriction review (no participation in connection with China or Chinese-owned entities) | Team owner to confirm |
| E10 | **At least one NASA data source or resource** to be eligible for a Global Award | ITZA uses more than ten ([§7](#7-official-resources-for-field-shift-and-itza-coverage)) |

## 3. Super Intelligence (SI) rules

From the FAQ and the Project Submission Guide:

- Space Apps 2026 uses **Super Intelligence (SI)** in place of "AI" (U.S. Executive Order of September 29, 2026).
- SI tools may be used to accelerate development, but **SI should not be used to come up with the idea** for solving the challenge.
- SI-generated content **must not use, contain or modify NASA branding** (logos, flags, mission identifiers).
- Disclosure of where and how SI was used is **required**:
  - **Images and videos:** visible watermark showing SI generation.
  - **Audio:** acknowledged in descriptive text and metadata.
  - **Code and data:** acknowledged in descriptive text and metadata.
- The "Use of SI" form answer is for data collection and is not shown to judges, but judges see the SI indicators (watermarks, text, metadata) in the project and assess originality, intent and execution.

For ITZA this covers the coding tools used during development, the generative-interface assistant (FR-15), the LightGBM stress model and any SI-generated media in the demo. How the repository records this is an open team decision (PRD §13).

## 4. Project page fields

| Field | Content rule | ITZA plan |
|---|---|---|
| Project Name | | ITZA (ITZA SPACE) |
| High-Level Project Summary | What it is, how it addresses the challenge, why it matters | Problem → solution → importance |
| Link to Project Demo | Public link (YouTube, Drive, GitHub, ...), no login, password or permission | 30 s video and 7-slide deck |
| Link to Final Project | Public website or repository, no login | Public web app + public repository |
| Detailed Project Description | What it does, how it works, benefits, goals, tools, languages, hardware/software | [SOLUTION_OVERVIEW](SOLUTION_OVERVIEW.md) |
| Use of SI | Whether and how SI tools were used | [§3](#3-super-intelligence-si-rules) |
| NASA Data | Specific NASA data and resources used | [§7.1](#71-nasa-data-and-resources) |
| Space Agency Partner Data and Other References | **All** data, resources, tools, code, text and images used, even open source | Attribution register ([§6](#6-licensing-and-attribution-mandatory)) |

Practical rules: the Project page accepts images (JPG, PNG, GIF up to 10 MB) but not videos or documents; host those externally and test every link in a private browser. Requesting a FortiGuard Web Filter classification for the app's domain is recommended (not required) so judges' networks do not block it.

## 5. Judging criteria and awards

Every judging level scores each project **1 to 5** on five criteria (Judging & Awards Guide 2026):

| Criterion | What scores 5 |
|---|---|
| **Impact** | Addresses a significant problem; extensive reach; could change the world; quality far exceeds expectations |
| **Creativity** | Groundbreaking, never-attempted approach; original and inventive |
| **Validity** | Scientifically sound, technically feasible, fully developed, highly usable and user-friendly |
| **Relevance** | Fully addresses the challenge; **NASA data is integral**, not a superficial addition |
| **Presentation** | Well-structured, compelling storytelling; judged from the demo **and** the full project |

Judging phases: Local Event judges select Global Nominees → global expert judges select Global Finalists and Honorable Mentions → an executive committee from NASA and the 2026 Space Agency Partners awards ten Global Awards: Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology, Local Impact.

## 6. Licensing and attribution (mandatory)

From the Participant Terms and Conditions (updated 2026-08-07):

| Rule | Consequence for ITZA |
|---|---|
| Original content created for Space Apps must be freely available or under an **OSI-approved open-source license**; without one, NASA distributes it under **Apache 2.0** | The repository needs an explicit OSI license file before submission |
| Non-NASA materials (datasets, code) must be **freely and publicly available without restriction**, or at minimum OSI-licensed; the team must verify this itself | Every third-party dataset, tile service and library is checked; anything with a usage restriction (e.g., non-commercial) is replaced or removed from the submission |
| The licenses of all such materials **must be identified in the submitted documentation**; NASA will not post solutions without it | A third-party license and attribution register ships with the repository and in the app |
| **Cite every source**, even open source; awards can be withdrawn for missing citations | References field lists every dataset, library, model, font and image |
| No export-controlled information (ITAR/EAR), no PII, no material promoting commercial products | |

The register is [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) (datasets, services, literature, model, dependencies with their licenses); the repository license is [`LICENSE`](../LICENSE) (Apache 2.0). `node scripts/licenses.mjs --check` fails on a dependency that is not OSI-approved or public domain and on a `data-sources.yaml` entry without license and citation.

Known item to resolve: the satellite basemap uses **EOX Sentinel-2 cloudless (CC BY-NC-SA 4.0)**, a non-commercial license that is not "without restriction". Public-domain NASA imagery (for example NASA GIBS layers) avoids the question.

NASA data use: NASA Earth science data are openly available; cite each product with its DOI as requested by its DAAC. NASA does not endorse non-U.S. Government sites; for non-NASA resources, follow each site's own data-use terms.

## 7. Official resources for Field Shift, and ITZA coverage

**Nothing in the resource list is individually mandatory.** The challenge statement uses "you may" throughout; the only hard data rule is E10 (at least one NASA data source or resource for a Global Award). Relevance scoring rewards NASA data that is **integral** to the solution. The list below is the challenge's Resources tab (published 2026-11-13) plus GRACE/GRACE-FO, which the Objectives name.

### 7.1 NASA data and resources

| Resource (official list) | ITZA use | Status |
|---|---|---|
| SMAP soil moisture | Root-zone and surface moisture: replay cross-check, Arena, ML features | In use (SPL4SMGP, POWER SMAP archive) |
| GPM / IMERG precipitation | Daily rain for the water balance | In use (IMERG Final/Late V07) |
| Landsat | 30 m vegetation index history (via HLS L30, Landsat 8/9) | In use (HLS) |
| MODIS / VIIRS | NDVI long record, phenology, ET | In use (MOD13Q1, MCD12Q2, MOD16A2GF); VIIRS continuity planned |
| NASA POWER | Weather, ET0 inputs, climatology, 2050 projections, MCP | In use |
| SRTM elevation | Slope, flow paths, erosion, 3D terrain (NASADEM is NASA's reprocessed SRTM) | In use (NASADEM) |
| ECOSTRESS | LST and evaporative stress context | In use (L2T LSTE, L4T ESI) |
| GEDI | Vegetation structure context (the list highlights Level-4 biomass) | In use (L2A/L2B) |
| GRACE / GRACE-FO (Objectives) | Regional water-storage trend card | In use (JPL mascon RL06.3) |
| NLDAS / GLDAS | Continuous land-surface model moisture and ET | **Not used yet** |

ITZA also uses NASA products beyond the list: NISAR L3 soil moisture (provisional), HLS vegetation indices, NEX-GDDP-CMIP6, the NASA POWER and CMR MCP servers, and the NASA/IBM Prithvi foundation model (T2).

### 7.2 Space Agency Partner resources (ESA)

| Resource | ITZA use | Status |
|---|---|---|
| Copernicus Sentinel-2 | 30 m vegetation indices via HLS S30 (harmonized Sentinel-2) | In use; credit ESA/Copernicus as partner data |
| ERA5 reanalysis | Gap-filling weather where stations are sparse | Not used (POWER covers the need) |

Teams are "highly encouraged" to use partner data; listing it in the References field is required either way.

### 7.3 Other listed resources (optional, non-NASA)

| Resource | Coverage | ITZA use / relevance |
|---|---|---|
| USDA Cropland Data Layer (CropScape) | US, 30 m, annual | **In use**: proof-field crop-history ground truth (CropScape point service was failing on 2026-11-12) |
| USDA NRCS SSURGO / STATSGO2, Web Soil Survey | US | Not used; better soil properties than SoilGrids for the US proof field |
| PRISM (Oregon State) | US | Not used; rainfall/temperature cross-check on the proof field |
| USDA NASS QuickStats | US county/state | Not used; county yield and acreage history for proof-field calibration |
| OpenET | Western US (includes Colorado) | Not used; field-scale ET cross-check on the proof field |
| FAO GAEZ | Global | Not used; crop suitability for the Algerian story region |
| CoCoRaHS | North America | Not used; rain-gauge check of IMERG |
| USDA AMS Market News | US | Not used; ITZA asks farmers for their own prices (F-25) |
| NAIP | US, ~1 m | Not used |
| USGS NLCD | US, 30 m | Not used |
| USGS NWIS | US | Not used |
| USFS LANDFIRE | US | Not used |
| USDA Ag Data Commons | Mostly US | Not used |

The list is US-heavy. The Algerian story field relies on global sources (NASA products, SoilGrids, FAO); US-only sources strengthen the **proof field**, where validation happens.

## 8. Requirements that follow for ITZA

Mandatory before submission (blocking):

1. An OSI license in the repository and a third-party license and attribution register covering every dataset, tile service, library, model, font and image ([#99](https://github.com/ITZA-SPACE/itza/issues/99)), shown in the app with an SI-use statement ([#101](https://github.com/ITZA-SPACE/itza/issues/101)).
2. No third-party material with a usage restriction in the submitted product (replace the non-commercial imagery basemap, [#100](https://github.com/ITZA-SPACE/itza/issues/100)).
3. A public, login-free final project link (web app and repository) and a public demo link, tested in a private browser.
4. Demo within limits: ≤ 30 s video or ≤ 7 slides, English (or English subtitles), no minors' likeness, SI-generated visuals watermarked, no NASA branding in SI-generated content.
5. Project page copy for every required field, including the NASA Data and References fields and the SI-use answer, plus the demo video and deck ([#102](https://github.com/ITZA-SPACE/itza/issues/102)).

Recommended (scoring): make NASA data visibly integral in the app (sources on every number, already in place), add the remaining listed sources where they strengthen validation or coverage, and credit ESA Sentinel-2 as partner data:

- SSURGO soils for US fields ([#104](https://github.com/ITZA-SPACE/itza/issues/104)).
- PRISM, OpenET and NASS QuickStats cross-checks on the proof field ([#105](https://github.com/ITZA-SPACE/itza/issues/105)).
- GLDAS/NLDAS land-surface model moisture and ET, the one listed NASA family not yet used ([#106](https://github.com/ITZA-SPACE/itza/issues/106)).
- FAO GAEZ suitability in the story-region pack ([#107](https://github.com/ITZA-SPACE/itza/issues/107)).

Shared data: hero-field clips and derived products live in one team GCS store with a manifest, licenses and checksums ([#103](https://github.com/ITZA-SPACE/itza/issues/103)).

## 9. Official sources

| Page | Retrieved |
|---|---|
| [Challenge details: Field Shift](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/) | 2026-11-13 |
| [Challenge resources tab](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=resources) | 2026-11-13 |
| [Resources and Participant Guides](https://www.spaceappschallenge.org/resources/) | 2026-11-13 |
| [Participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/) (page dated 2026-11-05) | 2026-11-13 |
| [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) (dated 2026-11-12) | 2026-11-13 |
| [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) (dated 2026-11-12) | 2026-11-13 |
| [Participant Terms and Conditions](https://www.spaceappschallenge.org/legal/) (updated 2026-08-07) | 2026-11-13 |
