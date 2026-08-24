# PRD: Map Lead CRM — Lee Fallback Foundation

**Feature ID:** `lee-fallback-map-crm-foundation`  
**Branch:** `feat/lee-fallback-map-crm-foundation`  
**Mode:** Operate (sales rep completes territory work, not marketing)  
**Primary agents:** donphan → metagross → uidev → smeargle → alakazam

---

## 1. What progress is the user trying to make?

**Bob — job statement**

> When I'm working a territory (walking, driving, or planning from a desk), I want to see which nearby properties look like good roofing doors — aging structure, and eventually long-open permits — so I can build today's lead list and convert the ones worth knocking without guessing or wasting time.

**Functional job:** Find candidate properties in a radius, inspect facts, save leads.  
**Emotional job:** Feel confident I'm knocking the _right_ doors, not random ones.  
**Social job:** Show my manager/team I worked the territory with evidence, not vibes.

**Struggling moment:** Rep opens the app mid-route (or before a canvass block) with 45 minutes and no idea which streets to prioritize. Spreadsheets and memory don't show roof age or permit stall signals on a map.

**Desired outcome (done):** Rep drops a pin (or uses GPS), sets radius, sees a scannable list + map markers, opens one property, reads honest facts (including “structure year = proxy”), converts 1–3 doors to leads, and those leads survive refresh on the hosted URL.

---

## 2. Forces of progress (sanity check)

| Force               | What it looks like here                                                  | Design implication                                                                                  |
| ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Push**            | Blind canvassing wastes time; permit/age signals exist in data           | Map + list twin; sort/filter by signal strength                                                     |
| **Pull**            | One screen: map, filters, convert, lead list                             | No login friction v1; defaults that work on first open                                              |
| **Anxiety**         | “Is this really Chester?” “Is roof age real?” “Will my leads disappear?” | Coverage banner, proxy labels, DynamoDB persistence on hosted URL                                   |
| **Habit / inertia** | Reps already use mental maps, paper lists, or another CRM                | Familiar map idiom; “Walk the radius. Convert a door.” lede; disabled future nav as legend not trap |

**Balance check:** Pull is strong only if **anxiety brakes are addressed first** — honest geography, labeled proxies, clear empty/loading states, deliberate convert confirm. Do not lead with RAG polish while the map path still feels untrustworthy.

---

## 3. Approachable product definition

**Approachable** here means: a rep who has never seen Elephant data can open the hosted URL, understand where they are, run one search, convert one lead, and find it again — without reading architecture docs.

**Three beats:**

1. **Orient** — Heading names the served place (Lee County, FL while Chester is unpublished). Banner explains why, in one sentence. Disabled nav items look inactive, not broken.
2. **Search** — Pin or GPS → radius slider → candidate list + markers. Aging-roof filter uses structure year with plain copy (“Structure built before {year} — roof-age proxy”).
3. **Act** — Tap row → drawer with address + available facts → “Convert to lead” with confirm → leads panel shows today's list.

**Phase 2 (same PRD, later wave):** permit layer with long-open sort, RAG agent with citations, Chester flip when catalog publishes it.

---

## 4. Current state vs gap

| Surface                      | Status                      | Gap                                                  |
| ---------------------------- | --------------------------- | ---------------------------------------------------- |
| Map shell (pin, GPS, radius) | Built                       | Wire fully to live `search.inRadius` on hosted URL   |
| Aging-roof layer + list      | Built (UI + client filters) | End-to-end on live Lee MCP data                      |
| Permit layer                 | UI chrome exists            | Live permit attach via `properties.get` / probe      |
| Property drawer + BBB        | Partial                     | Real consolidated JSON; honest NULLs                 |
| Lead create/list             | API + UI paths exist        | Hosted DynamoDB path verified on Amplify             |
| Coverage honesty             | Banner + tests              | Dynamic from `counties.defaultCounty`, not hardcoded |
| Disabled CRM nav             | Built                       | Already meets spec                                   |
| RAG `agent.ask`              | **Stub only**               | Alakazam stack + fixtures — Wave 3                   |
| Chester default              | **Blocked**                 | Pipeline must list `chester` with geo + `built_year` |

---

## 5. Success metrics

**Functional (Slowking-aligned):**

- Hosted Amplify URL runs the demo transcript on **live Lee** (not localhost, not fixture-only).
- Rep can complete: pin → radius → see candidates → open drawer → convert → see lead in list.
- Coverage never labels Lee as Chester.

**Usability (Steve):**

- First-time rep reaches first candidate list in **< 60 seconds** without instructions.
- Every empty state answers: _why empty_ and _what to try next_.
- Convert is deliberate (confirm) and recoverable (archive lead).

**Out of scope (unchanged):**

- Ingest, Neon, IPFS, county onboard
- Live BBB API
- Outbound messaging
- Chester as default until `listPublishedCounties` includes it with usable geo

---

## 6. UX foundations (6-pass snapshot)

### Pass 1 — Mental model

- **First visit:** “I'm on a map of real parcels in [county]. I drop a pin and walk the radius.”
- **Return visit:** “My leads are saved; I can search a new pin.”
- **Vocabulary:** “Structure year (proxy)” not “roof age”; “Today's list” not “pipeline stage.”

### Pass 2 — Information architecture

Single-page operate layout:

```
[ Territory heading + coverage chip ]
[ Operator lede ]
[ Disabled nav: Leads (active) | Campaigns | Inbox | Reports ]
[ Map | Controls: GPS, pin, radius, aging filter, permit filter ]
[ Candidate list ←→ Property drawer ]
[ Leads panel ]
```

### Pass 3 — Affordances

- Pin drop and GPS are equally prominent; radius slider shows miles live.
- List rows are the accessible twin of map markers (keyboard + screen reader).
- Convert button only when drawer has a property; confirm dialog names the address.

### Pass 4 — Cognitive load

- Defaults: Fort Myers pin, 5 mi radius, 15 yr structure-age threshold.
- Permit layer off by default until data connected (avoid empty layer anxiety).
- No API jargon in operator viewport.

### Pass 5 — State design

| State                | User sees                                                    | Next action          |
| -------------------- | ------------------------------------------------------------ | -------------------- |
| Search not connected | “Connect to API…” (dev) / blocking on hosted                 | —                    |
| Zero candidates      | “No doors in this radius. Widen radius or move pin.”         | Adjust controls      |
| NULL built year      | Row visible for permits; excluded from aging layer with chip | Open for permit-only |
| Convert success      | Toast + lead in panel                                        | Keep searching       |
| Agent not indexed    | Honest stub + link to map search                             | Use filters instead  |

### Pass 6 — Flow integrity

Demo path must never strand the user without orientation after: GPS deny, empty radius, convert, or agent stub.

---

## 7. User stories (for `prd.json`)

**Quality gates (all stories):**

```json
"quality": {
  "typecheck": "pnpm typecheck",
  "lint": "pnpm lint",
  "test": "pnpm test"
}
```

### Wave 1 — Trust the map (hosted Lee)

| ID     | Title                                                                      | Type      | Agent     |
| ------ | -------------------------------------------------------------------------- | --------- | --------- |
| US-001 | Dynamic `counties.defaultCounty` drives heading + coverage banner          | backend   | donphan   |
| US-002 | `search.inRadius` returns Haversine-filtered Lee parcels with `built_year` | backend   | donphan   |
| US-003 | Amplify SPA calls hosted API for search + leads (CORS, env)                | fullstack | metagross |
| US-004 | Map shell: pin, GPS, radius → live candidate list + markers                | frontend  | uidev     |
| US-005 | Aging-roof layer: structure-year filter + honest proxy label               | frontend  | uidev     |
| US-006 | Property drawer from `properties.get` with NULL-safe BBB block             | fullstack | uidev     |
| US-007 | Convert to lead → DynamoDB → leads panel persists on refresh               | fullstack | metagross |
| US-008 | Disabled CRM nav (Campaigns/Inbox/Reports) inert + labeled                 | frontend  | uidev     |
| US-009 | smeargle design tests + browser verify on Amplify URL                      | test      | smeargle  |

**Wave 1 acceptance anchor (VERIFY AC-1…8):**

- AC-1: Open hosted URL → Lee heading + unpublished-Chester banner
- AC-2: Drop pin / GPS + set radius
- AC-3: See aging-roof candidates (structure year ≤ threshold)
- AC-4: Open property drawer; contractor/BBB when present, honest empty when not
- AC-5: Convert ≥1 lead; reload page → lead still there
- AC-6: Filter list by radius + age threshold
- AC-7: Disabled future CRM sections visible, not navigable
- AC-8: PR lists web URL, API URL, no login, demo on hosted URL

### Wave 2 — Permit signal

| ID     | Title                                                           | Type      | Agent   |
| ------ | --------------------------------------------------------------- | --------- | ------- |
| US-010 | Permit probe + `getOracleProperty` fallback for roofing permits | backend   | donphan |
| US-011 | Long-open permit layer (≥5 yr default) + sort                   | fullstack | uidev   |
| US-012 | Drawer shows permit status, open duration, contractor           | frontend  | uidev   |

### Wave 3 — RAG (Alakazam)

| ID     | Title                                                                       | Type      | Agent    |
| ------ | --------------------------------------------------------------------------- | --------- | -------- |
| US-013 | RAG corpus fixtures + local OpenSearch replay                               | backend   | alakazam |
| US-014 | Production `agent.ask` with citations matching map facts                    | fullstack | alakazam |
| US-015 | In-app agent panel; confidence-below-threshold → structured search fallback | frontend  | uidev    |

### Wave 4 — Chester flip (data-gated, no ingest in this repo)

| ID     | Title                                                     | Type      | Agent   |
| ------ | --------------------------------------------------------- | --------- | ------- |
| US-016 | Auto-flip default to Chester when catalog publishes pilot | backend   | donphan |
| US-017 | GIS MUNI clip (West Chester + Coatesville) + pilot banner | fullstack | uidev   |

---

## 8. Example story (US-007)

```json
{
  "id": "US-007",
  "title": "Convert property to persisted CRM lead",
  "description": "As a sales rep, when I find a door worth knocking, I want to convert it to a lead with one deliberate action so that my list survives refresh and I can keep canvassing.",
  "type": "fullstack",
  "agent": "uidev",
  "dependencies": ["US-003", "US-006"],
  "wave": 1,
  "priority": "1",
  "acceptanceCriteria": [
    "Convert opens confirm dialog naming address_street",
    "leads.create snapshots property facts with roofAgeBasis structure_year_built",
    "Lead appears in leads panel immediately after success",
    "Reload hosted URL — lead still listed (DynamoDB, not memory)",
    "Duplicate convert on same property is idempotent or clearly handled",
    "Archive removes lead from active list with recoverable semantics",
    "Design test convert-lead.design.test.ts passes",
    "Feature quality gates pass"
  ],
  "passes": false
}
```

---

## 9. Demo transcript → verification map

Same as README demo, with honest Lee fallback:

1. Open hosted CRM → Lee + banner
2. Pin/GPS + radius
3. Aging-roof candidates in radius
4. (Wave 2) Long-open permits emphasized
5. Drawer: permit + contractor + BBB when on record
6. Convert to lead(s)
7. (Wave 3) NL agent query with citations
8. Filter by age, permit duration, radius
9. Show disabled Campaigns/Inbox/Reports

---

## 10. Open questions

These decide how “approachable” we push copy and scope:

1. **Audience for v1 demo** — Is the primary evaluator a roofing sales rep, a hiring reviewer (Slowking), or your internal team? (Affects copy tone: “doors” vs “properties”.)

2. **Lee fallback acceptability** — Is shipping the hosted demo on **Lee County, FL** with an honest banner sufficient for this milestone, or do you need Chester on screen even if data is incomplete?

3. **RAG priority** — Wave 3 in one PR, or acceptable to ship Wave 1–2 first with the honest `agent.ask` stub and add RAG in a follow-up PR?

4. **Lead lifecycle depth** — v1 = `new` + `archived` only, or full status enum (`contacted`, `qualified`, `lost`, `won`) in the UI?

5. **Mobile field use** — Is phone-in-pocket canvassing a Wave 1 requirement (GPS + one-thumb layout), or desktop/tablet demo first?

6. **Auth** — Confirm v1 stays public/no-login for the challenge runtime?

7. **Copy voice** — Keep “Walk the radius. Convert a door.” and “Today's list”, or neutralize to “Search radius” / “Lead list” for broader CRM positioning?

8. **Where to land companion artifacts** — Also write `prd.json` + `VERIFY.md` alongside this file, or keep stories in execute-feature only?
