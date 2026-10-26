# Roofing CRM: design handoff (Task B · CRM · not Task A)

**Product:** Roofing CRM, a map-based roofing lead CRM for a sales rep at a roofing company in Travis County, TX. It **reads only what CountyLens publishes** (by CID or through the CountyLens MCP) and adds GPS and pin-drop radius search, CRM leads and an agent that can create leads. Hosted at `crm.aldarraj.com`.
**Scope (first release):** Map, Filters and AI search, plus leads; Campaigns and the rest are coming soon (visits stay later).
**Prototype:** the CountyLens canvas artifact (claude.ai). Start at the board **`CrmFlows`**; every `Crm…` board opens with the **Map view (CRM preview)** switch forced on. 153 Crm boards. Prototype source: `prototype/` in the handoff package.
**Design system:** Atlas (Material 3) tokens and components only; CRM additions are logged as E-49 onward, each “CRM · not Task A” (§8).
**Companion:** the CountyLens handoff (`HANDOFF.md`) is the source for everything shared; this document covers the CRM only.

**Rules the CRM design follows:**
- Every CRM screen is its own `Crm…` board. Shared boards (Explore, PropertyDetail, SearchBox, Hub, ProtoBar, Shell) get CRM additions **only with the switch on**; with it off every CountyLens board is unchanged (checked by a pixel comparison of all 106 CountyLens boards; see the CountyLens handoff, Appendix B).
- Earlier decisions apply where the CRM reuses a component: contractor badge’s five states and “as printed on permit” (AD-05), BBB Rated / Not found / Blocked / Not checked (AD-07), permit class + “source says {word}” (AD-08), the agent’s Working… then the full answer at once, Took too long at 25 s (AD-09).
- Sample data stays a placeholder (#123); the three sample leads come from existing rows (101, 58, 3).
- Mobile first: 390, then 768 and 1440.

## 1. Site map

| Screen | URL | Boards | Reuses |
|---|---|---|---|
| Sign in · email + password, the admin test user (B-01), no sign-up, no forgot-password (not the CountyLens admin email code) | `/sign-in?next=` | `CrmSignIn390/768/1440`; states `CrmSignInLoading390` (signing in), `CrmSignInError390` (wrong email or password), `CrmSignInLocked390` (too many attempts), `CrmSignInExpired390` (session expired, returns to a filtered Leads link), `CrmSignInSignedOut390` | AdminSignIn layout pattern |
| Map, the home screen · whole Travis County until a centre is picked | `/map` (county) · `/map?at=&r=&roof=&permit=&open=&sort=` | `CrmMap390/768/1440`; states `CrmMapTiles390`, `CrmMapFailed390`, `CrmMapNoResults390`, `CrmMapPartial390`, `CrmMapIndexDown390` | Explore with the switch on |
| GPS and pin drop | same URL; `at` from GPS or the pin | `CrmGpsStates` (all states, drawn and linked); live: `CrmMapGpsExplain390`, `CrmMapLocating390`, `CrmMapGps390/768/1440`, `CrmMapGpsLow390`, `CrmMapGpsDenied390`, `CrmMapGpsUnavailable390`, `CrmMapGpsOutside390`, `CrmMapPinMode390/1440`, `CrmMapPin390/1440`, `CrmMapPinMove1440`, `CrmMapPinOutside390` | Explore map, radius ring, radius card |
| Field triage · 390 (signature moment #3) | `/map?triage=1` | `CrmTriage390`; `CrmTriageSwipe390`, `CrmTriageLead390`, `CrmTriageLoading390`, `CrmTriageFailed390`, `CrmTriageOffline390`, `CrmTriageEnd390`, `CrmTriageEmpty390` | Result cards, lead kit, PropertyDetail drawer |
| Candidate list · the List view of the CRM map | `/map?view=list` (same filters as the map) | `CrmCandidates390/768/1440`, `CrmCandidatesConfirm390/1440`, `CrmCandidatesCreated390`, `CrmCandidatesHide1440` | Explore list and table, Pager |
| Property drawer (CRM order, on PropertyDetail) | `/map?sel={property_cid}` | `CrmProperty390/768/1440`; states `CrmPropertyCreating390`, `CrmPropertyCreated390`, `CrmPropertyDup390`, `CrmPropertyFailed390/1440`, `CrmPropertyPartial390` | PropertyDetail with the switch on; ContractorBadge rules |
| Create lead · one tap, duplicate refused | snackbar, no form | `CrmLeadCreate390/768/1440` (created, Add a note), `CrmLeadDup390/1440` (refused) | Atlas snackbar, bottom sheet |
| Ask the agent (§4.7) | `/map?mode=ai&q=` | `CrmAsk390/768/1440`, `CrmAskConfirm390/1440`, `CrmAskCreated390`; states `CrmAskWorking390`, `CrmAskSlow390`, `CrmAskNoResults390`, `CrmAskLowConf390`, `CrmAskOutside390`, `CrmAskNotFound390`, `CrmAskCreateFailed390`, `CrmAskThrottled390`, `CrmAskPaused390`. The earlier `CrmAgent…` boards are kept unchanged but no longer linked | Explore AI mode with the switch on (AD-09) |
| Leads list · the CRM's own lead records (§4.5) | `/leads?status=&assignee=&roof=&permit=&openYrs=&place=&r=&sort=&page=` | `CrmLeads390/768/1440`, `CrmLeadsFiltered1440` (combined filters from a link), `CrmLeadsPaged1440` and `CrmLeadsPaged390` (paged, B-08), `CrmLeadsAllReps390` (sales-manager view); states `CrmLeadsStates`, `CrmLeadsLoading390`, `CrmLeadsEmpty390`, `CrmLeadsNoMatch390`, `CrmLeadsError390`, `CrmLeadsPartial390` | Map filter chips, Area picker and radius, Pager, ContractorBadge rules |
| Lead (§4.6) · 1440 beside the Leads list; 768 and 390 a full page | `/leads/{id}` | `CrmLead390/768/1440`, `CrmLeadChanged390` (Now column); states `CrmLeadStates`, `CrmLeadLoading390`, `CrmLeadSaving390`, `CrmLeadSaveFailed390`, `CrmLeadDeleted390`, `CrmLeadStale390`, `CrmLeadElsewhere390`. The earlier `CrmLeadDetail…` boards are kept unchanged but no longer linked | Leads list, ContractorBadge rules, PropertyDetail drawer |
| Shell · top bar, navigation, data source | every screen | `CrmShell1440` (account menu open), `CrmShellData1440` (data panel), `CrmShell390` (More open); components `CrmDataChip`, `CrmAccount`, `CrmBottomNav` | Top app bar, rail, bottom nav |
| Coming-soon section · Campaigns, Estimates, Jobs, Invoices, Outreach | `/campaigns`, `/estimates`, `/jobs`, `/invoices`, `/outreach` (prototype `?section=`) | `CrmComingSoon390/768/1440` | CountyLens Coming-soon card (`Shell390ComingSoon`) |
| States overviews | – | `CrmMapStates`, `CrmGpsStates`, `CrmCandidatesStates`, `CrmTriageStates`, `CrmLeadsStates`, `CrmLeadStates`, `CrmAskStates` (`CrmAgentStates` kept) | ExploreStates, HelperStates patterns |

**Top bar (768, 1440):** Roofing CRM · the existing location switcher (Travis County, TX live; other counties Coming soon, unchanged) · the universal search box (modes Map · Filters · AI) · data-source chip · Apps (opens the app switcher menu: CountyLens, Roofing CRM ✓, Landing page; E-94) · account menu (Sample Rep, role “Admin”, Sign out). Help and Ask are CountyLens-only and are hidden in the CRM. **390:** title, location, compact data chip (“Run 3”), account.

**Navigation:** **768 and 1440** rail: Map (home; Filters and AI nested under it), Leads, then a **Coming soon** group: Campaigns, Estimates, Jobs, Invoices, Outreach. **390** bottom bar: Map · Leads · Ask · More; More is a sheet with the five Coming-soon sections (each with its line), Apps and Sign out. Runs, Coverage, Data, Builder, SQL and Admin are not in the CRM.

**Coming-soon items** reuse the **CountyLens coming-soon row** (the location picker’s: on-surface-variant text and the Atlas `atlas-pill--unavailable` pill, not the 38 % disabled opacity). In the 768 and 1440 rail each is a rail item with a “Soon” pill; in the 390 More sheet each is the full row (icon, name, one line, “Coming soon” pill). Each links to its Coming-soon page and carries a one-line tooltip, also read to screen readers: Campaigns · plan outreach to groups of leads; Estimates · price a roof from the lead; Jobs · schedule and track roofing work; Invoices · bill completed jobs; Outreach · email and SMS to owners. Opening one of their URLs shows the Coming-soon page with **Back to Map**; an unknown section says there is no section there.

**Data-source chip:** “Data: CountyLens Run {n}” opens a panel: “The lead index is built from the CountyLens manifest {CID} on {date}. The CRM reads only published CountyLens data.” with the CID copyable and a link to CountyLens Data. States: index up to date · newer run available (“Index updating to Run {n}”; results stay on the current run until it finishes) · index unavailable (leads and notes still open; Retry).

**Sign-in and session:** email + password for the admin test user (one shared login, role Admin; B-01); Show password toggle; filled Sign in; plain text “No account? Access is shared privately with reviewers.” (no link). Wrong email or password never says which. Three wrong tries: “Too many attempts. Try again later.” with the form disabled. Session expired: “Signed out. Sign in to continue where you left off”. Signing out from the account menu or More opens “You signed out.” After sign-in the user returns to the URL they asked for (`next`, CRM routes only, so no open redirect): a shared Leads link opens with its filters, because every Leads filter, the sort and the page live in the URL (§4.5). Signed in stays signed in after a reload. Prototype: the session is kept in this browser (`countylens.proto.crmSession`); any 8+ character password works for `sample.rep@example.com`; the Leads board's “Open this link signed out” control shows the round-trip.

## 2. Flows (board `CrmFlows`)

| Flow | Steps |
|---|---|
| **Field · 390 (main)** | Sign in → map on Travis County → **Use my location** (explain → locating → “You are here (±12 m)”, 5 mi ring; off → Drop pin; outside → Go to Travis County) → drag the ring or the slider → **Triage {n}** → swipe right to create, left to skip (buttons and keys too, Undo each time) → end: “{n} leads created, {m} skipped” → Open Leads. |
| **Desk · 1440** | Map → **Drop pin** → results around the pin → Filters: roof 15 → 25, open or stalled, open ≥ 5 yrs, radius → List: select 3 → **Create 3 leads** (confirmation, duplicates skipped) → drawer: permit, contractor as printed + badge, BBB → Create lead from the property or from one permit. |
| **Agent** | “Show me open roofing permits older than five years within five miles of Pflugerville” → Working… (timer, Cancel) → answer with claims and citations ↔ numbered pins → Create lead per row · Create leads for all {n} · Show on map → “make leads of the top 3” → confirmation card → Create → created from Agent. Took too long at 25 s; rate-limited; paused. |
| **Lead follow-up** | Leads → combined filters (status, assignee, roof, permit, open ≥, within r mi of an Area; all in the URL) → Copy link / Show on map → Lead (beside the list at 1440) → status menu, assignee menu, Add note → History → reload keeps them. |

### 2.1 Clickable demo walk

Every interaction below works on the canvas (checked by `clickflow`, `mapflow`, `candflow`, `triflow`, `leadsflow`, `leadflow`, `askflow`):

1. **Sign in → map:** `CrmSignIn1440` (any 8+ character password for `sample.rep@example.com`) → `CrmMap1440` on Travis County.
2. **Use my location:** explain → Continue → Finding your location… → You are here, ring around you (`CrmMap390`). Denied path: `CrmMapGpsDenied390` → Drop pin → crosshair.
3. **Drop pin:** click the map at 1440 (drag it, or move it with the arrow keys); at 390 the crosshair and **Place pin here**, or a long-press.
4. **Radius:** drag the ring handle, or the slider and number field up to 25 mi (`CrmMapPin1440`).
5. **Roof age 15 → 25** changes the count; **permit filter** Open / Stalled with Open ≥ 5 yrs switches the sort to **Permit open (longest)**.
6. **Drawer → Create lead → Already a lead:** `CrmProperty1440` · Create lead → snackbar with Undo, Open lead, Add a note → the drawer reads “Already a lead · New”.
7. **Select 3 candidates → Create 3 leads:** `CrmCandidates1440` → confirmation sheet (duplicates skipped) → “2 leads created · 1 already a lead” with Undo and Open Leads.
8. **Triage:** `CrmTriage390` · swipe right creates, left skips, or Skip / Create lead / Open details; every action has Undo.
9. **Leads filters update the URL note:** `CrmLeads1440` · each filter, the sort and the page change the URL line and the address bar.
10. **Lead status and Add note appear in History:** `CrmLead1440` · status menu → History “Status: New → Contacted”; Save a note → History “Note added”.
11. **Agent:** `CrmAsk1440` · Show on map (numbered pins) → Create leads for all 4 → confirmation card → Create → “2 leads created · 2 already leads”.
12. **Coming soon:** each of Campaigns, Estimates, Jobs, Invoices, Outreach shows its tooltip on hover or focus and opens its Coming-soon page on click; `CrmComingSoon{390|768|1440}?section=…` shows its page with Back to Map.
13. **App switcher:** the Apps button (1440, 768) opens an Atlas menu (CountyLens, Roofing CRM ✓, Landing page); at 390 the same three rows sit under Apps in the More sheet. Landing page opens the Hub. Escape closes the menu and returns focus (E-94).

## 3. Demo lines D-1 to D-9 → screen and state

Two states of the data. **Ships first** is the state the real Travis County data supports today: Task A’s contract v1 has no street address and no contractor name, so the first build ships the NoAddress and NoContractor boards. **Field-present** is the state shown once the fields appear in the manifest (contract v1.1, a later Task A story); the normal boards (`CrmProperty1440`, `CrmLeads1440`, …) show sample addresses and “as printed on permit” for that state. The prototype `?v1=addr` / `?v1=ctr` switch only opens the first state on the canvas; it is prototype-only and never ships.

| Line | What the demo shows (summary; exact wording in the assignment README) | Screen | Ships first (no address, no contractor name) | Field-present state |
|---|---|---|---|---|
| D-1 | Sign in with the shared test login; the map opens on Travis County | Sign in → Map (home) | `CrmSignIn390` → `CrmMap390` (no property rows; same in both states) | `CrmMap1440`, `CrmMap768` |
| D-2 | Centre a radius search on GPS or a dropped pin (location off → drop a pin) | Map · GPS and pin | `CrmMapNoAddress390` · pin dropped, map card with TCAD id; GPS boards are the same in both states: `CrmMapGps390`, `CrmMapGpsDenied390`, `CrmGpsStates` | `CrmMapPin390` / `CrmMapPin1440` · pin |
| D-3 | Set the radius and roof age; roof age 15 → 25 changes the count | Map · Filters and radius | `CrmMapNoAddress390` · rows by TCAD id; `CrmMapStates` | `CrmMapPin1440` · roof chips and radius 0.5–25 mi |
| D-4 | Open or stalled permits, open ≥ 5 yrs, longest open first; candidates as a list (and triage at 390) | Candidate list · Field triage | `CrmCandidatesNoAddress390` · rows; `CrmTriageNoAddress390` · card; `CrmTriageNoContractor390` · card | `CrmCandidates1440` · Permit open (longest); `CrmTriage390` · cards |
| D-5 | Property details: permit class and derived status (“Stalled · derived: no status in source”), open years, contractor (or “Contractor not published” with its reason) with Resolved / Unresolved, BBB state or its reason, never a score | Property drawer | `CrmPropertyNoAddress390` / `CrmPropertyNoAddress1440` · header; `CrmPropertyNoContractor390` · permits | `CrmProperty1440` / `CrmProperty390` · address and “as printed on permit” |
| D-6 | Create a lead from the property or one permit; a property is a lead only once; bulk create skips duplicates | Create lead | `CrmPropertyNoAddress390` · created with the fallback title (Copy, Open lead and snackbars use it) | `CrmLeadCreate390` · created; `CrmPropertyDup390` / `CrmLeadDup1440` · already a lead; `CrmCandidatesConfirm1440` → `CrmCandidatesCreated390` · Create 3 leads |
| D-7 | Ask the agent: answer with citations and numbered pins; leads only after confirmation | Ask the agent | `CrmAskNoAddress390` / `CrmAskNoContractor390` · honest stalled-only answer, widen chip | `CrmAsk1440` · answered; `CrmAskConfirm1440` · confirmation card; `CrmAskCreated390` · created from Agent |
| D-8 | Leads list filtered by status, roof age, permit status and radius; lead status and notes with history | Leads list → Lead | `CrmLeadsNoAddress390` / `CrmLeadsNoAddress1440`, `CrmLeadsNoContractor390` / `CrmLeadsNoContractor1440` · list; `CrmLeadNoAddress390`, `CrmLeadNoContractor390` · Lead | `CrmLeadsFiltered1440` · combined filters; `CrmLead1440` · status, assignee, notes, history |
| D-9 | Future sections (Campaigns, Estimates, Jobs, Invoices, Outreach) are visible but not available | Coming-soon sections | Same in both states | Rail and More sheet · tooltips; `CrmComingSoon1440?section=campaigns` (390, 768) · coming-soon page |

### 3.1 Task B brief items B-01 to B-10 → boards

Each Task B item from the design brief, with the boards and states that show it and the acceptance flow that checks it.

| Item | What it needs | Boards · state | Checked by |
|---|---|---|---|
| B-01 Sign-in | The admin test user (one shared login, role Admin); wrong password; signed out | `CrmSignIn390/768/1440` (form, test-user hint) · `CrmSignInError390` (wrong email or password, never says which) · `CrmSignInSignedOut390` · also `CrmSignInLoading390`, `CrmSignInLocked390`, `CrmSignInExpired390` | clickflow (sign in → map), shellflow |
| B-03 GPS permission | Asking; denied falls back to a dropped pin; position outside Travis County | Asking: `CrmMapGpsExplain390` (explain first) → `CrmMapLocating390` · Denied: `CrmMapGpsDenied390` → Drop pin → `CrmMapPinMode390` (crosshair) → `CrmMapPin390` · Outside: `CrmMapGpsOutside390` · also `CrmMapGpsLow390`, `CrmMapGpsUnavailable390`, `CrmMapPinOutside390` · board `CrmGpsStates` | clickflow, mapflow |
| B-06 Lineage and Hub | “View lineage in Explorer” from the drawer to CountyLens; Apps back to the Hub | `CrmProperty390/768/1440`: View lineage in Explorer → CountyLens `Property390/1440?mapView=off&pid=…` (switch off) · the Apps menu in the top bar (`CrmShellApps1440`) and the 390 More sheet (`CrmShell390`) → Landing page = `Hub` | clickflow (Apps menu → Landing page at 1440 and 390), v1flow (menu, Escape, focus), candflow |
| B-07 Leads | Create from the drawer, the list, the AI answer and mobile triage (swipe right = create, Undo); “Already a lead”; lead detail with status, assignee, notes, history | Drawer: `CrmProperty*` → `CrmLeadCreate390/768/1440`, `CrmPropertyCreated390` · List: `CrmCandidates1440` → `CrmCandidatesConfirm390/1440` → `CrmCandidatesCreated390` · AI: `CrmAsk390/768/1440` → `CrmAskConfirm390/1440` → `CrmAskCreated390` · Triage: `CrmTriage390`, `CrmTriageSwipe390` (right = create, Undo) · Already a lead: `CrmLeadDup390/1440`, `CrmPropertyDup390`, `CrmTriageLead390`, skipped rows in the confirmations · Detail: `CrmLead390/768/1440` + `CrmLeadStates` | candflow, triflow, askflow, leadflow |
| B-08 Lead list | Combined filters kept in the URL; paged | `CrmLeads390/768/1440` · `CrmLeadsFiltered1440` (combined filters from a link) · `CrmLeadsPaged1440` (page 2 of 4) · `CrmLeadsPaged390` (combined filters, page 2 of 6) · `CrmLeadsAllReps390`, `CrmLeadsNoMatch390` | leadsflow, pagedflow |
| B-09 Agent Create lead | The agent’s Create lead action and its confirmation before anything is created | `CrmAsk1440` (Create lead per row, Create leads for all) → `CrmAskConfirm1440/390` (“Create 2 leads? 2 are already leads and will be skipped”) → `CrmAskCreated390` · `CrmAskCreateFailed390` | askflow, clickflow |
| B-10 Disabled sections | Campaigns, Estimates, Jobs, Invoices, Outreach in the CRM navigation, reusing the CountyLens coming-soon row | 768/1440 rail “Coming soon” group and the 390 More sheet (`CrmShell1440`, `CrmShell390`, every Crm board): the CountyLens coming-soon row (on-surface-variant text, `atlas-pill--unavailable`, tooltip) → `CrmComingSoon390/768/1440?section=…` | clickflow, shellflow |

## 4. Screens

> **Which state ships first.** Real Travis County data has no street address and no contractor name until Task A publishes them (contract v1.1). The first build ships the **NoAddress** and **NoContractor** boards; the normal boards (sample addresses, “as printed on permit”) are the **field-present** state shown once the fields appear in the manifest. The prototype `?v1=addr` / `?v1=ctr` switch is prototype-only.

### 4.1 Leads (records owned by the CRM)

- **One lead per property.** A second create is refused with “Already a lead · {status} · {assignee}” and Open lead; bulk create and the agent list existing leads as skipped.
- **Statuses:** New · Contacted · Qualified · Won · Lost, each with an icon and label.
- **Outreach and estimates** are not in this release: “Send message” (Outreach · Soon) and “Create estimate” (Estimates · Soon) are disabled with tooltips; nothing is sent.
- **Prototype only:** leads live in this browser (`countylens.proto.crmLeads`), seeded with three sample leads; Reset sample leads restores them. The build keeps leads in the CRM lead store.

### 4.2 The CRM home map

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

### 4.3 Candidate list, the CRM property drawer and creating leads

- **Candidate list** is the List view of the CRM map: the same matches and filters, the existing table (cards at 390) and Pager. CRM only: a checkbox per row and the selection bar **Create {n} leads**; a **Lead · {status}** pill on rows that are already leads; a **Hide existing leads** toggle in the list header (“Existing leads hidden (n)”); the “Why is this a match?” chip reads **Why is this a lead?** (roof age + basis + confidence; permit class + open years + “source says {word}”).
- **Bulk create** opens a confirmation sheet listing each selected address with its main signal (the open or stalled permit when there is one, else the roof). Rows that are already leads show “Already a lead · {status} · skipped”. Result: snackbar “{n} leads created · {m} already leads” with **Undo** and **Open Leads**.
- **Property drawer (CRM).** From the map, the list and the agent, the drawer embeds **PropertyDetail** in a sales order: address and lead status on top; then **Create lead** (filled) or “Already a lead · {status} · {assignee}” with **Open lead**; Roof (age, basis, confidence; when unknown, the reason); Permits (class, source word, issue date, open duration, contractor “as printed on permit” with the ContractorBadge variants, BBB in one of its four states, a source link per permit, and **Create lead from this permit** on open or stalled permits, which records that permit as the lead’s main signal); Owner as today. **View lineage in Explorer** replaces “Open in CRM” and opens the CountyLens property page in a new tab (signature moment #8); Metadata, Merged from and the location collapse under “Lineage”. With the switch off, PropertyDetail and the Explore drawer are unchanged.
- **Creating a lead** is one tap, no form: status New, assignee = me, origin Map, List, Agent or Property page. The button shows “Creating…”, then a snackbar **Lead created · {id}** with **Undo**, **Open lead** and **Add a note** (expands with a note field: Skip, Save note). A property is a lead only once: a second try is refused with “Already a lead · {status} · {assignee}” and Open lead. **Create failed** shows in place with **Try again**; at 390 offline: “You’re offline. The lead was not saved.” **Partial data** (roof age unknown, or no permit data) still lets the rep create the lead; the missing signal says why and links CountyLens Coverage where permits are not published.
- **Prototype only:** leads live in this browser (`countylens.proto.crmLeads`); demo boards set states with `crm-demo` (creating, created, failed) and `crm-fail` (error, offline: the first try fails, Try again succeeds). The build creates leads in the CRM lead store with an idempotent create keyed on the property, so a double tap never makes two.

### 4.4 Field triage at 390 (signature moment #3)

- **Start:** “Triage {n}” in the CRM map’s results sheet (390) turns the current results, in the current sort, into a stack of cards. The sheet gives way to the triage panel; a 100 px map strip stays above it, centred on the current card’s marker, which is ringed (`is-tri`). Back to map leaves triage at any time.
- **Card:** address and city · type; distance and bearing from the pin (or “from you” with GPS); roof age with basis and confidence; the main permit signal with “Open > 5 yrs”; contractor “as printed” with its badge; BBB state; “Why is this a lead?” chips (roof ≥ the filter, permit class and source word, distance ≤ the ring). A lead shows “Already a lead · {status} · {id}” and offers only Skip and Open lead.
- **Actions:** swipe right = create lead (status New, assigned to you, origin Map, main signal the open or stalled permit, else the roof); swipe left = skip. A drag shows a “Create lead” or “Skip” stamp; past 96 px it commits, otherwise the card snaps back. Every swipe or button shows a snackbar with **Undo** (Undo removes the new lead and brings the card back). Buttons Skip, Create lead and Open details do the same; with the card focused, ← skips, → creates and Enter opens details; a polite live region announces “Card {k} of {n}: {address}…”.
- **End of stack:** “{n} leads created, {m} skipped” with Open Leads and Back to map.
- **States:** loading the next card (skeleton), empty ring (“No candidates in this ring” with Widen to N mi and Roof ≥ M yrs), create failed (the card returns with Try again), offline (banner: Skip still works; Create returns the card with “You’re offline. The lead was not saved.”). Reduced motion (system setting or the motion switch): cards change without the fling.

### 4.5 Leads list (combined filters in the URL)

- **What it lists:** the CRM's own lead records (not the candidate list). 1440: a paged table (Pager, 8 per page): address (+ city, lead id), status pill, assignee, roof age + basis and confidence, main permit (class, open years, derived status, AD-08), contractor as printed with its badge (AD-05), Mi from the area centre (only when a radius filter is on), created from (Map, List or Agent), last activity (latest history or note, with what it was), created. 768: Lead (with “from {origin}”), Status (with assignee), Roof, Main permit, Mi, Last activity. 390: paged lead cards (3 per page) with the same fields stacked and a sticky header with the count, Copy link, Show on map and the active filter chips (each opens Filters). Row or card click opens Lead detail.
- **Filters combine,** in the map's chip style: Status (multi-select), Assignee (Me · All reps · a name; All reps is the sales-manager view), Roof age ≥ (Any, 15, 20, 25), Permit status (Open and Stalled combine; none = Any; picking an open duration turns both on), Permit open ≥ (Any, 1, 3, 5, 10 yrs), Within r mi of {Area} (the Area picker and the radius control, 0.5–25 mi). A plain-English sentence above the list: “{n} leads · New or Contacted · roof ≥ 15 yrs · open or stalled permit open ≥ 5 yrs · within 5 mi of {place}”. Clear filters resets everything. Sort: last activity (default), roof age, permit open, nearest (needs an area).
- **URL:** `/leads?status=new,contacted&assignee=all&roof=15&permit=open,stalled&openYrs=5&place={id}&r=5&sort=near&page=2`; defaults are left out, and reload, back and **Copy link** reopen the same list. Opening a link signed out goes to sign-in and returns to the same filtered list (`next`, CRM routes only). **Show on map** opens the CRM map on the whole county with only the filtered leads and a “{n} leads from your Leads list” chip that clears back to all candidates. A board note shows the URL.
- **Paging (B-08):** 8 per page at 1440 and 768, 3 at 390, with the shared Pager; `page` is in the URL with the filters, and changing a filter or the sort returns to page 1. `CrmLeadsPaged1440`: all reps, page 2 of 4. `CrmLeadsPaged390`: New + Contacted, roof ≥ 15, all reps, page 2 of 6.
- **States:** loading, no leads yet (“Create your first lead from the map” + Go to map), no leads match these filters (+ Clear filters), error (Retry; filters kept), partial: a lead whose property is missing from the newer run keeps its snapshot (“Property not in Run {n}; the lead keeps its snapshot”).
- **Prototype only:** the Area centres reuse Explore's sample places; distances come from the leads' sample positions; the assignee names other than Sample Rep are placeholders; **Add a team’s leads** (prototype bar; on by default on the Paged boards) adds 23 placeholder leads from three reps so the list pages. They are kept apart from the shared lead store (`team=1` in the URL, T- lead ids), and Reset sample leads removes them; the newer run in the partial state is shown as Run 4. **Open this link signed out** stands in for a real expired session (the boards don't check the session on open).

### 4.6 Lead (status, assignee, notes, history)

- **Layout:** 1440 shows the Leads list (my leads, last activity first, the open one marked) on the left and the lead on the right; 768 and 390 are a full page with **Back to Leads**. Every lead link in the CRM (Leads rows, snackbars, the drawer, search, triage) opens this page.
- **Header:** address; **status** menu (New, Contacted, Qualified, Won, Lost, each with icon and label, not colour alone); **assignee** menu (Me or a team member); created from (Map, List, Agent, Property page) and date; **Show on map** (the map with this lead), **View property** (CRM map with the drawer open), **View lineage in Explorer** (new tab).
- **Signals at creation:** roof age + basis + confidence, main permit (class, source word, open years, permit id), contractor as printed with its badge (AD-05), BBB state (AD-07), with “From CountyLens Run {n} · manifest {CID}”. If a newer run changed a signal, a **Now · Run {m}** column shows it with a Changed pill (sample: L-1040 was saved from Run 2; its permit was finaled in Run 3); otherwise “No change since this lead was created”. The lead references the property and permit; owner details are read from the property when opened, never copied into the lead.
- **Notes:** an add-note box with **Save**; the list newest first with author and time. **History:** a timeline of every change (created, status from → to, assignee from → to, note added) with who and when, newest first.
- **Saving:** each change saves at once, optimistically: “Saving…”, then “Saved”. A failed save undoes the change and offers Try again; a failed note keeps its text in the box. Another session changing the lead raises “This lead was updated by {name}. Reload to see the latest.”
- **Future sections:** “Send message” (Outreach · Soon) and “Create estimate” (Estimates · Soon) are disabled with a tooltip and a visible line; nothing is sent.
- **Prototype only:** changes persist in this browser (reload keeps them); **Next save fails** on the state bar forces the failure path; the team names other than Sample Rep, the deleted-by line and the Run 2 → Run 3 change are samples.

### 4.7 Ask the agent (answer, map, create lead)

- **One agent UI.** The CRM agent is Explore's AI mode with the switch on. Reused as is: Working… with elapsed timer and Cancel, the full answer at once (AD-09), How I read this, numbered citations that match numbered map pins, editable assumption chips that re-run the query, the missing-data note, Took too long. The rail **AI**, the 390 **Ask** tab, PropertyDetail's Ask and the ProtoBar open `CrmAsk`.
- **Signed in, no counter.** The “n of 10 AI questions left this session” counter is hidden in the CRM; the daily-budget pause and the rate limit (“Too many questions in a short time”, countdown, Find disabled) stay.
- **Worked example:** “Show me open roofing permits older than five years within five miles of Pflugerville” reads as Centre Pflugerville · within 5 mi · open = not finaled · **Open ≥ 5 yrs** (permit age in words becomes this chip). The answer is honest about what the data holds (real data near Pflugerville has no open roofing permits, only stalled ones) and has a “Widen to {2r} mi” chip. It is written as claims, each with a citation: “No open permits match. 4 stalled permits do (sample rows) within 5 mi of Pflugerville city hall [1–3]: the source has no status for them, so they read as stalled (derived). The longest is 101 Sample Ln: Stalled 6.4 yrs · derived: no status in source [2].” Each row: permit class (stalled is derived) and open years (AD-08), contractor as printed with its badge (AD-05), BBB state (AD-07) and, for matches on a published field, “Matched on permit type: Reroof” as the retrieval evidence. Where part of the area has no permit data the answer says so and links the coverage note.
- **Leads:** each row has **Create lead** (one tap, origin Agent) or **Already a lead · {status}**; the answer has **Create leads for all {n}** and **Show on map** (numbered pins; at 390 the sheet steps aside). Asking in words (“make leads of the top 3”) never creates anything: the agent replies with a confirmation card listing the properties (“Create 1 lead? 2 are already leads and will be skipped.”, Create and Cancel). After Create: “{n} leads created · {m} already leads” with Open Leads, and the lead snackbar with Undo. Leads made here show “created from Agent”.
- **States:** no results (“I found no properties that match. Try a bigger radius or a lower roof age.” with chips that do that), low confidence (“I’m not confident in these matches: {reason}”, sample reason: roof ages from year built only), place outside Travis County or not found (nothing runs; chips for known places), create failed from chat (card stays with the error; Create again retries), rate-limited, AI paused.
- **Prototype only:** keyword rules stand in for the model (as in CountyLens AI); the permit-text snippet, the outside-county place list and the throttle seconds are samples. The build's agent proposes leads through the create-lead tool and the UI asks the user to confirm (B-09); the agent never writes leads by itself.

## 5. Lead fields shown on screen

| Field | Shown on | Notes |
|---|---|---|
| Lead id (`L-1042`) | Leads rows and cards, Lead header, snackbars, citations, triage | Assigned by the CRM lead store |
| Property (`property_cid`) and address | Every lead view; View property, Show on map, View lineage in Explorer | The lead **references** the property; owner details are read from the property, never copied |
| Main permit reference | Lead signals (“Roofing permit 2020-047812 BP”) | Set when the lead is created from a permit |
| Status | Pill with icon and label (New, Contacted, Qualified, Won, Lost) on Leads, Lead, map markers (line style), citations, cards | Status menu on the Lead page; every change in History |
| Assignee | Leads (column, filter Me / All reps / name), Lead header menu | Defaults to the signed-in rep |
| Created from | Leads “From” column, Lead header | Map, List, Agent or Property page |
| Created | Leads, Lead header | Date and time |
| Last activity | Leads (sort and column) | Latest history or note |
| Notes | Lead · Notes, newest first | Text, author, time; Save; a failed save keeps the text |
| History | Lead · History timeline, newest first | Created, status from → to, assignee from → to, note added; who and when |
| Signals snapshot | Lead · Signals at creation; Leads columns | Roof age + basis + confidence, permit class + source word + open years, contractor as printed + identity badge, BBB state |
| Source run and manifest CID | Lead · “From CountyLens Run {n} · manifest {CID}”; data chip and panel | A newer run's changes show in the **Now** column; otherwise “No change since this lead was created” |

## 6. URL state

**CRM map** (`/map`, the home screen; all keys optional, defaults left out):

| Key | Meaning | Example |
|---|---|---|
| `at` | Centre: lat,lon from GPS, a dropped pin or an Area; none = whole Travis County | `at=30.4394,-97.6200` |
| `place` | Area picker id instead of `at` | `place=pf` |
| `r` | Radius in miles, 0.5–25 | `r=5` |
| `roof` | Roof age ≥ N yrs | `roof=15` |
| `permit` | `open`, `stalled` or both | `permit=open,stalled` |
| `open` | Permit open ≥ N yrs | `open=5` |
| `sort` | `roof`, `open` (longest open) or `near` | `sort=open` |
| `view` | `map` (default) or `list` (candidate list) | `view=list` |
| `sel` | Property whose drawer is open | `sel={property_cid}` |
| `leads` | Show only these leads (from Leads › Show on map) | `leads=L-1042,L-1041` |
| `mode`, `q` | Agent mode and the question | `mode=ai&q=…` |
| `triage` | Field triage at 390 | `triage=1` |
| `layers` | Visible layers | `layers=roof,permits,leads,gaps` |

**Leads list** (`/leads`): `status` (any mix), `assignee` (`me` default, `all`, or a name), `roof`, `permit` (`open`, `stalled`, both), `openYrs`, `place` + `r`, `sort` (`activity`, `roof`, `open`, `near`), `page`. Example: `/leads?status=new,contacted&roof=15&permit=open,stalled&openYrs=5&place={id}&r=5&page=2`. Reload, back and **Copy link** reopen the same list; a signed-out link goes to sign-in and back (`next`, CRM routes only). **Lead:** `/leads/{id}`. **Sign in:** `/sign-in?next=`. **Coming soon:** `/campaigns`, `/estimates`, `/jobs`, `/invoices`, `/outreach`.

*Prototype:* boards use `.dc.html` names with the same keys (`CrmLeads1440.dc.html?status=…`, `CrmMap1440.dc.html?leads=…`, `?sel=`, `?crm=` presets); the map keys are a proposal for the CRM build.

## 7. Shared components the CRM uses (what each adds behind the switch)

| Board | Added only with the switch on |
|---|---|
| `Explore1440` (Explore 768, 390, Shell1440 and the ExploreQ boards inherit) | GPS control and its states; Drop a pin; Recentre uses a separate icon; Residential/Commercial on cards, rows and the drawer; lead mark on cards, rows, citations and markers (ring); legend lines "ringed = already a lead" and "Permits: City of Austin only, as published (Run 3)"; Create lead on expanded cards, in the drawer (property or permit) and on citations; selection bar "Create n leads" and the same on the map selection chip; the create-lead sheet; CRM top bar (data chip and account menu replace Help and Ask; `Shell1440` opens the account menu where it opened Help); rail Leads plus the Coming-soon group; bottom bar `CrmBottomNav` (Map · Leads · Ask · More sheet); 3 citations on desktop (each carries a lead action); ProtoBar CRM jump group; `?leads={ids}` from Leads › Show on map (whole county, only those leads, a chip to clear); `?sel={property}` from Lead › View property (opens the CRM drawer); lead links open `CrmLead`; the CRM home map (§4.2): whole-county view, complete GPS states and the 390 Locate chip, Drop pin (click, drag, arrow keys, crosshair, long-press), radius 0.5–25 mi, the CRM filter set and sort, live layers, the coverage note and the map states. Shared markup touched with the switch off renders the same (filters panel, sort menu, no-results copy, list header, cards) |
| `PropertyDetail` (Property boards inherit; Explore’s drawer embeds it in the CRM) | The CRM drawer (§4.3): lead status and Create lead or Already a lead on top, Roof, Permits with Create lead from this permit and a source link, Owner, View lineage in Explorer instead of Open in CRM, Metadata and Merged from collapsed. Switch off: the CountyLens content, unchanged |
| `SearchBox` | A **Lead** match group (lead number or address) |
| `Hub1440` (768, 390 inherit) | The CRM card's prototype link opens `CrmMap`. Text only, switch-independent: the scope line and, when live, Open → `CrmSignIn` (CountyLens handoff §4.0.1) |
| `ProtoBar` | "Roofing CRM boards" jump group (Map, Leads, Agent, Shell, Coming-soon page, Sign in) when the switch is on or the board is a Crm board |
| `CrmBottomNav`, `CrmAccount`, `CrmDataChip` | CRM-only components: 390 bottom bar and More sheet, account menu, data-source chip and panel. Escape closes their menus and sheets and returns focus; Coming-soon items stay hoverable for their tooltip |
| `Explore1440` · agent (AI mode) | The CRM agent (§4.7): no session counter (paused and rate-limited kept), permit age in words, contractor badge + BBB + permit-text evidence per cited row, Create lead / Create leads for all {n} with a confirmation card, Show on map, no-results / low-confidence / place states |
| `Explore1440` · accessibility (`crm-on` class, switch on only) | 48 px hit areas, 24 px marker hit areas, 3:1 hexagon and cluster edges, lead status by line style, the A-4 key hint, dialog focus trap + Escape (§10) |
| `ContractorBadge`, `Pager` | No change; reused as they are |

## 8. Extensions log, E-49 onward (CRM · not Task A)

| Entry | What it is | Why | Boards |
|---|---|---|---|
| E-49 GPS control · CRM · not Task A | Map control “Use my location” with states: finding your location (spinner), you are here (blue dot, ±12 m, radius around you), location off → Drop a pin, outside Travis County → Recentre on Travis County | README AC-2, intent SC-1 | CrmMapGps, CrmMapLocating, CrmMapGpsDenied, CrmMapGpsOutside |
| E-50 Pin drop · CRM · not Task A | Map control “Drop a pin”; the map shows a crosshair and a chip “Tap the map where you want the search centre” with Cancel; the dropped pin becomes the radius centre and the results update | README AC-2 | CrmMapPinMode, CrmMapPin |
| E-51 Property type · CRM · not Task A | Residential or Commercial with a home or storefront icon on cards, rows and the drawer header | Intent SC-2 | CrmMap, CrmProperty |
| E-52 Lead mark · CRM · not Task A | “Lead · {status}” pill (status colours) on cards, rows and citations; a tertiary ring on the map marker; legend line “ringed = already a lead” | Triage at a glance | CrmMap, CrmCandidates |
| E-53 Create-lead sheet · CRM · not Task A | Bottom sheet at 390, dialog at 768 and 1440: create from the property or its roofing permit, the signals saved with the lead (roof, basis, confidence, permit class + source word, contractor as printed on permit + badge, BBB), status New, owner, optional note; if the property is already a lead the sheet says so and links to it | AD-05, AD-07, AD-08 reused | CrmLeadCreate, CrmLeadDup, Explore drawer |
| E-54 Bulk create leads · CRM · not Task A | Selection bar above the candidate table (“Create n leads”) and the same action on the map selection chip; duplicates are skipped and counted in the snackbar | Intent SC-4: no duplicates | CrmCandidates |
| E-55 Lead status, notes and history · CRM · not Task A | Status as radio chips; notes newest first with author and time; history timeline; each change saves at once with a snackbar, a failed save keeps the text and offers Try again | Intent SC-4 | CrmLeadDetail |
| E-56 Leads filter bar · CRM · not Task A | Status chips (All, New, Contacted, Qualified, Won, Lost) and selects for roof age, permit status, open duration, radius and its origin (Area, GPS, pin), owner (manager view optional); 390 folds it behind a “Filters · n” button | README demo line 8 | CrmLeads |
| E-57 Disabled future sections · CRM · not Task A | More lists Campaigns, Estimates, Jobs, Invoices (“Coming soon”) and Outreach messages (“Mocked”) as disabled cards with a lock; lead detail has a disabled “Send message · mocked” button | README AC-11, demo line 9 | CrmComingSoon, CrmLeadDetail |
| E-58 CRM shell additions · CRM · not Task A | Rail and bottom nav Map · Leads · Ask · More, account icon (desktop/tablet), ProtoBar “Roofing CRM boards” jump group, Hub CRM card link, SearchBox “Lead” match group, Property detail Create lead / Open lead, all behind the Map view (CRM preview) switch | Rules 1–2: switch off leaves CountyLens unchanged | Explore, ProtoBar, Hub, SearchBox, PropertyDetail |
| E-59 Citation → Create lead · CRM · not Task A | Under each agent citation (CRM only): “Create lead”, or the lead pill when it is already a lead; desktop shows 3 citations so the actions fit | README demo line 7, AD-09 unchanged | CrmAgent, Explore · AI with the map on |
| E-60 CRM sign-in (revised in E-65) · CRM · not Task A | One shared test login (Amazon Cognito managed login), no self sign-up; states: form, signing in, wrong password, rate-limited, error, session expired, signed in with Sign out | Intent ASM-4 | CrmSignIn 390 / 768 / 1440 |
| E-61 CRM top bar and navigation · CRM · not Task A | Top bar: Roofing CRM, the existing location switcher (unchanged), the universal search box (Map · Filters · AI), data chip, Apps (opens the Hub), account menu; Help and Ask are CountyLens-only and hidden with the map on. Rail: Map with Filters and AI nested, Leads, then E-64. 390: bottom bar Map, Leads, Ask, More | Top app bar, nav rail, bottom nav | Explore with the map on, all Crm boards, CrmShell1440 / 390 |
| E-62 Data source chip and panel · CRM · not Task A | “Data: CountyLens Run {n}” chip in the top bar (390: compact “Run 3”); opens a panel: “The lead index is built from the CountyLens manifest {CID} on {date}. The CRM reads only published CountyLens data.”, copyable CID, link to CountyLens Data. States: up to date, newer run available (“Index updating to Run {n}”), index unavailable (with Retry) | Atlas chip, banner, atlas-cid | CrmDataChip, CrmShellData1440, CrmShell1440 gallery |
| E-63 Account menu · CRM · not Task A | Account icon button opens a menu: avatar, test user name, “Admin” role pill, email, “Shared test user”, Sign out (clears the session, opens Sign in · signed out) | Atlas menu and pill | CrmAccount; Shell1440 with the map on opens it |
| E-64 Coming-soon nav group · CRM · not Task A | Rail (768, 1440): “Coming soon” group under Leads with Campaigns, Estimates, Jobs, Invoices, Outreach; each visible, muted on-surface-variant (not the 38% disabled opacity) with the Atlas “unavailable” pill (“Soon”), a one-line tooltip and the same line for screen readers; it links to its Coming-soon page. 390: the bottom bar’s More sheet lists the five as the CountyLens coming-soon row (icon, name, one line, “Coming soon” pill), then Apps and Sign out | The CountyLens coming-soon row (location picker: list item, on-surface-variant text, atlas-pill--unavailable) | Explore with the map on, CrmShell1440 / 390, every standalone Crm board, CrmBottomNav |
| E-65 CRM sign-in, email and password · CRM · not Task A | Replaces E-60’s form: email, password with Show password toggle, filled Sign in; plain text “No account? Access is shared privately with reviewers.”; no sign-up link, no forgot-password flow. States: signing in, wrong email or password, too many attempts (try again later), session expired (“Signed out. Sign in to continue where you left off”), signed out by the user, already signed in. Returns to ?next= (CRM boards only); the session survives a reload | Not the CountyLens admin email code (E-32 unchanged) | CrmSignIn 390 / 768 / 1440, CrmSignInExpired390, CrmSignInSignedOut390, CrmSignInLoading / Error / Locked390 |
| E-66 Coming-soon section page · CRM · not Task A | For a disabled section’s URL (?section=campaigns, estimates, jobs, invoices, outreach): the CountyLens Coming-soon card (schedule icon, “{Section} is coming soon”, one line on what it will do, provenance line) with one filled action, Back to Map; an unknown section says so | Reuses Shell390ComingSoon’s card; nothing new in Atlas | CrmComingSoon 390 / 768 / 1440 |
| E-67 Whole-county home view · CRM · not Task A | With no area chosen the CRM map opens on Travis County zoomed out: hexagons and permit clusters, the county line with the outside area shaded, “Travis County (whole county)” in the Area picker, no ring yet, a card offering Use my location or Drop pin, and the header counting sample rows across the county (no new totals). Picking an area, a GPS fix or a pin zooms in and draws the ring | Location switcher and Area picker unchanged | CrmMap 390 / 768 / 1440 |
| E-68 GPS states, complete · CRM · not Task A | “Use my location” map control plus a Locate chip in the 390 sticky header. Explain before the browser asks, locating (spinner), located (blue dot with an accuracy circle; the ring centres on it), low accuracy over 500 m (“Location is approximate”), denied (“Location is off. Drop a pin or search a place instead.” with Drop pin), unavailable or timed out (Try again, Drop pin), outside Travis County (“Go to Travis County”) | Extends E-49 | CrmGpsStates and its live boards |
| E-69 Drop pin · CRM · not Task A | 1440 and 768: Drop pin, then click the map; the pin can be dragged or moved with the arrow keys. 390: Drop pin shows a fixed crosshair at the map centre with “Place pin here” and Cancel (pan the map under it); a long-press also drops the pin. A map label shows the pin’s latitude, longitude and nearest gazetteer place (“near Pflugerville”). A pin outside the county shows the outside message and goes back | Map controls, keyboard model A-4 | CrmMapPinMode, CrmMapPin, CrmMapPinMove1440, CrmMapPinOutside390 |
| E-70 CRM radius 0.5–25 mi · CRM · not Task A | Slider, number field and ring handle stay in sync and clamp at 0.5–25 mi in the CRM; CountyLens keeps 0.5–10 mi | Radius card, ring handle | Explore with the map on |
| E-71 CRM filter set and sort · CRM · not Task A | Roof age ≥ N (chips 10–25 plus an “Other” number field, default 15), Permit status Open · Stalled · Any, Permit open ≥ any / 1 / 3 / 5 / 10 yrs, with definitions; owner filters and owner suggestions stay CountyLens-only. Sort: Roof age (oldest), Permit open (longest), Nearest (needs a centre); a permit filter switches the default sort to Permit open until the rep picks one | Existing filter chips and sort menu | Explore Filters and sort with the map on |
| E-72 CRM map layers and coverage note · CRM · not Task A | Layers popover with four switches: Aged roofs (roof-age hexagons when zoomed out, live in the CRM; markers when zoomed in), Open and stalled permits (count clusters when zoomed out, coloured by open duration with --viz-permit-open-*; “5+” badge on markers and an “Open > 5 yrs” pill on cards), My leads (marker outline coloured by lead status), Permit coverage gaps (the existing hatch, live). When the ring or the county view overlaps a gap: a chip on the ring and an info icon in the results header that opens the note “Permits are shown only where CountyLens publishes them. Part of this area has no permit data.”, linking CountyLens Coverage. Legend per layer | Review #22 (CountyLens keeps no hexagons); Atlas viz tokens | Explore with the map on, every CrmMap board |
| E-73 CRM map states · CRM · not Task A | Map tiles loading (tile grid, “Loading map tiles… results are ready below”, list works); map failed (List view with “Map unavailable, results below.” and Retry); no results in the ring (“Try a bigger radius or a lower roof age” with Widen to N mi, Roof ≥ M yrs, Any permit); partial (permit coverage gap note); lead index unavailable (map banner, data chip “Index unavailable”, leads still open) | Rule 7: loading, empty, error, partial | CrmMapTiles390, CrmMapFailed390, CrmMapNoResults390, CrmMapPartial390, CrmMapIndexDown390 |
| E-74 One-tap lead and the lead snackbar · CRM · not Task A | Create lead is one tap, no form: status New, assignee = me, origin Map, List or Agent, main signal the property or the chosen permit. Snackbar “Lead created” with Undo and Open lead; “Add a note” expands it with a note field (Skip, Save note). Candidate list: Hide existing leads toggle; “Why is this a match?” reads “Why is this a lead?” in the CRM | Replaces the create-lead sheet of E-53 (no form) | CrmLeadCreate 390 / 768 / 1440, CrmCandidatesHide1440, CrmCandidates |
| E-75 Bulk create with confirmation · CRM · not Task A | “Create {n} leads” on the list selection bar (and the map selection chip) opens a sheet: each address with its main signal; rows already leads are marked “Already a lead · {status} · skipped”. Result: “{n} leads created · {m} already leads” with Undo and Open Leads | Replaces the direct bulk create of E-54 | CrmCandidatesConfirm390 / 1440, CrmCandidatesCreated390 |
| E-76 CRM property drawer on PropertyDetail · CRM · not Task A | With the switch on, the drawer from the map, list and agent embeds PropertyDetail in a CRM order: address and lead status, then Create lead (filled) or “Already a lead · {status} · {assignee}” with Open lead; Roof (age, basis, confidence; reason when unknown); Permits (class, source word, issue date, open duration, contractor as printed with the ContractorBadge variants, BBB in one of four states, source link, “Create lead from this permit” on open or stalled permits); Owner as today. “Open in CRM” becomes “View lineage in Explorer” (CountyLens property page, new tab); Metadata and Merged from collapse under Lineage. CountyLens is unchanged | Signature moment #8; AD-05, AD-07, AD-08 | CrmProperty 390 / 768 / 1440; Property1440 / 390 with the switch on |
| E-77 Create lead states · CRM · not Task A | Creating (button and snackbar spinner), created, already a lead (refused, never created twice; snackbar “Already a lead · {status} · {assignee}” with Open lead), create failed (banner in the drawer with Try again; at 390 “You’re offline. The lead was not saved.”), partial data (roof age unknown or no permit data: the missing signal says why, and a lead can still be created) | Rule 7 | CrmPropertyCreating390, CrmPropertyCreated390, CrmPropertyDup390, CrmPropertyFailed390, CrmPropertyFailed1440, CrmPropertyPartial390, CrmLeadDup390/1440 |
| E-78 Field triage cards (390) · CRM · not Task A | “Triage {n}” in the results sheet turns the results into a stack of cards, one property each: address, distance and bearing from the pin, roof age with basis and confidence, main permit signal with “Open > 5 yrs”, contractor as printed with its badge, BBB state and “Why is this a lead?” chips; the map strip above centres and rings the current marker. Swipe right = create lead, swipe left = skip, each with a snackbar and Undo; Skip, Create lead and Open details buttons do the same, and the arrow keys and Enter work with the card focused (announced for screen readers). A lead card says “Already a lead · {status}” and offers only Skip and Open lead. End: “{n} leads created, {m} skipped” with Open Leads and Back to map. States: loading the next card, empty ring, create failed (the card returns with Try again), offline. Reduced motion: no fling | Signature moment #3; result cards, lead kit (E-74) | CrmTriage390, CrmTriageSwipe390, CrmTriageLead390, CrmTriageLoading390, CrmTriageFailed390, CrmTriageOffline390, CrmTriageEnd390, CrmTriageEmpty390 |
| E-79 Leads table, cards and combined filters · CRM · not Task A | Supersedes the E-56 filter bar. Filters combine, in the map’s chip style: Status (multi-select), Assignee (Me, All reps = sales-manager view, or a name), Roof age ≥, Permit status (Open and Stalled combine; none = Any), Permit open ≥, Within r mi of an Area (Area picker + radius 0.5–25). A plain-English sentence sits above the list. Sort: last activity, roof age, permit open, nearest. 1440: paged table (Pager) with address, status pill, assignee, roof + basis, main permit (class, years, source word, AD-08), contractor as printed with its badge (AD-05), Mi (only with a radius), created from, last activity, created; 768 folds assignee and origin into the first two cells; 390: stacked lead cards with a sticky header (count, active filter chips). Row click opens Lead detail | Brief step 5; replaces the single-status Leads list | CrmLeads1440, CrmLeads768, CrmLeads390, CrmLeadsAllReps390 |
| E-80 Leads list in the URL · CRM · not Task A | Every filter, the sort and the page are kept in the URL: /leads?status=new,contacted&roof=15&permit=open,stalled&openYrs=5&place={id}&r=5&sort=near&page=2 (defaults left out). Reload and Copy link reopen the same list; a signed-out link goes to sign-in, then back to it (the sign-in return check now allows commas). A board note shows the URL | Shareable manager and rep views | CrmLeads1440/768/390, CrmLeadsFiltered1440, CrmSignIn |
| E-81 Leads states · CRM · not Task A | Loading (sentence from the URL, count “…”), no leads yet (“Create your first lead from the map” with Go to map; filters hidden), no leads match these filters (with Clear filters), error with Retry (filters kept), partial: a lead whose property is missing from the newer run shows “Property not in Run 4 · snapshot” and a banner “Property not in Run 4; the lead keeps its snapshot” | Brief step 5 | CrmLeadsStates, CrmLeadsLoading390, CrmLeadsEmpty390, CrmLeadsNoMatch390, CrmLeadsError390, CrmLeadsPartial390 |
| E-82 Show filtered leads on the map · CRM · not Task A | “Show on map” on Leads opens the CRM map on the whole county with only the filtered leads’ properties and a “{n} leads from your Leads list” chip; its × restores all candidates and drops ?leads= from the URL. Ignored with the switch off | Leads → map round trip | CrmLeads1440 → CrmMap1440?leads=…; Explore1440 (switch on only) |
| E-83 Lead page beside the list · CRM · not Task A | 1440: the Leads list (my leads, last activity first, current one marked) on the left and the lead on the right; 768 and 390: a full page with Back to Leads. Header: address, status, assignee, created from and date, Show on map (map with this lead), View property (CRM map with the drawer open, ?sel={property}), View lineage in Explorer. Disabled “Send message” (Outreach · Soon) and “Create estimate” (Estimates · Soon) with tooltips; nothing is sent. Lead links across the CRM (Leads rows, snackbars, drawer, search, triage) now open this page | Brief step 6; the earlier CrmLeadDetail boards stay as they were | CrmLead1440, CrmLead768, CrmLead390; Explore1440, PropertyDetail, SearchBox (switch on only) |
| E-84 Lead status and assignee menus, notes and history timeline · CRM · not Task A | Status menu (New, Contacted, Qualified, Won, Lost, each with an icon and label) and Assignee menu (Me or a team member) save at once; notes newest first with author and time; History timeline (created, status from → to, assignee from → to, note added) with who and when, newest first | Replaces the status chips of E-55 in the new Lead page | CrmLead1440/768/390 |
| E-85 Signals snapshot with At creation / Now · CRM · not Task A | The signals saved with the lead (roof age + basis + confidence, main permit with class, years and source word, contractor as printed with its badge, BBB state) with “From CountyLens Run {n} · manifest {CID}”. When a newer run changed a signal, a Now column shows it with a Changed pill; otherwise “No change since this lead was created”. The lead references the property and permit; owner details are read from the property, never copied | AD-05, AD-07, AD-08; lineage | CrmLead1440, CrmLeadChanged390 |
| E-86 Lead states · CRM · not Task A | Loading; saving (status, assignee or note: “Saving…” then “Saved”); save failed (the change is undone with Try again; a failed note keeps its text); lead not found or deleted (Back to Leads); property not in the newer run (snapshot kept, View property off); changed elsewhere (“This lead was updated by {name}. Reload to see the latest.”, also raised by another tab) | Brief step 6 | CrmLeadStates, CrmLeadLoading390, CrmLeadSaving390, CrmLeadSaveFailed390, CrmLeadDeleted390, CrmLeadStale390, CrmLeadElsewhere390 |
| E-87 CRM agent on the AI mode · CRM · not Task A | The CRM agent is Explore’s AI mode with the switch on, not a second agent UI: Working… with timer and Cancel, the full answer at once, How I read this, numbered citations ↔ numbered pins, editable assumption chips that re-run, the missing-data note and Took too long are reused. CRM only: the “n of 10 AI questions left” counter is hidden (users are signed in); permit age in words (“older than five years”) becomes the “Open ≥ N yrs” chip. The rail AI, the 390 Ask tab, PropertyDetail Ask and the ProtoBar now open CrmAsk; the earlier CrmAgent boards stay as they were | Brief step 7 | CrmAsk1440, CrmAsk768, CrmAsk390; Explore1440, CrmBottomNav, PropertyDetail, ProtoBar (switch on only) |
| E-88 CRM answer rows and actions · CRM · not Task A | Each cited row adds the contractor as printed with its badge (AD-05), BBB state (AD-07) and, for permit-text matches, “Matched on permit text: …” as the retrieval evidence; “Create lead” or “Already a lead · {status}” per row; “Create leads for all {n}” and “Show on map” (numbered pins on the CRM map; the 390 sheet steps aside). The summary is written as claims, each with its citation; where part of the area has no permit data the answer says so and links the coverage note | Extends E-39 citations; AD-08 permit class + source word | CrmAsk1440/768/390 |
| E-89 Leads from chat, confirmed first · CRM · not Task A | Asking in words (“make leads of the top 3”) or pressing “Create leads for all {n}” never creates anything: the agent replies with a confirmation card listing the properties (“Create 1 lead? 2 are already leads and will be skipped.”, Create and Cancel). After Create: “{n} leads created · {m} already leads” with Open Leads, plus the lead snackbar with Undo. Leads made here say “created from Agent” | Agent never acts alone | CrmAskConfirm390/1440, CrmAskCreated390 |
| E-90 CRM agent states · CRM · not Task A | No results (“I found no properties that match. Try a bigger radius or a lower roof age.” with chips that do it), low confidence (“I’m not confident in these matches: {reason}”), place outside Travis County or not found (nothing runs; chips for known places), create failed from chat (card stays, Try again), rate-limited (“Too many questions in a short time”, countdown, Find disabled), AI paused (daily budget). Working…, Took too long and Cancel are reused | Brief step 7; AD-09 | CrmAskNoResults390, CrmAskLowConf390, CrmAskOutside390, CrmAskNotFound390, CrmAskCreateFailed390, CrmAskThrottled390, CrmAskPaused390, CrmAskWorking390, CrmAskSlow390 |
| E-91 CRM states pass · CRM · not Task A | Every Crm screen checked for loading, empty, error and partial (and rate-limited where it calls the agent or gateway). Added: the candidate list loading skeleton (“Loading candidates from the lead index”), Retry on the list error, live candidate state boards, and states boards for the candidate list and drawer, field triage and the agent, in the CountyLens patterns (skeletons, one-line empty hints with a suggested action, what failed and how to retry) | Brief step 8 | CrmCandidatesStates, CrmTriageStates, CrmAskStates, CrmCandidatesLoading390, CrmCandidatesEmpty390, CrmCandidatesError390, CrmCandidatesPartial390; Explore1440 (switch on only) |
| E-92 CRM responsive and accessibility pass · CRM · not Task A | CRM-only (a crm-on class on Explore, switch on): 48 px hit areas on the view switch, result tabs, sheet handle, clusters, radius handle, search pin, numbered pins, step row and lead links, 48 px selection checkboxes, fields and selects; 24 px hit areas on map markers; 3:1 edges on hexagons and clusters; lead status on markers by line style as well as colour (solid New, dashed Contacted, double Qualified/Won, dotted Lost) and in every marker label; the A-4 key hint on the CRM map; a focus ring on the question box; the drawer, bulk sheet and create-lead sheet move focus in, trap Tab and close with Escape, returning focus; account menu, data panel, More sheet and the Lead status/assignee menus close with Escape; Leads rows are whole-row links | Brief step 9; A-1 to A-8 | Explore1440, PropertyDetail, CrmAccount, CrmDataChip, CrmBottomNav, CrmGpsStates, CrmLeads, CrmLead, CrmSignIn, states boards |
| E-93 CRM partial-data states from contract/v1 · CRM · not Task A | States for fields the data contract does not publish: no street address (title is the TCAD account id + “near {place}”, a line “Address not published in Run {n} · lat, lon”); “Contractor not published” with its reason (no lexicon carrier); “Stalled · derived: no status in source” in place of “source says …”; BBB shows only Rated / Not found / Blocked / Not checked with its reason and never a score; contractor badge only Resolved or Unresolved; “Type not published” for a null property type; “Matched on permit type: …” only when a matched field exists; the agent’s honest stalled-only answer with a “Widen to {2r} mi” chip. Normal states (address, “as printed on permit”) are kept for later contract versions. Token swap: Qualified lead pill uses tertiary-container / on-tertiary-container; --lead-qualified-container and --on-lead-qualified-container are removed (no token extension) | Review log #1, #2, #4 to #8, #12, #20; CRM-R1 items 1, 2, 4 to 10 | CrmMapNoAddress390, CrmCandidatesNoAddress390, CrmPropertyNoAddress390/1440, CrmTriageNoAddress390, CrmAskNoAddress390, CrmLeadsNoAddress390/1440, CrmLeadNoAddress390, CrmPropertyNoContractor390, CrmTriageNoContractor390, CrmAskNoContractor390, CrmLeadNoContractor390, CrmLeadsNoContractor390/1440; Explore1440, PropertyDetail, CrmLeads, CrmLead, CrmLeadDetail (switch on only) |
| E-94 CRM app switcher menu · CRM · not Task A | The Apps icon opens an Atlas menu (not the Hub page): CountyLens, Roofing CRM (current, with a check and aria-current) and the Landing page, on the 1440 and 768 top bars; at 390 the same three rows sit under “Apps” in the More sheet. Escape closes it and returns focus to the Apps icon; opening it closes any other overlay. Built from Atlas menu items and tokens only. CountyLens keeps its Apps link until a CountyLens round (no switch-off board changes) | Design-system § 15; review log #3 (CRM-R1 item 3) | CrmAppsMenu, CrmShell1440, CrmBottomNav, Explore1440 (switch on only), CrmShellApps1440, CrmShellApps768 |
| E-95 Hub card: Roofing CRM point text · CRM · not Task A | One line on the Roofing CRM card of the Apps hub changes from “Lead tools (visits, notes): coming soon” to “Leads and notes”, because leads and notes are live. The scope line and the Open target are unchanged; no other Hub or CountyLens element changes (Hub1440, 768 and 390 share the card) | Review log #23; CRM-R2 item 4 | Hub1440, Hub768, Hub390 |

## 9. States

**Partial data from `contract/v1` (CRM-R1, E-93).** The contract does not publish a street address, the contractor name as printed, a BBB score, a raw status word or a permit description. The boards design for what is published: the property title is the TCAD account id + “near {place}” with a line “Address not published in Run {n} · lat, lon” (card, candidate row, drawer header, triage card, agent row, Leads row, Lead header; Copy, Open lead and snackbars use the same title); the contractor line reads “Contractor not published · {reason}”; stalled reads “Stalled · derived: no status in source”; BBB shows only Rated / Not found / Blocked / Not checked with its reason; the badge has only Resolved and Unresolved; a null type reads “Type not published”; the evidence line “Matched on permit type: …” appears only when a matched field exists. The normal states (address, “as printed on permit”) stay for later contract versions. Prototype only: the `v1` switch (`?v1=addr` or `?v1=ctr`) opens these states; do not ship it.

Every Crm screen has loading, empty, error and partial data, and rate-limited where it calls the agent or the data gateway (state pass, step 8). Patterns are CountyLens's: skeleton rows with one status line, a one-line empty hint with a suggested action (chips that widen the radius or lower the roof age), “what failed and how to retry”, and partial data that says what is missing and why. Live boards carry a dashed **Prototype · state** bar (does not ship); each screen has a states overview board. Full per-board list: §9.1.

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

### 9.1 Every Crm board and its states

Boards named `…NoAddress…` or `…NoContractor…` are the state the **first build ships**; the address and “as printed on permit” boards are marked **field-present** (shown once contract v1.1 fields appear in the manifest).

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
| Map | `CrmMap1440` | Populated (whole county) · field-present state |
| Map | `CrmMap390` | Populated (whole county) · field-present state |
| Map | `CrmMap768` | Populated (whole county) · field-present state |
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
| Map · pin | `CrmMapPin1440` | Results around the pin · field-present state |
| Map · pin | `CrmMapPin390` | Results around the pin · field-present state |
| Map · pin | `CrmMapPinMode1440` | Placing the pin |
| Map · pin | `CrmMapPinMode390` | Placing the pin |
| Map · pin | `CrmMapPinMove1440` | Drag or arrow keys |
| Map · pin | `CrmMapPinOutside390` | Error: pin outside the county |
| Candidate list | `CrmCandidates1440` | Populated · field-present state |
| Candidate list | `CrmCandidates390` | Populated · field-present state |
| Candidate list | `CrmCandidates768` | Populated · field-present state |
| Candidate list | `CrmCandidatesConfirm1440` | Bulk confirmation |
| Candidate list | `CrmCandidatesConfirm390` | Bulk confirmation |
| Candidate list | `CrmCandidatesCreated390` | Bulk created snackbar |
| Candidate list | `CrmCandidatesEmpty390` | Empty: chips to widen · new |
| Candidate list | `CrmCandidatesError390` | Error: index unavailable, Retry · new |
| Candidate list | `CrmCandidatesHide1440` | Existing leads hidden |
| Candidate list | `CrmCandidatesLoading390` | Loading (skeleton) · new |
| Candidate list | `CrmCandidatesPartial390` | Partial: no permit data note · new |
| Candidate list + drawer | `CrmCandidatesStates` | Overview: loading, empty, error, partial, rate-limited (gateway) · new |
| Property drawer | `CrmProperty1440` | Populated (not a lead yet) · field-present state |
| Property drawer | `CrmProperty390` | Populated (not a lead yet) · field-present state |
| Property drawer | `CrmProperty768` | Populated (not a lead yet) · field-present state |
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
| Field triage | `CrmTriage390` | Populated (stack) · field-present state |
| Field triage | `CrmTriageEmpty390` | Empty ring |
| Field triage | `CrmTriageEnd390` | End of stack |
| Field triage | `CrmTriageFailed390` | Error: create failed, Try again |
| Field triage | `CrmTriageLead390` | Already a lead card |
| Field triage | `CrmTriageLoading390` | Loading next card |
| Field triage | `CrmTriageOffline390` | Error: offline |
| Field triage | `CrmTriageStates` | Overview: loading, empty, error, partial · new |
| Field triage | `CrmTriageSwipe390` | Swiping |
| Leads list | `CrmLeads1440` | Populated; state bar: loading, no leads yet, error, partial · field-present state |
| Leads list | `CrmLeads390` | Populated; state bar: loading, no leads yet, error, partial · field-present state |
| Leads list | `CrmLeads768` | Populated; state bar: loading, no leads yet, error, partial · field-present state |
| Leads list | `CrmLeadsAllReps390` | All reps view |
| Leads list | `CrmLeadsEmpty390` | Empty: no leads yet, Go to map |
| Leads list | `CrmLeadsError390` | Error: Retry |
| Leads list | `CrmLeadsFiltered1440` | Combined filters from the URL |
| Leads list | `CrmLeadsLoading390` | Loading |
| Leads list | `CrmLeadsPaged1440` | Paged: page 2 of 4, all reps (team sample) |
| Leads list | `CrmLeadsPaged390` | Paged with combined filters: page 2 of 6 |
| Map | `CrmMapNoAddress390` | Partial data: address not published (card with TCAD id, near place, lat/lon) · **ships first** |
| Candidate list | `CrmCandidatesNoAddress390` | Partial data: address not published (candidate row) · **ships first** |
| Property drawer | `CrmPropertyNoAddress390` | Partial data: address not published (drawer header) · **ships first** |
| Property drawer | `CrmPropertyNoAddress1440` | Partial data: address not published (drawer header) · **ships first** |
| Field triage | `CrmTriageNoAddress390` | Partial data: address not published (triage card) · **ships first** |
| Ask the agent | `CrmAskNoAddress390` | Partial data: address not published (answer rows) · **ships first** |
| Leads list | `CrmLeadsNoAddress390` | Partial data: address not published (Leads row) · **ships first** |
| Leads list | `CrmLeadsNoAddress1440` | Partial data: address not published (Leads row) · **ships first** |
| Lead | `CrmLeadNoAddress390` | Partial data: address not published (Lead header) · **ships first** |
| Property drawer | `CrmPropertyNoContractor390` | Partial data: contractor not published, with its reason (permits) · **ships first** |
| Field triage | `CrmTriageNoContractor390` | Partial data: contractor not published (triage card) · **ships first** |
| Ask the agent | `CrmAskNoContractor390` | Partial data: contractor not published (agent rows) · **ships first** |
| Lead | `CrmLeadNoContractor390` | Partial data: contractor not published (Signals saved with the lead) · **ships first** |
| Leads list | `CrmLeadsNoContractor390` | Partial data: contractor not published (Leads cards) · **ships first** |
| Leads list | `CrmLeadsNoContractor1440` | Partial data: contractor not published (Leads column) · **ships first** |
| Shell | `CrmShellApps1440` | App switcher menu open (CountyLens, Roofing CRM ✓, Landing page) |
| Shell | `CrmShellApps768` | App switcher menu open (CountyLens, Roofing CRM ✓, Landing page) |
| Shell component | `CrmAppsMenu` | App switcher menu open / closed |
| Leads list | `CrmLeadsNoMatch390` | Empty: no match, Clear filters |
| Leads list | `CrmLeadsPartial390` | Partial: property not in Run 4 |
| Leads list | `CrmLeadsStates` | Overview: loading, no leads yet, no match, error, partial |
| Lead | `CrmLead1440` | Populated; state bar: loading, property not in Run 4, changed elsewhere, not found, deleted, next save fails · field-present state |
| Lead | `CrmLead390` | Populated; state bar: loading, property not in Run 4, changed elsewhere, not found, deleted, next save fails · field-present state |
| Lead | `CrmLead768` | Populated; state bar: loading, property not in Run 4, changed elsewhere, not found, deleted, next save fails · field-present state |
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
| Ask the agent | `CrmAsk1440` | Answered (worked example) · field-present state |
| Ask the agent | `CrmAsk390` | Answered (worked example) · field-present state |
| Ask the agent | `CrmAsk768` | Answered (worked example) · field-present state |
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

## 10. Responsive and accessibility

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

13. Coming-soon items reuse the CountyLens coming-soon row (on-surface-variant text and the `atlas-pill--unavailable` pill at full colour, never Atlas’s 38 % disabled rule), so they stay hoverable for their tooltip and each opens its Coming-soon page (B-10).

## 11. Open items

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
