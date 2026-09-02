# Slowking evaluation — Roofing CRM & Lead Identification UI

**Assignment:** Roofing CRM & Lead Identification UI  
**Designated repo:** https://github.com/prismteam-ai/roofing-crm  
**Candidate PR:** https://github.com/prismteam-ai/roofing-crm/pull/3  
**Head evaluated:** `ab4977674106b40c13d9ce319ea289ecc77731e7` (2026-08-12T18:56:15Z)  
**Hosted runtime exercised:** https://cc-bb-aa.github.io/roofing-crm/  
**Pages last-modified:** 2026-08-12 18:57:00Z · hosted `crm.js` SHA1 `1de9fa68…` matches PR head  
**Demo:** `demo/out/crm-demo-transcript.webm` (2 696 773 B, 39.68s, recorded vs hosted Field Desk UI)  
**Credentials:** none (public)  
**Oracle sibling:** https://github.com/prismteam-ai/oracle-property-intelligence-platform-pipeline-chester-county-pa/pull/2 · runId `a08ba375-b4fc-47f3-b05b-7a9e22717b27`

## Verdict

Partial Pass

## Total score

90/100

## Scorecard

| Dimension | Weight | Band | Points | Why |
|---|---|---|---|---|
| Functional outcome | 40 | — | 35 | Sum of per-point scores. Hosted pin/radius/age/open/leads/disabled all work; roofing UCC, true roof age, BBB, and vector RAG are absent and labeled. |
| Runtime & demo quality | 20 | 100% | 20 | Pages HTTP 200 exercised end-to-end (not localhost). Official e2e **4/4 in 6.8s** against Pages. Demo 39.7s walks the official transcript on the live Field Desk UI. |
| Evidence quality | 12 | 100% | 12 | Live JSON counts, Playwright actions/results, screenshots, and demo frames all agree (1825, 27/41 long-open, land-dev chips, BBB n/a). |
| Access-boundary compliance | 8 | 100% | 8 | No ingest in this repo. Consumes vendored Oracle artifacts only. No login-walled UCC scrape, no BBB API, no vector store. |
| Implementation quality | 7 | 75% | 5 | Clear static consumer: haversine, AND filters, 1825 parse, XSS escape, fail-loud loads, design-system remap. Gaps: vanilla JS, no unit tests, lead chips mislabel land-dev as “roof”, `businesses.json` unused. |
| Kit-usage conformance | 5 | 50% | 3 | Design-system + Playwright + hosted Pages. Not metagross/Amplify, not espeon/alakazam RAG, not smeargle design specs. Built-with-kit: **partial**. |
| Reproducibility | 4 | 100% | 4 | PR is system of record (Pages URL, demo path, Oracle sibling). Fork CI green on head. Hosted `crm.js` matches clone. |
| Speed | 4 | 75% | 3 | Same-day delivery (first commit 16:08Z, latest 18:56Z). Sent datetime is date-only (`2026-08-12`); conservative 75%. |
| **Total** | **100** | | **90** | |

## Functional Outcome Breakdown

| Evaluation point | Sub-weight | Band | Points | Evidence / why |
|---|---|---|---|---|
| Chester County default map | 5 | 100% | 5 | Pages title/kicker **Chester County, PA**. Default pin **39.9607, -75.6055** (West Chester). Leaflet map + Esri canvas. Boot status **5 matches · 5 mi** at age 15. |
| Pin drop + configurable radius | 6 | 100% | 6 | Map click moved pin to **40.0599, -75.5952**; 5 mi circle drawn; matches **5 → 2**. Radius input live. **Use GPS** present (geolocation not forced in headless; pin satisfies GPS-and/or-pin). |
| Aged-roof search (≥15) with land-dev vs roof labels | 6 | 75% | 5 | Default WC: **5** matches, chips **LAND-DEV 15Y** (3 ROSE LA, 1310 GOSHEN PW, 1210 KAREN LA, 1228 CHEYNEY RD, 490 S WAWASET RD). Hosted data: **0/2493** `roofAgeYears`, **7** construction/land-dev ≥15. Filter works; not true roof age. |
| Open / long-open permits + official 5-year agent | 8 | 75% | 6 | Official prompt sets `#open` + `#minOpenDays=1825` + age 0. Moved pin: **27** matches; default WC pin: **41**. Age **AND** open at default pin → **1** (1228 CHEYNEY RD). Agent JSON caveats: not a vector store; county Act 247/EnerGov/health GIS; municipal roofing UCC not harvested. **0** `isRoofing`. Deterministic keyword filter, not RAG. |
| Property / permit detail (contractor + BBB) | 4 | 75% | 3 | 415 W LINCOLN HW / UPI `41-5-3.6`: Roof **?y (unknown)**, Land-dev **2y**, owner EXTON REALTY PARTNERS LLC, Act 247 rows with status/duration/type, contractor **—**, **BBB n/a**, provenance `chesco-act247-gis`. BBB **0/356**. |
| Lead create / remove / filter | 5 | 75% | 4 | Add 415 W LINCOLN HW + 4 BUTTONWOOD DR; remove first → 1 left. Lead filters render. Saved chips say **ROOF 2Y / 6Y** for land-dev ages (honesty leak vs match chips). localStorage only. |
| Disabled future CRM sections | 3 | 100% | 3 | `Pipeline / jobs (soon)`, `Campaigns (soon)`, `Billing (soon)` — `aria-disabled="true"`, not links. |
| Consume Oracle artifacts at scale, no ingest | 3 | 100% | 3 | Live: **2493** properties, **952** permits (well 161 / sewage 280 / Act 247 460 / EnerGov 51), **356** contractors, **89** businesses file (unused in UI). **136** open / **78** open≥1825. No ingest scripts. Slice is Oracle’s West Chester 5 mi cap, not ~194k county. |
| **Functional outcome subtotal** | **40** | | **35** | |

## Gates

| Gate | Status | Reason |
|---|---|---|
| PR to designated repo | **Pass** | Open PR #3 `feat/chester-roofing-crm` → `prismteam-ai/roofing-crm` (`cc-bb-aa`). Head `ab497767`. |
| Deployed runtime | **Pass** | GitHub Pages HTTP 200. Exercised only at `https://cc-bb-aa.github.io/roofing-crm/` via curl + Playwright (no `npm start`, no localhost). |
| Credentials | **Pass** | Public; no login. |
| Demo artifact | **Pass** | `demo/out/crm-demo-transcript.webm` on the PR (39.68s). Frames show Chester load, pin+5 mi, land-dev 15y, open-permit dots, add-lead, agent `minOpenDays: 1825` / 27 matches, lead filter, disabled-sections caption. |

## Hiring signal

**Strengths**
- Candidate-deployed hosted CRM that a sales user can actually operate: pin, radius, age, long-open, save/remove leads.
- Honest data contract: land-dev labeled separately from roof on matches; agent states it is not a vector store; UCC/BBB called n/a.
- Official “open roofing permits older than five years…” prompt now applies **minOpenDays=1825**; age and open **AND** together (1 parcel at default pin).
- Consumes the real Oracle harvest (2493 / 952) instead of a toy handful; no ingest in this repo.
- 40s demo re-recorded against the live Field Desk UI; hosted e2e 4/4.

**Weaknesses**
- Agent is a keyword filter that dumps JSON — assignment asked for a RAG-backed agent.
- **0** municipal roofing UCC, **0** true `roofAgeYears`, **0** BBB scores (sibling-data limits, correctly labeled).
- Saved-lead chips relabel land-dev as “roof”.
- `businesses.json` (89 commercial owners) is published and unused.
- Vanilla single-file JS; PR body still mentions `npm run test:unit` after that script was removed.

**Material risks**
- A user who trusts “aged roofs” or “open roofing permits” without reading chips/caveats will outreach on Act 247 / health GIS, not roofing UCC.
- Vendored Oracle JSON can drift from the sibling Pages runtime.
- `pages.yml` deploys without waiting on the e2e job (CI runs, but does not gate Pages).

**Follow-up questions**
1. Why is the NL agent a deterministic filter rather than the kit RAG path (`espeon` / `alakazam` + Vercel AI SDK)?
2. Will saved-lead chips use the same land-dev vs roof rule as match chips?
3. How does municipal roofing UCC / year-built enter this CRM without ingesting here?
4. Why vendor a snapshot instead of reading the Oracle hosted artifacts / MCP at runtime?

## Detail

**Intent:** A roofing sales user can pin a Chester County location, surface aged-roof and long-open-permit parcels in a chosen radius, and convert them into CRM lead records so outreach starts from real local signals.  
**Proven?** Partially. The identification workflow is live and usable; roofing-specific signals are missing and the agent is not RAG.

**What worked (hosted, observed 2026-08-12T18:56–19:00Z)**  
- GET `/` 200; `/data/pipeline-run.json` runId `a08ba375-…`; `/crm.js` SHA matches head.  
- Playwright (Pages only): default 5 land-dev≥15; pin move → 2; official agent → `#minOpenDays=1825`, 27 matches (41 at WC pin); AND age+open → 1; detail UPI + BBB n/a; add 2 / remove 1 lead; disabled pipeline/jobs, campaigns, billing.  
- Official `tests/e2e/crm.spec.ts` vs `E2E_BASE_URL=https://cc-bb-aa.github.io/roofing-crm/`: **4 passed (6.8s)**.  
- Demo 39.68s captions match the official transcript; agent panel shows `"minOpenDays": 1825` and 27 matches.

**What failed / was thin**  
- Not vector RAG (explicit caveat).  
- Not municipal roofing UCC; not BBB; not year-built roof age.  
- Lead list “roof” chip vs match “land-dev” chip.  
- Businesses artifact unused. GPS not demonstrated (pin is sufficient).  
- Long match lists make the rail very tall; map still works in the viewport.

**Access boundaries:** Required path is consume Oracle artifacts, do not ingest. Observed: static `./data/*.json` fetches only. No PASDA/Evolve/BBB harvest code. Login-walled UCC left untouched.

**Timing:** Assignment sent **2026-08-12** (time not supplied). First PR commit `235c2e7a` 16:08:44Z; latest `ab497767` 18:56:15Z (~2h 48m of commits; likely ~4h from mid-afternoon send).

**Implementation / kit notes (read-only, `apps/web/public/{index.html,crm.js}`)**  
- Architecture: static Field Desk UI + Leaflet, localStorage leads, client-side filter. Appropriate for “no ingest.”  
- `parseAgentQuestion`: open+permit → 1825 if “five years” / “5 years”; aged-roof only when the question is not an open-permit question.  
- Design tokens follow `design-system/chester-field-desk/pages/lead-map.md` (copper / tray / Barlow), not the generic MASTER navy.  
- Expected toolchain (arceus / README): baseline `apply-engineering-guidelines`; no clean CRM specialist. Closest: `metagross`+`build-frontend-backends` (wrong shape for a static consumer), `espeon`/`alakazam` for RAG, `smeargle` for design tests. Consulted read-only: alakazam/espeon ~28, metagross ~35, smeargle ~40, guidelines ~55.  
- Built-with-kit: **partial**.

**AC probes (hosted):** M1/M2/M3 Pass. M4 Partial (land-dev proxy, labeled). M5 Partial (county GIS open, not roofing UCC). M6 Partial (contractor often —; BBB n/a). M7/M8 Pass (lead list + CRUD; chip label Partial). M9 Partial (NL filter, not RAG; 1825 correct). M10 Pass. M11 Pass.
