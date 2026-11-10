Slowking report done. Relayed verbatim below.

# Slowking Evaluation — prismteam-ai/roofing-crm (branch `assessment/roofing-crm`, head `5a9ee9c`)

## Verdict
- **Variant 1 (demo gate pending, as-is): Inconclusive — 0/100 held pending demo.** Runtime was exercised and the core intent proven; only the non-runtime demo gate is unresolved (Hard rule 3). Not a candidate failure yet; becomes `Failed`/0 if no demo artifact is supplied.
- **Variant 2 (demo gate assumed passed — mandatory scorecard): Pass — 79/100.**

## Total score
**79/100** (variant 2). Variant 1: **0/100 pending** (gated, not a quality judgement).

## Intent
A roofing sales rep can find and qualify aging-roof and stalled-permit properties around a chosen point in Cook County and turn them into CRM leads, so outreach targets the highest-value roofs. **Proven** in the hosted runtime on real pipeline data (1,864,469 properties, 1,607,387 permits, 33,560 contractors; run `20261110T221716Z`, root CID present).

## Scorecard — Variant 2 (demo assumed passed, mandatory)
| Dimension | Weight | Band | Points | Why |
|---|---|---|---|---|
| Functional outcome | 40 | — | 33 | Sum of evaluation points below; BBB never surfaced, roofing-permit false positives at top of ranking |
| Runtime & demo quality | 20 | 75% | 15 | Stable, 0 console errors, searches 1–3 s, agent 5–12 s; mobile usable but map buried under 300-row list; demo not assessable |
| Evidence quality | 12 | 75% | 9 | Real-scale counts, provenance (run id, root CID, source links, ingested dates), persisted leads, agent citations; BBB and long-open-signal quality thin |
| Access-boundary compliance | 8 | 100% | 8 | Dataset read only via pipeline MCP 4-tool contract (bearer); no direct DB/blob access; leads in own SQLite |
| Implementation quality | 7 | 75% | 5 | Clean seams, real ranking/lead/agent logic, 82 unit + 8 e2e tests, CI; CDK stack decorative, uncached per-question embedding |
| Kit-usage conformance | 5 | 50% | 3 | metagross 62, alakazam 62; Docker/Caddy VM + OpenAI instead of cdk deploy + Bedrock; no Powertools/PagerDuty |
| Reproducibility | 4 | 50% | 2 | Hosted URL + docs + docker compose + fixtures reproduce locally; Caddy/VM config and CD absent from repo; no PR as system of record |
| Speed | 4 | 100% | 4 | 5 h 36 m from assignment sent to last commit |
| **Total** | **100** | | **79** | |

### Functional Outcome Breakdown (variant 2)
| Evaluation point | Sub-weight | Band | Points | Evidence / why |
|---|---|---|---|---|
| County default + centring (GPS / map pin / place / ZIP) + radius | 6 | 100% | 6 | Loads on Evanston 2 mi; place select → Loop; ZIP 60302 → "Centred on Oak Park"; map click moved pin to 41.90614,-87.77084 (962 in radius); GPS denial shows "User denied Geolocation"; slider 2→5 mi re-queried |
| Roof-age threshold filter at real scale | 7 | 75% | 5 | 12,961 in 2 mi radius, 300 shown; threshold spinbutton + confidence filter; weakness: "roof age" is year-built proxy ("179 y, low confidence", built 1847) so top leads are oldest buildings, not likely-aging roofs |
| Open roofing permits + long-open emphasis | 7 | 75% | 5 | Toggle → 16 in Loop 2 mi; long-open ≥2 y → 20 at Oak Park 5 mi ranked 4.6 y → 3.0 y; weakness: #1 lead `5643 W NORTH AVE` permit is an interior renovation ("egress walkway on roof"), `120 WOODBINE` is a garage build; same permit from assessor + Chicago feeds counted as "2 open permits" |
| Permit details: status, open duration, contractor, BBB | 6 | 50% | 3 | Drawer shows status (ACTIVE/PENDING/RECHECK), "open 4.3 y", issued date, contractor, source link; BBB was "not available (no contractor match)" on every record opened (~10) and in both agent answers — never demonstrated |
| Browsable candidate list from map/radius filters | 4 | 100% | 4 | 300-cap list with distance/age/permit summary, colour-coded markers, "Showing 300 of 12,961"; count wording inconsistent when filtered ("2 of 2 in radius") |
| CRM lead records (create/manage) + disabled future sections | 5 | 100% | 5 | Add from property and from permit → `leads.create` 200; status → contacted, notes saved (`leads.update`), delete (`leads.delete`), persisted across reload; leads page filters; 5 real disabled "coming soon" sidebar buttons |
| RAG agent NL queries | 5 | 100% | 5 | llm mode: BBB example chip → grounded answer, 8 citations, trace id; free-text "roofs older than 40 years near Skokie…" → 4 properties, 12 citations, Assumptions + Missing data sections |
| **Functional outcome subtotal** | **40** | | **33** | |

## Scorecard — Variant 1 (demo gate pending as-is)
| Dimension | Weight | Band | Points | Why |
|---|---|---|---|---|
| Functional outcome | 40 | 0% | 0 | Demo gate pending — held, not scored |
| Runtime & demo quality | 20 | 0% | 0 | Demo gate pending |
| Evidence quality | 12 | 0% | 0 | Demo gate pending |
| Access-boundary compliance | 8 | 0% | 0 | Demo gate pending |
| Implementation quality | 7 | 0% | 0 | Demo gate pending |
| Kit-usage conformance | 5 | 0% | 0 | Demo gate pending |
| Reproducibility | 4 | 0% | 0 | Demo gate pending |
| Speed | 4 | 0% | 0 | Demo gate pending |
| **Total** | **100** | | **0** | Becomes 79 once the demo artifact is supplied and shows the real outcome |

Functional Outcome Breakdown (variant 1): all seven points above at 0% / 0 pts, cause "demo gate pending"; subtotal 0/40.

## Gates
- **PR to prismteam-ai/roofing-crm: Blocked** — no PR exists; operator designated the local checkout `/home/vladsterian/repos/github_repos/roofing-crm` (branch `assessment/roofing-crm`, 18 candidate commits, +30,499 lines over skeleton) as the system of record. Recorded as a risk; must become a PR before a final record.
- **Hosted runtime: Pass** — https://roofing-crm.108-142-177-43.nip.io, public, `/health` `{"ok":true,"dataset":"mcp","agent":"llm"}`, `/build.json` commit `5a9ee9c`; exercised with Playwright at 1440x900 and 390x844.
- **Credentials: Pass** — public, per-browser workspace via `x-workspace-id`.
- **Demo artifact: Blocked (pending)** — not yet available; variant 2 assumes Pass.

## Hiring signal
**Strengths**
- Delivered the whole workflow end to end on real county-scale data in ~5.5 h: map search, filters, drawer, lead CRUD, grounded RAG agent, provenance everywhere.
- Honest engineering: documented limitations (8-item data-limitations panel), deviations stated in `docs/kit-usage.md`, offline deterministic agent for CI, 82 unit + 8 e2e tests across 390/768/1440.
- Strict MCP data boundary with Zod on both sides, retry/backoff/concurrency limits, request ids, secrets redacted; `.env` not tracked.

**Weaknesses**
- Lead-signal quality: roofing-permit classification lets non-roofing permits rank first; roof age = year built; BBB never visible. The CRM presents these as top leads without a confidence cue.
- Kit conformance partial: Docker/Caddy VM + OpenAI instead of `cdk deploy` + Bedrock; CDK stack would not run (SQLite on Lambda, missing env); no Powertools/PagerDuty; agent endpoint unauthenticated with no rate limit or token budget; per-question re-embedding of up to 300 docs.
- UX: desktop drawer covers the agent panel; permit ids overflow cards; delete has no confirmation; mobile map sits below a 300-row list.

**Material risks**: no PR and no demo yet; hosted deployment not reproducible from git (manual VM); sandbox workspace id is not auth.

**Follow-up questions**
1. How would you keep a false-positive "roofing" permit (interior renovation mentioning a roof walkway) out of the top of the lead list without changing the ingestion story?
2. BBB rating never appeared in the walk — what fraction of contractors in the dataset actually carry a rating, and how would you surface that coverage to a sales rep?
3. Why ship a CDK stack that cannot deploy rather than a minimal working one or none; what would it take to make it real?
4. What stops `agent.ask` from being abused on the public URL (cost, PII sent to OpenAI)?

## Detail
- **Timing**: sent 2026-11-10T17:11:00Z; latest commit 2026-11-11T00:46:46+02:00 (= 2026-11-10T22:46:46Z); elapsed **5 h 35 m 46 s**. First candidate commit 2026-11-10T19:58Z.
- **Worked (1440x900)**: default load → 300 of 12,961 in radius; drawer for `1705 LAKE ST` (PIN, year built, sale, owner, source link); open-permits toggle → 2 results, long-open → 0 at Evanston; Loop → 16 open permits; ZIP 60302 → Oak Park, 5 mi → 1,210 in radius; leads 0→2→1 with status/notes persisted; two agent answers in llm mode; data-limitations panel.
- **Worked (390x844)**: single-column layout, no horizontal overflow (markers clipped inside map), full-screen drawer, agent panel, leads page; state (pin, radius, filters, leads) persisted across viewport reload.
- **Failed/weak**: BBB rating never observed; non-roofing permit as #1 long-open lead; duplicate permit across two sources counted twice; `Contractor` on assessor permits looks like owner name (e.g. `H & B PERCE` = owner); long-open ≥2 y empty in Evanston/Loop at 2 mi (data sparsity, not a bug).
- **Blocked**: demo; PR; `ash` kit reviewer not consulted (Pillar 3 cutoff).
- **Access boundaries**: all dataset calls go `web → tRPC → McpDatasetClient → pipeline MCP` (`findProperties/getProperty/queryDataset/getDatasetInfo`); externals are OpenFreeMap tiles, Nominatim geocode, OpenAI; no direct DB/vector/blob access.
- **Console/network**: 0 errors; 7–13 warnings (WebGL ReadPixels perf + MapLibre "Expected number, found null" from null style values); all tRPC 200.
- **Implementation/kit**: implementation 70/100 (Pillar 3); kit-usage 62/100 (metagross 62 primary, alakazam 62, ash blocked; arceus routing primary=metagross, supporting donphan/alakazam/ash/mew).

## Pain points found in the live walk
| # | Viewport | Issue | Recommended fix |
|---|---|---|---|
| 1 | both | Top long-open lead (`5643 W NORTH AVE`, 4.3 y) is an interior renovation, not a roofing permit; garage build also flagged | Add a client-side roofing-keyword score or exclude descriptions dominated by non-roof scope; show the matched keyword as a badge |
| 2 | both | BBB column always "not available"; AC "BBB when available" never demonstrated | Expose dataset BBB coverage (e.g. "N contractors rated") in footer; add a filter "has BBB rating" so a rep can find the ones that exist |
| 3 | 1440 | Property drawer overlays and blocks the "Ask the agent" panel; chip click intercepted | Narrow drawer or dock it left of the agent panel; close drawer on agent focus |
| 4 | 1440 + 390 | Permit id (`cook_assessor_permits:0534…00:00:00.000`) overflows drawer card (desktop) and lead card (mobile, clipped) | `overflow-wrap:anywhere` on ids; show short permit number, full id in tooltip |
| 5 | 390 | Map sits below the 300-row candidate list; user scrolls ~2,000 px to reach it; root CID value hidden in top bar | Reorder mobile to controls → map → list, or collapse list to 20 with "show more"; show truncated CID |
| 6 | both | "Showing 2 of 2 in radius" after toggling permits contradicts "12,961 in radius" unfiltered | Keep `total_in_radius` as the unfiltered denominator and add "N match filters" |
| 7 | both | Same permit from assessor + Chicago feeds counted as "2 open permits" | Dedupe by PIN + issue date + normalised description before counting |
| 8 | both | Lat/Lon inputs keep stale values after place/ZIP/pin change | Sync inputs to the active pin |
| 9 | both | Lead "Delete" has no confirmation; immediate hard delete | Confirm dialog or undo toast; soft-delete status `lost` already exists |
| 10 | both | Agent answers mangle permit ids in prose (`ch.ic.b200466753`) though citations are correct | Instruct model to copy ids verbatim; render citations as the canonical list |

---

Side note: Playwright MCP wrote screenshots to `.playwright-mcp/` in repo root (untracked, not gitignored). No tracked file touched. Remove dir or add to `.gitignore` before PR.
