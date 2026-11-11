**Verdict: Fail — submission gates, not an unusable runtime.**
**Total score: 0/100.**

## Actual scorecard

Missing PR and demo force every dimension to zero. These zeros are gate consequences, not independent judgments of product quality.

| Dimension                  |  Weight | Band | Points | Why                                                                      |
| -------------------------- | ------: | ---: | -----: | ------------------------------------------------------------------------ |
| Functional outcome         |      40 |   0% |      0 | PR/demo gates failed; working capabilities earn no points until resolved |
| Runtime & demo quality     |      20 |   0% |      0 | Hosted runtime exercised; mandatory demo absent                          |
| Evidence quality           |      12 |   0% |      0 | PR/demo gate override                                                    |
| Access-boundary compliance |       8 |   0% |      0 | PR/demo gate override                                                    |
| Implementation quality     |       7 |   0% |      0 | PR/demo gate override                                                    |
| Kit-usage conformance      |       5 |   0% |      0 | PR/demo gate override                                                    |
| Reproducibility            |       4 |   0% |      0 | PR/demo gate override                                                    |
| Speed                      |       4 |   0% |      0 | Delivery timing verified; PR/demo gate override                          |
| **Total**                  | **100** |      |  **0** | **Mandatory gates failed**                                               |

## Functional Outcome Breakdown

| Evaluation point                                   | Sub-weight | Band | Points | Evidence / why                                                     |
| -------------------------------------------------- | ---------: | ---: | -----: | ------------------------------------------------------------------ |
| Geographic discovery and radius                    |          8 |   0% |      0 | PR/demo gates failed; live discovery nevertheless demonstrated     |
| Roof-age, confidence and open-duration filtering   |          8 |   0% |      0 | PR/demo gates failed; observed filter transitions recorded below   |
| Property, permit, contractor and BBB qualification |          8 |   0% |      0 | PR/demo gates failed; qualification also has factual-label defects |
| Persistent CRM lead workflow                       |          8 |   0% |      0 | PR/demo gates failed; isolated lifecycle demonstrated              |
| Grounded natural-language discovery                |          8 |   0% |      0 | PR/demo gates failed; answers returned, source links broken        |
| **Functional outcome subtotal**                    |     **40** |      |  **0** |                                                                    |

## Gates

| Gate        | Result     | Concrete reason                                                                                                             |
| ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| PR          | **Failed** | Operator confirms none submitted; `docs/pr-body-draft.md` is not a PR. Target-repo query for `vsterian:main` returned none. |
| Runtime     | **Pass**   | Candidate-hosted HTTPS deployment personally exercised through browser; no local installation, build or server.             |
| Credentials | **Pass**   | Public runtime; no login or credential retrieval required.                                                                  |
| Demo        | **Failed** | `docs/pr-body-draft.md:4` explicitly says no video recorded; no separate qualifying demo supplied.                          |

## Provisional quality assessment — unscored

Requested assumption: **only PR/demo presence changes; product remains unchanged.**
Installed Slowking hard rules prohibit nonzero dimension scores after failed gates, including a provisional subtotal. Consequently, no defensible provisional `n/100` is issued. Tables below separate observed quality from gate failure without inventing video quality or deducting missing PR twice.

| Dimension                  |  Weight | Observed quality under that assumption                                                                        |
| -------------------------- | ------: | ------------------------------------------------------------------------------------------------------------- |
| Functional outcome         |      40 | Useful discovery-to-lead workflow demonstrated; source verification and qualification semantics incomplete    |
| Runtime & demo quality     |      20 | Core workflows worked at all three widths; hypothetical video's quality remains unknown                       |
| Evidence quality           |      12 | Real records, repeatable counts, durable mutations and matching RAG results; all four tested citations failed |
| Access-boundary compliance |       8 | CRM consumes existing dataset through MCP; ingestion correctly remains outside this assignment                |
| Implementation quality     |       7 | Substantive typed implementation; concrete count, evidence-selection and mutation-feedback defects            |
| Kit-usage conformance      |       5 | Genuine kit patterns; material deployment/operational deviations without established approval                 |
| Reproducibility            |       4 | Published URL works; BBB instructions and linked CI evidence need correction—not another missing-PR penalty   |
| Speed                      |       4 | Verified elapsed delivery **7h 09m 23s**; no unsupported speed-band threshold invented                        |
| **Total**                  | **100** | **Not scored; no provisional hiring verdict**                                                                 |

### Provisional functional breakdown — evidence, not points

| Evaluation point                        | Sub-weight | Observed outcome                                                                           | Remaining gap                                                                     |
| --------------------------------------- | ---------: | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Geographic discovery/radius             |          8 | **Demonstrated:** presets, ZIP, coordinate entry, map click, synthetic GPS, actual markers | Physical-device GPS and permission-denial recovery not established                |
| Roof/confidence/open-duration filtering |          8 | **Demonstrated:** matching counts change correctly; long-open results ordered              | Default “roof age” prominently ranks low-confidence building-age proxies          |
| Qualification/BBB                       |          8 | **Partial:** real roofing permit, contractor, license and archived A+ displayed            | Unknown shown as closed; source links fail; archive date provenance misleading    |
| Persistent lead workflow                |          8 | **Demonstrated:** create, status, notes, filters, reload, delete and browser isolation     | Failed-save handling remains weak; sandbox workspace is not tenant authentication |
| Grounded RAG discovery                  |          8 | **Partial:** three completed answers match two independently retrieved properties          | Broken citations; broader-query truncation and permit-evidence defects            |
| **Functional scope**                    |     **40** | **Core intent substantially demonstrated**                                                 | **Not fully trustworthy qualification**                                           |

## Hiring signal

**Positive:** fast delivery of a genuine, usable fullstack product—not a fixture-only mockup. Current hosted workflow handles substantial data and persistent lead management.
**Concern:** evidence integrity trails feature completeness. Broken citations and “unknown → closed” labels can mislead sales qualification; favorable UI results alone should not establish production readiness.
**Decision:** do not accept this submission as complete. Correct factual defects, submit PR/demo, then re-evaluate; observed implementation merits follow-up rather than dismissal based solely on missing artifacts.

Candidate follow-up questions:

1. How will citation tests verify both successful resolution and the exact referenced record?
2. How will unknown permit status and building-age proxies remain visibly distinct from verified roof facts?
3. How will RAG distinguish total matches, retrieved samples, and individually qualifying permits?
4. Which kit deviations have approval, and what is genuinely deployed versus migration scaffolding?

## Runtime evidence and limitations

**Intent:** roofing sales teams can find local aging-roof or long-open-permit opportunities, inspect source-backed details, and manage qualified leads using grounded natural-language discovery. **Workflow proven; trustworthy source verification only partial.**

| Check              | Current-run observation                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive scope   | Personally drove **390×1000, 768×1000, 1440×1000**; no horizontal document overflow in checked states                                                           |
| Location           | Presets and coordinate pin worked; ZIP `60201` resolved to `42.05676,-87.70097`; map clicks changed pin; emulated GPS centered on supplied Oak Park coordinates |
| Marker interaction | Actual Jarlath property marker opened correct drawer at all widths without changing selected pin                                                                |
| Default scale      | Evanston radius 2 mi, roof ≥15: **300 displayed / 12,961 matches**; radius 0.5 mi: **300/591**                                                                  |
| Confidence/age     | At 0.5 mi, age ≥0: **1,094** matches; high/medium confidence: **478**; age ≥180: **0**                                                                          |
| Open duration      | Evanston radius 5 mi, age ≥0: **174** open-permit properties; ≥2 years: **40**; ≥5: **2**; ≥7: **0**                                                            |
| BBB reproduction   | Exact documented settings gave **300/1,678**, hiding target; changing confidence to **high** gave **95/95**, exposing it                                        |
| Real BBB drawer    | PIN `16243140530000`, permit `100524612`: WINDWARD, license `104004204`, archived **A+**, profile link; checked at all widths                                   |
| Lead lifecycle     | Permit-based create/status/notes/filter/reload/delete passed at all widths; additional property-only conversion passed                                          |
| Isolation/cleanup  | Own workspace had one lead while fresh context had zero; all **four evaluator-created leads deleted**, final reload zero; pre-existing workspace untouched      |
| Disabled sections  | Outreach, quotes, scheduling, analytics and billing were disabled at all widths                                                                                 |

**Exact README query, substituting its city placeholder:** “show me open roofing permits older than five years within five miles of Evanston”.
Three completed LLM answers returned Jarlath PIN `10253260360000` / permit `100890214` (**2,219 days**) and Clark PIN `11304030030000` / permit `100902014` (**2,153 days**), with four citation links each.
Conditional waits allowed up to **100 seconds**; mobile/tablet responses completed in **16.97s/14.44s**. Desktop completed normally; its 13.04s measured wait excluded earlier request time.
Independent product pillar reproduced both matches through deployed read endpoints. **All four source URLs returned HTTP 400, “Unrecognized arguments”**—not merely unavailable browser navigation.
Runtime metadata reports **1,864,469 properties, 1,607,387 permits, 33,560 contractors**; counts were not independently recounted.

## Findings and cheap, true fixes

1. **Fix record-specific citations.** Bare `?3143020` and `?PIN|2026` are invalid source queries. Validate canonical URLs and referenced records; HTTPS-prefix assertions are insufficient.
2. **Preserve unknown status.** Drawer shows both BBB-example permits as **“unknown · closed”**. Fix `PropertyDrawer.tsx:96–97`; require positive closure evidence.
3. **Correct BBB date semantics.** `packages/shared/src/bbb.ts:8–9` uses contractor ingestion date beside “archived copy”; label ingestion honestly or carry actual capture/check timestamp.
4. **Preserve RAG counts and predicates.** `agent.ts:113–134` drops total count at the 300-record cap; `retrieval.ts:59–69` can reintroduce younger open permits. Carry total/sample counts and apply duration predicate when constructing evidence.
5. **Expose failed lead saves.** `LeadsPage.tsx:51–60,155–180` lacks mutation-error feedback; textarea permits content beyond server's 4,000-character limit. Add bound, visible unsaved/retry state, rejection test.
6. **Repair reproduction docs.** BBB walkthrough needs high confidence; draft CI link targets older SHA. Cite current CI and distinguish incomplete AWS scaffolding from working VM deployment.

## Implementation, timing and provenance

Independent implementation pillar consulted **Arceus → Metagross + Alakazam**. Strengths: TypeScript, shared Zod/tRPC contracts, MCP boundary validation, SQLite persistence, AI SDK and bounded tool execution.
Kit limitations: VM/Docker deployment, local storage/in-memory retrieval, incomplete undeployed CDK path, and missing demonstrated operational alerting. Documented rationale is not established exception approval; AWS migration is **not** a cheap fix.
**Deployed manifest:** `834837e`, built `2026-11-11T00:20:51Z`; GitHub resolves prefix to **`834837e0e0955c491a1f83b6e5526c2460ca8d31`**. Manifest is version evidence, not binary attestation.
**Pipeline:** supplied software SHA `4dafad5` not independently attested; live dataset run **`20261110T221716Z`**, CID **`bafybeifhz5scgrouns27paizph5zpnlxhovr6vcm6skecu67msh4ffjlaq`**, verified through runtime.
**Timing:** sent `2026-11-10T17:11:00Z`; GitHub commit timestamp `2026-11-11T00:20:23Z`; elapsed **7h 09m 23s**.
**CI:** current-SHA run [42930578254](https://github.com/vsterian/roofing-crm/actions/runs/42930578254) succeeded. Draft links successful but older-SHA run `42923040441`.
**Model provenance:** requested parent configuration `github-copilot/gpt-6-astra`; both independent pillar calls explicitly pinned to that verified model ID. Implementation pillar reports all three CLI reviewer consultations explicitly pinned likewise.
**Tools/evidence:** hosted Playwright, read-only HTTP, file reads, GitHub reads as **`vsterian`**. Screenshots: `/tmp/opencode/slowking-834837e-{390,768,1440}-bbb.png`, plus location/RAG/lead captures. Historical R2 score excluded.

Not checked: full automated suite/matrix, current claimed desktop 9/9 rerun, failure/load/security coverage, real GPS hardware, video quality or upstream binary SHA. No repo/wiki edits, builds, deployments, commits, pushes, PR creation or credential-file reads.
Risk: useful lead workflow currently presents broken verification links and overstated qualification facts; passing focused browser checks does not remove those defects.
