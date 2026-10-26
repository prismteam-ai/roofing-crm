---
id: QC-TC-B-09
type: test-cases
title: "Grounded agent + production hardening + real-data switch + prototype re-audit"
parent: [FEAT-B09, FEAT-B11]
story: stories/B-09-agent-hardening.md
spec: specs/009-agent-hardening/spec.md
owner: HebaGaber
status: Draft
gate: G6
version: 0.2
created: 2026-10-24
runtime_url: "{RUNTIME_URL} = https://crm.{domain} or the 009-agent-hardening Amplify branch preview; never localhost"
reviewed_code: "d8e9299 (plan/tasks only; no implementation commit yet)"
qc_signoff: false
---

# Test Cases: B-09 Grounded agent + production hardening + real-data switch + prototype re-audit

> **v0.2, 2026-10-25: real Run 2 test data filled in (§ 5) and the golden pass rules set to what the data supports (§ 8, TC-001, TC-009 to TC-015, TC-NF-01). v0.1, 2026-10-24.** Drafted with `developmentsupport-testcases` from the story's Given / When /
> Then ACs (AC-1 … AC-8), its edge cases, its Requirements table and `specs/009-agent-hardening/spec.md`'s
> FR-001 … FR-008. `tasks.md` was **not** read for this draft, per constitution XXII. Every case
> starts from `{RUNTIME_URL}` in a private window and logs in as `{TEST_USER}`. Playwright runs
> against `{RUNTIME_URL}`; `playwright.config.ts` must refuse `localhost`.
>
> Confidence bands used below are ADR-06's (`docs/architecture-constitution.md`): auto ≥0.92,
> clarify 0.80–0.92 or margin<0.05, refuse (`not_found`) <0.80 — the corrected wording already
> applied to the story's edge cases. Prototype screens referenced are at
> `design/prototype/CrmAsk*.dc.html`, not the story's earlier stale `design/screens/` path.
>
> Playwright test ids below are names only; `tests/e2e/responsive/ask.spec.ts` and
> `tests/agent/golden.test.ts` are not written yet.

## 1. Feature overview

A sales rep asks a plain-language question about roofing opportunities and gets a grounded,
cited, map-openable answer that can become a lead through the existing lead-creation path; an
evaluator can run the seven standard golden questions at scale, check the whole app's layout at
three widths, see a self-resolving health alert on a dashboard, confirm the data is the real
full-county publication (not a 35-row sample), and find zero unresolved drift from the approved
prototype. The value is a trustworthy agent that never invents a property, and a product proven
production-ready, not just demo-ready.

## 2. Requirement mapping

| Source | Reference | Covered by |
| --- | --- | --- |
| Acceptance criterion | B-09-AC-1 (cited, map-openable answer with stated center point) | TC-001, TC-002, TC-003 |
| Acceptance criterion | B-09-AC-2 (create lead from an answer, via `leads.create`, model never writes directly) | TC-004, TC-005, TC-006 |
| Acceptance criterion | B-09-AC-3 (out-of-scope ZIP, zero fabricated results) | TC-007, TC-008 |
| Acceptance criterion | B-09-AC-4 (7 golden queries, p95 < 20s, 100% groundedness) | TC-009…TC-015, TC-NF-01 |
| Acceptance criterion | B-09-AC-5 (full responsive suite, 390/768/1440, every screen) | TC-016, TC-017, TC-NF-02 |
| Acceptance criterion | B-09-AC-6 (DLQ alarm fires and self-resolves, visible on dashboard) | TC-018, TC-019 |
| Acceptance criterion | B-09-AC-7 (data read directly from Task A's published Run 2 manifest by CID) | TC-020, TC-021 |
| Acceptance criterion | B-09-AC-8 (prototype re-diff, fix or deferred-with-reason) | TC-022, TC-023 |
| Edge case | model call exceeds 23s server-side abort | TC-024 |
| Edge case | place-resolution confidence 0.80–0.92 or margin<0.05 → clarify, not a guess | TC-025b |
| Edge case | place-resolution confidence <0.80 → refuse (`not_found`), not a guess | TC-025 |
| Edge case | DLQ alert that never recovers stays active | TC-019b |
| Edge case | a screen-drift fix would reopen approved architecture → deferred with reason, not force-fixed | TC-023b |
| Functional requirement | FR-001 (cited, real records) | TC-001, TC-003 |
| Functional requirement | FR-002 (lead only via existing path, never model-direct) | TC-004, TC-005, TC-006 |
| Functional requirement | FR-003 (honest empty/invalid-scope answer) | TC-007, TC-008 |
| Functional requirement | FR-004 (7 golden queries, p95<20s, 100% real citations) | TC-009…TC-015, TC-NF-01 |
| Functional requirement | FR-005 (responsive at phone/tablet/desktop, every screen) | TC-016, TC-017 |
| Functional requirement | FR-006 (alert + auto-clear, dashboard-visible) | TC-018, TC-019 |
| Functional requirement | FR-007 (read by manifest CID, documented + reversible) | TC-020, TC-021 |
| Functional requirement | FR-008 (re-diffed, fixed or deferred with reason) | TC-022, TC-023 |
| NFR | ≤3 model calls/ask, 5 asks/min/user, $3/day cap, 23s server abort (ARD-B §10) | TC-024, TC-026, TC-027 |

## 3. Assumptions

- **Data source.** Per AC-7, this story's deployed build reads property/permit data directly by
  Task A's Run 2 full-county manifest CID `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`
  (441,961 properties / 15,025 permits). The test data in § 5 was read from this manifest on
  2026-10-25 (provenance recorded there); no placeholder token remains. **Do not** substitute B-03/B-07's earlier 35-row-sample fixtures;
  SC-005 explicitly requires the real publication.
- **Routes.** Ask screen `/ask` (or wherever `apps/web/src/routes/Ask/` mounts — confirm against
  the build; `{route}` marks where it may differ), map `/map`, leads list `/leads`.
- **Login.** `{TEST_USER}` is an environment variable. Each UI case (Type = UI in § 7) opens
  `{RUNTIME_URL}{route}` in a private window and logs in as `{TEST_USER}` as its first step, before
  any other action. Cases typed API, Infra, or Docs in § 7 are not browser journeys — "opening the
  hosted URL" for them means an authenticated call against `{RUNTIME_URL}`'s deployed API (API
  cases), a CDK-assertions or CloudWatch check against the deployed stack (Infra cases), or a
  reviewed-document check (Docs cases); each such case's steps say explicitly what it opens or
  calls instead of a browser page.
- **Place.** "Pflugerville" and "Manor" resolve against the gazetteer
  (`packages/oracle-views/gazetteer/travis-places@1.0.0`); their exact centers are read from the
  gazetteer at test time, not hard-coded here, so a gazetteer update doesn't silently stale this
  file.
- **Confidence bands are ADR-06's**, not a single 0.80 threshold: auto ≥0.92, clarify 0.80–0.92 or
  margin<0.05 between the top two candidates, refuse (`not_found`) <0.80.
- **Golden queries G1–G7** are `checks.md` §7.1's exact prompts, run against the pinned Run 2
  manifest, not the earlier sample — thresholds in §7.1/§7.2 apply as written.
- **Copy.** Exact assistant-facing strings are read from `design/prototype/CrmAsk*.dc.html` at test
  time; where the story/spec state a required phrase ("not in Run {n}"-style honesty), that exact
  phrase is asserted; otherwise the *behavior* (not an invented exact string) is asserted. See § 10
  if any copy gap surfaces during build.

## 4. Scope

- **In scope:** asking a plain-language question and getting a cited, map-openable answer;
  creating a lead from that answer through the existing `leads.create` path; an out-of-scope
  question's honest empty/invalid-scope response; the 7 golden queries at scale (latency +
  groundedness); the full responsive suite across every screen (old and new) at 3 widths; the DLQ
  alarm firing and self-clearing, visible on the `RoofingCrm` dashboard; the data-source switch to
  the Run 2 manifest CID; the prototype re-diff of every screen.
- **Out of scope:** vector/semantic search (ARD-08, not in v1); PagerDuty paging (SNS email
  substitute, already accepted); any new lead-store behavior beyond B-07; Atlas registration or an MCP
  name lookup (the CRM reads Task A's published data directly by CID, constitution B1); a ground-up
  prototype rebuild (B-03 already did this; this round is a targeted re-diff of drift since).

## 5. Test data

- **Place A (happy path):** "Pflugerville" — center resolved live from the gazetteer at test time;
  radius 5 mi (AC-1's exact wording, "within five miles of Pflugerville").
- **Place B (second golden query, inherited area):** same Pflugerville area as Place A (G2 inherits
  it), permit "open ≥5 years" ("many years").
- **Place C (exact-threshold query):** "Manor", radius 5 mi, roof age >5 years (G3).
- **Place D (ambiguous/low-confidence, edge case):** a deliberate misspelling, e.g. "Pflugervile"
  (one letter dropped) — expected to land in the 0.80–0.92 fuzzy band or trigger the margin<0.05
  clarify path per ADR-06; exact score depends on the live gazetteer and is read at test time, not
  hard-coded.
- **Place E (refuse, not clarify):** a clearly non-Travis, non-existent place name, e.g. "Zzyzxville" —
  expected score <0.80 → `not_found`.
- **Out-of-scope ZIP (AC-3, G6):** `99999` (not a Travis County ZIP).
- **Real permit number (G5):** `1981-001776 BP` (Austin, roofing replacement, **stalled**, issued
  1981-08-05, 16,516 days open when read on 2026-10-25), permit CID
  `baguqeeratgqigjx72ocnrviqvfzg3jeojnoz4r2slpejuljn5cyjibzbacza`, property CID
  `baguqeeradgf5m53kbzldg3rxy5fj6oy5ac5i5jc46pnxpvttkizlqiwap5sq` (TCAD id `284902`, Duplex,
  30.2425521, -97.7327896; no roof date, reason `no_roof_date`). Contractor is `unresolved`
  (`contractor_unresolved`); `bbb_rating` has no lexicon carrier, so the expected G5 answer is the
  permit found and cited, the BBB rating stated as not available.
- **Open (not stalled) long-running permit:** `1989-010586 BP`, status Planned, issued 1989-03-08,
  13,744 days open on 2026-10-25, permit CID
  `baguqeera2rehbqfcax5busc3737zzfwdqaci5f5hkjuh22muyqoizvsivxqa`, property CID
  `baguqeera7vhpi6mthe7kya66nli6hmcv3znfttativpbsnzrgloxjyhdhcvq` (TCAD id `205334`, no roof date).
  `2024-032172 BP` (Permitted, 948 days open) is the open permit with a short open time.
- **Austin property with roof age >= 20 and its basis (A1, TC-001 Austin variant):** property CID
  `baguqeeranjr5dt4wn5xcpa3flm6mgqcwlt5v35xbfixrrmo3dzzbig6ztsxa`, TCAD id `194401`, Commercial
  Building at 30.2672948, -97.7426184, roof age 33 years, `roofAgeBasis: permit`, confidence high,
  derived from its closed reroof permit `1992-000408 BP` (issued 1992-04-30, final 1993-03-02,
  permit CID `baguqeerawb5epsdnvytifm6dxq6yg5rvbvbjhj37zm7of2wlpsl4ra4yybwa`).
- **Three properties for the lead-create scenario (TC-004/006):** TCAD ids `194401` (33 years,
  basis permit, `1992-000408 BP`), `194348` (35 years, basis permit, `1989-012978 BP`, CID
  `baguqeeraburffmo4bnncbjjne6bxycz2bk4hi4v2ni4u625cbylnotjkdvyq`) and `194346` (41 years, basis
  permit, `1983-007189 BP`, CID `baguqeeraayekdy33assuaimhgoh5sghf2wibdfxt36btkqwz2l53ilbwoncq`);
  all within 3 mi of downtown Austin, all with roof age >= 20. The suite never creates leads on
  other properties; it deletes only the ones it created.
- **ZIP with results:** ZIP `78701` (Austin; gazetteer ZCTA centre 30.270569, -97.742589).
  Run 2 publishes no postal code (`postal_code` is `not_in_export` on every property), so a ZIP is
  answered as a radius around the ZCTA centre: 3 mi gives 34,828 properties, 2,874 with roof age
  >= 20, 31,374 with no roof date. There is no ZIP filter on the data itself.
- **Lakeway combined-filter case (G4):** "Lakeway" (30.354982, -97.986269), tenure >= 10 years,
  owner mailing address outside the area. Run 2 does not publish owner location
  (`owner_is_out_of_area` and `owner_area_class` are `not_in_export` for every property), so the
  expected result is `field_not_published` (or an answer that flags the constraint and asserts no
  owner location). In a 100-row sample within 5 mi of Lakeway, `isLongTenure` was true for 65,
  false for 5 and null (`no_dated_sale`) for 30.
- **Expected exact counts (read from the same index through the deployed API, 2026-10-25):**
  - County overview (zoom 8, no filter): 441,961 properties; 390,061 binned; 51,900 without
    coordinates; 380,569 binned properties without a roof age. Roof age >= 20: 7,922 matched
    (7,907 binned, 15 without coordinates, 432,451 without a roof date). Open roofing permits 80,
    stalled 1,669 (1,674 stalled and 80 open in the permit table, 15,025 permits in all).
  - Radius, roof age (counts `afterRadius` / `afterRoofAge`): Pflugerville 5 mi 47,282 / 0 for roof
    >= 15 (47,269 with no roof date); Manor 5 mi 26,983 / 2; Lakeway 5 mi 28,361 / 1; Austin
    (30.298622, -97.754134) 3 mi 31,001 / 2,585 for roof >= 15 and 2,462 for roof >= 20;
    Austin 5 mi 78,233 / 5,815 for roof >= 20.
  - Permits: Manor 5 mi has 3 roofing permits, 1 stalled older than 5 years (`1990-002676 BP`,
    13,156 days open), 0 open. Lakeway 5 mi has 6, of which 4 are stalled and older than 5 years
    (`1987-017516 BP`, `2000-001756 BP`, `2002-018982 BP`, `2007-124940 BP`). Within 2 mi of
    30.2672, -97.7431 there are 2,283 roofing permits, 274 open or stalled (9 open), 247 of them
    older than 5 years. Contractor: 0 of 15,025 permits resolved (manifest
    `coverage.contractor_resolved.count` is 0).
  - Provenance: manifest `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`, run
    `travis-full-run2-20261024`; read through `crm-api-trpc` (`search.properties`,
    `search.permits`, `search.countyOverview`, `property.get`) and the published parquet parts
    (`property_improvement`) fetched by CID from the CloudFront gateway.
  - Known limits of that API (defects, not data): `search.permits` returns every permit status
    with no limit; around downtown Austin it fails at 3 mi (response over the 6 MB Lambda limit)
    and 5 mi (28 s timeout), and for Pflugerville 5 mi it runs out of memory. Count cross-checks
    for permits therefore use `property.get` on cited rows, not `search.permits`.
- **Data snapshot:** manifest CID `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`
  (441,961 properties / 15,025 permits). Every agent-created lead must store this CID in
  `sourceManifestCid`.
- **Run-scoped values:** every lead created by this suite is created with a note/tag prefixed
  `B09-{yyyymmddHHMMss}-` so one run can be told apart from another.
- **Cleanup:** `afterAll` deletes only the leads `{TEST_USER}` created during that run (same
  cleanup helper B-07's suite established, GAP-3 there) — no other lead is touched.
- **DLQ trigger (AC-6/TC-018):** the existing forced-failure procedure from B-02's evidence
  (`docs/evidence/`), re-run here against `FetchPartDlq`.

## 6. Environment, risks and dependencies

- `RUNTIME_URL=https://009-agent-hardening.d1zmhc6kkyzsbe.amplifyapp.com` (branch preview; replace with `https://crm.{domain}` once promoted) · `{TEST_USER}` = the seeded admin `admin@roofing-crm.test`, password from Secrets Manager `roofing-crm/admin-user` into `CRM_TEST_PASSWORD` (environment only, never in a file). `{RUNTIME_URL}` and `{TEST_USER}` in the cases below are these two environment parameters, not unfilled data.
- B-07 merged (leads live, for the agent's `createLead`/confirm path) — confirmed (`8b13240`).
- The data-switch (AC-7) must be deployed before TC-001–TC-015, TC-020, TC-021 are meaningful —
  running them against the 35-row sample instead of the Run 2 manifest would pass for the wrong
  reason. Confirm `leadIndex.indexInfo().manifestCid` before running this suite.
- **Known gaps** that become expected-to-fail or blocked cases are listed in § 10 and linked from
  the rows they affect. First real run on Run 2 (2026-10-25, `docs/evidence/B-09.md`) recorded GAP-1 to GAP-5.

## 7. Coverage matrix

| TC ID | Title | Priority | Tags | Type | Requirement(s) | Playwright test |
| --- | --- | --- | --- | --- | --- | --- |
| B-09-TC-001 | Ask about Pflugerville permits, get cited answer | P1 | `@smoke @demo` | UI | AC-1, FR-001 | `tests/agent/golden.test.ts › "G1"` |
| B-09-TC-001a | Austin variant: roofs over 20 years within 3 mi of Austin answered with verified rows | P1 | `@smoke` | API | AC-1, FR-001 | `tests/agent/golden.test.ts › "A1"` |
| B-09-TC-002 | Open a cited result on the map | P1 | `@smoke` | UI | AC-1, FR-001 | `tests/e2e/responsive/ask.spec.ts › "open on map"` |
| B-09-TC-003 | Follow-up question inherits the area (G2) | P2 | `@demo` | UI | AC-1, FR-001 | `tests/agent/golden.test.ts › "G2"` |
| B-09-TC-004 | Create a lead from the agent's answer | P1 | `@smoke @demo` | UI | AC-2, FR-002 | `tests/agent/golden.test.ts › "G7"` |
| B-09-TC-005 | Agent never calls a direct write path | P1 | `@security` | API | AC-2, FR-002 | `apps/api/test/routers/agent.confirmLead.test.ts` |
| B-09-TC-006 | Lead created from the agent carries `createdFrom:"agent"` and appears in the lead list | P1 | `@smoke` | UI | AC-2, FR-002 | `tests/agent/golden.test.ts › "G7"` |
| B-09-TC-007 | Out-of-scope ZIP returns zero fabricated results | P1 | `@negative` | UI | AC-3, FR-003 | `tests/agent/golden.test.ts › "G6"` |
| B-09-TC-008 | Out-of-scope answer states the reason | P2 | `@negative` | UI | AC-3, FR-003 | `tests/agent/golden.test.ts › "G6"` |
| B-09-TC-009 | G1 passes at scale (groundedness + latency) | P1 | `@perf @smoke` | API | AC-4, FR-004 | `tests/agent/golden.test.ts › "G1"` |
| B-09-TC-010 | G2 passes (inherited area, "many years" stated) | P2 | `@perf` | API | AC-4, FR-004 | `tests/agent/golden.test.ts › "G2"` |
| B-09-TC-011 | G3 passes (exact thresholds, sorted by open duration) | P2 | `@perf` | API | AC-4, FR-004 | `tests/agent/golden.test.ts › "G3"` |
| B-09-TC-012 | G4 passes (combined filters, "outside the area" explained) | P2 | `@perf` | API | AC-4, FR-004 | `tests/agent/golden.test.ts › "G4"` |
| B-09-TC-013 | G5 passes (exact permit lookup, BBB cited or "not available") | P2 | `@perf` | API | AC-4, FR-004 | `tests/agent/golden.test.ts › "G5"` |
| B-09-TC-014 | G6 passes (zero results, says why) | P1 | `@perf @negative` | API | AC-4, FR-004 | `tests/agent/golden.test.ts › "G6"` |
| B-09-TC-015 | G7 passes (lead created, appears in list) | P1 | `@perf` | API | AC-4, FR-004 | `tests/agent/golden.test.ts › "G7"` |
| B-09-TC-NF-01 | All 7 golden queries, p95 < 20s, 100% groundedness | P1 | `@perf` | API | AC-4, FR-004 | `tests/agent/golden.test.ts › "p95 and groundedness"` |
| B-09-TC-016 | Every screen passes responsive check at 390/768/1440 | P1 | `@responsive @smoke` | UI | AC-5, FR-005 | `tests/e2e/responsive/*.spec.ts` |
| B-09-TC-017 | Ask screen's 6 states each render correctly at all 3 widths | P1 | `@responsive` | UI | AC-5, FR-005 | `tests/e2e/responsive/ask.spec.ts` |
| B-09-TC-NF-02 | No horizontal overflow or inaccessible control on any screen | P1 | `@responsive @a11y` | UI | AC-5, FR-005 | `tests/e2e/responsive/*.spec.ts` |
| B-09-TC-018 | Forced DLQ failure fires the alarm, visible on dashboard | P1 | `@ops @smoke` | Infra | AC-6, FR-006 | `infra/test/crm-sync-stack.alarmEmail.test.ts` + `infra/test/crm-ops-stack.dashboard.test.ts` (construct exists) backs the wiring; the live ALARM transition itself has no automated test — manual, forced failure + CloudWatch screenshot |
| B-09-TC-019 | Alarm self-resolves once the queue drains | P1 | `@ops` | Infra | AC-6, FR-006 | same backing as TC-018; the live OK transition is manual, no automated test — CloudWatch screenshot |
| B-09-TC-019b | Alarm stays active if the failure never recovers | P2 | `@ops @negative` | Infra | AC-6, edge case | no automated test — relies on the self-resolving alarm's own `treatMissingData: NOT_BREACHING` config (`infra/lib/crm-sync-stack.ts`); manual, forced non-recovering failure + CloudWatch screenshot |
| B-09-TC-020 | CRM/agent data traces to the Run 2 manifest CID | P1 | `@smoke` | API | AC-7, FR-007 | `apps/api/test/leadIndex.manifestCid.test.ts` |
| B-09-TC-021 | Direct read from Task A's published data documented | P2 | `@docs` | Docs | AC-7, FR-007 | no automated test — documentation review of `docs/architecture-constitution.md`, signed off by the QC Lead |
| B-09-TC-022 | Every listed screen re-diffed against current prototype | P1 | `@design` | Docs | AC-8, FR-008 | no automated test — visual design review against `design/design-review-log.md`, signed off by `audino` + the QC Lead |
| B-09-TC-023 | Every found mismatch fixed or logged with a reason | P1 | `@design` | Docs | AC-8, FR-008 | no automated test — visual design review against `design/design-review-log.md`, signed off by `audino` + the QC Lead |
| B-09-TC-023b | A drift fix that would reopen approved architecture is deferred, not forced | P2 | `@design @negative` | Docs | AC-8, edge case | no automated test — review of `design/design-review-log.md`'s deferral reasons, signed off by the QC Lead |
| B-09-TC-024 | A call exceeding 23s shows "took too long," never a blank/broken screen | P1 | `@negative @perf` | UI | edge case, NFR-001 | `tests/e2e/responsive/ask.spec.ts › "timeout"` |
| B-09-TC-025 | A clearly non-Travis place name is refused, not guessed | P1 | `@negative` | UI | edge case | `apps/api/test/services/agent/placeResolver.test.ts` |
| B-09-TC-025b | A misspelled/ambiguous place name triggers a clarifying question, not a guess | P1 | `@negative` | UI | edge case | `apps/api/test/services/agent/placeResolver.test.ts` |
| B-09-TC-026 | A 6th ask within one minute is throttled | P2 | `@negative @perf` | API | NFR-001 | `apps/api/test/agent/rateLimiter.test.ts` |
| B-09-TC-027 | A call estimated to exceed the $3/day cap is paused before the model is called | P2 | `@negative @perf` | API | NFR-001 | `apps/api/test/agent/spendCap.test.ts` |

## 8. Functional test cases

### B-09-TC-001: Ask about Pflugerville permits, get cited answer (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-1, FR-001 · demo line D-7
- **Preconditions:** logged in; the Run 2 manifest is the live index (TC-020 passed).
- **Test data:** question "Which properties in Travis County within five miles of Pflugerville
  have roofs older than 15 years?" (G1, checks.md §7.1).
- **Steps:**
  1. **Open** `{RUNTIME_URL}/ask` in a private window. → the Ask screen's empty/idle `data-state`.
  2. **Log in** as `{TEST_USER}`. → the Ask input is focused and enabled.
  3. **Type** the G1 question into the question input and submit. → `data-state="working"` appears immediately.
  4. **Wait** for the answer. → `data-state="answer"` within 20s.
  5. **Verify** the answer text states the geocoded center point it used for Pflugerville (lat/lon or a named landmark, read from the gazetteer).
  6. **Verify** every returned result card shows a real `property_cid` and a citation (source URL or "source not available" with a reason — never a blank citation).
- **Expected result:** the answer names the center point used, every result has a real,
  verifiable `property_cid` with a citation, and the roof-age filter (>15 years) is reflected in
  every returned result's shown roof age.
- **Run 2 data truth (§ 5):** within 5 mi of Pflugerville there are 47,282 properties and none
  has a roof age of 15 years or more (47,269 have no roof date, 13 are younger). The passing
  result on Run 2 is therefore an honest empty: `outcome: "empty_in_scope"`, zero results, zero
  citations, the 47,269 excluded for no roof date and the reason stated, and the Pflugerville
  centre named. A list of Pflugerville roofs would be fabricated and fails.
- **Austin variant (TC-001a, golden A1):** "Which properties within 3 miles of Austin have roofs
  older than 20 years?" must be `answered`: centre Austin city (30.298622, -97.754134), 2,462
  matching properties, every cited row (for example TCAD `194401`, 33 years, basis permit)
  verifying against the index. ("downtown Austin" is not a gazetteer place and is correctly
  refused.)

### B-09-TC-002: Open a cited result on the map

- **Priority / tags:** P1 · `@smoke`
- **Maps to:** AC-1, FR-001
- **Preconditions:** TC-001 completed, at least one result card is shown.
- **Steps:**
  1. **Click** "Open on map" on the first result card. → navigates to `{RUNTIME_URL}/map` (or the
     map panel opens in place, per the build).
  2. **Verify** the map centers on that result's exact coordinates and its pin is selected/highlighted.
  3. **Verify** the property detail shown on the map matches the `property_cid` cited in the Ask answer.
- **Expected result:** the same property, identified by the same `property_cid`, appears
  selected on the map — no mismatch between the cited record and the opened one.

### B-09-TC-003: Follow-up question inherits the area (G2)

- **Priority / tags:** P2 · `@demo`
- **Maps to:** AC-1, FR-001 · checks.md G2
- **Preconditions:** TC-001 completed in the same `threadId`/conversation.
- **Test data:** "Which properties near that area have open roofing permits that have been open
  for many years, and who is the listed contractor?"
- **Steps:**
  1. **Type** the G2 follow-up into the same conversation and submit.
  2. **Verify** the answer does not ask the rep to re-specify the area (area is inherited from G1).
  3. **Verify** the answer states its meaning of "many years" (e.g. "open ≥5 years").
  4. **Verify** each result shows a contractor name or "contractor not available" (never a blank or guessed name), and a BBB rating or "BBB rating not available."
- **Expected result:** area inherited correctly; "many years" threshold stated explicitly;
  contractor/BBB fields are either real values with citations or an honest "not available."

### B-09-TC-004: Create a lead from the agent's answer (happy path)

- **Priority / tags:** P1 · `@smoke @demo`
- **Maps to:** AC-2, FR-002 · checks.md G7
- **Preconditions:** TC-001 completed, at least 3 candidate properties shown.
- **Test data:** "Create a lead for the first result."
- **Steps:**
  1. **Type** "Create a lead for the first result" and submit.
  2. **Verify** a confirmation card appears naming the first result's property (never an immediate silent write).
  3. **Click** "Create" / "Confirm" on the card.
  4. **Verify** the lead appears, with status `new`, within 2s (same latency bar as B-07's AC-1).
  5. **Navigate** to `{RUNTIME_URL}/leads`. → the new lead is visible at the top of the list.
- **Expected result:** the lead exists, `createdFrom: "agent"`, `sourceManifestCid` = the pinned
  Run 2 CID, and it is the same property the agent cited (same `property_cid`/`tcadId`).

### B-09-TC-005: Agent never calls a direct write path (security/regression)

- **Priority / tags:** P1 · `@security`
- **Maps to:** AC-2, FR-002 — constitution P0 rule
- **Type:** API/code-inspection, run as an automated check, not a manual UI step.
- **Steps:**
  1. **Inspect** the deployed/built `services/agent/tools.ts` module's import graph.
  2. **Verify** it does not import `LeadService` or `requireLeadService` anywhere.
  3. **Call** `agent.ask` with a question that would plausibly trigger a `proposeLeads` tool call, without ever calling `agent.confirmLead`.
  4. **Verify** `leads.list` shows no new lead as a result of step 3 alone.
- **Expected result:** no lead is created unless the separate, rep-triggered `agent.confirmLead`
  mutation is called — the model's own tool set has no path to a write.

### B-09-TC-006: Agent-created lead carries correct provenance and appears in the list

- **Priority / tags:** P1 · `@smoke`
- **Maps to:** AC-2, FR-002
- **Preconditions:** TC-004 completed.
- **Steps:**
  1. **Open** the lead created in TC-004 from `{RUNTIME_URL}/leads`.
  2. **Verify** its detail view shows `createdFrom: "agent"` and the pinned manifest CID as its source.
  3. **Verify** its signals (roof age, basis, open permit id, contractor, BBB rating) match what the agent's answer cited.
- **Expected result:** full provenance matches the agent's cited answer; no field is invented or
  silently changed between the answer and the stored lead.

### B-09-TC-007: Out-of-scope ZIP returns zero fabricated results (negative/missing-data)

- **Priority / tags:** P1 · `@negative`
- **Maps to:** AC-3, FR-003 · checks.md G6
- **Test data:** "How many properties have roofs older than 40 years in ZIP 99999?"
- **Steps:**
  1. **Open** `{RUNTIME_URL}/ask`, log in.
  2. **Type** the G6 question and submit.
  3. **Verify** `data-state` reaches an out-of-scope/empty state, not "answer" with results.
  4. **Verify** the result count shown is exactly 0, and the `citations` list is empty.
- **Expected result:** zero results, zero citations, no invented property.

### B-09-TC-008: Out-of-scope answer states the reason

- **Priority / tags:** P2 · `@negative`
- **Maps to:** AC-3, FR-003
- **Preconditions:** TC-007 completed.
- **Steps:**
  1. **Verify** the answer text explicitly names ZIP 99999 and states it is not a Travis County ZIP (or equivalent honest reason).
- **Expected result:** the exact scope checked and rejected is named in the answer text — not a
  generic "no results" with no explanation.

### B-09-TC-009 … B-09-TC-015: Golden queries G1–G7 pass at scale

- **Priority / tags:** P1/P2 · `@perf`
- **Maps to:** AC-4, FR-004 · checks.md §7.1/§7.2, one TC per query (G1=TC-009/already covered by
  TC-001's functional happy path — this group re-runs it under the automated grading harness
  rather than duplicating the manual steps; G2=TC-010, G3=TC-011, G4=TC-012, G5=TC-013, G6=TC-014,
  G7=TC-015).
- **Steps (automated, per query, via `tests/agent/golden.test.ts`):**
  1. **Call** `agent.ask` with the query's exact prompt from `tests/agent/golden.json`.
  2. **Verify** groundedness: every returned `property_cid` resolves via `property.get` against
     the live index, and the answer's `manifestCid` equals the pinned Run 2 CID.
  3. **Verify** correctness: re-read every cited row with `property.get` (inside the stated radius,
     meets the stated roof-age, status and open-duration filters, permit present and same status);
     for property questions the answer's matched count must equal `search.properties`' own count
     for the same centre, radius and roof age. (`search.permits` is not used as the oracle: it
     cannot serve a 3 to 5 mi radius around central Austin.)
  4. **Verify** honesty: the answer text states its assumptions (center, thresholds) and flags any
     missing data.
  5. **G6 only:** verify zero results and an explicit "scope invalid/empty" statement.
  6. **G7 only:** verify the proposed lead, once confirmed, appears in `leads.list`.
- **Expected result:** each of G1–G7 individually passes its grading rule from checks.md §7.2,
  where the rule is the truth of Run 2 (`tests/agent/passRules.ts`, `tests/agent/golden.json`):
  - G1 (Pflugerville, roof > 15): answered with verified rows, or an honest empty (see TC-001). Run 2: honest empty.
  - G2 (inherits Pflugerville, open permits, contractor): answered or honest empty; any contractor
    or BBB value is a failure (0 of 15,025 permits have a resolved contractor).
  - G3 (Manor, open permits over 5 years, sorted by open duration): answered or honest empty
    about Manor. Run 2: Manor 5 mi has 3 roofing permits, 1 stalled over 5 years
    (`1990-002676 BP`) and none open, so the status wording decides which.
  - G4 (Lakeway, 10+ years, owners outside the area): `field_not_published`, or an answer that
    flags the owner-location constraint as unsupported (`not_in_export`) and never asserts an
    owner is outside the area. Run 2 does not publish owner location.
  - G5 (permit `1981-001776 BP`): answered, the permit cited (permit CID in § 5), the BBB rating
    and contractor stated as not available.
  - G6 (ZIP 99999): refusal, zero claims, citations, rows and count.
  - G7: seeded with A1 (G1 has no rows on Run 2), propose then confirm, lead in `leads.list`.
  - Austin variants A1 to A5 (§ 5 data) must be `answered` with real, verified rows (A3 with the
    contractor and BBB stated as not available).
  Honest empties are accepted only with zero claims, citations and rows, matched 0, and the
  reason in structured fields. The resolved area must match the place in the prompt.

### B-09-TC-NF-01: All 7 golden queries, p95 < 20s, 100% groundedness

- **Priority / tags:** P1 · `@perf`
- **Maps to:** AC-4, FR-004
- **Steps:**
  1. **Run** the golden set (G1 to G7 and the Austin variants A1 to A5: 13 asks per repeat, G7
     counted as its seed plus its own ask), 3 repeats (39 asks), paced 13 s apart to stay under 5 asks/min.
  2. **Measure** "first useful answer" latency for each ask.
  3. **Compute** p95 across all latencies (report n; with fewer than 20 samples the p95 equals the maximum).
  4. **Compute** citation groundedness: (cited `property_cid`s that resolve) / (total cited) across all answers.
- **Expected result:** p95 < 20.000s; groundedness = 100.00%; zero asks hit `rate_limited` or
  `paused` from the test harness's own pacing.

### B-09-TC-016: Every screen passes the responsive check at 390/768/1440

- **Priority / tags:** P1 · `@responsive @smoke`
- **Maps to:** AC-5, FR-005
- **Steps (per screen: CrmMap, FilterSheet, PropertyDetail, ContractorBadge, ResultsPanel,
  LeadsList, LeadDetail, AppShell/NavRail, Ask):**
  1. **Open** `{RUNTIME_URL}{route}` at viewport 390×844 (phone). → no horizontal scroll
     (`document.documentElement.scrollWidth <= clientWidth`); every interactive control is tappable
     and visible without overlap.
  2. **Resize** to 768×1024 (tablet). → layout switches to tablet mode per the design tokens; no
     overflow.
  3. **Resize** to 1440×900 (desktop). → full rail/desktop layout; no overflow.
- **Expected result:** all 3 widths pass with zero overflow and zero inaccessible controls, on
  every listed screen.

### B-09-TC-017: Ask screen's 6 states each render correctly at all 3 widths

- **Priority / tags:** P1 · `@responsive`
- **Maps to:** AC-5, FR-005
- **Test data:** working, answer-with-citations, no-results, low-confidence, throttled, paused —
  each triggered via its deterministic test input (TC-001 for "working"/"answer", TC-007 for
  "no-results", TC-025 for "low-confidence", TC-026 for "throttled", TC-027 for "paused").
- **Steps:**
  1. For each state, trigger it, then repeat TC-016's 3-width check on the Ask screen alone.
- **Expected result:** each `data-state` renders without overflow or inaccessible controls at all
  3 widths.

### B-09-TC-018: Forced DLQ failure fires the alarm, visible on the dashboard

- **Priority / tags:** P1 · `@ops @smoke`
- **Maps to:** AC-6, FR-006
- **Steps:**
  1. **Trigger** a sync-job failure that lands a message on `FetchPartDlq` (same forced-failure
     procedure as B-02's evidence).
  2. **Open** the CloudWatch `RoofingCrm` dashboard.
  3. **Verify** the DLQ-depth widget shows depth > 0 and the alarm widget shows `ALARM` within one
     evaluation period.
- **Expected result:** the alarm visibly transitions to `ALARM` on the dashboard, with a nonzero
  DLQ depth shown.

### B-09-TC-019: Alarm self-resolves once the queue drains

- **Priority / tags:** P1 · `@ops`
- **Maps to:** AC-6, FR-006
- **Preconditions:** TC-018 completed (alarm is in `ALARM`).
- **Steps:**
  1. **Let** the queue's existing redrive/retry drain the message (or manually drain it for the test).
  2. **Verify** the dashboard's DLQ-depth widget returns to 0.
  3. **Verify** the alarm widget transitions back to `OK`, with no manual reset action taken.
- **Expected result:** alarm clears automatically once the queue is empty — no human intervention
  needed to clear it.

### B-09-TC-019b: Alarm stays active if the failure never recovers (edge case)

- **Priority / tags:** P2 · `@ops @negative`
- **Maps to:** AC-6, edge case
- **Steps:**
  1. **Trigger** a DLQ message that is designed not to drain (e.g. a permanently malformed part).
  2. **Wait** past the normal drain window.
  3. **Verify** the alarm remains `ALARM`, never silently clearing while depth stays > 0.
- **Expected result:** the alarm never clears while the underlying failure is unresolved.

### B-09-TC-020: CRM/agent data traces to the Run 2 manifest CID

- **Priority / tags:** P1 · `@smoke`
- **Maps to:** AC-7, FR-007
- **Steps:**
  1. **Call** the deployed API's index-info endpoint (or equivalent) and read `manifestCid`.
  2. **Verify** it equals `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`.
  3. **Open** `{RUNTIME_URL}/map` and verify the property count shown is consistent with 441,961
     properties in scope (not the earlier 35-row sample's count).
- **Expected result:** both the API and the UI trace to the real Run 2 publication.

### B-09-TC-021: Direct read from Task A's published data documented

- **Priority / tags:** P2 · `@docs`
- **Maps to:** AC-7, FR-007
- **Steps:**
  1. **Open** `.specify/memory/constitution.md` (B1) and `docs/architecture-constitution.md` (§7).
  2. **Verify** both say the CRM reads Task A's published data directly: the manifest named by
     `DATA_MANIFEST_CID` and its parts, by CID, with the MCP as an optional cross-check only.
- **Expected result:** the data path is written down explicitly and matches the built sync job.

### B-09-TC-022: Every listed screen re-diffed against current prototype

- **Priority / tags:** P1 · `@design`
- **Maps to:** AC-8, FR-008
- **Steps:**
  1. **Open** `design/design-review-log.md`.
  2. **Verify** it has a row for each of: CrmMap, FilterSheet, PropertyDetail, ContractorBadge,
     ResultsPanel, LeadsList, LeadDetail, AppShell/NavRail, and each new Ask state.
  3. **Verify** each row is no longer "Not yet re-checked" — it is either "Incorporated" or
     explicitly "Deferred: {reason}".
- **Expected result:** every row has a terminal status; none are left unresolved.

### B-09-TC-023: Every found mismatch fixed or logged with a reason

- **Priority / tags:** P1 · `@design`
- **Maps to:** AC-8, FR-008
- **Preconditions:** TC-022 completed.
- **Steps:**
  1. **For** each "Incorporated" row, **verify** the referenced fix is present in the live build
     (spot-check spacing/token/copy against `design/prototype/CrmAsk*.dc.html` and the matching
     existing-screen prototype file).
  2. **For** each "Deferred" row, **verify** it states a concrete reason, not a placeholder.
- **Expected result:** zero rows with a vague or missing reason; fixed rows are verifiably fixed
  in the live build.

### B-09-TC-023b: A drift fix that would reopen approved architecture is deferred, not forced (edge case)

- **Priority / tags:** P2 · `@design @negative`
- **Maps to:** AC-8, edge case
- **Steps:**
  1. **Identify** (from `design/design-review-log.md`) any mismatch whose fix would require
     changing an already-approved architecture decision (e.g. ADR-06's confidence bands, a G3-
     approved data shape).
  2. **Verify** it is marked "Deferred" with that exact reason, not silently force-fixed.
- **Expected result:** no architecture decision is reopened under this story's time pressure
  without an explicit, separate decision.

### B-09-TC-024: A call exceeding 23s shows "took too long," never a blank/broken screen

- **Priority / tags:** P1 · `@negative @perf`
- **Maps to:** edge case, NFR-001
- **Steps:**
  1. **Trigger** an ask under a test-only injected-delay condition (staging flag) that exceeds 23s.
  2. **Verify** the Ask screen reaches `data-state="timed_out"` with a clear "this took too long,
     try again" message — never a spinner forever, never a blank page, never an unhandled error.
- **Expected result:** a typed, visible timeout state, with a retry affordance.

### B-09-TC-025: A clearly non-Travis place name is refused, not guessed

- **Priority / tags:** P1 · `@negative`
- **Maps to:** edge case (place-resolution <0.80)
- **Test data:** "Zzyzxville" (place name not in the gazetteer, no plausible fuzzy match).
- **Steps:**
  1. **Ask** "roofs older than 15 years near Zzyzxville."
  2. **Verify** the answer refuses (`not_found`) rather than picking an arbitrary center point.
  3. **Verify** the refusal offers to rephrase, and makes no tool calls that return property rows.
- **Expected result:** `outcome: "not_found"`, zero results, no guessed center point.

### B-09-TC-025b: A misspelled/ambiguous place name triggers a clarifying question, not a guess

- **Priority / tags:** P1 · `@negative`
- **Maps to:** edge case (place-resolution 0.80–0.92, or margin<0.05 between top-2 candidates — ADR-06)
- **Test data:** Place D, "Pflugervile" (one letter dropped from "Pflugerville").
- **Steps:**
  1. **Ask** "roofs older than 15 years near Pflugervile."
  2. **Verify** the place-resolution score for this question (read from the `agent.ask` response's
     trace/debug field, or from `apps/api/test/services/agent/placeResolver.test.ts`'s equivalent
     unit assertion) falls in 0.80–0.92, or the top two candidates are within 0.05 of each other.
  3. **Verify** the answer's `outcome` is `needs_clarification`, offering the top 3 place candidates
     as options — never silently auto-accepting the misspelling and never refusing outright.
  4. **Verify** no `searchProperties`/`searchPermits` tool call was made before the rep picks a
     candidate (no results shown alongside the clarifying question).
- **Expected result:** `outcome: "needs_clarification"`, top-3 candidates shown (including
  "Pflugerville"), zero property results returned until the rep disambiguates.

### B-09-TC-026: A 6th ask within one minute is throttled

- **Priority / tags:** P2 · `@negative @perf`
- **Maps to:** NFR-001
- **Steps:**
  1. **Send** 5 asks for `{TEST_USER}` within the same 60-second window.
  2. **Send** a 6th ask immediately after.
  3. **Verify** the 6th returns `outcome: "rate_limited"` with a `retryAfterSec` value, not a 500
     and not a silent model call.
- **Expected result:** exactly 5 asks succeed per rolling minute per user; the 6th is cleanly
  throttled.

### B-09-TC-027: A call estimated to exceed the $3/day cap is paused before the model is called

- **Priority / tags:** P2 · `@negative @perf`
- **Maps to:** NFR-001
- **Steps:**
  1. **Simulate** (via test-only seeded usage record) `{TEST_USER}`'s daily spend at the $3 cap.
  2. **Send** one more ask.
  3. **Verify** the response is `outcome: "paused"` and that no Bedrock/Gateway model call was made
     (checked via the `AgentModelCallsTotal` metric / mock call count — zero increment).
- **Expected result:** the spend cap is enforced *before* any model call, never after.

## 9. Edge cases

(Captured above as TC-024, TC-025/TC-025b, TC-019b, TC-023b — the spec's 4 edge cases (the
place-confidence edge case needs two cases, one per ADR-06 band: refuse below 0.80, clarify
0.80–0.92), each with its own
case rather than folded into a happy-path case, since each needs its own deterministic trigger.)

## 10. Gap-linked cases (expected to fail until fixed)

| TC ID | Asserts | Gap | Defect |
| --- | --- | --- | --- |
| B-09-TC-013 (G5) | Permit-number lookup answers with the permit cited and the BBB rating "not available" | GAP-1 | The lookup runs the county-wide permit search (all properties in a 25 mi radius): `Runtime.OutOfMemory` at 1024 MB, then 28 s timeout; the caller gets no parsable response. Same class: `search.permits` over 3 to 5 mi around central Austin. |
| B-09-TC-011, TC-012 (G3, G4) | The place in the prompt resolves to Manor / Lakeway | GAP-2 | The plan step returned the whole question as `area.query` on a repeat (`needs_clarification`), after answering `empty_in_scope` on the first run. Non-deterministic place extraction. |
| B-09-TC-012 (G4) | Owner-outside-the-area half is flagged as not published | GAP-3 | First run returned `empty_in_scope` with no recorded reason; owner location is `not_in_export` for every property. Needs the answer's `missing`/`unsupported` inspected on a re-run. |
| B-09-TC-NF-01 | p95 under 20 s, max under 23.5 s | GAP-4 | First run: 11 timed asks, p95 and max 23.7 s (ZIP 78701 radius ask timed out at the 23 s abort); the failed G5 call took 28.4 s on a repeat. |
| B-09-TC-015 (G7) | Lead created from the first result, appears in the list | GAP-5 | Not exercised on Run 2: the seed question failed in the first run because the prompt said "downtown Austin" (not a gazetteer place). Needs a re-run with the "Austin" wording. |
