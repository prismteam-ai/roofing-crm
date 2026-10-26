# CountyLens: design handoff for implementation

**Product:** CountyLens, a list-first explorer for public property, permit, owner and contractor data in Travis County, TX. The map is not Task A scope (it is reused in the Roofing CRM, Task B).
**Domain:** countylens.aldarraj.com
**Design system:** Atlas (Material 3). No new design values: anything Atlas lacks is built from Atlas tokens and logged in §8. Corner radii use `--md-sys-shape-corner-*` only.
**Clickable prototype:** the CountyLens canvas artifact (claude.ai). Open `Main.dc.html` (site map) and use the round prototype menu on any board to switch device or jump around. The same menu has the prototype-only **Map view (CRM preview)** switch, off by default (§1, Map view).
**Prototype source:** `prototype/` in this package. One `.dc.html` file per board, plus the Atlas tokens and components CSS and the CountyLens extensions (`ds/countylens/a11y.css`, `tablet.css`, `compact.css`).
**Handoff date:** 2026-10-19, revised after seven design-review rounds (88 points; see `design-review-log.md`) engineering's architecture decisions AD-01 to AD-16 (`0000-agent-architecture.md` §5, confirmed by the PO on 2026-10-19; what changed is in §13) and review round 8 (#89–#108) · 241 boards (106 CountyLens + 135 Roofing CRM, §14) · every button and link checked to work, with the map switch off and on.

> How to read the prototype source. Each board is HTML in an `<x-dc>` template with `{{holes}}`, `sc-for` and `sc-if`, and logic in a `DCLogic` class. Treat it as a behaviour and layout reference, not as code to port. Port the logic, not the numbers: the sample records, run data and counts are fixtures (review #14).

---

## 1. Ground rules

| Rule | Detail |
|---|---|
| Sample data | Every number that is not from a real source is labelled **Sample** in the UI. The prototype's demo sample data is accepted for the design (review #30). In the build, test fixtures are labelled as fixtures and never reach the hosted app; "Sample" labels are removed only where real data replaces them (#14). |
| Coverage | Travis County, TX is the only live county. Other counties and states show as **Coming soon**, muted, with no counts and no "Notify me" (#20). |
| Sources | TCAD (properties, owners and sales, parcel geometry) · Austin open-data permits (`3syk-w9eu`, City of Austin only) · **TX Comptroller franchise-tax (`9cir-efmm`)** for businesses · **Overture** for places · contractor names as printed on permits · BBB ratings (#28). |
| Contractor identity | **Official or nothing (AD-05, AD-06).** The permit's name is shown **"as printed on permit"** and never becomes a company record. A **Contractor badge** gives one of five states with a one-line reason: **Resolved** (an official registry identifier matched: "Comptroller taxpayer no. {id} matched"), **Candidate** (likely match from name, phone, address, BBB or places; not proof; tooltip "Name matches stay Candidate. Only an official ID resolves a contractor."), **Ambiguous** (more than one possible company), **Conflicting** (the sources disagree), **Unresolved** (no match). There is **no licence line**: the reason says "No Texas roofing licence register exists". Data licences on the Legal pages are unaffected. **Decided by the PO on 2026-10-19 (AD-05):** a name match, even exact, unique and active, stays **Candidate**; only an official registry identifier resolves a contractor. Austin permits carry names only, so Resolved will be rare. With no name on the permit: "No contractor printed on permit", no badge. |
| BBB | Four states, one wording everywhere (AD-07): **Rated** (with the letter), **Not found**, **Blocked**, **Not checked** (`bbb_status` = `rated` / `not_found` / `blocked` / `not_checked`). **Blocked in Run 3:** "BBB: Blocked · bbb.org refused the check (403) on 2026-10-17", linked to the fetch-log evidence. Never blank, never "no rating" (#37). BBB is extra detail, never proof of identity. |
| Roof age | Always an estimate, shown with its **basis** (reroof permit, then new build, then year built) and a **confidence** badge (High / Medium / Low). |
| Proof | Every value can be traced: source → capture time → run → CID, with copy and Verify. Results show coordinates and a source link (#23). |
| Public vs admin | The app is public by default and **the demo needs no admin access**. **Only admins can sync**: Start / Stop / Retry run and Activity appear only after **Admin sign-in** (email code, no self sign-up), which sits at the end of the main navigation, and carry an Admin flag (#19, #41). AI mode shows each visitor a **quota of 10 questions per session** (sessionStorage), visible all session; failed, paused or throttled questions and chip edits do not count; sign-in for more questions is **coming soon** (#58, #66, #79). |
| Map view | **Not Task A scope.** CountyLens ships List view only, with no view switcher (PO, round 5: the disabled 'Map · Soon' segment is removed). The map exists in the prototype as a CRM preview behind a prototype-only toggle. Do not build the map, the toggle or a feature flag for it. (#74, #78) |
| Coming soon | Builder mode (#21, #46), Street View (#17), AI-user sign-in (#66), the Roofing CRM card until Task B is live (#45). Each carries a **"Soon"** marker where it is listed (Builder: in its panel note and the mobile switcher badge, not on the rail). Builder and AI-user sign-in keep their prototypes so the design is ready; the others are disabled and point to a working alternative. **Not in this list:** Map view, map hexagons and map layers are **CRM preview only; no CountyLens marker; not Task A** (#22, #74, #82). |
| Principles | **P1** Everything in one place · **P2** Proof behind every value · **P3** Answers, not dead ends. |
| Six states | Every data screen handles loading, empty (with a hint and one next step), error, partial data, rate-limited and populated. |
| Breakpoints | 390 (mobile), 768 (tablet), 1440 (desktop): **every screen has all three** (#8, #9). Atlas tokens: compact < 600, medium 600–839, expanded ≥ 840. |
| No inner scrolling | At every size, the Explore query panel and results panel fit without scrolling. Results page instead (§4.1.6). |
| Touch targets | **48 px** is the build rule (#16). |
| One source of counts | Every count on Coverage, the Ownership row, Reconciliation and the MCP `get_coverage` tool comes from one place: the **coverage section of the run manifest** (AD-04, #34). There is no `coverage.json` or `merge_stats.json`. |
| Scope rule | Anything beyond the README requirements either ships with labelled sample (test) data that shows the intended experience, or is marked **Coming soon**. Content that must be dynamic (counts, dates, CIDs, URLs) is wired in implementation. |

## 2. Architecture (hybrid, review #1)

These are design constraints. Engineering owns the final choices; record the hybrid in the architecture constitution at G3. **There is no query database**: data lives in published Parquet. The only hosted state is one on-demand DynamoDB item per UTC day that counts AI spend ($0 idle) (#67).

| Runs in the browser | Runs on the server (Lambda: tRPC, and MCP's own handler) |
|---|---|
| Explore queries (Filters, SQL), Verify, Coverage, Runs and Data screens | The AI agent (D-10, D-11), MCP (D-12) |
| **DuckDB-WASM** over CID-addressed Parquet: CID-named copy first, public gateway fallback (#64, #84) | DuckDB over the same published Parquet |
| **Free-form SQL runs only here** | Fixed, parameterised tools only; no free-form SQL |

- Both sides share one **`query-core`** package: view definitions, bound parameters, filter definitions and the SQL checks (§4.1.3).
- **Published data (AD-01, AD-03, AD-04).** Each run publishes exactly what `elephant-cli export-tables` writes: one Parquet table per lexicon class (`properties`, `property_improvement`, `structure`, `sales_history`, `person`, `company`, `address`, `geometry`, `business_location`), one per relationship (`relationships/`) and `tables-export.json`; plus the **run manifest** (`oracle-travis-run-manifest.v1`: `runId`, `previousManifestCid`, sources with watermarks, records, deltas and limitations, artifacts with CID, size and SHA-256, and a **coverage section**) and the **places gazetteer**. There is **no serving Parquet** and no other copy of the data. The run history is `runs/index.json`, committed to git and published with each release; the app finds the latest run there. **No IPNS:** each manifest links to the one before it (the run chain). No map `tiles/` directory: map tiles belong to the CRM (#78). These outputs belong in stories A-02 (data contract) and A-11 (publication) (#32). Earlier CIDs are never changed (D-7).
- **Views exposed to SQL and MCP:**

  | View | Rows | Columns |
  |---|---|---|
  | `v_property` | 412,860 | `property_cid`, `situs_address`, `lat`, `lon`, `coordinate_source`, `roof_age_years`, `roof_age_basis` (`permit` / `new_construction` / `built_year` / `unknown`), `roof_age_confidence`, `last_sale_date`, `tenure_years`, `tenure_basis` (`sale_date` / `unknown`), `owner_is_out_of_area`, `owner_area_class` (`in_county` / `regional` / `out_of_area` / `unknown`), … |
  | `v_roofing_permit` | 22,083 | `permit_cid`, `property_cid`, `permit_number`, `status_raw`, `improvement_status`, `status_class` (`open` / `stalled` / `closed` / `exclude`), `issue_date`, `final_date`, `expiry_date`, `is_open`, `open_days`, `contractor_company_cid`, `contractor_name_raw`, `contractor_resolution`, `bbb_status` (`rated` / `not_found` / `blocked` / `not_checked`), `bbb_rating`, … |
  | `v_contractor` | 18,240 | `contractor_company_cid`, `name`, `identity_source`, BBB fields, `roofing_permit_count` (Resolved companies, plus one row per unresolved name, marked unresolved) |
  | `v_run` | 3 | `run_id`, `started_at`, `finished_at`, `manifest_cid`, `previous_manifest_cid`, sources |

  The views live in `packages/query-core/views.sql`, over the elephant-cli tables only; names are frozen against a real `tables-export.json` in A-02 (AD-07). Bound parameters: `:area_centre`, `:radius_mi`. Helper function: `dist_mi(lat, lon, :area_centre)`.
- **Places gazetteer.** Area search needs Census places and ZIP centroids: `gazetteer.parquet` (`place_id`, `name`, `kind`, `lat`, `lon`, `source`) in the A-02 data contract, listed in the manifest (#30).
- **Verify (D-6).** Fetch a **file** artifact under about 50 MB from two public gateways: lane A **ipfs.io** and lane B **dweb.link**, the pair the README names (#69). Both are operated by **Interplanetary Shipyard**, and each lane shows its operator; neither is run by CountyLens. **Filebase stores and pins the files**; Filebase's own gateway is **never** one of the two lanes (#26). w3s.link is not on the demo path. Fetch **by the plain file URL** (`https://ipfs.io/ipfs/<cid>`, `https://<cid>.ipfs.dweb.link/`), never `?format=raw`, which returns one block (#35). Hash as a stream with **hash-wasm** or **@noble/hashes** (WebCrypto cannot hash in chunks) and compare with the manifest's size and SHA-256. Directories and files over 50 MB show **Verify via CAR**. Each lane prints the exact URL fetched. A rate limit counts as pending with a countdown, never as a failure. Verify always uses the public gateways, never the CID-named copy (#64). **Gateway spike (#69, implementation):** early in A-02, test one real Filebase-pinned CID on ipfs.io and dweb.link (CORS, Range, subdomain redirect, rate limits).
- **Activity log.** Server-side events only (AI questions, MCP calls, Try a tool, search), written to **CloudWatch Logs** (`/countylens/query-log`), kept 30 days, no personal data. Filters, SQL and Builder run in the browser and are **not logged**; the page says so (#18, #43). Admin only.
- **Agent (AD-09).** Turns a question into tool calls and returns **one response through API Gateway, no streaming**: at most 6 tool steps and 3 model calls, a hard stop at 25 s (target p95 under 20 s). The UI shows **Working…** with an elapsed timer and Cancel, then the answer with all its steps at once, or **Took too long** at 25 s. Conversation memory is kept on the client; a follow-up such as "near that area" reuses the previous area (#24). It must say what data is missing (for example BBB) rather than invent it.
- **MCP.** `https://countylens.aldarraj.com/mcp` is its **own stateless Streamable HTTP handler** (a Lambda behind API Gateway) that shares `query-core` with tRPC, with CORS and Origin checks. It is read-only and needs a **bearer token** (AD-10), shared privately with reviewers and stored in SSM; a missing or wrong token returns `401`. It is **throttled** by the API Gateway stage rate limit (no per-IP WAF rules, which would add cost); throttled calls return `429`. **Try a tool** goes through the CountyLens API, which adds the token on the server, so the token never reaches the browser; the prototype's sample response must not ship (#2, #44, #57).
- **Shareable URLs.** Explore state lives in the URL, for example `/tx/travis/explore?at=30.4394,-97.6200&r=5&roof=15&permit=open,stalled&tenure=10&ooa=1&sort=open_desc&sel=p_101`, plus `mode=filters|sql|ai`, `view=list` and `place=<id>`. **Area = `place` or `at`:** a picked place writes `place=<id>`; a free centre writes `at=lat,lon`; both round-trip with `r`. The back button must work. CountyLens has List view only: a `view=map` URL falls back to List (#74, #88).
- **Sign-in and run commands.** Cognito user pool with the built-in **email code** (SES) for admins only, self sign-up off (#41); the AI-user variant is coming soon (#66). Start / Stop / Retry go to an **SQS run-command queue** with a command ID. A small **local bridge** on the pipeline host long-polls the queue with scoped IAM credentials (the SSM agent does not read SQS), acknowledges each command when it picks it up, and drops commands older than **15 minutes** so a stale Start never fires later. **Cancel** sends a cancel message keyed by the command ID; the bridge skips that command if it has not started. If nothing acknowledges within 60 s the UI shows "Host offline" (#42, #56).
- **Reading the data (#36, #64, AD-01).** Queries (browser DuckDB and the Lambda agent and MCP) read the **elephant-cli tables through the views**, from an **S3 copy of the published files named by their CID** (bytes checked against the CID at release), with HTTP range reads of only the columns and row groups a query needs. If the copy fails, the browser falls back to a public gateway; a Lambda fallback fetch is labelled "via server". The loading state shows MB of the needed columns, never a 400 MB download.
- **Cost (#7, #40, #55, AD-13).** The Coverage cost card lists **every** deployed resource with its fixed cost and its usage in cents: Amplify Hosting; **S3 copy of published files** (cents); API Gateway + Lambda (tRPC and the MCP endpoint); model API calls; the DynamoDB spend counter; SSM Parameter Store (MCP token and config); Cognito; SES; SQS; CloudWatch Logs; ACM certificate (free; DNS stays at Namecheap, **no Route 53 hosted zone**); Filebase pinning (free tier, 5 GB); GitHub Releases (CAR copies, free); the public gateways ipfs.io and dweb.link (free, run by Interplanetary Shipyard, not ours); the local pipeline. **$0.00 fixed per month**; everything else is usage in cents.
- **AI spend (#58, #66, #68, #71, G3).** Server-side protection: a daily spend counter (the DynamoDB item above) with the provider's prepaid credit as the hard ceiling, about 6 steps and 1.5k output tokens per answer, a route throttle, reserved concurrency of 3–5 for the agent Lambda **only if the account limit allows it** (AD-11), and an alarm at 80% of the daily cap ($3 a day); size the cap for evaluation days. The visible quota is **10 questions per session**, kept in `sessionStorage` and shown beside Find and in the results tab bar. Only answered questions count: failed, paused or throttled questions do not, and a chip edit that re-runs the query without a model call does not count and costs nothing (#79). When the daily budget is used up, AI mode pauses until 00:00 UTC and says so; Filters and SQL keep working. There is no streaming (AD-09): `agent.ask` returns one response through API Gateway, so the stage throttle applies. **Model provider (#73, #88):** Vercel AI SDK, provider set by `AI_PROVIDER` (`bedrock` or `gateway`); confirm quota before A-14. Optional: cache answers per run CID and question for 24 h, labelled "cached answer from {time}".
- **Demo city check (#38).** During A-02, count real roofing permits inside the Pflugerville 5 mi ring (Austin permits cover the City of Austin only). If the D-11 answer would be thin, move the demo centre to a place whose ring is mostly City of Austin, for example ZIP 78753.

## 3. Site map and routes

The `Main` board is the site map for **both apps**: CountyLens (top), then the **Apps hub** band (Hub → CountyLens, Hub → Roofing CRM, Apps back to the Hub from both, and the cross-app links such as “View lineage in Explorer”), then the **Roofing CRM** site map (CRM · not Task A; §14.1).

| Screen | Route | Priority | Demo | Boards (1440 · 768 · 390) |
|---|---|---|---|---|
| App shell | every screen | Must | D-1 | `Shell1440`, `Shell390More`, `Shell390Location`, `Shell390ComingSoon`, `ShellStates` |
| Apps hub (suite landing page) | `/` on the suite domain | Must | – | `Hub1440`, `Hub768`, `Hub390` |
| First visit: “What can I ask?” card over Explore | `/tx/travis/explore?first=1` | Nice to have | – | `Welcome1440/768/390` |
| **Explore (home)**: Filters / Builder (prototype, soon) / SQL / AI, List view | `/tx/travis/explore` | Must | D-4, D-8–D-11 | `Explore1440`, `Explore768`, `Explore390`, `ExploreStates`, `ExploreQ-*`, `ExploreQ390-*` |
| CRM preview: Explore with Map view on (prototype only, **not Task A**) | – | – | – | `ExploreQ-crmmap`, or any Explore board with the ProtoBar switch on |
| Search box (in place, every screen) | `?q=` on any route | Must | – | `SearchBox`, `SearchStates` |
| Property detail | `/tx/travis/property/{id}` | Must | D-9 | `PropertyDetail` (shared), `Property1440`, `Property768`, `Property390`, `Property390Full`, `Property390NoImagery`, `PropertyStates` |
| Runs | `/runs` | Must | D-2 | `Runs1440`, `Runs768`, `Runs390`, `RunsStates`, `RunsAdmin1440` |
| Runs compare | `/runs/compare?a=2&b=3` | Must | D-7 | `RunsCompare1440`, `RunsCompare768`, `RunsCompare390` |
| Pipeline history log | `/runs/log` | Must | – | `RunsLog1440`, `RunsLog768` |
| Coverage | `/tx/travis/coverage` | Must | D-3 | `Coverage1440`, `Coverage768`, `Coverage390`, `CoverageStates` |
| Data: run chain + manifest | `/data/manifest` | Must | D-5 | `DataManifest1440`, `DataManifest768`, `Data390`, `DataStates`, `RunChain` |
| Data: verify | `/data/verify/{cid}` | Must | D-6 | `DataVerify1440`, `DataVerify768`, `DataStates` |
| Data: catalog | `/data/catalog` | Must | – | `DataCatalog1440`, `DataCatalog768` |
| SQL states and errors | Explore · SQL | Must | D-4 | `SqlStates` |
| AI mode states | Explore · AI | Must | D-10, D-11 | `HelperStates`, `ExploreQ-aiworking`, `ExploreQ-aislow` (and their 768 and 390 boards) |
| Help · MCP and API docs | `/help/mcp` | Must | D-12 | `HelpMcp1440`, `HelpMcp768`, `HelpMcp390` |
| Admin sign-in | `/admin/sign-in` (Admin in the main navigation) | Must | – | `AdminSignIn1440`, `AdminSignIn768`, `AdminSignIn390` |
| Sign in to keep asking (AI users) · **Coming soon** | `/sign-in` | Coming soon | – | `UserSignIn1440`, `UserSignIn768`, `UserSignIn390` (planned flow, not linked) |
| Activity (admin only) | `/admin/activity` | Nice to have | – | `Activity1440`, `Activity768`, `Activity390`, `ActivityStates` |
| Legal: terms, data use and licences, privacy | `/legal/*` | Must | – | `LegalTerms1440/768`, `LegalData1440/768/390`, `LegalPrivacy1440/768` |
| Empty-state hints | shared | Must | – | `EmptyHints` |

The 768 and 390 versions of the data screens wrap the 1440 page with one shared rule each (`tablet.css`: rail plus one column; `compact.css`: one column, bottom nav, charts as tables, tables as key–value cards below 600 px). Build the same rules with container queries.

## 4. Screens

### 4.0 App shell

- **Top bar (768+):** wordmark · location chip "Travis County, TX ▾" · search box · run badge **"Run 3 · {date}"** (opens Runs; Stale only for real staleness, #13) · Help menu · **Ask** · Apps (opens the hub).
- **Top bar (390):** wordmark plus icon buttons for location, Help, Ask and Apps. The search box sits below the bar.
- **Navigation, 768 and 1440:** rail with Explore, the query modes nested under it (Filters, Builder with Soon, SQL, AI), then Runs, Coverage, Data, and **Admin** at the end (opens Admin sign-in; reads "Signed in" for admins). **Activity shows only when signed in as admin.**
- **Navigation, 390:** bottom bar with Explore, Runs, Data and More. More holds Coverage, Help, MCP docs, Admin sign-in and the legal pages (Activity only for admins).
- **Help menu:** Help, What can I ask?, MCP and API docs. Admin sign-in moved to the main navigation. Signed in, an **Admin** pill sits in the top bar.
- **Ask:** on Explore it switches to AI mode in place and focuses the question box. Everywhere else it opens Explore in AI mode.
- **Sync badge states** (`ShellStates`): Fresh, Running, Stale (more than 8 days old), Failed, Never synced.
- **Location picker:** pick a state, then a county. Only Travis is live; the rest show "Coming soon".

### 4.0.1 Apps hub (#15)

The suite landing page (#15, #45). The Apps button on every screen opens it.
- **Status chip:** latest run, manifest CID and refresh time ("Run 3 · bafybeih…q7n3 · refreshed 2026-10-17 11:43 UTC"), linking to Runs. States: loading (skeleton) and unavailable ("Run status unavailable" with Try again).
- **Watch demo** and **Pull requests** buttons (links added at submission).
- **App cards:** CountyLens (Open CountyLens, What can I ask?) and Roofing CRM. Until Task B is deployed, the CRM card shows "Coming soon" and a disabled "Not deployed yet" button, so there is no dead link. The CRM card's scope line reads: **“Map, Filters and AI search, plus leads; Campaigns and the rest are coming soon.”** (Visits stay later.) When the CRM is live, its Open button goes to the CRM sign-in (`CrmSignIn{390|768|1440}`). "Preview Explore with the map · prototype only" opens `ExploreQ-crmmap`; it is **prototype only, do not ship**, and shows only with the CRM-preview switch on (#87).
- What both apps share, and the legal links.

### 4.1 Explore (home)

One workspace. Query with **Filters, SQL or AI**; **Builder** is a working prototype marked coming soon. Results are a **List** (a paged table at 1440 and 768, paged cards at 390). CountyLens has no view switcher; the List / Map switch exists only in the CRM preview. Property details open on demand.

> **Map view is not Task A scope (#74).** The prototype keeps the full map (markers, ring and handle, count chip, legend, Layers, hexagons, map controls, map keyboard, OSM credits) as a **Roofing CRM preview** behind the ProtoBar switch “Map view (CRM preview) · prototype only, not in CountyLens”, off by default. With it on, Explore shows a dashed note “CRM preview: not part of CountyLens”. Build none of it for CountyLens: no map code, no toggle, no feature flag. The deviations from Atlas are logged in §8.

#### 4.1.1 Layout (List view, as CountyLens ships)

| | 1440 | 768 | 390 |
|---|---|---|---|
| Query panel | Left, x 80, w 320, full height. Collapses to a 256 px summary with Edit query / Save / Clear. | 320 px overlay with a scrim, opened from the query chip in the results bar. | Modal bottom sheet (half → full, drag handle), opened by the **Edit query** extended FAB in the thumb zone. The mode switcher sits in its title row. |
| Results bar (y 64, h 56) | Area picker · Sort (no view switcher); the radius control sits in the table footer, bottom right | Query chip · Area · Sort (icon only) | Replaced by a **sticky results header**: count “within r mi” and Sort; Area chip + radius slider and number field; active filter chips (each opens the query) |
| Results | x 400 (336 when the query panel is collapsed) to the right edge: **paged table**. AI mode: **Answer (480 px)** beside a **numbered Matches table**. | Full width: a 5-column table (Address with lat, lon as a second line · Roof · Conf. · Distance · details); AI mode: Answer above (440), numbered Matches table below (464). Paging stays. | Results are the page: **paged cards** below the sticky header (y 234 to the bottom nav); AI mode adds the Answer tab and numbers the cards. |
| Details | Drawer from the right, 440 px | Drawer 440 px | Full sheet |

The map layouts (map + 360 px cards panel at 1440, map above cards at 768, full-bleed map with a bottom sheet at 390) exist only in the CRM preview.

#### 4.1.2 Shared by all modes

- **Area and radius, outside the query panel (#75, E-34; PO round 5):** they sit where the map view has them, in both views and both switch states; the query panel has no Area or radius.
  - **Area** picker in the results bar (next to Sort), with search ("City, ZIP or address"). Typing filters the list with the match in bold, Enter picks the first match, no match shows a hint. Places can also be set from the top search ("Set as Area"). The centre's lat, lon shows in its tooltip and in the AI "How I read this" line.
  - **Radius:** slider 0.5–10 mi (steps of 0.5) plus a number field; arrow keys step 0.5. **Map view** (CRM preview): the radius card at the bottom right of the map, synced with the ring handle. **List view:** the same control at the bottom right of the results, in the table footer beside the pager. **390 with the map off:** Area chip and radius slider in the sticky results header. In AI mode it edits the radius chip.
- **Results header (#75, E-35):** "128 within 5 mi of Pflugerville city hall · roof ≥ 15 yrs", updated **150 ms after the last change** (count, radius, Area and the active conditions of the current mode).
- **Proof of the radius:** the Mi column with a bearing ("2.4 mi NE"), Sort = Nearest, and Close matches that say how far outside they are ("0.2 mi outside"). Each row has **Open in OpenStreetMap** (an external link with the parcel's lat, lon; not a map in CountyLens).
- **Footer:** match count · Clear · Save (saved searches appear in the search box).
- **SQL binding:** `:area_centre` and `:radius_mi` come from the Area and radius. **AI binding:** a radius stated in the question wins; otherwise the chip reads "Within the Area radius (not stated)".

#### 4.1.3 Query modes

- **Filters:** roof age at least, in years (10 / 13 / 15 / 20 / 25), roofing permit (Any / Open or stalled / Stalled) plus an **"Open ≥ N yrs"** chip with a menu (any time, 1, 3, 5, 10 yrs) that matches the agent's "many years" chip (#59, E-33), owner (Tenure > 10 yrs, Out-of-area).
  - **Definitions inline (#31, #37):** "Out-of-area = mailing address outside Travis County"; "Stalled = the source says Expired, or open past its expiry date" (AD-08: the Travis profile sets the class from `status_raw` and `expiry_date`; an expired permit is never relabelled Completed or Cancelled); "Tenure = years since the last sale; unknown when there is no sale date".
  - **Suggested queries:** "Out-of-area owners, roof ≥ 20" and "Owners for 10+ years, roof ≥ 15".
- **Builder: prototype, coming soon (#21, #46).** No "Soon" pill on the rail item (PO, round 5); the corner badge stays on the mobile switcher segment (E-30) and the panel note says it is coming soon. It still opens, with the note "Prototype of the coming query builder. Filters, SQL and AI ship first."
  - A plain-language sentence (up to 3 lines) and an All (AND) / Any (OR) switch.
  - Each condition is one compact line: field · operator · value · delete.
  - Fields: Roof age, Permit status, Permit open yrs, Owner tenure, Owner mailing. A field can be used only once, so there are at most 5 conditions.
  - Ships after Filters, SQL and AI (build order step 4).
- **SQL:** an editor with Run and **Schema**, which opens the Data catalog (`/data/catalog`) in a new browser tab (no pop-up), and the bound-parameter line below it.
  - **Suggestions sit below the editor:** Roof ≥ 15 in Area · Open permits 5+ yrs (two at 1440 and 768, so the panel never scrolls; Out-of-area, roof ≥ 20 is the third at 390).
  - **Checks, in order, on Run:**
    1. Empty.
    2. A write keyword: "Read-only".
    3. A misspelled keyword (`SELEC`, `FORM`, `WHER`, `ORDR`, `JION`, …): "Syntax error, line n. 'FORM' is not a keyword. Did you mean FROM?", with a one-click **Replace** button.
    4. Does not start with SELECT or WITH.
    5. Missing FROM.
    6. Unknown view: "There is no view named properties", with a **Use v_property** button that guesses the nearest view.
    7. Unbalanced brackets or quotes.
  - Every error also shows **an example that runs**, the nearest suggestion, with **Use this example**.
  - A successful run shows "n rows · 62 ms · in the list".
  - **Suggestion SQL uses the AD-07 names:** `situs_address`, `roof_age_years`, `dist_mi(lat, lon, :area_centre)`; the permit query reads `status_class`, `status_raw`, `open_days`, `contractor_name_raw` and `contractor_resolution`, joins on `property_cid` and filters `WHERE r.status_class IN ('open','stalled') AND r.open_days >= 1826`, so stalled permits are kept (#103); the out-of-area query reads `owner_is_out_of_area`, `owner_area_class`, `tenure_years` and `tenure_basis`. The Schema list shows the §2 view columns.
  - **Engine line (#27, #64):** "DuckDB-WASM in your browser · read-only · bafybeih…q7n3 (CID copy) · 18.4 MB" (MB of the elephant-cli tables behind the views the query reads); the tooltip explains that it reads those tables through the views, the CID-named copy, the check at release and the ipfs.io fallback.
  - **Run it yourself (#27):** toggles a copyable DuckDB CLI command built from the query that ran: `duckdb -init views.sql` (from `packages/query-core`, which defines the views and `dist_mi()` over the run's elephant-cli tables on ipfs.io), `SET VARIABLE run_cid`, and the query with `:area_centre` and `:radius_mi` filled in. No per-view Parquet files. It hides the suggestions while open.
- **AI:** a question box (72 px) with **Find** and the session quota "n of 10 AI questions left this session"; the results tab bar repeats it as "n of 10 left", so the quota stays visible while the answer is open (#58, #66, #79). Kept in `sessionStorage`; only answered questions count, and a question counts when its answer arrives (not failed, cancelled, timed-out, paused or throttled ones, and not chip edits). At the limit Find is disabled and an info banner says "You've used this session's 10 AI questions. Filters and SQL have no limit —" with the button **Open this question in Filters** (same Area, radius and conditions), then plain text, not a button: "More AI questions with sign-in: coming soon." When the daily budget is used up, a paused banner replaces it (E-31; boards `ExploreQ-ailimit`, `ExploreQ-aipaused`). Two suggestions show until a conversation has turns (and on mobile until a question has run).
  - **"Read as" assumption chips are editable (#4):** tap a chip to open a small menu of values. Radius: 1 / 3 / 5 / 7 / 10 mi. Roof age: 10 / 15 / 20 / 25 yrs. Years open ("many years" = N): 1 / 3 / 5 / 10. Place: the first five places. Edited chips say "(you set)". ✕ drops a chip as the secondary action.
  - **Answer tab (#24),** the default results tab in AI mode:
    - The question, with a "Follow-up · area from your last question" pill when it applies.
    - **Working… (AD-09, E-43):** while the single response is pending: a spinner icon (static under reduced motion), "Working…", the elapsed seconds (a timer, not announced every second), an indeterminate progress bar, "The answer and all its steps arrive together. Up to 6 steps; it stops at 25 s." and **Cancel** (nothing counted; "Cancelled" banner with Ask again). Matches and the "Read as" chips wait for the answer ("Matches arrive with the answer."). Board: `ExploreQ-aiworking` (timer from 7 s; it reaches Took too long at 25 s).
    - **Took too long (AD-09, E-43):** at 25 s a warning banner "Took too long. The answer stopped at the 25 s limit. Nothing was counted, and your question is kept." with **Try again** (filled) and **Use Filters instead** (outlined; same Area, radius and conditions). Board: `ExploreQ-aislow`.
    - **How I read this (#39):** arrives with the answer; one line built from the assumptions, for example "Pflugerville city hall → 30.4394, −97.6200 · within 5 mi · roof age > 15 yrs (reroof permit, else new build, else year built) · data: v_property · Run 3". Clamped to 2 lines below desktop, full text on hover.
    - **All tool steps at once, with the answer (no streaming, AD-09),** for example "Found Pflugerville at 30.4394, −97.6200" · "Searched r = 5 mi, roof > 15 yrs" · "Read 9 matching parcels from v_property" · "Checked roof-age basis and confidence" (contractor questions: "Read contractor identity (TX Comptroller registry only) and BBB state from v_roofing_permit"). On 768 and 390 they fold into one "4 steps done · show" row.
    - A summary with numbered citations (5 on desktop, 3 on tablet, 2 on mobile). **Citations ↔ rows (#76, E-39):** citation [n] matches row n in the numbered Matches table (numbered cards at 390); tapping it highlights row n and opens its Why view, and the row number opens the same Why view. (With the CRM preview on, the numbers also match numbered map pins.)
    - The missing-data note. Contractor questions: "Contractor names are as printed on the permit; only a TX Comptroller match is Resolved. BBB is Blocked on some (bbb.org refused the check, 403) or Not checked. …"; citations then show the name as printed and its badge label.
    - **Conversation:** up to 4 turns, kept on the client. "Earlier in this conversation" shows recent turns with **New conversation**. "That area", "same area" and "near there" reuse the previous area and radius.
  - Recognises distance, places (Pflugerville, Manor, Wells Branch, Austin, the four ZIPs), roof age, permits, contractors and owners.

#### 4.1.4 Map view: CRM preview only, not Task A (#22, #74, #78)

Kept in the prototype for the Roofing CRM; **do not build it in CountyLens.**

**CRM first release (PO, round 5):** Explore and Search with three search modes, **Map, Filters and AI**. With the ProtoBar switch on, the prototype shows exactly that: the query rail has Filters and AI only (SQL and Builder are hidden and a URL asking for them opens Filters), the search box offers Map · Filters · AI as its "Start a new query with" modes and drops SQL suggestions, and the dashed note reads "CRM preview · Map, Filters and AI · not part of CountyLens". The top bar title reads **Roofing CRM**, and the navigation drops **Runs, Coverage and Data** (and the run badge), which belong to CountyLens. In CountyLens (switch off) the search box modes are Filters · SQL · AI, with no Map. CRM scope: **“Map, Filters and AI search, plus leads; Campaigns and the rest are coming soon.”** (Visits stay later.)

With the switch on, Explore shows the map exactly as in round 4:
- Roof-age markers coloured `--viz-roof-age-*`; stalled permits as a diamond with a dashed outline; non-matching markers dimmed and disabled.
- Radius ring and pin at the Area centre, with the drag handle (E-16) and a count chip ("128 in 5 mi"); the map radius card and Layers popover (E-5).
- Legend (hidden on mobile); zoom in, zoom out, recentre; hexagons and the coverage-gap layer (Soon).
- Keyboard: the map is a tab stop; arrow keys pan, + and − zoom, Home recentres (A-4).
- Selected list rows and AI citations show as numbered pins.

With the switch off (CountyLens) all of these are hidden, along with the OSM credits and licence row, the privacy page's tile-provider sentence and the `tiles/` row in Data · Manifest and Data 390. The CountyLens replacements are the Area + radius block, the results header, the roof-age colour on the Roof cell (E-37) and citations ↔ rows.

#### 4.1.5 Result cards

- **Collapsed:** title · distance with bearing · details (i) · expand. Below it, two **signal chips**: roof yrs (with its roof-age colour swatch) + confidence pill, and permit status as **class + the source's own status word (AD-08)**: "Stalled 6.4 yrs · source says Expired", "Open 3.8 yrs · source says Active", "Closed 2023 · source says Final". Each chip opens the Why view (#6).
- **Expanded:** adds the basis, then the **contractor block (AD-05, AD-06, E-42):** Contractor "SAMPLE ROOFING CO" *as printed on permit* · the Contractor badge (Resolved / Candidate / Ambiguous / Conflicting / Unresolved) with its one-line reason · "BBB: {state}". No licence line. With no name on the permit: "No contractor printed on permit". Then the **Why is this a match?** button. The details drawer's Roofing permit card has the same status, "Contractor, as printed on permit", Identity (badge + reason) and BBB rows.
- **Why view:** replaces the list inside the panel, with Back to results.
  - Each rule with its value; **Coordinates** (lat, lon); a **source record** link; then source · run · CID (#23).
  - Verify CID and Details buttons.
- **Close matches:** their own tab (in the table header at 1440 and 768). Each says what it misses ("0.2 mi outside", "Roof 13 yrs, 2 short"); tapping one relaxes that condition and adds the property, with a "Close match added" pill.
- **Sort:** Oldest roof, Permit open longest, Nearest.

#### 4.1.6 Paging, never scrolling

- Pages are packed to fit the panel's height. In the prototype: collapsed card 88 px, expanded 188 px (170 on tablet) plus the contractor block, header 48 px, pager 48 px.
- Expanding cards pushes the overflow onto the next page.
- Pager text: "1–7 of 9 sample cards"; the table footer reads "Showing 1–9 of 9 sample rows · Oldest roof" with a compact Pager and Download.
- Changing the query, sort, Area or radius goes back to page 1.

#### 4.1.7 Other Explore pieces

- **List view (the CountyLens results view):** at 1440 a paged table with row checkboxes and the columns # · Address · Roof (colour swatch + number) · Basis · Conf. · Permit · Mi (with bearing) · **Lat, lon** · **Source** (link to the TCAD record) · Open in OpenStreetMap (#23); rows per page from the height (48 px rows); a Pager and Download in the footer. At 768 the 5-column table (56 px rows). In AI mode a numbered table (# · Address with lat, lon · Roof · Conf. · Distance).
- **Details:** opens from (i), the drawer under the title reads "{n} mi from the area centre". Its Roof card cites `roof_age_years · Run 3 · CID`. "Ask about it" opens AI mode with a question about that address filled in.
- **Opened from search:** each search mode opens Explore in that mode with its query loaded (`ExploreQ-*` boards).
  - Filters: roof15, permits5 (the D-9 board: roof ≥ 15, open or stalled permits open ≥ 5 yrs, near Pflugerville, sorted by longest open), ooa78753 (SC-5: out-of-area owners **and tenure > 10 yrs**, #83), stalled78753.
  - SQL: sqlperm, sql.
  - AI: aicontractor (the D-11 board, drawn as the second turn: D-10's question in "Earlier in this conversation", then "…near that area…" with the follow-up pill and the carried-over area), aiooa, ai, ailimit, aipaused, **aiworking** and **aislow** (AD-09; also `ExploreQ768-*` and `ExploreQ390-*`).
  - CRM preview: crmmap (roof15 with Map view on; prototype only).
  - Builder: builder (the prototype, marked Soon).
- **States** (`ExploreStates`, `SqlStates`, `HelperStates`): loading, empty with close matches, error, partial (BBB), rate-limited, AI "can't answer" (no sale prices), and AI **Working…** and **Took too long** (AD-09).

### 4.2 Search box (every screen)

- **Idle:** a hint box ("Search an address, place, ZIP or permit, or ask a question"), mode chips (Filters, SQL, AI), the suggestion "Open or stalled roofing permits near Pflugerville" (opens Filters), and one de-duplicated list of Suggested, Recent and Saved searches, each with its mode icon. Recent and saved items can be removed.
- **Typing:** matches grouped by **Place, Address and Permit** only. Owner and contractor name search is removed (#33). Footer links: Ask AI / SQL. Place rows show **Set as Area**.
- Has a single clear button; the browser's own clear (✕) is hidden.
- **Modes per app:** CountyLens offers **Filters · SQL · AI** (no Map); the Roofing CRM offers **Map · Filters · AI** (no SQL, and no SQL suggestions or SQL footer link).
- **No scrolling, Close always visible (PO, round 5):** Close sits in a fixed footer outside the list. At 1440 and 768 the suggested, recent and saved list is two columns; at 390 it shows 4 with "Show n more". The panel is 640 px high at most (624 at 390).

### 4.3 Property detail (shared component)

- **Opens as a drawer over the List view** (`Property1440`): the results list stays behind it with the open property highlighted. The map backdrop and the “Show on map” action exist only in the CRM preview; CountyLens shows “Show in the list” (#80).
- **Sections:**
  - **Street View: coming soon** (#17), shown as the no-imagery card; no Google key or billing.
  - Owner and sale (confidential owners show as "withheld").
  - Roof: estimate, basis, confidence and an evidence chain.
  - Permits: each with its class + source status word ("Stalled · source says Expired", "Closed · source says Final"), issued · expired · final dates, "Contractor, as printed on permit", **Identity** (Contractor badge + reason) and BBB state (AD-05, AD-06, AD-08). No licence line. The note under them says the class comes from the Travis profile next to `status_raw`, and identity from the TX Comptroller registry only.
  - **Owner merged from 2 records** (#3, #34, #62): a real de-duplication, two TCAD owner accounts for the same owner (“SAMPLE, JORDAN A”, kept, last sale 2011-07-18, which matches the Owner section; and “JORDAN A SAMPLE”, merged, “same normalised name and mailing address; newer account”), matched on normalised name + mailing address. It links to Coverage → Reconciliation. **Sources (#92, AD-01):** each source row says "From the published owner record (person table) · TCAD account {id}"; there is no lineage file or `v_lineage`. **Fallback:** if A-02 finds no published field that names the source accounts, the section shows "Merge details: coming soon. Run 3 merged 6,866 owner records in the county (Run manifest · coverage section)." (`PropertyDetail` prop `mergeDetails="none"`; `PropertyStates` · Merged-from details not published; E-47).
  - Provenance (field · source · captured · run · CID · data licence), with the AD-07 field names (`roof_age_years`, `bbb_status`, `lat, lon`); Location shows "Coordinate source: TCAD parcel centroid".
  - **Similar properties:** a vertical list in the result-card style.
- **Below 600 px**, permits and provenance rows become key–value cards. Nothing scrolls sideways (#10).
- **"Ask about this property":** opens Explore in AI mode.
- **Sizes:** a 560 px drawer at 1440 and 768, a full sheet at 390.

### 4.4 Runs

- **Run picker (the first control on the page):** a dropdown under the title, "Run 3 · latest · 2026-10-17 · 10:22–11:51 UTC · 1 h 29 m · Completed". The menu lists every run newest first, each with its date, start–end time in UTC, duration, status pill and manifest CID, plus a search field (run number or date; Enter picks the first match; Esc closes). It scales to any number of runs (the list scrolls). The picked run drives the pipeline diagram, timeline, latest events and "What Run n changed"; the sync card, the top run badge and the state banner always show the latest run, and an earlier run shows "Viewing an earlier run · Show the latest run". A running or failed run is listed with its status and opens with "Its changes show once it publishes". `?run=<n>` belongs in the URL.
- **Sync card:**
  - Status pill and last and next sync.
  - **County coverage: "99.4% of roll · 410,402 of 412,860 parcels"** (#28).
  - **Public view:** "Admins start runs from the pipeline" with an **Admin sign-in** link and no action buttons.
  - **Admin view** (`RunsAdmin1440`): Start run / Stop run / Retry Comptroller / Retry now / Retry publish / Start first run, depending on state (#19).
  - **Command states (#42, #56):** "“Start run” queued · command cmd-xxxx · waiting for the pipeline host; it expires after 15 min" with Cancel → "Acknowledged (cmd-xxxx)" → the run state changes; if nothing acknowledges in 60 s, "Host offline · the command expires 15 min after it was sent; start the host, or run it from the pipeline CLI". Cancel sends a cancel message for that command ID. The prototype has an Online / Offline switch for the host.
- **Pipeline diagram:**
  - **8 sources:** Austin permits, TCAD properties, TCAD owners and sales, BBB (blocked), Coordinates, TX Comptroller businesses, Overture places, Contractors. They feed four steps: Check and join → Derive → Publish → Verify.
  - Each shows a status icon + label, progress, count and duration. Click for start, end, records, a note and a log link.
- **Timeline (Gantt):** one bar per source and step from 10:20 to 11:55 UTC, with a hover tooltip, a "now" line while running, and **Show as table**.
- **Latest events** change with the state.
- **What Run n changed** (replaces the dated line and slider, which did not scale to many runs):
  - Counted against the run before it; the picker chooses the run.
  - A change-mix bar (added / changed / removed, each marked +, ~ or −).
  - Per-source change bars, manifest and previous CID with copy and Verify, and a Compare link.
- **States:**
  - completed;
  - running (simulated run);
  - partial (Comptroller failed, Run 3 records carried over);
  - stale (9 days);
  - rate-limited;
  - failed;
  - no runs.

  The dashed state bar is **prototype only**. The simulated Running state and the Run 4 sample stay in the prototype as is (#29); the build shows Running only for a real run.
- **Compare (D-7):**
  - The two runs side by side, per-source deltas and artifact CID changes (AD-03): the **new manifest CID**, which links to the old one (`previousManifestCid`); the **old manifest still resolves on ipfs.io and dweb.link**; **CAR available** (Run 3 CAR on the GitHub Release, with its CID and size). Checks: "New manifest links to the old one (previousManifestCid)", "Both runs listed in runs/index.json", "CAR available". No IPNS.
  - Immutability checks and a directory CAR download.
  - The **prior-CID pill** has three states: Checking ipfs.io and dweb.link… · Prior CID resolves on ipfs.io and dweb.link · Prior CID failed on {gateway}. It stays static in the prototype (#25).
  - Each source row names its elephant-cli table and CID: permits → `property_improvement`, properties → `properties`, owners → `person` and `sales_history`, contractor names and businesses → `company` (#100).
  - **390 (`RunsCompare390`, #107, E-48):** the two run cards stacked, then the new manifest CID linked down to the old one (previousManifestCid), the "Old manifest still resolves on ipfs.io and dweb.link" pill and the CAR link, then per-source changes as a list. States: populated, loading, empty (only one run), error (Run 2 manifest unreadable), partial (one gateway failed) and rate-limited.
- **History log:** 41 events, filters by event type and run with **Clear filters**, numbered pager (12 per page), Download CSV.

### 4.5 Coverage

- **Summary tiles:**
  - Record kinds complete: 3 of 7 rows (complete / partial / blocked).
  - Records loaded: 3,685,340 of 3,724,754 (98.9%).
  - Areas with permit data: 1 of 4.
  - Counted from: Run 3 · Oct 17.
- **Loaded vs each source's own total:** one row per README record kind, BBB as a sub-row under Contractor (#28):
  1. Property (TCAD appraisal roll).
  2. Permit (Austin `3syk-w9eu`).
  3. Ownership (TCAD owners and sales).
  4. Contractor (names on Austin permits), with the sub-row **Contractor · BBB: "Blocked · bbb.org refused the check (403) on 2026-10-17"**, linked to its evidence.
  5. Business (TX Comptroller franchise-tax `9cir-efmm`; "52,870 located with Overture places").
  6. Coordinates (TCAD parcel geometry).

  Every count's source is **"Run manifest · coverage section"** (AD-04), and each row's provenance names its elephant-cli table and CID (#100): Property → `properties`, Permit → `property_improvement`, Ownership → `person` + `sales_history`, Contractor → `company`, Business → `company` + `business_location`, Coordinates → `geometry`.
  - **Permit row (#102, AD-16):** "Sample: 21,640 of 22,083 reroof permits matched to a property · 443 unmatched (kept and counted)".
  - **Contractor row (#90, AD-05, E-45):** "22,210 names · 5 identity states (Sample)" with a stacked bar and a legend with counts: Resolved 0 · Candidate 14,880 · Ambiguous 2,140 · Conflicting 390 · Unresolved 4,800 (all Sample, adding up to 22,210), and "Real counts come from Run 3 in A-02. Resolved needs an official ID; Austin permits carry names only." The BBB sub-row counts against the same 22,210 names.
  Each row shows status, source, **"Out of: {denominator source}"**, a loaded/missing bar (missing hatched), %, reason, a Run 1–3 trend, collected time and a provenance link. There is a table view.
- **Coverage by area:** the 7 rows × Austin / Pflugerville / Manor / unincorporated on `--viz-seq-1…5`; "No source" and "Blocked" hatched.
- **Reconciliation · duplicates merged in Run 3 (#3):** Property, Owner, Contractor and Business, each with records in, merged, entities out, a share-merged bar (0–20% scale) and the method:
  - Property: TCAD prop ID + geo ID.
  - Owner: normalised name + mailing address.
  - Contractor: "Merged only on an official registry identifier. Name, phone, address, BBB and places matches stay Candidates." (#89). **Merged** counts only Resolved merges; Candidate, Ambiguous, Conflicting and Unresolved names stay one row each (22,210 in → 0 merged → 22,210 out, Sample).
  - Business: Comptroller taxpayer number; an Overture place within 50 m.

  Owner reads 404,980 in → 398,114 out, the same figure as the Ownership row and MCP `get_coverage` (#34). Worked examples: **owner** 2 accounts → 1 (opens Property detail) and a **contractor Candidate cluster** (#89): "SAMPLE ROOFING CO, Sample Roofing Company LLC, Sample Rfg Co → 1 likely Comptroller company" with the Candidate badge, "· 3 spellings · Candidate, not proof · 11 permits · not merged · No Texas roofing licence register exists". Counts and merge counts come from the coverage section of the run manifest (numbers only, no rows, AD-04). Worked examples are read at query time from the published elephant-cli tables (#91, #62).
- **Cost (#7, #40, #55, AD-13),** full width, 16 resources in two columns, each with what it is for and **"Fixed · usage"** (for example "$0.00 · 2¢"). Header pill: **"$0.00 fixed per month"**.
  - Web app (AWS Amplify Hosting) · **S3 copy of published files** (2¢) · API Gateway + Lambda (tRPC and the MCP endpoint) · model API calls ($3 daily cap) · DynamoDB spend counter · SSM Parameter Store (MCP token, config) · Cognito user pool · SES · SQS run-command queue · CloudWatch Logs · ACM certificate (free; DNS at Namecheap, no Route 53 hosted zone) · Filebase pinning (free tier, 5 GB) · GitHub Releases (CAR copies) · public gateways (ipfs.io, dweb.link; run by Interplanetary Shipyard, not ours) · **Scheduled refresh (EventBridge Scheduler, off) + Fargate task definition, $0.00** (#101, AD-15) · pipeline (local Restate stack). No Route 53 hosted zone, IPNS publisher or IPNS key.
  - Last bill **$0.07** (Sample), explained on the card: $0.00 fixed + 7¢ usage while testing (model calls, Lambda requests, S3 copy), from Cost Explorer captured 10-01. A $5/month budget alert, and the evidence line "cost.json, built at deploy time and attached to the release (not an IPFS artifact)" (#101).
- Known limitations · source speed and constraints (TX Comptroller and Overture rows).
- **States:** loaded, loading, gaps only, rate-limited (cached counts), error, empty.

### 4.6 Data

- **Manifest (D-5):**
  - **Run chain first (AD-03, E-41, `RunChain`):** this run's manifest CID → the previous manifest CID → … → "First run · no previous manifest". Each run is a tappable tile (manifest CID, date) with **Verify** and Copy CID; the selected run's line shows its manifest, previous manifest, size and gateways. Arrows run left to right at 1440 and 768 and top to bottom at 390. The run list is `runs/index.json`, committed to git. No IPNS.
  - Artifacts table (name, CID with copy, codec, size, SHA-256, Verify): `manifest.json`, then the elephant-cli tables (`properties`, `property_improvement`, `structure`, `sales_history`, `company`, `person`, `address`, `geometry`, `business_location`, `relationships/` as a directory, `tables-export.json`) and `gazetteer.parquet`, on 2 pages. (The `tiles/` row shows only in the CRM preview; CountyLens publishes no map tiles, #78.)
  - Download `manifest.json`.
- **Verify (D-6, #26):**
  - Pick an artifact. Files under 50 MB race on two lanes, **Lane A · ipfs.io** and **Lane B · dweb.link**, each with its operator (Interplanetary Shipyard) (#69), showing bytes, time, status and the **exact URL fetched**: the plain file URL of a `bafybei…` root (`https://ipfs.io/ipfs/bafybeigr7…`, `https://bafybeigr7….ipfs.dweb.link/`), never `?format=raw` (#35). Filebase stores the files and its gateway is never a lane. `DataStates` and `Data390` use the same 38.2 MB example; larger files and directories show Verify via CAR (#53).
  - Directories and large files show **Verify via CAR** with the reason.
  - Results: Verified, Mismatch, Rate-limited with a countdown. Reduced motion shows "Received n%" (A-8).
- **Catalog:**
  - **Only what is published (AD-01):** the elephant-cli tables, one per class (`properties`, `property_improvement`, `structure`, `sales_history`, `person`, `company`, `address`, `geometry`, `business_location`) and `relationships/`, then "Also published": `manifest.json` and `gazetteer.parquet`. Names and columns come from `tables-export.json`.
  - Field types, meanings, sources and data licences. The selected example is `property_improvement` (`cid`, `property_cid`, `data_group_cid`, `request_identifier`, `improvement_type`, `improvement_action`, `improvement_status`, dates, `source_http_request` keeping the raw status and expiry date), with a card listing what `v_roofing_permit` adds (§2).
  - "In SQL and MCP, use the views": `views.sql` defines them over these tables only.
  - Query in SQL.

### 4.7 Activity (admin only, #18, #19, #43)

- **Header note:** "Server-side events from CloudWatch Logs: AI questions, MCP calls, Try a tool and search · kept 30 days · no personal data. Browser queries (Filters, SQL, Builder) run on the visitor's device and are not logged."
- **BBB never shows as a failure (#60):** an AI question about BBB ratings is logged as "Answered · BBB missing-data note". A timed-out AI question (AD-09) is logged as "Failed: took too long (25 s)". No sample row searches a contractor name (#33).
- **Last week:** server events, median and p95 response, failure rate, top areas, top questions and tools, failure reasons.
- **Query log:**
  - Type chips (AI, MCP, Try a tool, Search) and Failed only, with **Clear filters**.
  - Numbered pager (8 rows per page); Download CSV; Run again.
  - Below 600 px each row stacks as a key–value card.

### 4.8 Help · MCP and API docs (#2)

- **Endpoint:** `https://countylens.aldarraj.com/mcp`, its own stateless Streamable HTTP handler sharing `query-core`, with CORS and Origin checks. **Access (AD-10, E-44):** "Bearer token required, shared privately with reviewers" for `tools/list` and `tools/call` (info pills with a key icon), read-only, throttled (stage rate limit); no or wrong token returns `401`, throttled calls `429` (#44, #57). Tool schemas and sample responses use the AD-07 names (`property_cid` for every property, never `id`, #108; `roof_age_years_min`, `status_class`, `owner_is_out_of_area`, `roof_age_years`, `roof_age_basis`, `coordinate_source`, `status_raw`, `contractor_name_raw`, `contractor_resolution`, `bbb_status`).
- **Tools, each with input schema, a copy-paste example and its real response:**
  - `search_properties`
  - `get_property` (`owner_merged_from` is optional: present only when the published owner record names its source accounts, #92)
  - `list_permits`
  - `get_coverage` (from the manifest's coverage section; includes `contractor_resolution: {resolved, candidate, ambiguous, conflicting, unresolved}` and the permit match `{reroof, matched_to_property, unmatched_kept}`, #90, #102)
  - `list_runs`
  - `resolve_place`
- **Connect a client (#57, AD-10):** every snippet carries `Authorization: Bearer <token>`. Claude Desktop via `mcp-remote` (`{"mcpServers": {"countylens": {"command": "npx", "args": ["mcp-remote", "https://countylens.aldarraj.com/mcp", "--header", "Authorization: Bearer <token>"]}}}`), Claude Code (`claude mcp add --transport http countylens https://countylens.aldarraj.com/mcp --header "Authorization: Bearer <token>"`) and MCP Inspector (Streamable HTTP, header `Authorization: Bearer <token>`).
- **Try a tool:** pick a tool, edit the JSON arguments, Run, and see the response and timing. "Runs through the CountyLens API, which adds the token for you." The prototype shows a labelled sample response; the build must show the live reply. **States (#104, E-46):** error "Couldn't run: 401 Unauthorized. The server's MCP token is misconfigured, so nothing ran." with Try again (any API failure uses "Couldn't run: {reason}"); throttled "429 · throttled. Too many calls, try again in n s." with the Run button disabled and counting down. The dashed "Prototype · reply as" chips (Live · Error 401 · Throttled 429) do not ship.

### 4.9 Sign-in: admins now, AI users coming soon (#19, #41, #42, #58, #66)

One email-code screen with two roles (E-32). **Admin** (`AdminSignIn*`), opened from **Admin** at the end of the main navigation: a banner says **"The demo needs no admin access. Every demo step runs on the public pages."**; only allow-listed addresses get a code, no self sign-up; done → Go to Runs. **AI user** (`UserSignIn*`) is **coming soon**: the boards show the planned flow with a "Coming soon" banner and nothing links to them yet. Both use Cognito's built-in 6-digit email code.
- **States:** email entry (with validation) → sending → code entry ("works once, for 5 minutes") → wrong code ("n tries left") → expired code (Send a new code) → too many attempts (try again in 15 minutes) → signed in (Go to Runs). The prototype has a state bar.
- Once signed in, the Admin pill shows, and admin actions and Activity appear.

### 4.10 First visit: "What can I ask?" (#47)

The welcome screen and the 5-step tour are cut. On a first visit, Explore opens with one dismissible card over the results (E-28):
- One line on what the data is, then three example questions; tapping one runs it in AI mode.
- Close (✕) or **Got it** dismisses it; **What can I ask?** in the Help menu (and the apps hub) reopens it.
- Placed over the results: x = results left + 16 at 1440, x 96 at 768, full width at 390.

Similar properties in Property detail stays (redesigned in round 1).

## 5. User flows (board `Flows`)

- **A · First visit, under 2 minutes:** “What can I ask?” card → tap a question or search an area → filter by roof age → open a property → signal chip → Why view → ask in AI mode.
- **B · Evaluator demo:** D-1 to D-12 in order (§9), for an 8–10 minute video. Plan a fresh run just before recording, so the badge shows a recent date (#13).
- **C · No dead ends:** no results → close matches, each saying what it misses → widen the radius or add permits → AI mode with the question carried over → back to the same list.
- **D · AI mode → citations ↔ rows:** ask → answer with steps and numbered citations that match numbered rows → change a chip → results re-run → follow-up "near that area" → open a cited property.
- **E · Prove any value:** signal chip → Why view (coordinates, source link) → manifest row → gateway race → honest result.

## 6. States inventory

| Screen | Loading | Empty | Error | Partial | Rate-limited | Other |
|---|---|---|---|---|---|---|
| Shell | – | – | – | – | – | Fresh, running, stale, failed, never synced (`ShellStates`) |
| Explore | skeleton cards | close matches tab | banner + retry | BBB gap note | gateway countdown | `ExploreStates` |
| SQL | running | 0 rows | plain-language errors with fix and example | – | – | read-only (`SqlStates`) |
| AI mode | Working… with timer and Cancel | close suggestions | query couldn't finish; Took too long at 25 s | missing source | wait timer | can't answer; follow-up (`HelperStates`, `ExploreQ-aiworking`, `ExploreQ-aislow`) |
| Property | skeleton | Street View coming soon | "Filters, SQL and the list still work" | withheld owner; contractor shows the shared Contractor badge (Unresolved, its reason, name as printed on permit); merged-from details not published | Street View: coming soon card (no daily-limit state) + permits retrying | `PropertyStates` (every state keeps "Show in the list") |
| Search | – | hint and next step | – | – | – | `SearchStates` |
| Runs | running | no runs | failed | partial | verify pending | stale; public vs admin |
| Runs compare | prior CID checking; 390 skeleton cards | 390: only one run | prior CID failed on {gateway}; 390: Run 2 manifest unreadable | 390: one gateway failed | 390: gateways rate-limited | resolves on both (`RunsCompare390` has all six) |
| Coverage | counting | no coverage yet | could not load | gaps only | cached counts | `CoverageStates` |
| Data | lanes pending | – | mismatch | – | rate-limited | verify via CAR (`DataStates`) |
| Activity | – | not enough activity | – | – | – | admin only (`ActivityStates`) |
| Sign-in (admin and AI user) | sending | – | wrong code; expired code | – | too many attempts | signed in (`AdminSignIn1440`, `UserSignIn1440` state bars) |
| AI mode limits | – | – | – | – | session quota used (`ExploreQ-ailimit`) | AI paused for the day (`ExploreQ-aipaused`) |
| Runs (admin) | command queued | – | host offline | – | – | acknowledged (`RunsAdmin1440`, host switch) |
| Apps hub | status chip loading | – | status unavailable + Try again | – | – | CRM not deployed (`Hub1440` state bar) |

## 7. Components

**Atlas components used:**
- Button (filled, tonal, outlined, text) · Icon button · Chip (filter, input, signal) · Pill (status) · Card · List and list item.
- Navigation rail · Bottom navigation · Top app bar · Banner · Snackbar · Skeleton · Progress · Slider.
- Menu · Tabs · Table · Text field · Search · Bottom sheet · Side sheet · Dialog · Tooltip · Scrim.
- Citation · Missing-data note · Assumption chips · Key–value row · CID with copy · Provenance line · Code.

**CountyLens shared components** (build once, reuse everywhere):

| Component | Used by | Notes |
|---|---|---|
| SearchBox | every screen | in-place panel; `onPlace(key)` sets the Explore Area |
| Pager | Explore results, Activity, Runs log, Data manifest | `pages`, `page`, `text`, `label`, `compact`, `onPage(n)`; first, last and current ±1 with "…" |
| PropertyDetail | Property boards, Explore drawer | `device` prop; key–value cards below 600 px |
| Query panel | Explore | Filters / SQL / AI and the footer (Area and radius live in the results bar and footer, E-34); 390: modal bottom sheet opened by the Edit query FAB |
| Results table | Explore | live header (E-35), Matches / Close tabs, paged table (full, 5-column, numbered for AI), roof-age swatch, OSM link |
| Results panel | Explore | tabs (Answer, Matches, Close), paging, Why view |
| Answer panel | Explore · AI | Working… (timer, Cancel), Took too long, then steps all at once, summary, citations ↔ rows, missing note, turns (AD-09) |
| RunChain | Data · Manifest (1440, 768, 390) | `device` (desktop / mobile), `verifyHref`; runs newest first, each tappable with Verify and Copy CID (AD-03) |
| ContractorBadge | Explore cards and drawer, Property detail, AI citations | `state` (resolved / candidate / ambiguous / conflicting / unresolved), `printed`, `bbb`; name as printed on permit, pill + one-line reason, BBB state; no licence line (AD-05, AD-06) |
| Pipeline diagram, Gantt timeline, change-mix bar | Runs | status tokens; table alternative for each |
| Coverage bar, area matrix, sparkline, reconciliation table, cost list | Coverage | `--viz-seq-*`, hatch for missing |
| Admin gate | Shell, Runs, Activity | public by default; admin flag and actions after sign-in |
| **ProtoBar · do not ship** | prototype only | site map, device switcher and the **Map view (CRM preview)** switch; state bars. None of it ships, and no feature flag replaces the switch. Map, map chip, map controls and legend are CRM components (CRM preview), not CountyLens |

## 8. Extensions log (board `Extensions`)

The rule: tokens only, no new values. Anything Atlas lacks is built from Atlas parts and logged here.

**App shell (2026-10-17):**
- TopAppBar (location chip, run badge, Help, Ask).
- Ask cue.
- Coach mark (removed with the tour, #47).
- Map overlay (dashed diamond) · CRM preview · not Task A.
- Map legend with counts · CRM preview · not Task A.
- Map overlay (coverage gap) · CRM preview · not Task A.
- Property drawer.
- Evidence chain.
- Photo box.
- Select picker.
- Suggestions menu.
- Promise card (removed with the welcome screen, #47).
- Location switcher.
- Sync badge.
- Coming-soon row.
- Docked search bar.
- Footer.

**Accessibility (A-1 to A-9, `ds/countylens/a11y.css`)**

| ID | Fix |
|---|---|
| A-1 | 48 px hit areas on buttons, icon buttons, chips, signal chips, pager numbers and CID copy; wrapped chip rows 48 px apart |
| A-2 | Citations as 24 px numbered badges |
| A-3 | Focus rings inset inside clipping containers |
| A-4 | Map is a keyboard region · CRM preview · not Task A |
| A-5 | Map markers outlined · CRM preview · not Task A |
| A-6 to A-8 | Reduced versions of the ring and hexagon motion (A-6, A-7 · CRM preview · not Task A) and of the gateway race (A-8, ships) |
| A-9 | Light or dark theme on any element |

**Explore, data screens and charts (E-1 to E-13), and the design review (E-14 to E-30), 2026-10-18**

| ID | Extension |
|---|---|
| E-1 | Navigation rail with nested query modes |
| E-2 | Segmented control |
| E-3 | Collapsible query panel and minimisable results panel |
| E-4 | Searchable Area menu |
| E-5 | Radius card and Layers popover on the map · CRM preview · not Task A (CountyLens: E-34) |
| E-6 | Paged results panel with tabs and an in-panel Why view |
| E-7 | Pager |
| E-8 | SQL help panel (error, fix, working example) |
| E-9 | Single-line suggestion chip |
| E-10 | Pipeline diagram and Gantt timeline |
| E-11 | Coverage bar, area matrix and sparkline |
| E-12 | Change mix: `--viz-cat-1/6/2` in light, `--viz-cat-3/1/4` in dark, each marked +, ~ or −; validated for colour-blind readers in both themes (#11) |
| E-13 | Prototype state bar and ProtoBar, including the Map view (CRM preview) switch: **do not ship** |
| E-14 | Editable assumption chip (#4) |
| E-15 | Agent answer panel (#24): one response, no streaming (AD-09) |
| E-16 | Radius ring handle (#5) · CRM preview · not Task A |
| E-17 | Signal chips on cards (#6) |
| E-18 | Coming-soon item (#17, #21, #22) |
| E-19 | Reconciliation table and "Merged from n records" (#3) |
| E-20 | Cost section (#7): fixed · usage in cents, "$0.00 fixed per month" (AD-13) |
| E-21 | Key–value card stack below 600 px (#8, #10) |
| E-22 | Tablet (768) and compact (390) rules (#8, #9) |
| E-23 | Try-a-tool panel (#2) |
| E-24 | Admin flag and gated actions (#19) |
| E-25 | Resolve-check pill, three states (#25) |
| E-26 | SQL engine line and "Run it yourself" DuckDB command (#27) |
| E-27 | Command status banner: queued, acknowledged, host offline (#42) |
| E-28 | "What can I ask?" first-visit card (#47) |
| E-29 | Run status chip with loading and unavailable states (#45) |
| E-30 | "Soon" badge on a segmented-control button (#46) |
| E-31 | Session quota counter (10 per session) and limit banner with Open this question in Filters (#58, #66, #79) |
| E-32 | Sign-in role variant: admin and AI user (#58) |
| E-33 | "Open ≥ N yrs" chip menu in Filters (#59) |
| E-34 | Area picker in the results bar; radius control at the bottom right of the results (map card in map view, table footer in list view, sticky header at 390) (#75) |
| E-35 | Live results header and radius proof: bearing, Nearest, "0.2 mi outside", OpenStreetMap link (#75) |
| E-36 | List-first layouts at 1440, 768 and 390; 390 sticky header, Edit query FAB and query bottom sheet (#74, #77) |
| E-37 | Roof-age colour on the Roof cell, always with the number (#74) |
| E-38 | ~~Disabled "Map · Soon" segment~~ removed (PO, round 5): CountyLens has no view switcher; `view=map` falls back to List (#74) |
| E-39 | Citation ↔ numbered row (#76) |
| E-40 | Run picker: dropdown with every run and its timestamp, first control on Runs (PO, round 5) |
| E-41 | Run chain on Data · Manifest: manifests newest first, each linked to the previous one, tappable, with Verify (AD-03) |
| E-42 | Contractor badge, five identity states with a one-line reason; name "as printed on permit"; no licence line (AD-05, AD-06) |
| E-43 | AI Working… (elapsed timer, Cancel) and Took too long at 25 s (Try again, Use Filters instead) (AD-09) |
| E-44 | MCP access: "Bearer token" pills and the Authorization header in every client snippet (AD-10) |
| E-45 | Contractor identity bar: five states stacked, legend with icon, label and count; Sample counts (#90) |
| E-46 | Try a tool error (401) and throttled (429) states; prototype-only "reply as" chips (#104) |
| E-47 | Merge-details fallback note on Property detail (#92) |
| E-48 | Runs compare at 390, six states (#107) |
| E-49 … E-95 | **Roofing CRM · not Task A** (§14): GPS control and states, pin drop, property type, lead mark, create-lead sheet with duplicate check, bulk create, lead status / notes / history, leads filter bar, disabled future sections, CRM shell additions behind the switch, citation → Create lead, CRM sign-in; E-61 CRM top bar and navigation, E-62 data-source chip and panel, E-63 account menu, E-64 Coming-soon nav group, E-65 email + password sign-in, E-66 Coming-soon section page; E-67 whole-county home view, E-68 GPS states, E-69 Drop pin, E-70 CRM radius 0.5–25 mi, E-71 CRM filter set and sort, E-72 CRM map layers and coverage note, E-73 CRM map states; E-74 one-tap lead and the lead snackbar, E-75 bulk create with confirmation, E-76 CRM property drawer on PropertyDetail, E-77 create-lead states; E-78 field triage cards (390); E-79 Leads table, cards and combined filters, E-80 Leads list in the URL, E-81 Leads states, E-82 Show filtered leads on the map; E-83 Lead page beside the list, E-84 status and assignee menus, notes and history timeline, E-85 signals snapshot with At creation / Now, E-86 Lead states; E-87 CRM agent on the AI mode, E-88 CRM answer rows and actions, E-89 leads from chat confirmed first, E-90 CRM agent states; E-91 CRM states pass; E-92 CRM responsive and accessibility pass |

**Deviations when mapView is OFF** (CountyLens ships with it off; each one has its full version with mapView ON, in the CRM):

| Atlas rule | Atlas expects | CountyLens | Full version |
|---|---|---|---|
| §14.1 rule 3 | Full-bleed map + bottom sheet at 390 | List-first page of paged cards, sticky header, Edit query FAB opening a bottom sheet | Full version available with mapView ON (CRM) |
| §14.2 #1 | Live radius ring | Radius slider and number field at the bottom right of the results + live results header | Full version available with mapView ON (CRM) |
| §14.2 #2 | Roof-age heat | Roof-age colour on the Roof cell, always with the number | Full version available with mapView ON (CRM) |
| §14.2 #5 | Agent → map pins | Citations ↔ numbered rows | Full version available with mapView ON (CRM) |

**Tokens (#12):** every corner radius uses `--md-sys-shape-corner-*`. The off-scale 2, 3 and 6 px radii became extra-small (4 px). The literal `#747775` became `--md-sys-color-outline`.

## 9. Demo script mapping (D-1 to D-12)

| Demo | What it shows | Screen | Board and state | How to show it |
|---|---|---|---|---|
| D-1 | Opening context: Travis County, TX · Run 3 · {date} | App shell | `Explore1440`; `ShellStates` | Point at the location chip and run badge; the badge opens Runs |
| D-2 | Run summary: sources, counts, timestamps, limitations, % of roll | Runs | `Runs1440` · Completed | 8 sources with BBB blocked; County coverage 99.4% of roll; click Austin permits |
| D-3 | Records by source with collection time and provenance | Coverage | `Coverage1440` · Loaded | Six record-kind rows with denominators, then the area grid, Reconciliation and Cost |
| D-4 | Query layer: DuckDB in the browser, no hosted database; reads the elephant-cli tables through the views, from the CID-named copy first, public gateway fallback | Explore · SQL | `ExploreQ-sql`, `ExploreQ-sqlperm`; `SqlStates` | Run a suggestion; read the engine line; open Run it yourself and copy the DuckDB command; type FORM to show the fix |
| D-5 | Artifact manifest: CID, size, codec, digest; the run chain | Data · Manifest | `DataManifest1440` | Run chain first (Run 3 → Run 2 → Run 1; tap a run, Verify), then the artifacts table of elephant-cli tables, manifest and gazetteer |
| D-6 | Two-gateway fetch; bytes match size and digest | Data · Verify | `DataVerify1440`; `DataStates` | Pick the 38.2 MB file; press Verify; read the plain file URLs on ipfs.io and dweb.link and each lane's operator; show a directory → Verify via CAR |
| D-7 | New CID, old one intact; CAR | Runs · Compare | `RunsCompare1440` | New manifest CID linked to the old one; the old one still resolves on ipfs.io and dweb.link; CAR available |
| D-8 | Radius, roof ≥ 15: count, basis, coordinates, source | Explore · Filters (List view, map switch off) | `ExploreQ-roof15` | Move the radius slider or type in the number field; the header updates ("128 within 5 mi of Pflugerville city hall · roof ≥ 15 yrs"); Sort = Nearest; Mi with bearing, lat, lon, Source and Open in OpenStreetMap per row; a Close match "0.2 mi outside"; a row → Why view |
| D-9 | Open roof permits in the D-8 area: duration, contractor, BBB or a labelled gap | Explore · Filters + Property | `ExploreQ-permits5` (roof ≥ 15, open or stalled, open ≥ 5 yrs, near Pflugerville), `Property1440` | Same area and roof rule as D-8; the Open ≥ 5 yrs chip; permit chips on cards ("Stalled 6.4 yrs · source says Expired"); expand a card: contractor as printed on permit with its badge; "BBB: Blocked · bbb.org refused the check (403)"; Owner merged from 2 records |
| D-10 | Old roofs within 5 mi of Pflugerville, with reasoning and evidence | Explore · AI (List view, map switch off) | `ExploreQ-ai` (board "Explore · AI · D-10 answered (populated)") | Tap the first suggestion, Find; Working… with its timer, then the answer with all steps at once; read How I read this; **citations ↔ rows**: tap [2] → row 2 highlights in the numbered Matches table and its Why view opens |
| D-11 | Long-open permits **near that area**, contractor, assumptions, gaps | Explore · AI | `ExploreQ-aicontractor` (two turns) | D-10's question sits in "Earlier in this conversation"; the follow-up "…near that area…" shows the follow-up pill and reuses Pflugerville; change "Open ≥ 5 yrs" to 3; contractors as printed with their badge; BBB note. Optional: `ExploreQ-aislow` for Took too long |
| D-12 | MCP-ready: tool list and one answered query | Help · MCP | `HelpMcp1440` | Bearer token required (shared privately with reviewers), read-only, throttled; tools and schemas; Try a tool `search_properties`; connect from Claude Desktop (mcp-remote), Claude Code or Inspector, each with the Authorization header. On Try a tool: "You don't paste a token here: the CountyLens API adds it on the server (AD-10)." |

## 10. Accessibility (board `A11yAudit`)

- Text contrast ≥ 4.5:1 in light and dark; chart colours validated in both themes. (Map shapes ≥ 3:1 belongs to the CRM preview.)
- **Touch targets: 48 px is the build rule** (Atlas §14.1); smeargle checks it on every screen.
- A visible focus ring everywhere, inset where a container clips it.
- The radius works by keyboard (slider and number field, arrow keys); every chart has a table view or text alternative. (Map keyboard, A-4, belongs to the CRM preview.)
- `prefers-reduced-motion` gives a reduced version of each animation (A-8 gateway race; A-6, A-7 in the CRM preview); the Working… spinner stops turning. Answer steps always arrive at once (AD-09).
- The Working… timer is a `role="timer"` that is not announced every second; Working, Took too long and Cancelled are announced once.
- Status is never shown by colour alone: always an icon plus a label (and +, ~, − on change charts).
- Live regions announce counts, the results header, SQL messages, answer text and page changes.

## 11. Open items

1. **#29 Running state and Run 4 sample** stay in the prototype as is. The build cuts them and shows Running only for a real run.
2. **#30 Area sample places** are demo data. The build needs the places gazetteer (§2).
3. **#32 Data contract outputs** (§2) are covered in implementation stories A-02 and A-11.
4. **#13 Badge wording** is final as "Run 3 · {date}"; exact copy is settled in implementation.
5. **Mobile property sheet** scrolls (a full-page sheet; accepted).
6. **Settings** is not drawn.
7. **#38 Demo city:** count real roofing permits in the Pflugerville 5 mi ring during A-02; switch the demo centre if D-11 comes back thin (§2).
8. **#37 Stalled definition (AD-08):** the Travis profile sets `status_class` from `status_raw` and `expiry_date`; stalled = source says Expired (or Expired - License), or open past its expiry date. The card always shows the source's own word.
9. **#51 Hexagons and map layers:** CRM preview only; no CountyLens marker; not Task A (decisions #22, #74, #82). A deliberate deviation from Brief A, built in the Roofing CRM.
10. **#52 Compare:** at implementation, link the Run 3 CAR to `carCid` and its GitHub Release copy, and show each run's data window (`updated_at` from → to) (decision #25).
11. **G3 architecture gate:** #54/#69 lane B is dweb.link (same operator as ipfs.io; confirm CORS, Range and the subdomain redirect in the A-02 spike), #58 AI spend caps (budget, steps, tokens, concurrency), #64 CID-named copies with gateway fallback. All three are applied in the design and §2; record them in the constitution at G3.
12. **#63 Similar properties** stays (PO decision); its similarity rule is still to be defined in implementation (a proposal: same ZIP, roof age within 3 yrs).
13. **#65 Hub links:** wire "Watch demo" and "Pull requests" at release.
14. **#69 Gateway spike** in A-02 (§2 Verify): ipfs.io + dweb.link on one real Filebase-pinned CID.
15. **#70 Privacy:** the page now describes admin accounts (email only, Cognito eu-north-1, deleted within 30 days of a request or of access ending) and says no user IDs, emails or IPs reach the activity log; needs legal review before launch.
16. **Map view: CRM task.** Not designed for CountyLens (no view switcher); the map, its layers and its keyboard model are the Roofing CRM's (Task B). The prototype keeps them behind the ProtoBar switch (#74, #78).
17. ~~AD-05 name-match~~ **Decided by the PO on 2026-10-19:** an exact, unique, active legal-name match stays Candidate; only an official registry identifier (Comptroller taxpayer number) resolves a contractor. Closed (#105).
18. **AD-07 names** are frozen against a real `tables-export.json` in A-02; if a name changes there, update the SQL suggestions, Schema list, Catalog and MCP schemas together.
19. **#92 Merge details:** in A-02, name the elephant-cli field that carries an owner's source accounts. If none exists, ship the fallback note (§4.3).

## 12. Suggested build order

1. `query-core` and the data contract: `views.sql` over the elephant-cli tables, the run manifest (with its coverage section and `previousManifestCid`), `runs/index.json`, gazetteer, fixtures.
2. App shell, URL state, SearchBox.
3. Explore: Filters + Area picker (results bar) + radius control (results footer) + live results header + paged List (table at 1440 and 768, cards at 390 with the sticky header and Edit query sheet) + Why view, close matches + property drawer. Explore ships List view only (no view switcher).
4. SQL (DuckDB-WASM, checks, suggestions); AI mode on the server agent (editable chips, answer panel, follow-ups); then Builder.
5. Runs, Compare, Log · Coverage (rows, reconciliation, cost) · Data manifest and Verify · Catalog.
6. Help · MCP page on the token-protected, throttled `/mcp` (Try a tool through the CountyLens API); apps hub with its status chip.
7. States for every screen; 768 and 390 rules; accessibility pass against §10. (No map work: the map is the CRM's.)
8. The "What can I ask?" card (nice to have).
9. Admin, built last (AD-12): Cognito sign-in, SQS run-command queue and bridge, Start / Stop / Retry, Activity (#93).

**Acceptance check:**
- Every row in §9 can be demonstrated end to end with the map switch off.
- Explore ships List view only, with no view switcher, and `view=map` falls back to List.
- No map code, map toggle or feature flag ships; no `tiles/` in the manifest.
- No IPNS, no serving Parquet, no streaming answer, no contractor licence line (AD-01, AD-03, AD-06, AD-09).
- No panel scrolls at 390, 768 or 1440 in Explore.
- Every value has a source → run → CID path.
- Sample values are labelled.
- Coming-soon items carry a "Soon" pill; only Builder has a working prototype, and it is not in the first release.

## 13. Architecture decisions applied (AD-01 to AD-16, 2026-10-19)

Engineering's decisions in `0000-agent-architecture.md` §5 override the design where they differ. Only what they change was changed; every other screen, state, token and component is as before. New pieces use Atlas tokens and components only and are logged in §8 (E-41 to E-48). Review round 8 (#89–#108) found the places the first pass still disagreed with the decisions; the second table lists those fixes.

| Decision | What changed in the design | Boards |
|---|---|---|
| AD-01 No serving Parquet | Data and Catalog list only the elephant-cli tables plus the manifest and the gazetteer; queries read the tables through `views.sql`; the SQL loading state and Run it yourself no longer mention a serving file | `DataCatalog1440` (768 inherits), `DataManifest1440`, `Data390`, `DataVerify1440`, `SqlStates`, `Explore1440` |
| AD-03 No IPNS | Every IPNS card, "IPNS before/after" and "IPNS → CID" removed. Data · Manifest starts with the run chain (this run's manifest CID → previous → …, each tappable, each with Verify). Runs · Compare shows the new manifest CID, the old one still resolving on ipfs.io and dweb.link, and CAR available | `RunChain` (new), `DataManifest1440`, `Data390`, `DataStates`, `RunsCompare1440`, `Runs1440`, `RunsLog1440`, `Coverage1440`, `HelpMcp1440`, `Hub1440`, `Main`, `Flows` |
| AD-04 Counts from the manifest | Every Coverage count's source is "Run manifest · coverage section" | `Coverage1440` (768, 390 inherit) |
| AD-05 Contractor identity | Contractor badge with Resolved / Candidate / Ambiguous / Conflicting / Unresolved and a one-line reason; the permit's name labelled "as printed on permit" | `ContractorBadge` (new), `Explore1440` (cards, drawer, Why view, AI), `PropertyDetail`, `PropertyStates` |
| AD-06 No licence register | No contractor licence line; "No Texas roofing licence register exists" as the reason. Data licences on Legal pages unchanged | `ContractorBadge`, `Coverage1440`, `PropertyDetail` |
| AD-07 Column names, BBB states | `roof_age_years`, `tenure_years`, `tenure_basis`, `owner_is_out_of_area`, `owner_area_class`, `contractor_company_cid`, `coordinate_source` in SQL examples, the Schema list, Catalog and MCP schemas; BBB Rated / Not found / Blocked / Not checked | `Explore1440`, `HelpMcp1440`, `DataCatalog1440`, `SqlStates`, `PropertyDetail`, `HelperStates`, `ExploreStates`, `EmptyHints`, `ShellStates`, `Runs1440`, `Coverage1440` |
| AD-08 Raw permit status | Permit cards show the class and the source's word: "Stalled · source says Expired" | `Explore1440`, `PropertyDetail` |
| AD-09 One AI response | Working… with timer and Cancel, then the full answer with all steps at once; Took too long at 25 s with Try again and Use Filters instead; a question counts when its answer arrives | `Explore1440`, `HelperStates`, `ExploreQ-aiworking`, `ExploreQ-aislow` and their 768 / 390 boards (new), `Extensions` |
| AD-10 MCP token | "Bearer token required, shared privately with reviewers"; `Authorization: Bearer <token>` in the Desktop, Code and Inspector snippets; Try a tool "Runs through the CountyLens API, which adds the token for you"; "public, read-only, no token" removed | `HelpMcp1440` (768, 390 inherit) |
| AD-13 Cost | "$0.00 fixed per month" plus usage in cents; Route 53 hosted zone, IPNS publisher and IPNS key removed; "S3 copy of published files (cents)" added | `Coverage1440` (768, 390 inherit) |
| AD-02, AD-11, AD-12, AD-14 to AD-16 | No design change (AD-11 noted in §2 AI spend) | – |

**Round 8 fixes (#89–#108, 2026-10-19):**

| # | Fix | Boards |
|---|---|---|
| 89 | Reconciliation worked example is a Candidate cluster ("1 likely Comptroller company", Candidate badge, not merged); Contractor method "Merged only on an official registry identifier…" | `Coverage1440` (768, 390 inherit) |
| 90 | Contractor row shows the five identity states as a stacked bar with counts (Sample) and the A-02 note; Reconciliation merges only Resolved; `get_coverage` returns `contractor_resolution` | `Coverage1440`, `CoverageStates`, `HelpMcp1440` |
| 91 | §4.5: counts and merge counts from the manifest (numbers only); worked examples read at query time from the tables | HANDOFF |
| 92 | Merged-from rows cite "From the published owner record (person table) · TCAD account {id}"; fallback note; `owner_merged_from` optional | `PropertyDetail` (Property 1440 / 768 / 390 / 390 full inherit), `PropertyStates`, `HelpMcp1440` |
| 93 | Admin pieces moved to the last build step | HANDOFF §12 |
| 94 | Partial card is the shared result card: "Open 6.4 yrs · source says Active", contractor as printed on permit + Candidate badge | `ExploreStates` (SearchStates and EmptyHints checked: no result card) |
| 95 | Resolved reason "Comptroller taxpayer no. {id} matched"; Candidate tooltip | `ContractorBadge`, `Explore1440`, `PropertyDetail` |
| 96 | "No contractor printed on permit" variant and a 390 key–value example | `ContractorBadge` |
| 97 | Loading uses the SqlStates pattern: progress bar, "11.2 of 18.4 MB of the columns needed · Run 3" | `ExploreStates` |
| 98 | "Filters, SQL and the list keep working."; no map or ring | `ExploreStates`, `HelperStates` |
| 99 | 13 artifacts (14 counted the CRM-only `tiles/`) | `RunChain`, `Runs1440`, `RunsLog1440`, `Data390` |
| 100 | Provenance names the elephant-cli table and CID; the derived `…c2t9` artifact is gone | `Coverage1440`, `RunsCompare1440` |
| 101 | Cost adds the scheduled refresh (EventBridge Scheduler, off) + Fargate task definition; cost.json is a deploy-time release asset | `Coverage1440` |
| 102 | Permit row and `get_coverage` show 21,640 of 22,083 matched, 443 unmatched (kept and counted) | `Coverage1440`, `HelpMcp1440` |
| 103 | SQL suggestion 2 filters `r.status_class IN ('open','stalled')` | `Explore1440` |
| 104 | Try a tool error (401) and throttled (429) states at all widths | `HelpMcp1440` (768, 390 inherit) |
| 105 | AD-05 name-match recorded as decided; D-12 token line | HANDOFF §1, §9, §11 |
| 106 | `HelperContext1440` removed from the AD-07 row (not in `prototype/`) | HANDOFF §13 |
| 107 | `RunsCompare390` added, six states; Runs and the prototype menu link to it on mobile | `RunsCompare390` (new), `RunsCompare1440`, `Runs1440` |
| 108 | MCP rows use `property_cid` | `HelpMcp1440` |

**Final copy fixes (2026-10-19):** `PropertyStates`: "Show in the list", "Filters, SQL and the list still work", the Street View coming-soon card replaces the daily-limit card, and the partial row uses the shared Contractor badge with its reason and "as printed on permit". `Explore1440` (768, 390 inherit): drawer "mi from the area centre"; Roof card field `roof_age_years`. `Coverage1440` (768, 390 inherit): "located with Overture places". `HelpMcp1440` (768, 390 inherit): Access card "You don't paste a token here: the CountyLens API adds it on the server." `ExploreQ-ai` retitled "Explore · AI · D-10 answered (populated)". No numbers, counts, CIDs, sizes or sample rows changed.

## 14. Roofing CRM (Task B) · prototype, not Task A

The Roofing CRM is a map-based roofing lead CRM for a sales rep in Travis County, TX (assignment `README.md`; intent `01-intent.md`, VIS-B, approved 2026-10-21). It **reads only what CountyLens publishes** (read-only, by CID or through the CountyLens MCP) and adds a map with GPS and pin-drop radius search, CRM leads, and an agent that can create leads. Hosted at `crm.aldarraj.com`. Start at the board **`CrmFlows`**.

**Rules for the CRM boards (they protect the finished CountyLens design):**
- Every CRM screen is a new board named `Crm…`. Each one opens with the **Map view (CRM preview)** switch forced on, as `ExploreQ-crmmap` does: Explore-based boards pass `map-view="on"`; the other Crm boards set the switch for their own page only.
- Shared boards get CRM additions **only when the switch is on** (§14.4). With the switch off every CountyLens board looks and behaves as before: checked by a pixel comparison of every existing board, switch off, before and after (no layout change).
- Earlier decisions still apply where the CRM reuses a component: the Contractor badge's five states and "as printed on permit" (AD-05), BBB Rated / Not found / Blocked / Not checked (AD-07), permit class + derived status, "Stalled · derived: no status in source" (AD-08, CRM-R1), and the agent's Working… then the full answer at once, Took too long at 25 s (AD-09).
- Atlas tokens and components only; new pieces are E-49 to E-95, each tagged "CRM · not Task A".
- Sample data stays a placeholder (#123): the existing sample rows and places, no new totals. The three sample leads are made from existing rows (101, 58, 3).
- Mobile first: the field flow (GPS → radius → triage → lead) is drawn at 390 first, then 768 and 1440.

### 14.1 Site map

| Screen | URL | Boards | Reuses |
|---|---|---|---|
| Sign in · email + password, the admin test user (B-01), no sign-up, no forgot-password (not the CountyLens admin email code) | `/sign-in?next=` | `CrmSignIn390/768/1440`; states `CrmSignInLoading390` (signing in), `CrmSignInError390` (wrong email or password), `CrmSignInLocked390` (too many attempts), `CrmSignInExpired390` (session expired, returns to a filtered Leads link), `CrmSignInSignedOut390` | AdminSignIn layout pattern |
| Map, the home screen · whole Travis County until a centre is picked | `/map` (county) · `/map?at=&r=&roof=&permit=&open=&sort=` | `CrmMap390/768/1440`; states `CrmMapTiles390`, `CrmMapFailed390`, `CrmMapNoResults390`, `CrmMapPartial390`, `CrmMapIndexDown390` | Explore with the switch on |
| GPS and pin drop | same URL; `at` from GPS or the pin | `CrmGpsStates` (all states, drawn and linked); live: `CrmMapGpsExplain390`, `CrmMapLocating390`, `CrmMapGps390/768/1440`, `CrmMapGpsLow390`, `CrmMapGpsDenied390`, `CrmMapGpsUnavailable390`, `CrmMapGpsOutside390`, `CrmMapPinMode390/1440`, `CrmMapPin390/1440`, `CrmMapPinMove1440`, `CrmMapPinOutside390` | Explore map, radius ring, radius card |
| Field triage · 390 (signature moment #3) | `/map?triage=1` | `CrmTriage390`; `CrmTriageSwipe390`, `CrmTriageLead390`, `CrmTriageLoading390`, `CrmTriageFailed390`, `CrmTriageOffline390`, `CrmTriageEnd390`, `CrmTriageEmpty390` | Result cards, lead kit, PropertyDetail drawer |
| Candidate list · the List view of the CRM map | `/map?view=list` (same filters as the map) | `CrmCandidates390/768/1440`, `CrmCandidatesConfirm390/1440`, `CrmCandidatesCreated390`, `CrmCandidatesHide1440` | Explore list and table, Pager |
| Property drawer (CRM order, on PropertyDetail) | `/map?sel={property_cid}` | `CrmProperty390/768/1440`; states `CrmPropertyCreating390`, `CrmPropertyCreated390`, `CrmPropertyDup390`, `CrmPropertyFailed390/1440`, `CrmPropertyPartial390` | PropertyDetail with the switch on; ContractorBadge rules |
| Create lead · one tap, duplicate refused | snackbar, no form | `CrmLeadCreate390/768/1440` (created, Add a note), `CrmLeadDup390/1440` (refused) | Atlas snackbar, bottom sheet |
| Ask the agent (§14.11) | `/map?mode=ai&q=` | `CrmAsk390/768/1440`, `CrmAskConfirm390/1440`, `CrmAskCreated390`; states `CrmAskWorking390`, `CrmAskSlow390`, `CrmAskNoResults390`, `CrmAskLowConf390`, `CrmAskOutside390`, `CrmAskNotFound390`, `CrmAskCreateFailed390`, `CrmAskThrottled390`, `CrmAskPaused390`. The earlier `CrmAgent…` boards are kept unchanged but no longer linked | Explore AI mode with the switch on (AD-09) |
| Leads list · the CRM's own lead records (§14.9) | `/leads?status=&assignee=&roof=&permit=&openYrs=&place=&r=&sort=&page=` | `CrmLeads390/768/1440`, `CrmLeadsFiltered1440` (combined filters from a link), `CrmLeadsPaged1440` and `CrmLeadsPaged390` (paged, B-08), `CrmLeadsAllReps390` (sales-manager view); states `CrmLeadsStates`, `CrmLeadsLoading390`, `CrmLeadsEmpty390`, `CrmLeadsNoMatch390`, `CrmLeadsError390`, `CrmLeadsPartial390` | Map filter chips, Area picker and radius, Pager, ContractorBadge rules |
| Lead (§14.10) · 1440 beside the Leads list; 768 and 390 a full page | `/leads/{id}` | `CrmLead390/768/1440`, `CrmLeadChanged390` (Now column); states `CrmLeadStates`, `CrmLeadLoading390`, `CrmLeadSaving390`, `CrmLeadSaveFailed390`, `CrmLeadDeleted390`, `CrmLeadStale390`, `CrmLeadElsewhere390`. The earlier `CrmLeadDetail…` boards are kept unchanged but no longer linked | Leads list, ContractorBadge rules, PropertyDetail drawer |
| Shell · top bar, navigation, data source | every screen | `CrmShell1440` (account menu open), `CrmShellData1440` (data panel), `CrmShell390` (More open); components `CrmDataChip`, `CrmAccount`, `CrmBottomNav` | Top app bar, rail, bottom nav |
| Coming-soon section · Campaigns, Estimates, Jobs, Invoices, Outreach | `/campaigns`, `/estimates`, `/jobs`, `/invoices`, `/outreach` (prototype `?section=`) | `CrmComingSoon390/768/1440` | CountyLens Coming-soon card (`Shell390ComingSoon`) |
| States overviews | – | `CrmMapStates`, `CrmGpsStates`, `CrmCandidatesStates`, `CrmTriageStates`, `CrmLeadsStates`, `CrmLeadStates`, `CrmAskStates` (`CrmAgentStates` kept) | ExploreStates, HelperStates patterns |

**Top bar (768, 1440):** Roofing CRM · the existing location switcher (Travis County, TX live; other counties Coming soon, unchanged) · the universal search box (modes Map · Filters · AI) · data-source chip · Apps (opens the app switcher menu: CountyLens, Roofing CRM ✓, Landing page; E-94) · account menu (Sample Rep, role “Admin”, Sign out). Help and Ask are CountyLens-only and are hidden in the CRM. **390:** title, location, compact data chip (“Run 3”), account.

**Navigation:** **768 and 1440** rail: Map (home; Filters and AI nested under it), Leads, then a **Coming soon** group: Campaigns, Estimates, Jobs, Invoices, Outreach. **390** bottom bar: Map · Leads · Ask · More; More is a sheet with the five Coming-soon sections (each with its line), Apps and Sign out. Runs, Coverage, Data, Builder, SQL and Admin are not in the CRM.

**Coming-soon items** reuse the **CountyLens coming-soon row** (the location picker’s: on-surface-variant text and the Atlas `atlas-pill--unavailable` pill, not the 38 % disabled opacity). In the 768 and 1440 rail each is a rail item with a “Soon” pill; in the 390 More sheet each is the full row (icon, name, one line, “Coming soon” pill). Each links to its Coming-soon page and carries a one-line tooltip, also read to screen readers: Campaigns · plan outreach to groups of leads; Estimates · price a roof from the lead; Jobs · schedule and track roofing work; Invoices · bill completed jobs; Outreach · email and SMS to owners. Opening one of their URLs shows the Coming-soon page with **Back to Map**; an unknown section says there is no section there.

**Data-source chip:** “Data: CountyLens Run {n}” opens a panel: “The lead index is built from the CountyLens manifest {CID} on {date}. The CRM reads only published CountyLens data.” with the CID copyable and a link to CountyLens Data. States: index up to date · newer run available (“Index updating to Run {n}”; results stay on the current run until it finishes) · index unavailable (leads and notes still open; Retry).

**Sign-in and session:** email + password for the admin test user (one shared login, role Admin; B-01); Show password toggle; filled Sign in; plain text “No account? Access is shared privately with reviewers.” (no link). Wrong email or password never says which. Three wrong tries: “Too many attempts. Try again later.” with the form disabled. Session expired: “Signed out. Sign in to continue where you left off”. Signing out from the account menu or More opens “You signed out.” After sign-in the user returns to the URL they asked for (`next`, CRM routes only, so no open redirect): a shared Leads link opens with its filters, because every Leads filter, the sort and the page live in the URL (§14.9). Signed in stays signed in after a reload. Prototype: the session is kept in this browser (`countylens.proto.crmSession`); any 8+ character password works for `sample.rep@example.com`; the Leads board's “Open this link signed out” control shows the round-trip.

### 14.2 Flows (board `CrmFlows`)

| Flow | Steps |
|---|---|
| **Field · 390 (main)** | Sign in → map opens on Travis County → **Use my location**: "Finding your location…" → "You are here (±12 m)", blue dot, 5 mi ring around you (location off → "Drop a pin"; outside the county → "Recentre on Travis County") → drag the ring handle or the slider → triage cards in the full sheet (roof chip, "Stalled 6.4 yrs · derived: no status in source", Residential/Commercial, "Lead · {status}" if already a lead) → property sheet → **Create lead** (bottom sheet, pre-filled) → saved; the card and marker get the lead mark. |
| **Desk · 1440** | Map → **Drop a pin** (crosshair, tap the map) → results around the pin → Filters: roof 15 → 25, open or stalled, open ≥ 5 yrs, radius → List: select rows → **Create 3 leads** (duplicates skipped and counted) → drawer: permit, contractor as printed + badge, BBB → Create lead from the property or from its permit. |
| **Agent** | "Show me open roofing permits older than five years within five miles of Pflugerville" → Working… (timer, Cancel) → the full answer, steps, citations ↔ numbered pins → each row: **Create lead** or its lead pill · **Create leads for all {n}** · **Show on map** → “make leads of the top 3” → confirmation card → Create → “{n} leads created · {m} already leads”, Open Leads. Took too long at 25 s: Try again or Use Filters instead. Rate-limited and daily pause kept; no per-session counter. |
| **Lead follow-up** | Leads → combine filters (status, assignee, roof age, permit status, open duration, within r mi of an Area) → Copy link or Show on map → Lead (beside the list at 1440) → status (New · Contacted · Qualified · Won · Lost) → add a note → History shows both with times → reload: the changes persist. Show on map returns to the property. |

### 14.3 Leads

- **Lead record (owned by the CRM):** `id`, the property (`property_cid`), title, type, source (`property` or `permit`), status, owner, created, notes (text, author, time), history, and a **snapshot of the signals** at creation: roof age, basis, confidence, permit class + source word, contractor as printed on permit, identity state, BBB state, distance.
- **No duplicates:** one lead per property. A second create is refused with “Already a lead · {status} · {assignee}” and **Open lead**; bulk create lists existing leads as skipped and says how many.
- **Statuses:** New · Contacted · Qualified · Won · Lost. Owner defaults to the signed-in rep. The Leads Assignee filter offers Me (default), All reps (the sales-manager view) or a name.
- **Outreach** is mocked: "Send message · mocked" and "Schedule a visit · Soon" are disabled on lead detail. Nothing is sent.
- **Prototype only:** the boards keep leads in this browser (`localStorage` key `countylens.proto.crmLeads`), seeded with three sample leads; **Reset sample leads** on the Leads board restores them. The build stores leads server-side in the CRM's own lead store; do not ship the browser store.

### 14.4 Shared boards: what the switch adds (switch off = unchanged)

| Board | Added only with the switch on |
|---|---|
| `Explore1440` (Explore 768, 390, Shell1440 and the ExploreQ boards inherit) | GPS control and its states; Drop a pin; Recentre uses a separate icon; Residential/Commercial on cards, rows and the drawer; lead mark on cards, rows, citations and markers (ring); legend lines "ringed = already a lead" and "Permits: City of Austin only, as published (Run 3)"; Create lead on expanded cards, in the drawer (property or permit) and on citations; selection bar "Create n leads" and the same on the map selection chip; the create-lead sheet; CRM top bar (data chip and account menu replace Help and Ask; `Shell1440` opens the account menu where it opened Help); rail Leads plus the Coming-soon group; bottom bar `CrmBottomNav` (Map · Leads · Ask · More sheet); 3 citations on desktop (each carries a lead action); ProtoBar CRM jump group; `?leads={ids}` from Leads › Show on map (whole county, only those leads, a chip to clear); `?sel={property}` from Lead › View property (opens the CRM drawer); lead links open `CrmLead`; the CRM home map (§14.6): whole-county view, complete GPS states and the 390 Locate chip, Drop pin (click, drag, arrow keys, crosshair, long-press), radius 0.5–25 mi, the CRM filter set and sort, live layers, the coverage note and the map states. Shared markup touched with the switch off renders the same (filters panel, sort menu, no-results copy, list header, cards) |
| `PropertyDetail` (Property boards inherit; Explore’s drawer embeds it in the CRM) | The CRM drawer (§14.7): lead status and Create lead or Already a lead on top, Roof, Permits with Create lead from this permit and a source link, Owner, View lineage in Explorer instead of Open in CRM, Metadata and Merged from collapsed. Switch off: the CountyLens content, unchanged |
| `SearchBox` | A **Lead** match group (lead number or address) |
| `Hub1440` (768, 390 inherit) | The CRM card's prototype link opens `CrmMap`. Text only, switch-independent: the scope line and, when live, Open → `CrmSignIn` (§4.0.1) |
| `ProtoBar` | "Roofing CRM boards" jump group (Map, Leads, Agent, Shell, Coming-soon page, Sign in) when the switch is on or the board is a Crm board |
| `ContractorBadge`, `Pager` | No change; reused as they are |

### 14.5 States

**Partial data from `contract/v1` (CRM-R1, E-93).** The contract does not publish a street address, the contractor name as printed, a BBB score, a raw status word or a permit description. The boards design for what is published: the property title is the TCAD account id + “near {place}” with a line “Address not published in Run {n} · lat, lon” (card, candidate row, drawer header, triage card, agent row, Leads row, Lead header; Copy, Open lead and snackbars use the same title); the contractor line reads “Contractor not published · {reason}”; stalled reads “Stalled · derived: no status in source”; BBB shows only Rated / Not found / Blocked / Not checked with its reason; the badge has only Resolved and Unresolved; a null type reads “Type not published”; the evidence line “Matched on permit type: …” appears only when a matched field exists. The normal states (address, “as printed on permit”) stay for later contract versions. Prototype only: the `v1` switch (`?v1=addr` or `?v1=ctr`) opens these states; do not ship it.

Every Crm screen has loading, empty, error and partial data, and rate-limited where it calls the agent or the data gateway (state pass, step 8). Patterns are CountyLens's: skeleton rows with one status line, a one-line empty hint with a suggested action (chips that widen the radius or lower the roof age), “what failed and how to retry”, and partial data that says what is missing and why. Live boards carry a dashed **Prototype · state** bar (does not ship); each screen has a states overview board. Full per-board list: Appendix A.

| Screen | Loading | Empty | Error | Partial | Rate-limited |
|---|---|---|---|---|---|
| Sign in | `CrmSignInLoading390` | – (a form) | `CrmSignInError390`, `CrmSignInExpired390` | – | `CrmSignInLocked390` (3 tries) |
| Shell · data chip | `CrmShellData1440` (updating) | – | chip “Index unavailable” | updating: results stay on Run 3 | – |
| Map | `CrmMapTiles390` | `CrmMapNoResults390` | `CrmMapFailed390`, `CrmMapIndexDown390` | `CrmMapPartial390` | gateway, drawn in `CrmMapStates` |
| GPS and pin | `CrmMapLocating390` | – | `CrmMapGpsDenied390`, `CrmMapGpsUnavailable390`, `CrmMapGpsOutside390`, `CrmMapPinOutside390` | `CrmMapGpsLow390` | – |
| Candidate list | `CrmCandidatesLoading390` **new** | `CrmCandidatesEmpty390` **new** | `CrmCandidatesError390` **new** (Retry) | `CrmCandidatesPartial390` **new** | gateway, drawn in `CrmCandidatesStates` **new** |
| Property drawer | drawn in `CrmCandidatesStates` **new**; `CrmPropertyCreating390` | – (one property) | load error drawn in `CrmCandidatesStates` **new**; `CrmPropertyFailed390/1440` | `CrmPropertyPartial390` | – |
| Field triage | `CrmTriageLoading390` | `CrmTriageEmpty390` | `CrmTriageFailed390`, `CrmTriageOffline390` | drawn in `CrmTriageStates` **new** | – |
| Leads list | `CrmLeadsLoading390` | `CrmLeadsEmpty390`, `CrmLeadsNoMatch390` | `CrmLeadsError390` | `CrmLeadsPartial390` | – |
| Lead | `CrmLeadLoading390`, `CrmLeadSaving390` | `CrmLeadDeleted390`, not found | `CrmLeadSaveFailed390` | `CrmLeadStale390`, `CrmLeadChanged390`, `CrmLeadElsewhere390` | – |
| Ask the agent | `CrmAskWorking390` | `CrmAskNoResults390` | `CrmAskSlow390`, `CrmAskOutside390`, `CrmAskNotFound390`, `CrmAskCreateFailed390` | `CrmAskLowConf390` | `CrmAskThrottled390`, `CrmAskPaused390` |
| Coming-soon section | – (static) | unknown section | – | – | – |

“–” = not applicable: the sign-in form has no data to be empty; GPS, the drawer and Leads make no agent or gateway call of their own.

### 14.6 The CRM home map

Built on Explore with the switch on (as `ExploreQ-crmmap`); it reuses the roof-age markers, stalled diamonds, radius ring with handle and count chip, radius card, Layers popover, legend and keyboard model A-4. Added:

- **Whole county first.** With no area chosen the map opens on Travis County zoomed out: roof-age hexagons, permit clusters, the county line with the outside shaded, no ring yet, and a card with **Use my location** and **Drop pin**. The header counts the sample rows across the county (no new totals). “Travis County (whole county)” is in the Area picker; the location switcher and Area picker work as today. Picking an area, a GPS fix or a pin zooms in and draws the ring; Recentre returns to the county view.
- **Use my location** is a map control and, at 390, a Locate chip in the sticky header. States (board `CrmGpsStates`): explain before the browser asks (“Allow location to center the search on where you are.”), locating, located (blue dot with an accuracy circle; the ring centres on it), low accuracy over 500 m (“Location is approximate”), denied (“Location is off. Drop a pin or search a place instead.” + Drop pin), unavailable or timed out (Try again, Drop pin), outside Travis County (“You are outside Travis County. The CRM covers Travis County only.” + Go to Travis County).
- **Drop pin.** 1440/768: click the map; drag the pin or move it with the arrow keys (0.25 mi). 390: a fixed crosshair at the visible map centre with **Place pin here** and Cancel (pan the map under it), and a long-press (0.55 s) also drops it. The map label shows lat, lon and the nearest gazetteer place (“near Pflugerville”). A pin outside the county shows the outside message (“This pin is outside Travis County. The CRM covers Travis County only.”) and goes back to its last spot.
- **Radius 0.5–25 mi** in the CRM (slider, number field and ring handle in sync); CountyLens stays 0.5–10 mi.
- **Filters (CRM set):** Roof age ≥ N (10–25 chips or any number in “Other”; default 15; 15 → 25 changes the count), Permit status Open · Stalled · Any (Open = not finaled, includes stalled), Permit open ≥ any / 1 / 3 / 5 / 10 yrs. The results header sentence updates as today. Owner filters stay CountyLens-only.
- **Sort:** Roof age (oldest), Permit open (longest), Nearest. A permit filter makes Permit open (longest) the default until the rep picks a sort; Nearest needs a centre (disabled in the county view).
- **Layers:** Aged roofs (hexagons zoomed out, live in the CRM; markers zoomed in), Open and stalled permits (count clusters zoomed out, coloured by open duration `--viz-permit-open-*`; a “5+” badge on markers and an “Open > 5 yrs” pill on cards), My leads (marker outline coloured by status: New info, Contacted warning, Qualified and Won success, Lost outline), Permit coverage gaps (the existing hatch, live). Zoomed out = below 90 % of the default zoom.
- **Coverage note:** when the ring (or the county view) overlaps an area without permit data, a chip on the ring (“No permit data in part of this ring”) and, in the results header, an **info icon** (warning colour, next to Matches / Close) that opens the full note: “Permits are shown only where CountyLens publishes them. Part of this area has no permit data.” linking CountyLens Coverage. The note no longer takes a banner’s space above the list.
- **States:** tiles loading (results ready below), map failed (List view with “Map unavailable, results below.” and Retry), no results in the ring (Widen to N mi, Roof ≥ M yrs, Any permit), partial (coverage gap), lead index unavailable (map banner; the data chip reads “Index unavailable”; leads and notes still open).
- **Prototype only:** positions, the county line (north and east of the sample rows), the accuracy figures and the GPS outcome are samples; the live boards set them with presets (`crmhome`, `crmgpsexplain`, `crmgpslow`, …). The build takes the county boundary from the gazetteer and accuracy from the browser.

### 14.7 Candidate list, the CRM property drawer and creating leads

- **Candidate list** is the List view of the CRM map: the same matches and filters, the existing table (cards at 390) and Pager. CRM only: a checkbox per row and the selection bar **Create {n} leads**; a **Lead · {status}** pill on rows that are already leads; a **Hide existing leads** toggle in the list header (“Existing leads hidden (n)”); the “Why is this a match?” chip reads **Why is this a lead?** (roof age + basis + confidence; permit class + open years + “source says {word}”).
- **Bulk create** opens a confirmation sheet listing each selected address with its main signal (the open or stalled permit when there is one, else the roof). Rows that are already leads show “Already a lead · {status} · skipped”. Result: snackbar “{n} leads created · {m} already leads” with **Undo** and **Open Leads**.
- **Property drawer (CRM).** From the map, the list and the agent, the drawer embeds **PropertyDetail** in a sales order: address and lead status on top; then **Create lead** (filled) or “Already a lead · {status} · {assignee}” with **Open lead**; Roof (age, basis, confidence; when unknown, the reason); Permits (class, source word, issue date, open duration, contractor “as printed on permit” with the ContractorBadge variants, BBB in one of its four states, a source link per permit, and **Create lead from this permit** on open or stalled permits, which records that permit as the lead’s main signal); Owner as today. **View lineage in Explorer** replaces “Open in CRM” and opens the CountyLens property page in a new tab (signature moment #8); Metadata, Merged from and the location collapse under “Lineage”. With the switch off, PropertyDetail and the Explore drawer are unchanged.
- **Creating a lead** is one tap, no form: status New, assignee = me, origin Map, List, Agent or Property page. The button shows “Creating…”, then a snackbar **Lead created · {id}** with **Undo**, **Open lead** and **Add a note** (expands with a note field: Skip, Save note). A property is a lead only once: a second try is refused with “Already a lead · {status} · {assignee}” and Open lead. **Create failed** shows in place with **Try again**; at 390 offline: “You’re offline. The lead was not saved.” **Partial data** (roof age unknown, or no permit data) still lets the rep create the lead; the missing signal says why and links CountyLens Coverage where permits are not published.
- **Prototype only:** leads live in this browser (`countylens.proto.crmLeads`); demo boards set states with `crm-demo` (creating, created, failed) and `crm-fail` (error, offline: the first try fails, Try again succeeds). The build creates leads in the CRM lead store with an idempotent create keyed on the property, so a double tap never makes two.

### 14.8 Field triage at 390 (signature moment #3)

- **Start:** “Triage {n}” in the CRM map’s results sheet (390) turns the current results, in the current sort, into a stack of cards. The sheet gives way to the triage panel; a 100 px map strip stays above it, centred on the current card’s marker, which is ringed (`is-tri`). Back to map leaves triage at any time.
- **Card:** address and city · type; distance and bearing from the pin (or “from you” with GPS); roof age with basis and confidence; the main permit signal with “Open > 5 yrs”; contractor “as printed” with its badge; BBB state; “Why is this a lead?” chips (roof ≥ the filter, permit class and source word, distance ≤ the ring). A lead shows “Already a lead · {status} · {id}” and offers only Skip and Open lead.
- **Actions:** swipe right = create lead (status New, assigned to you, origin Map, main signal the open or stalled permit, else the roof); swipe left = skip. A drag shows a “Create lead” or “Skip” stamp; past 96 px it commits, otherwise the card snaps back. Every swipe or button shows a snackbar with **Undo** (Undo removes the new lead and brings the card back). Buttons Skip, Create lead and Open details do the same; with the card focused, ← skips, → creates and Enter opens details; a polite live region announces “Card {k} of {n}: {address}…”.
- **End of stack:** “{n} leads created, {m} skipped” with Open Leads and Back to map.
- **States:** loading the next card (skeleton), empty ring (“No candidates in this ring” with Widen to N mi and Roof ≥ M yrs), create failed (the card returns with Try again), offline (banner: Skip still works; Create returns the card with “You’re offline. The lead was not saved.”). Reduced motion (system setting or the motion switch): cards change without the fling.

### 14.9 Leads list (combined filters in the URL)

- **What it lists:** the CRM's own lead records (not the candidate list). 1440: a paged table (Pager, 8 per page): address (+ city, lead id), status pill, assignee, roof age + basis and confidence, main permit (class, open years, derived status, AD-08), contractor as printed with its badge (AD-05), Mi from the area centre (only when a radius filter is on), created from (Map, List or Agent), last activity (latest history or note, with what it was), created. 768: Lead (with “from {origin}”), Status (with assignee), Roof, Main permit, Mi, Last activity. 390: paged lead cards (3 per page) with the same fields stacked and a sticky header with the count, Copy link, Show on map and the active filter chips (each opens Filters). Row or card click opens Lead detail.
- **Filters combine,** in the map's chip style: Status (multi-select), Assignee (Me · All reps · a name; All reps is the sales-manager view), Roof age ≥ (Any, 15, 20, 25), Permit status (Open and Stalled combine; none = Any; picking an open duration turns both on), Permit open ≥ (Any, 1, 3, 5, 10 yrs), Within r mi of {Area} (the Area picker and the radius control, 0.5–25 mi). A plain-English sentence above the list: “{n} leads · New or Contacted · roof ≥ 15 yrs · open or stalled permit open ≥ 5 yrs · within 5 mi of {place}”. Clear filters resets everything. Sort: last activity (default), roof age, permit open, nearest (needs an area).
- **URL:** `/leads?status=new,contacted&assignee=all&roof=15&permit=open,stalled&openYrs=5&place={id}&r=5&sort=near&page=2`; defaults are left out, and reload, back and **Copy link** reopen the same list. Opening a link signed out goes to sign-in and returns to the same filtered list (`next`, CRM routes only). **Show on map** opens the CRM map on the whole county with only the filtered leads and a “{n} leads from your Leads list” chip that clears back to all candidates. A board note shows the URL.
- **Paging (B-08):** 8 per page at 1440 and 768, 3 at 390, with the shared Pager; `page` is in the URL with the filters, and changing a filter or the sort returns to page 1. `CrmLeadsPaged1440`: all reps, page 2 of 4. `CrmLeadsPaged390`: New + Contacted, roof ≥ 15, all reps, page 2 of 6.
- **States:** loading, no leads yet (“Create your first lead from the map” + Go to map), no leads match these filters (+ Clear filters), error (Retry; filters kept), partial: a lead whose property is missing from the newer run keeps its snapshot (“Property not in Run {n}; the lead keeps its snapshot”).
- **Prototype only:** the Area centres reuse Explore's sample places; distances come from the leads' sample positions; the assignee names other than Sample Rep are placeholders; **Add a team’s leads** (prototype bar; on by default on the Paged boards) adds 23 placeholder leads from three reps so the list pages. They are kept apart from the shared lead store (`team=1` in the URL, T- lead ids), and Reset sample leads removes them; the newer run in the partial state is shown as Run 4. **Open this link signed out** stands in for a real expired session (the boards don't check the session on open).

### 14.10 Lead (status, assignee, notes, history)

- **Layout:** 1440 shows the Leads list (my leads, last activity first, the open one marked) on the left and the lead on the right; 768 and 390 are a full page with **Back to Leads**. Every lead link in the CRM (Leads rows, snackbars, the drawer, search, triage) opens this page.
- **Header:** address; **status** menu (New, Contacted, Qualified, Won, Lost, each with icon and label, not colour alone); **assignee** menu (Me or a team member); created from (Map, List, Agent, Property page) and date; **Show on map** (the map with this lead), **View property** (CRM map with the drawer open), **View lineage in Explorer** (new tab).
- **Signals at creation:** roof age + basis + confidence, main permit (class, source word, open years, permit id), contractor as printed with its badge (AD-05), BBB state (AD-07), with “From CountyLens Run {n} · manifest {CID}”. If a newer run changed a signal, a **Now · Run {m}** column shows it with a Changed pill (sample: L-1040 was saved from Run 2; its permit was finaled in Run 3); otherwise “No change since this lead was created”. The lead references the property and permit; owner details are read from the property when opened, never copied into the lead.
- **Notes:** an add-note box with **Save**; the list newest first with author and time. **History:** a timeline of every change (created, status from → to, assignee from → to, note added) with who and when, newest first.
- **Saving:** each change saves at once, optimistically: “Saving…”, then “Saved”. A failed save undoes the change and offers Try again; a failed note keeps its text in the box. Another session changing the lead raises “This lead was updated by {name}. Reload to see the latest.”
- **Future sections:** “Send message” (Outreach · Soon) and “Create estimate” (Estimates · Soon) are disabled with a tooltip and a visible line; nothing is sent.
- **Prototype only:** changes persist in this browser (reload keeps them); **Next save fails** on the state bar forces the failure path; the team names other than Sample Rep, the deleted-by line and the Run 2 → Run 3 change are samples.

### 14.11 Ask the agent (answer, map, create lead)

- **One agent UI.** The CRM agent is Explore's AI mode with the switch on. Reused as is: Working… with elapsed timer and Cancel, the full answer at once (AD-09), How I read this, numbered citations that match numbered map pins, editable assumption chips that re-run the query, the missing-data note, Took too long. The rail **AI**, the 390 **Ask** tab, PropertyDetail's Ask and the ProtoBar open `CrmAsk`.
- **Signed in, no counter.** The “n of 10 AI questions left this session” counter is hidden in the CRM; the daily-budget pause and the rate limit (“Too many questions in a short time”, countdown, Find disabled) stay.
- **Worked example:** “Show me open roofing permits older than five years within five miles of Pflugerville” reads as Centre Pflugerville · within 5 mi · open = not finaled · **Open ≥ 5 yrs** (permit age in words becomes this chip). The answer is honest about what the data holds (real data near Pflugerville has no open roofing permits, only stalled ones) and has a “Widen to {2r} mi” chip. It is written as claims, each with a citation: “No open permits match. 4 stalled permits do (sample rows) within 5 mi of Pflugerville city hall [1–3]: the source has no status for them, so they read as stalled (derived). The longest is 101 Sample Ln: Stalled 6.4 yrs · derived: no status in source [2].” Each row: permit class (stalled is derived) and open years (AD-08), contractor as printed with its badge (AD-05), BBB state (AD-07) and, for matches on a published field, “Matched on permit type: Reroof” as the retrieval evidence. Where part of the area has no permit data the answer says so and links the coverage note.
- **Leads:** each row has **Create lead** (one tap, origin Agent) or **Already a lead · {status}**; the answer has **Create leads for all {n}** and **Show on map** (numbered pins; at 390 the sheet steps aside). Asking in words (“make leads of the top 3”) never creates anything: the agent replies with a confirmation card listing the properties (“Create 1 lead? 2 are already leads and will be skipped.”, Create and Cancel). After Create: “{n} leads created · {m} already leads” with Open Leads, and the lead snackbar with Undo. Leads made here show “created from Agent”.
- **States:** no results (“I found no properties that match. Try a bigger radius or a lower roof age.” with chips that do that), low confidence (“I’m not confident in these matches: {reason}”, sample reason: roof ages from year built only), place outside Travis County or not found (nothing runs; chips for known places), create failed from chat (card stays with the error; Create again retries), rate-limited, AI paused.
- **Prototype only:** keyword rules stand in for the model (as in CountyLens AI); the permit-text snippet, the outside-county place list and the throttle seconds are samples. The build's agent proposes leads through the create-lead tool and the UI asks the user to confirm (B-09); the agent never writes leads by itself.

### 14.12 Responsive and accessibility (CRM, step 9)

Checked on every Crm board at its width (390, 768, 1440), in light and dark, by a rendered audit (text contrast, target size, pill text, marker labels) and keyboard runs (`a11yflow`, 35 checks). Text contrast: no failures in either theme. Map shapes: marker edges, lead outlines, ring and handle are 3:1 or better on the map in both themes.

**Fixes (all CRM-only; on Explore they hang off a `crm-on` class that exists only with the switch on):**
1. 48 px hit areas (A-1 pattern, visual size unchanged): view switch (Map / List / Map + cards), result tabs, results-sheet handle, permit clusters, radius handle, search pin, numbered AI pins, the “steps done” row, lead pills and lead links in rows and citations, permit source links in the drawer, links on the states boards and the GPS states board, the data panel link.
2. 48 px controls: selection checkboxes (row and select-all), sign-in and note fields, Leads selects (assignee, area, sort) and the radius number field, the CRM roof-age “Other” field, the nested rail items (Filters, AI).
3. Map markers keep their 14 px look with a 24 px hit area: pins are dense, and every marker has the same action in the list and cards next to the map.
4. 3:1 edges where fills alone fail: roof-age hexagons get an on-surface-variant edge; permit clusters get an outer ring.
5. Lead status on markers is no longer colour alone: line style (solid New, dashed Contacted, double Qualified/Won, dotted Lost) plus the status in every marker’s label, including markers outside the current filter; the legend says so.
6. Map keyboard model (A-4) in the CRM: the map is a tab stop with a 3 px ring and now shows its key hint while focused (arrows pan, + − zoom); Use my location and Drop pin are reachable by Tab; the pin moves with the arrow keys.
7. Dialogs: the property drawer, the bulk confirmation sheet and the create-lead sheet move focus inside when they open, trap Tab and Shift+Tab, close with Escape and return focus to the control that opened them. The account menu, data panel, More sheet and the Lead status and assignee menus close with Escape and return focus.
8. Visible focus: map controls, pins and the sheet handle get a 3 px ring; the AI question box shows a ring on its box.
9. Leads: each row and card is one link target (whole row), not only the address text.
10. Sizes: `CrmGpsStates` grew to 960 px tall for the taller links; the sign-in Show password button re-aligned to the 48 px field.
11. **One overlay at a time:** the account menu, data-source panel, More sheet, search suggestions and Explore’s Area, Sort and Layers menus close each other (one shared overlay event); at 390 the map’s floating chips, controls and key hint step aside while one is open, the Area and Sort menus open full width under the query rail, and the top bar sits above the search row while its menu is open.
12. The results-sheet handle keeps its 32 × 4 grab bar; its 48 px hit area moved to `::before` (fix 1 had replaced the bar with a full-width block).

**Already in place and re-checked:** triage works without swiping (Skip, Create lead, Open details; ← → Enter) and drops the fling with reduced motion; the ring jumps and the hexagons swap in place with reduced motion (A-6 to A-8); status pills always carry the status word; at 390 the primary action stays visible and on top: Triage {n} in the results sheet, Create lead in the property sheet and on triage cards, Create {n} leads in the selection bar and the confirmation sheet.

**Note for CountyLens (not changed, switch off must stay as is):** the AI question box in CountyLens has no visible focus ring of its own; the CRM fix above could be adopted for CountyLens in a later CountyLens round.

### 14.13 CRM open items

1. Lead store, sign-in and the agent's create-lead tool are built in the CRM repo (B-01, B-07, B-09); the prototype's browser store and state switchers do not ship.
2. GPS accuracy, the ±12 m copy and the outside-county test use the browser's position and the county boundary from the gazetteer.
3. Residential / Commercial comes from the published property type (`v_property.property_type`). When it is null the card and the drawer header read “Type not published” (E-93). The Residential and Commercial values on the normal boards are sample placeholders (intent ASM-2).
4. Manager "All reps" view is optional for the demo.
5. Resolved in CRM-R2 (E-95): the Hub's Roofing CRM card now reads “Leads and notes”; the scope line and the Open target are unchanged.
6. Sign-in rate limit (three tries, then “try again later”) and session lifetime are set in Cognito; the copy does not name a duration.
7. Map: the whole-county view needs county-wide hexagon and permit-cluster tiles from the published index; the GPS timeout (10 s) and the low-accuracy threshold (500 m) are proposals.
8. The lineage link opens the CountyLens property page for the property’s CID; the prototype opens the 101 sample page.
9. Leads: the build checks the session on every route and redirects a signed-out link to sign-in with `next`; the URL keys above are a proposal for the CRM API's list query (assignee needs the rep directory).
10. The Leads “Permit open ≥” and distance are computed from the lead's snapshot; the build may prefer the current run when the property is still published.
11. Lead saves need an optimistic-concurrency check (a version per lead) so “changed elsewhere” is raised by the server; the prototype only detects another tab. Who may reassign a lead (any rep, or managers only) is for the PO.
12. Address and contractor name arrive with Task A’s contract v1.1 (a later Task A story, FU-A-01 / EXT-11, EXT-12). Until then the first build ships the NoAddress and NoContractor states (TCAD id + “near {place}”, “Address not published in Run {n}”, “Contractor not published” with its reason). The address and “as printed on permit” boards are the field-present state, shown once the fields appear in the manifest.
13. The “Stalled · derived: no status in source” label is used until a raw status word is published; then the label can show the word again (AD-08 layout unchanged).
14. The county outline for the “outside Travis County” check and the shaded outside area is not in the data (the gazetteer has points only). It is decided at architecture review (G3): a static county outline or a bounding box, recorded as non-Oracle reference data.
12. Agent: the CRM rate limit (per user, per minute) and whether the daily AI budget is shared with CountyLens are for engineering; the earlier `CrmAgentLimit390` board shows the CRM without a session quota now.

## Appendix A. Roofing CRM boards and their states

| Screen | Board | State shown |
|---|---|---|
| Sign in | `CrmSignIn1440` | Form; state bar: signing in, wrong email or password, too many attempts, session expired, signed out, signed in |
| Sign in | `CrmSignIn390` | Form; state bar: signing in, wrong email or password, too many attempts, session expired, signed out, signed in |
| Sign in | `CrmSignIn768` | Form; state bar: signing in, wrong email or password, too many attempts, session expired, signed out, signed in |
| Sign in | `CrmSignInError390` | Error: wrong email or password |
| Sign in | `CrmSignInExpired390` | Session expired, returns to a filtered Leads link |
| Sign in | `CrmSignInLoading390` | Loading (signing in) |
| Sign in | `CrmSignInLocked390` | Error: too many attempts (rate limit) |
| Sign in | `CrmSignInSignedOut390` | Signed out |
| Shell | `CrmShell1440` | Populated (account menu / More open) |
| Shell | `CrmShell390` | Populated (account menu / More open) |
| Shell | `CrmShellData1440` | Data chip: up to date, updating (partial), unavailable (error) |
| Shell component | `CrmAccount` | Menu open / closed |
| Shell component | `CrmBottomNav` | More sheet open / closed |
| Shell component | `CrmDataChip` | Up to date · updating (partial) · unavailable (error) |
| Coming-soon section | `CrmComingSoon1440` | Static page; unknown section = empty (“There’s no section here”) |
| Coming-soon section | `CrmComingSoon390` | Static page; unknown section = empty (“There’s no section here”) |
| Coming-soon section | `CrmComingSoon768` | Static page; unknown section = empty (“There’s no section here”) |
| Map | `CrmMap1440` | Populated (whole county) |
| Map | `CrmMap390` | Populated (whole county) |
| Map | `CrmMap768` | Populated (whole county) |
| Map | `CrmMapFailed390` | Error: map failed, list below with Retry |
| Map | `CrmMapIndexDown390` | Error: lead index unavailable, Retry |
| Map | `CrmMapNoResults390` | Empty: nothing in the ring, chips to widen |
| Map | `CrmMapPartial390` | Partial: no permit data in part of the ring |
| Map | `CrmMapStates` | Overview: loading, empty, error, partial, rate-limited (gateway), GPS |
| Map | `CrmMapTiles390` | Loading (tiles; results ready) |
| Map · GPS and pin | `CrmGpsStates` | Overview: explain, locating, located, low accuracy, denied, unavailable, outside, pin outside |
| Map · GPS | `CrmMapGps1440` | Located (ring around you) |
| Map · GPS | `CrmMapGps390` | Located (ring around you) |
| Map · GPS | `CrmMapGps768` | Located (ring around you) |
| Map · GPS | `CrmMapGpsDenied390` | Error: location off, Drop pin |
| Map · GPS | `CrmMapGpsExplain390` | Before the browser asks |
| Map · GPS | `CrmMapGpsLow390` | Partial: low accuracy |
| Map · GPS | `CrmMapGpsOutside390` | Error: outside Travis County, recentre |
| Map · GPS | `CrmMapGpsUnavailable390` | Error: unavailable or timed out, Try again |
| Map · GPS | `CrmMapLocating390` | Loading (finding your location) |
| Map · pin | `CrmMapPin1440` | Results around the pin |
| Map · pin | `CrmMapPin390` | Results around the pin |
| Map · pin | `CrmMapPinMode1440` | Placing the pin |
| Map · pin | `CrmMapPinMode390` | Placing the pin |
| Map · pin | `CrmMapPinMove1440` | Drag or arrow keys |
| Map · pin | `CrmMapPinOutside390` | Error: pin outside the county |
| Candidate list | `CrmCandidates1440` | Populated |
| Candidate list | `CrmCandidates390` | Populated |
| Candidate list | `CrmCandidates768` | Populated |
| Candidate list | `CrmCandidatesConfirm1440` | Bulk confirmation |
| Candidate list | `CrmCandidatesConfirm390` | Bulk confirmation |
| Candidate list | `CrmCandidatesCreated390` | Bulk created snackbar |
| Candidate list | `CrmCandidatesEmpty390` | Empty: chips to widen · new |
| Candidate list | `CrmCandidatesError390` | Error: index unavailable, Retry · new |
| Candidate list | `CrmCandidatesHide1440` | Existing leads hidden |
| Candidate list | `CrmCandidatesLoading390` | Loading (skeleton) · new |
| Candidate list | `CrmCandidatesPartial390` | Partial: no permit data note · new |
| Candidate list + drawer | `CrmCandidatesStates` | Overview: loading, empty, error, partial, rate-limited (gateway) · new |
| Property drawer | `CrmProperty1440` | Populated (not a lead yet) |
| Property drawer | `CrmProperty390` | Populated (not a lead yet) |
| Property drawer | `CrmProperty768` | Populated (not a lead yet) |
| Property drawer | `CrmPropertyCreated390` | Saved: lead created |
| Property drawer | `CrmPropertyCreating390` | Saving: creating |
| Property drawer | `CrmPropertyDup390` | Already a lead |
| Property drawer | `CrmPropertyFailed1440` | Error: create failed (390: offline), Try again |
| Property drawer | `CrmPropertyFailed390` | Error: create failed (390: offline), Try again |
| Property drawer | `CrmPropertyPartial390` | Partial: roof unknown, no permit data |
| Create lead | `CrmLeadCreate1440` | Created snackbar, Add a note |
| Create lead | `CrmLeadCreate390` | Created snackbar, Add a note |
| Create lead | `CrmLeadCreate768` | Created snackbar, Add a note |
| Create lead | `CrmLeadDup1440` | Refused: already a lead |
| Create lead | `CrmLeadDup390` | Refused: already a lead |
| Field triage | `CrmTriage390` | Populated (stack) |
| Field triage | `CrmTriageEmpty390` | Empty ring |
| Field triage | `CrmTriageEnd390` | End of stack |
| Field triage | `CrmTriageFailed390` | Error: create failed, Try again |
| Field triage | `CrmTriageLead390` | Already a lead card |
| Field triage | `CrmTriageLoading390` | Loading next card |
| Field triage | `CrmTriageOffline390` | Error: offline |
| Field triage | `CrmTriageStates` | Overview: loading, empty, error, partial · new |
| Field triage | `CrmTriageSwipe390` | Swiping |
| Leads list | `CrmLeads1440` | Populated; state bar: loading, no leads yet, error, partial |
| Leads list | `CrmLeads390` | Populated; state bar: loading, no leads yet, error, partial |
| Leads list | `CrmLeads768` | Populated; state bar: loading, no leads yet, error, partial |
| Leads list | `CrmLeadsAllReps390` | All reps view |
| Leads list | `CrmLeadsEmpty390` | Empty: no leads yet, Go to map |
| Leads list | `CrmLeadsError390` | Error: Retry |
| Leads list | `CrmLeadsFiltered1440` | Combined filters from the URL |
| Leads list | `CrmLeadsLoading390` | Loading |
| Leads list | `CrmLeadsPaged1440` | Paged: page 2 of 4, all reps (team sample) |
| Leads list | `CrmLeadsPaged390` | Paged with combined filters: page 2 of 6 |
| Map | `CrmMapNoAddress390` | Partial data: address not published (card with TCAD id, near place, lat/lon) |
| Candidate list | `CrmCandidatesNoAddress390` | Partial data: address not published (candidate row) |
| Property drawer | `CrmPropertyNoAddress390` | Partial data: address not published (drawer header) |
| Property drawer | `CrmPropertyNoAddress1440` | Partial data: address not published (drawer header) |
| Field triage | `CrmTriageNoAddress390` | Partial data: address not published (triage card) |
| Ask the agent | `CrmAskNoAddress390` | Partial data: address not published (answer rows) |
| Leads list | `CrmLeadsNoAddress390` | Partial data: address not published (Leads row) |
| Leads list | `CrmLeadsNoAddress1440` | Partial data: address not published (Leads row) |
| Lead | `CrmLeadNoAddress390` | Partial data: address not published (Lead header) |
| Property drawer | `CrmPropertyNoContractor390` | Partial data: contractor not published, with its reason (permits) |
| Field triage | `CrmTriageNoContractor390` | Partial data: contractor not published (triage card) |
| Ask the agent | `CrmAskNoContractor390` | Partial data: contractor not published (agent rows) |
| Lead | `CrmLeadNoContractor390` | Partial data: contractor not published (Signals saved with the lead) |
| Leads list | `CrmLeadsNoContractor390` | Partial data: contractor not published (Leads cards) |
| Leads list | `CrmLeadsNoContractor1440` | Partial data: contractor not published (Leads column) |
| Shell | `CrmShellApps1440` | App switcher menu open (CountyLens, Roofing CRM ✓, Landing page) |
| Shell | `CrmShellApps768` | App switcher menu open (CountyLens, Roofing CRM ✓, Landing page) |
| Shell component | `CrmAppsMenu` | App switcher menu open / closed |
| Leads list | `CrmLeadsNoMatch390` | Empty: no match, Clear filters |
| Leads list | `CrmLeadsPartial390` | Partial: property not in Run 4 |
| Leads list | `CrmLeadsStates` | Overview: loading, no leads yet, no match, error, partial |
| Lead | `CrmLead1440` | Populated; state bar: loading, property not in Run 4, changed elsewhere, not found, deleted, next save fails |
| Lead | `CrmLead390` | Populated; state bar: loading, property not in Run 4, changed elsewhere, not found, deleted, next save fails |
| Lead | `CrmLead768` | Populated; state bar: loading, property not in Run 4, changed elsewhere, not found, deleted, next save fails |
| Lead | `CrmLeadChanged390` | Partial: signal changed since creation (Now) |
| Lead | `CrmLeadDeleted390` | Empty: deleted |
| Lead | `CrmLeadElsewhere390` | Changed elsewhere, Reload |
| Lead | `CrmLeadLoading390` | Loading |
| Lead | `CrmLeadSaveFailed390` | Error: save failed, change undone, Try again |
| Lead | `CrmLeadSaving390` | Saving |
| Lead | `CrmLeadStale390` | Partial: property not in Run 4 |
| Lead | `CrmLeadStates` | Overview: loading, saving, save failed, not found/deleted, not in newer run, changed elsewhere |
| Lead (superseded by CrmLead) | `CrmLeadDetail1440` | Earlier board: loading, error, partial, not found |
| Lead (superseded by CrmLead) | `CrmLeadDetail390` | Earlier board: loading, error, partial, not found |
| Lead (superseded by CrmLead) | `CrmLeadDetail768` | Earlier board: loading, error, partial, not found |
| Lead (superseded by CrmLead) | `CrmLeadDetailError390` | Earlier board: loading, error, partial, not found |
| Lead (superseded by CrmLead) | `CrmLeadDetailLoading390` | Earlier board: loading, error, partial, not found |
| Lead (superseded by CrmLead) | `CrmLeadDetailMissing390` | Earlier board: loading, error, partial, not found |
| Lead (superseded by CrmLead) | `CrmLeadDetailPartial390` | Earlier board: loading, error, partial, not found |
| Ask the agent | `CrmAgentStates` | Overview (earlier; links CrmAsk) |
| Ask the agent | `CrmAsk1440` | Answered (worked example) |
| Ask the agent | `CrmAsk390` | Answered (worked example) |
| Ask the agent | `CrmAsk768` | Answered (worked example) |
| Ask the agent | `CrmAskConfirm1440` | Confirmation card |
| Ask the agent | `CrmAskConfirm390` | Confirmation card |
| Ask the agent | `CrmAskCreateFailed390` | Error: create failed from chat |
| Ask the agent | `CrmAskCreated390` | Saved: leads created |
| Ask the agent | `CrmAskLowConf390` | Partial: low confidence |
| Ask the agent | `CrmAskNoResults390` | Empty: no results, chips |
| Ask the agent | `CrmAskNotFound390` | Error: place not found |
| Ask the agent | `CrmAskOutside390` | Error: place outside Travis County |
| Ask the agent | `CrmAskPaused390` | Rate-limited: AI paused (daily budget) |
| Ask the agent | `CrmAskSlow390` | Error: took too long |
| Ask the agent | `CrmAskStates` | Overview: loading, empty, error, partial, rate-limited · new |
| Ask the agent | `CrmAskThrottled390` | Rate-limited |
| Ask the agent | `CrmAskWorking390` | Loading: Working… |
| Ask the agent (superseded by CrmAsk) | `CrmAgent1440` | Earlier board |
| Ask the agent (superseded by CrmAsk) | `CrmAgent390` | Earlier board |
| Ask the agent (superseded by CrmAsk) | `CrmAgent768` | Earlier board |
| Ask the agent (superseded by CrmAsk) | `CrmAgentLimit390` | Earlier board |
| Ask the agent (superseded by CrmAsk) | `CrmAgentPaused390` | Earlier board |
| Ask the agent (superseded by CrmAsk) | `CrmAgentSlow1440` | Earlier board |
| Ask the agent (superseded by CrmAsk) | `CrmAgentSlow390` | Earlier board |
| Ask the agent (superseded by CrmAsk) | `CrmAgentWorking1440` | Earlier board |
| Ask the agent (superseded by CrmAsk) | `CrmAgentWorking390` | Earlier board |
| Flows | `CrmFlows` | Index of flows |

## Appendix B. CountyLens boards with the Map view (CRM preview) switch off

Pixel comparison of every CountyLens board against the version before the CRM work (switch off, same viewport, fixed clock), run at the end of step 9. Boards that differed were compared again and by layout boxes.

| CountyLens board | Switch off: result |
|---|---|
| `A11yAudit` | Unchanged (pixel-identical) |
| `Activity1440` | Unchanged (pixel-identical) |
| `Activity390` | Unchanged (pixel-identical) |
| `Activity768` | Unchanged (pixel-identical) |
| `ActivityStates` | Unchanged (pixel-identical) |
| `AdminSignIn1440` | Unchanged (pixel-identical) |
| `AdminSignIn390` | Unchanged (pixel-identical) |
| `AdminSignIn768` | Unchanged (pixel-identical) |
| `ContractorBadge` | Unchanged (pixel-identical) |
| `Coverage1440` | Unchanged (pixel-identical) |
| `Coverage390` | Unchanged (pixel-identical) |
| `Coverage768` | Unchanged (pixel-identical) |
| `CoverageStates` | Unchanged (pixel-identical) |
| `Data390` | Unchanged (pixel-identical) |
| `DataCatalog1440` | Unchanged (pixel-identical) |
| `DataCatalog768` | Unchanged (pixel-identical) |
| `DataManifest1440` | Unchanged (pixel-identical) |
| `DataManifest768` | Unchanged (pixel-identical) |
| `DataStates` | Unchanged (pixel-identical) |
| `DataVerify1440` | Unchanged (pixel-identical) |
| `DataVerify768` | Unchanged (pixel-identical) |
| `EmptyHints` | Unchanged (pixel-identical) |
| `Explore1440` | Unchanged (pixel-identical) |
| `Explore390` | Unchanged (pixel-identical) |
| `Explore768` | Unchanged: same layout boxes; the pixel compare is flaky here even old against old |
| `ExploreQ-ai` | Unchanged (pixel-identical) |
| `ExploreQ-aicontractor` | Unchanged: same layout boxes; pixel-identical on re-run (AI timer noise) |
| `ExploreQ-ailimit` | Unchanged: same layout boxes; pixel-identical on re-run (AI timer noise) |
| `ExploreQ-aiooa` | Unchanged (pixel-identical) |
| `ExploreQ-aipaused` | Unchanged: pixel-identical on re-run |
| `ExploreQ-aislow` | Unchanged (pixel-identical) |
| `ExploreQ-aiworking` | Unchanged (pixel-identical) |
| `ExploreQ-builder` | Unchanged (pixel-identical) |
| `ExploreQ-crmmap` | Shows the CRM preview by design (the switch is forced on for this board) |
| `ExploreQ-ooa78753` | Unchanged (pixel-identical) |
| `ExploreQ-permits5` | Unchanged (pixel-identical) |
| `ExploreQ-roof15` | Unchanged (pixel-identical) |
| `ExploreQ-sql` | Unchanged (pixel-identical) |
| `ExploreQ-sqlperm` | Unchanged (pixel-identical) |
| `ExploreQ-stalled78753` | Unchanged (pixel-identical) |
| `ExploreQ390-ai` | Unchanged (pixel-identical) |
| `ExploreQ390-aicontractor` | Unchanged (pixel-identical) |
| `ExploreQ390-aiooa` | Unchanged (pixel-identical) |
| `ExploreQ390-aislow` | Unchanged (pixel-identical) |
| `ExploreQ390-aiworking` | Unchanged (pixel-identical) |
| `ExploreQ390-builder` | Unchanged (pixel-identical) |
| `ExploreQ390-ooa78753` | Unchanged (pixel-identical) |
| `ExploreQ390-permits5` | Unchanged (pixel-identical) |
| `ExploreQ390-roof15` | Unchanged (pixel-identical) |
| `ExploreQ390-sql` | Unchanged (pixel-identical) |
| `ExploreQ390-sqlperm` | Unchanged (pixel-identical) |
| `ExploreQ390-stalled78753` | Unchanged (pixel-identical) |
| `ExploreQ768-aislow` | Unchanged (pixel-identical) |
| `ExploreQ768-aiworking` | Unchanged (pixel-identical) |
| `ExploreStates` | Unchanged (pixel-identical) |
| `Extensions` | Changed on purpose: the log gained E-49 … E-95 (CRM · not Task A rows); existing rows unchanged |
| `Flows` | Unchanged (pixel-identical) |
| `HelpMcp1440` | Unchanged (pixel-identical) |
| `HelpMcp390` | Unchanged (pixel-identical) |
| `HelpMcp768` | Unchanged (pixel-identical) |
| `HelperStates` | Unchanged (pixel-identical) |
| `Hub1440` | Changed on purpose in CRM step 1 (brief): the CRM card’s scope line and Open target; text only, switch-independent |
| `Hub390` | Changed on purpose in CRM step 1 (as Hub1440) |
| `Hub768` | Changed on purpose in CRM step 1 (as Hub1440) |
| `LegalData1440` | Unchanged (pixel-identical) |
| `LegalData390` | Unchanged (pixel-identical) |
| `LegalData768` | Unchanged (pixel-identical) |
| `LegalPrivacy1440` | Unchanged (pixel-identical) |
| `LegalPrivacy768` | Unchanged (pixel-identical) |
| `LegalTerms1440` | Unchanged (pixel-identical) |
| `LegalTerms768` | Unchanged (pixel-identical) |
| `Main` | Unchanged (pixel-identical) |
| `Pager` | Unchanged (pixel-identical) |
| `Property1440` | Unchanged (pixel-identical) |
| `Property390` | Unchanged (pixel-identical) |
| `Property390Full` | Unchanged (pixel-identical) |
| `Property390NoImagery` | Unchanged (pixel-identical) |
| `Property768` | Unchanged (pixel-identical) |
| `PropertyDetail` | Unchanged (pixel-identical) |
| `PropertyStates` | Unchanged (pixel-identical) |
| `ProtoBar` | Unchanged (pixel-identical) |
| `RunChain` | Unchanged (pixel-identical) |
| `Runs1440` | Unchanged (pixel-identical) |
| `Runs390` | Unchanged (pixel-identical) |
| `Runs768` | Unchanged (pixel-identical) |
| `RunsAdmin1440` | Unchanged (pixel-identical) |
| `RunsCompare1440` | Unchanged (pixel-identical) |
| `RunsCompare390` | Unchanged (pixel-identical) |
| `RunsCompare768` | Unchanged (pixel-identical) |
| `RunsLog1440` | Unchanged (pixel-identical) |
| `RunsLog768` | Unchanged (pixel-identical) |
| `RunsStates` | Unchanged (pixel-identical) |
| `SearchBox` | Unchanged (pixel-identical) |
| `SearchStates` | Unchanged (pixel-identical) |
| `Shell1440` | Unchanged (pixel-identical) |
| `Shell390ComingSoon` | Unchanged (pixel-identical) |
| `Shell390Location` | Unchanged (pixel-identical) |
| `Shell390More` | Unchanged (pixel-identical) |
| `ShellStates` | Unchanged (pixel-identical) |
| `SqlStates` | Unchanged (pixel-identical) |
| `UserSignIn1440` | Unchanged (pixel-identical) |
| `UserSignIn390` | Unchanged (pixel-identical) |
| `UserSignIn768` | Unchanged (pixel-identical) |
| `Welcome1440` | Unchanged (pixel-identical) |
| `Welcome390` | Unchanged (pixel-identical) |
| `Welcome768` | Unchanged: pixel-identical on re-run (13 anti-aliased pixels, Δ ≤ 8/255, on the first run) |

## Appendix C. New Crm boards

Every board added for the Roofing CRM (135). None of them is part of CountyLens; the CRM is documented in `CRM-HANDOFF.md`.

- `CrmAccount` · CRM · not Task A
- `CrmAgent1440` · CRM · not Task A
- `CrmAgent390` · CRM · not Task A
- `CrmAgent768` · CRM · not Task A
- `CrmAgentLimit390` · CRM · not Task A
- `CrmAgentPaused390` · CRM · not Task A
- `CrmAgentSlow1440` · CRM · not Task A
- `CrmAgentSlow390` · CRM · not Task A
- `CrmAgentStates` · CRM · not Task A
- `CrmAgentWorking1440` · CRM · not Task A
- `CrmAgentWorking390` · CRM · not Task A
- `CrmAsk1440` · CRM · not Task A
- `CrmAsk390` · CRM · not Task A
- `CrmAsk768` · CRM · not Task A
- `CrmAskConfirm1440` · CRM · not Task A
- `CrmAskConfirm390` · CRM · not Task A
- `CrmAskCreateFailed390` · CRM · not Task A
- `CrmAskCreated390` · CRM · not Task A
- `CrmAskLowConf390` · CRM · not Task A
- `CrmAskNoResults390` · CRM · not Task A
- `CrmAskNotFound390` · CRM · not Task A
- `CrmAskOutside390` · CRM · not Task A
- `CrmAskPaused390` · CRM · not Task A
- `CrmAskSlow390` · CRM · not Task A
- `CrmAskStates` · CRM · not Task A
- `CrmAskThrottled390` · CRM · not Task A
- `CrmAskWorking390` · CRM · not Task A
- `CrmBottomNav` · CRM · not Task A
- `CrmCandidates1440` · CRM · not Task A
- `CrmCandidates390` · CRM · not Task A
- `CrmCandidates768` · CRM · not Task A
- `CrmCandidatesConfirm1440` · CRM · not Task A
- `CrmCandidatesConfirm390` · CRM · not Task A
- `CrmCandidatesCreated390` · CRM · not Task A
- `CrmCandidatesEmpty390` · CRM · not Task A
- `CrmCandidatesError390` · CRM · not Task A
- `CrmCandidatesHide1440` · CRM · not Task A
- `CrmCandidatesLoading390` · CRM · not Task A
- `CrmCandidatesPartial390` · CRM · not Task A
- `CrmCandidatesStates` · CRM · not Task A
- `CrmComingSoon1440` · CRM · not Task A
- `CrmComingSoon390` · CRM · not Task A
- `CrmComingSoon768` · CRM · not Task A
- `CrmDataChip` · CRM · not Task A
- `CrmFlows` · CRM · not Task A
- `CrmGpsStates` · CRM · not Task A
- `CrmLead1440` · CRM · not Task A
- `CrmLead390` · CRM · not Task A
- `CrmLead768` · CRM · not Task A
- `CrmLeadChanged390` · CRM · not Task A
- `CrmLeadCreate1440` · CRM · not Task A
- `CrmLeadCreate390` · CRM · not Task A
- `CrmLeadCreate768` · CRM · not Task A
- `CrmLeadDeleted390` · CRM · not Task A
- `CrmLeadDetail1440` · CRM · not Task A
- `CrmLeadDetail390` · CRM · not Task A
- `CrmLeadDetail768` · CRM · not Task A
- `CrmLeadDetailError390` · CRM · not Task A
- `CrmLeadDetailLoading390` · CRM · not Task A
- `CrmLeadDetailMissing390` · CRM · not Task A
- `CrmLeadDetailPartial390` · CRM · not Task A
- `CrmLeadDup1440` · CRM · not Task A
- `CrmLeadDup390` · CRM · not Task A
- `CrmLeadElsewhere390` · CRM · not Task A
- `CrmLeadLoading390` · CRM · not Task A
- `CrmLeadSaveFailed390` · CRM · not Task A
- `CrmLeadSaving390` · CRM · not Task A
- `CrmLeadStale390` · CRM · not Task A
- `CrmLeadStates` · CRM · not Task A
- `CrmLeads1440` · CRM · not Task A
- `CrmLeads390` · CRM · not Task A
- `CrmLeads768` · CRM · not Task A
- `CrmLeadsAllReps390` · CRM · not Task A
- `CrmLeadsEmpty390` · CRM · not Task A
- `CrmLeadsError390` · CRM · not Task A
- `CrmLeadsFiltered1440` · CRM · not Task A
- `CrmLeadsLoading390` · CRM · not Task A
- `CrmLeadsNoMatch390` · CRM · not Task A
- `CrmLeadsPaged1440` · CRM · not Task A
- `CrmLeadsPaged390` · CRM · not Task A
- `CrmMapNoAddress390` · CRM · not Task A
- `CrmCandidatesNoAddress390` · CRM · not Task A
- `CrmPropertyNoAddress390` · CRM · not Task A
- `CrmPropertyNoAddress1440` · CRM · not Task A
- `CrmTriageNoAddress390` · CRM · not Task A
- `CrmAskNoAddress390` · CRM · not Task A
- `CrmLeadsNoAddress390` · CRM · not Task A
- `CrmLeadsNoAddress1440` · CRM · not Task A
- `CrmLeadNoAddress390` · CRM · not Task A
- `CrmPropertyNoContractor390` · CRM · not Task A
- `CrmTriageNoContractor390` · CRM · not Task A
- `CrmAskNoContractor390` · CRM · not Task A
- `CrmLeadNoContractor390` · CRM · not Task A
- `CrmLeadsNoContractor390` · CRM · not Task A
- `CrmLeadsNoContractor1440` · CRM · not Task A
- `CrmShellApps1440` · CRM · not Task A
- `CrmShellApps768` · CRM · not Task A
- `CrmAppsMenu` · CRM · not Task A
- `CrmLeadsPartial390` · CRM · not Task A
- `CrmLeadsStates` · CRM · not Task A
- `CrmMap1440` · CRM · not Task A
- `CrmMap390` · CRM · not Task A
- `CrmMap768` · CRM · not Task A
- `CrmMapFailed390` · CRM · not Task A
- `CrmMapGps1440` · CRM · not Task A
- `CrmMapGps390` · CRM · not Task A
- `CrmMapGps768` · CRM · not Task A
- `CrmMapGpsDenied390` · CRM · not Task A
- `CrmMapGpsExplain390` · CRM · not Task A
- `CrmMapGpsLow390` · CRM · not Task A
- `CrmMapGpsOutside390` · CRM · not Task A
- `CrmMapGpsUnavailable390` · CRM · not Task A
- `CrmMapIndexDown390` · CRM · not Task A
- `CrmMapLocating390` · CRM · not Task A
- `CrmMapNoResults390` · CRM · not Task A
- `CrmMapPartial390` · CRM · not Task A
- `CrmMapPin1440` · CRM · not Task A
- `CrmMapPin390` · CRM · not Task A
- `CrmMapPinMode1440` · CRM · not Task A
- `CrmMapPinMode390` · CRM · not Task A
- `CrmMapPinMove1440` · CRM · not Task A
- `CrmMapPinOutside390` · CRM · not Task A
- `CrmMapStates` · CRM · not Task A
- `CrmMapTiles390` · CRM · not Task A
- `CrmProperty1440` · CRM · not Task A
- `CrmProperty390` · CRM · not Task A
- `CrmProperty768` · CRM · not Task A
- `CrmPropertyCreated390` · CRM · not Task A
- `CrmPropertyCreating390` · CRM · not Task A
- `CrmPropertyDup390` · CRM · not Task A
- `CrmPropertyFailed1440` · CRM · not Task A
- `CrmPropertyFailed390` · CRM · not Task A
- `CrmPropertyPartial390` · CRM · not Task A
- `CrmShell1440` · CRM · not Task A
- `CrmShell390` · CRM · not Task A
- `CrmShellData1440` · CRM · not Task A
- `CrmSignIn1440` · CRM · not Task A
- `CrmSignIn390` · CRM · not Task A
- `CrmSignIn768` · CRM · not Task A
- `CrmSignInError390` · CRM · not Task A
- `CrmSignInExpired390` · CRM · not Task A
- `CrmSignInLoading390` · CRM · not Task A
- `CrmSignInLocked390` · CRM · not Task A
- `CrmSignInSignedOut390` · CRM · not Task A
- `CrmTriage390` · CRM · not Task A
- `CrmTriageEmpty390` · CRM · not Task A
- `CrmTriageEnd390` · CRM · not Task A
- `CrmTriageFailed390` · CRM · not Task A
- `CrmTriageLead390` · CRM · not Task A
- `CrmTriageLoading390` · CRM · not Task A
- `CrmTriageOffline390` · CRM · not Task A
- `CrmTriageStates` · CRM · not Task A
- `CrmTriageSwipe390` · CRM · not Task A
