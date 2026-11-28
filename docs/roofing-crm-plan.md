# Roofing CRM & Lead Identification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use 10x-engineer:subagent-driven-development (recommended) or 10x-engineer:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Revised 2026-11-26 after plan review:** fork-based repo layout and PR gate, AWS CDK hosting
(Amplify + Lambda + DynamoDB), Vercel AI SDK, the CRM consumes the Oracle over HTTP (no DuckDB
in the CRM), submission only on a county-scale manifest.

**Goal:** A **hosted**, map-based roofing lead CRM for Broward County that a grader can exercise
in a browser at a public HTTPS URL. It:
- finds aged roofs and long-open roofing permits around a GPS point or dropped pin;
- shows contractor and BBB details;
- converts matches into managed lead records;
- answers natural-language lead questions through a RAG-backed agent.

**Architecture:** Turborepo (pnpm, TypeScript), deployed with CDK in `us-east-2`.
- `apps/web` is React + Vite + MapLibre GL on Amplify.
- `apps/api` is a tRPC router on Lambda behind API Gateway. It reads one immutable Oracle run
  through the hosted Oracle HTTP API (`ORACLE_API_URL`), pinned to `ORACLE_MANIFEST_CID` and
  validated with the Oracle repo's zod `contract`. It stores CRM-owned leads in DynamoDB.
- `packages/agent` runs a Vercel AI SDK tool loop whose tools come from an MCP client
  (`@ai-sdk/mcp`) connected to the hosted Oracle `/mcp`. It is served from a Lambda Function URL.

**Tech Stack:**
- App: Node ≥ 22.18, TypeScript, pnpm, Turborepo, tRPC v11 (`@trpc/server/adapters/aws-lambda`), zod, React 19 + Vite, MapLibre GL JS (OpenFreeMap style, no API key), TanStack Query, `@turf/circle`.
- Data and agent: AWS SDK v3 DynamoDB (`@aws-sdk/lib-dynamodb`), Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/mcp`), Oracle `contract` (git dependency on the Oracle repo; types and zod only).
- AWS: CDK (`aws-cdk-lib`: Amplify, API Gateway HTTP API, Lambda, Function URL, DynamoDB, SSM, Budgets), Powertools for AWS Lambda (TypeScript).
- Quality: vitest, Testing Library, Playwright, DynamoDB Local (Docker) for repository tests, Prettier + ESLint, GitHub Actions CI.

**Spec:** [`../README.md`](../README.md) · Architecture (in the Oracle repo, which owns the data contract): [`../../oracle-property-intelligence-platform-pipeline-broward-fl/docs/roofing-oracle-architecture-and-roadmap.md`](../../oracle-property-intelligence-platform-pipeline-broward-fl/docs/roofing-oracle-architecture-and-roadmap.md) (decisions, §0 grading, §0.1 kit deviations, §5 contract) · Data contract: Oracle plan Tasks 2, 13, 14, 15.

**Repo:** `~/git/roofing-crm/`. `origin` = `github.com/shengda/roofing-crm`, `upstream` = `github.com/prismteam-ai/roofing-crm`. The PR goes from the fork to the designated repo; confirm the fork relationship in Oracle Task 0. Paths below are relative to this folder. The team kit is not modified. Test command: `pnpm vitest run <path>` from the repo root (vitest workspace); e2e: `pnpm playwright test`.

## Global Constraints

- **Location and filters:** default county **Broward, FL**; the map opens centered on Broward (`{ lat: 26.15, lon: -80.30 }`, zoom 10). Roof-age threshold defaults to **15 years** and is user-configurable; the radius is user-configurable (0.25–25 miles, default 5).
- **Data scope:** data gathering, ingestion and source integration are **out of scope**. The CRM reads only the Oracle HTTP API v1 (`ORACLE_API_URL`) and MCP (`ORACLE_MCP_URL`) for the run named by `ORACLE_MANIFEST_CID`. It never reads Lexicon tables, Parquet or DuckDB, and ships no data cache. In development, `ORACLE_API_URL` points at a local `oracle serve --fixture fixtures/elephant-mini`.
- **Identifiers:** `propertyId` = Lexicon `parcel_identifier` (stable lead key); `propertyCid` = Elephant property CID (provenance); `permitId` = Oracle permit key `<source_system>:<permit_number>`.
- **Product limits:** no live BBB API calls (display BBB data present in the run only). Outbound messaging is mocked or absent. Disabled sections for future expansion are visible but non-functional.
- **Kit engineering baseline (`apply-engineering-guidelines`, which Slowking also loads):**
  - TypeScript everywhere.
  - Every LLM call goes through the Vercel AI SDK; direct provider SDKs are forbidden and an ESLint rule bans `@anthropic-ai/sdk`.
  - AWS `us-east-2` with CDK only; every resource tagged `project_name`.
  - Powertools Logger/Tracer/Metrics on every Lambda.
  - Vitest + GitHub Actions CI, Prettier + ESLint, `tsc`.
  - Follow `build-frontend-backends`: Amplify frontend, tRPC on Lambda, CDK in `infra/`.
  - Deviations only as recorded in architecture §0.1.
- **Grading (Slowking, see the architecture doc §0):**
  - A **hosted, public HTTPS runtime** is mandatory: `localhost`, "clone and run", local Docker or tunnels score 0/100. HTTPS is also required for GPS.
  - Every README demo step must be observable on the hosted URL.
  - The PR from the fork to the designated assignment repo is the system of record. It links the hosted URL, credentials (public; per-browser demo workspace), the demo video, setup docs and the kit-deviation summary.
  - The CRM is built (M4) and submitted (M5) only on a published **county-scale** Oracle manifest, never the fixture (toy data scores extremely low).
  - The final submission commit is the last commit: Slowking's Speed score runs to the PR head's latest commit, so post-submission notes go in PR comments.
  - **Observable in a headless browser:** Slowking drives a Playwright browser that may have no WebGL and no geolocation permission. If the map cannot initialise, the page shows a notice and the candidate list, filters and lead conversion still work; the search center can be set without the map (address/city search via the Oracle's `resolve_place`, or lat/lon inputs).
  - **Public, no login, isolated writes:** the grader must create leads, so each browser gets its own **demo workspace** (an httpOnly cookie `crm_ws`, issued on first visit, seeded with a few demo leads on real Broward properties, expiring after 7 days). Graders and visitors never see or change each other's leads, and the PR credentials line is simply "public".
- **Secrets and cost:** the Claude API key lives only in SSM Parameter Store; the agent is rate-limited per IP with a daily budget cap; an AWS Budgets alarm guards the account. Leads persist in DynamoDB.
- **Never commit:** `.env*` (except `.env.example`), API keys, AWS credentials, local database files, `cdk.out/` or Oracle data.

## Review Focus

1. **Pin dropped outside Broward (ocean, other county)** — search returns no candidates with `outsideCoverage: true` and the UI explains it, instead of an error or empty silence. (Task 2, Task 5)
2. **Agent asked about an unknown place** ("within five miles of Springfield") — agent states the assumption (uses the map center) or asks, never invents coordinates. (Task 8)
3. **Converting the same property twice** — returns the existing active lead; no duplicate, even under concurrent requests. (Task 3)
4. **Snapshot updated after leads exist** — leads whose property changed or disappeared are flagged `stale`, never deleted. (Task 3)
5. **GPS permission denied or unavailable** — falls back to the county center / pin mode with a visible message. (Task 5)
6. **Oracle unavailable or serving a different manifest** — the UI shows a degraded banner naming the expected and actual manifest CIDs; lead pages keep working; no silent mixing of runs. (Task 2, Task 4)
7. **Two browsers convert the same property** — each workspace gets its own lead; the uniqueness guard is per workspace; neither sees the other's leads. (Task 3, Task 4)

## Execution Order (architecture §6.1: M4 Query, then M5 Deploy)

The CRM is milestone **M4** of the five (ingest → inspect → upload → query → deploy) and is local until **M5**.

1. **Early, optional:** T1 → T4 against the Oracle fixture (`oracle serve --fixture fixtures/elephant-mini`) and DynamoDB Local, while the Oracle's M1 downloads and hashing run unattended.
2. **M4 Query** (after the Oracle's M3 publishes run 2): point `ORACLE_API_URL` / `ORACLE_MCP_URL` at a local `oracle serve --manifest <run 2 CID>` (published, synced and sha256-verified data) and set `ORACLE_MANIFEST_CID` to match. Build T5 → T9 on real county-scale data, then T10: `e2e/demo.spec.ts` passes locally in both Playwright projects.
3. **M5 Deploy:** T11 (hosted CRM on the hosted Oracle), re-run T10 against the hosted URL, open the draft PR and run a Slowking gate check, then T12 (submission).

---

### Task 1: Monorepo scaffold, CI and Oracle contract wiring

**Files:**
- Create:
  - Root config: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `vitest.workspace.ts`, `eslint.config.js` (incl. `no-restricted-imports` for `@anthropic-ai/sdk`), `.prettierrc`, `.gitignore` (`.env*`, `!.env.example`, `cdk.out/`, `data/`).
  - CI: `.github/workflows/ci.yml` (`tsc`, ESLint, Prettier check, `vitest run`).
  - `.env.example`:
    - Oracle: `ORACLE_API_URL=` (hosted Oracle, or `http://localhost:4317` for the fixture server), `ORACLE_MCP_URL=`, `ORACLE_MANIFEST_CID=` (expected run).
    - Agent: `ANTHROPIC_API_KEY=` (local development only; hosted reads SSM), `CRM_AGENT_MODEL=`, `AGENT_DAILY_TOKEN_BUDGET=`, `RATE_LIMIT_PER_MINUTE=`.
    - Leads: `LEADS_TABLE=`, `DYNAMODB_ENDPOINT=` (DynamoDB Local in development).
- Create: `packages/shared/src/{constants,dto}.ts`, `apps/api/src/{server,env}.ts` (local Node adapter for development), `apps/web/` (Vite React app shell)
- Test: `packages/shared/test/dto.test.ts`, `apps/api/test/health.test.ts`

**Interfaces:**
- Produces (`packages/shared`):
  - `BROWARD_CENTER = { lat: 26.15, lon: -80.30 }`, `DEFAULT_ZOOM = 10`, `DEFAULT_RADIUS_MILES = 5`, `RADIUS_BOUNDS = { min: 0.25, max: 25 }`, `DEFAULT_ROOF_AGE_YEARS = 15`.
  - `SearchInput` (zod): `{ center: { lat; lon }; radiusMiles; minRoofAgeYears; minOpenYears; layers: ("aged_roofs"|"open_permits")[]; permitStatus?: ("open"|"completed"|"other"|"needs_review")[] }`.
  - `LeadCandidate`: `{ propertyId; propertyCid; address; city; lat; lon; roofAgeYears: number|null; roofAgeBasis; openRoofPermits: { permitId; openDays: number|null; status; contractorName: string|null; bbbGrade: string|null }[]; score: number; reasons: string[] }`.
  - `SearchResult`: `{ candidates: LeadCandidate[]; outsideCoverage: boolean; permitGaps: string[] /* jurisdictions in the radius without permit data, from the Oracle's permitCoverage */; manifestCid: string }`.
  - `LeadSignals`: `{ roofAgeYears: number|null; roofAgeBasis: string; maxOpenDays: number|null; bbbGrade: string|null; ownerLocationClass: string }` (stored on leads; compared on snapshot reconcile).
  - `env.ts`: `loadEnv(): Env` (zod-validated; requires `ORACLE_API_URL`, `ORACLE_MCP_URL` and `ORACLE_MANIFEST_CID`).

- [ ] **Step 0: Work in the existing clone of the fork** (`~/git/roofing-crm`, `origin` = `shengda/roofing-crm`). Do not use the `roofing-crm-main` download folder inside the team kit.
```bash
cd ~/git/roofing-crm
git remote add upstream https://github.com/prismteam-ai/roofing-crm.git
git fetch upstream && git status            # README matches upstream
git checkout -b feat/roofing-crm
git add docs/ && git commit -m "docs: CRM execution plan"   # the plan already lives in docs/
```
- [ ] **Step 1: Write failing tests**
```ts
test("SearchInput rejects radius outside bounds", () => { expect(SearchInput.safeParse({ ...valid, radiusMiles: 30 }).success).toBe(false); });
test("SearchInput defaults roof age to 15", () => { expect(SearchInput.parse(minimal).minRoofAgeYears).toBe(15); });
test("loadEnv requires the Oracle API, MCP URL and expected manifest", () => { expect(() => loadEnv({})).toThrow(/ORACLE_API_URL|ORACLE_MCP_URL|ORACLE_MANIFEST_CID/); });
test("GET /health returns ok", …);
```
- [ ] **Step 2:** `pnpm vitest run packages/shared apps/api` → FAIL.
- [ ] **Step 3:** Scaffold. Add the Oracle repo as a dependency **for its `contract` export only** (zod schemas and types; no DuckDB):
  - during development: `"oracle-broward": "link:../oracle-property-intelligence-platform-pipeline-broward-fl"`;
  - before opening the CRM PR: `"github:<designated oracle repo>#<sha>"` (the Oracle's `prepare` builds `dist/`).

  Document in `.env.example` comments how to run the Oracle fixture server.
- [ ] **Step 4:** Re-run → PASS; `pnpm turbo build`, `pnpm eslint .` and `pnpm prettier --check .` succeed.
- [ ] **Step 5:** `git add -A . && git commit -m "chore: scaffold roofing CRM monorepo with CI"`

### Task 2: Oracle data adapter (`packages/oracle-data`)

**Files:**
- Create: `packages/oracle-data/src/{index,http,score,coverage}.ts`, `packages/oracle-data/test/fake-oracle.ts` (Fastify fake built from the Oracle `contract` schemas, serving fixture-shaped responses)
- Test: `packages/oracle-data/test/oracle-data.test.ts`

**Interfaces:**
- Consumes: Oracle HTTP API v1 (`/api/health`, `/api/query/aged-roofs`, `/api/query/open-permits`, `/api/property/:id`, `/api/permit/:key`), Oracle `contract` schemas, shared DTOs.
- Produces:
  - `createOracleData(opts: { apiUrl: string; expectedManifestCid: string; fetchImpl?: typeof fetch; timeoutMs?: number /*10000*/ }): OracleData`.
  - `OracleData { manifestCid: string; health(): Promise<{ ok: boolean; manifestCid: string|null; mismatch: boolean }>; search(input: SearchInput): Promise<SearchResult>; property(id: string): Promise<PropertyDetail|null>; permit(id: string): Promise<PermitDetail|null>; resolvePlace(name: string): Promise<LatLon|null>; hasProperty(id: string): Promise<boolean>; signalsFor(id: string): Promise<LeadSignals|null> }`. Every response is parsed with its contract schema; a manifest mismatch throws `OracleManifestMismatch`.
  - `scoreCandidate(c: Omit<LeadCandidate,"score"|"reasons">, opts: { minRoofAgeYears: number }): { score: number; reasons: string[] }`. Scoring:
    - +40 if the roof age ≥ threshold, plus 2 per extra year (cap 20);
    - +30 if there is any open roofing permit, plus 5 per open year (cap 25);
    - +10 if the BBB grade is D/F or the contractor company is inactive.

    Reasons are human-readable strings.
  - `isInsideCoverage(center: LatLon): boolean` (Oracle `COUNTY.bbox` from the contract).

- [ ] **Step 1: Write failing tests**
```ts
test("search merges aged roofs and open permits per property", …);  // one candidate per propertyId
test("candidates sorted by score desc, long-open permits first among ties", …);
test("pin outside Broward → outsideCoverage true, no candidates, no Oracle call", …);  // Review Focus 1
test("scoreCandidate: 22-year roof + permit open 6y, threshold 15 → 109 with both reasons", () => {
  // roof: 40 + min(2*(22-15), 20) = 54; permit: 30 + min(5*6, 25) = 55
  expect(scoreCandidate(c, { minRoofAgeYears: 15 }).score).toBe(109);
});
test("manifestCid propagates to results", …);
test("Oracle serving a different manifest → OracleManifestMismatch; health reports mismatch", …);  // Review Focus 6
test("Oracle timeout or 5xx → typed error, not a crash", …);
test("response failing the contract schema is rejected", …);
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement as a thin HTTP mapper over the Oracle API; no SQL and no DuckDB in the CRM.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: oracle HTTP data adapter with lead scoring`.

### Task 3: Leads database (`packages/leads-db`)

**Files:**
- Create: `packages/leads-db/src/{schema,repo,client}.ts`
- Test: `packages/leads-db/test/repo.test.ts` (DynamoDB Local in Docker via testcontainers, per the kit's testing strategy: prefer a containerized database over heavy mocking)

**Interfaces:**
- Produces:
  - Single DynamoDB table (on-demand, `pk`/`sk`, GSI1 for listing by status, TTL attribute `expiresAt`). Every key is scoped to a demo workspace `WS#<ws>`:
    - `WS#<ws>` / `META`: `createdAt`, `seeded`, `leadCreates` (daily counter), `expiresAt` (7 days, refreshed on use).
    - `WS#<ws>` / `LEAD#<id>`: `propertyId`, `permitId`, `status`, `priority`, `assignee`, `sourceManifestCid`, `signals` (`roofAgeYears`, `maxOpenYears`, `permitStatuses`, `lat`, `lon`), `stale`, `staleReason`, `createdAt`, `updatedAt`, `expiresAt`; GSI1 `WS#<ws>#STATUS#<status>`.
    - `WS#<ws>` / `LEAD#<id>#NOTE#<ts>` and `WS#<ws>` / `LEAD#<id>#EVENT#<ts>`.
    - Uniqueness guard `WS#<ws>` / `ACTIVE#<propertyId>` → `leadId`. It is written in the same `TransactWriteItems` as the lead with `attribute_not_exists(pk)`, and deleted when the lead reaches `won`/`lost`.
  - `LeadStatus = "new"|"contacted"|"qualified"|"proposal"|"won"|"lost"`. Allowed transitions: `new→contacted→qualified→proposal→won`, any non-terminal → `lost`, `lost→new` (re-creates the guard).
  - `createLeadsRepo(opts: { tableName: string; endpoint?: string }): (ws: string) => LeadsRepo` (every method is scoped to one workspace), plus `ensureWorkspace(ws, seed: SeedLead[]): Promise<{ created: boolean }>` (idempotent; seeds demo leads once). `LeadsRepo` has:
    - `createFromCandidate(i: { propertyId; permitId?; manifestCid; signals: LeadSignals }): Promise<{ lead: Lead; created: boolean }>`;
    - `createMany(items): Promise<{ created: number; existing: number }>`; creates are capped per workspace per day (`LEAD_CREATES_PER_DAY`, default 200) → `TOO_MANY_REQUESTS`;
    - `list(f?: LeadFilter)`, `get(id)`, where `LeadFilter = { status?: LeadStatus[]; stale?: boolean; search?: string; minRoofAgeYears?: number; minOpenYears?: number; permitStatus?: PermitStatus[]; near?: { center: LatLon; radiusMiles: number } }` (status via GSI1; signal and radius filters applied to the workspace's items, which are small);
    - `updateStatus(id, to: LeadStatus)`, `addNote(id, body)`;
    - `reconcileWithSnapshot(s: { cid: string; hasProperty(id): Promise<boolean>; signalsFor(id): Promise<LeadSignals|null> }): Promise<{ markedStale: number }>`.

- [ ] **Step 1: Write failing tests**
```ts
test("creating a lead for the same property twice returns the existing one", …); // Review Focus 3: created === false, same id
test("two concurrent creates for one property produce one lead", …);             // transaction guard
test("won/lost lead allows a new active lead for that property", …);
test("illegal transition new → won throws", …);
test("every status change writes an EVENT item", …);
test("reconcile flags leads whose property vanished or signals changed", …);      // Review Focus 4: stale === true, staleReason set
test("reconcile never deletes leads", …);
test("two workspaces converting the same property each get one lead and cannot list each other's", …); // Review Focus 7
test("ensureWorkspace seeds demo leads once and is idempotent", …);
test("list filters by minRoofAgeYears, minOpenYears, permitStatus and near{center,radiusMiles}", …);
test("lead creates over the daily workspace cap are rejected", …);
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `@aws-sdk/lib-dynamodb`. The table is created by CDK (Task 11) and by a test helper for DynamoDB Local.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: DynamoDB leads repository with workspaces, dedupe, filters and snapshot reconciliation`.

### Task 4: tRPC API

**Files:**
- Create: `apps/api/src/{router,context,lambda}.ts`, `apps/api/src/routers/{map,property,permit,leads,meta}.ts`
- Test: `apps/api/test/router.test.ts` (tRPC `createCaller` with the fake Oracle + DynamoDB Local)

**Interfaces:**
- Consumes: `OracleData`, `LeadsRepo`.
- Produces: `appRouter` with
  - `meta.snapshot` → `{ manifestCid; viewsVersion; counts; oracleHealthy; manifestMismatch }`
  - `map.search(SearchInput)` → `SearchResult`
  - `property.get({ id })`, `permit.get({ id })`
  - `leads.create({ propertyId; permitId? })`, `leads.createMany({ items })`, `leads.list(filter)`, `leads.get({ id })`, `leads.updateStatus({ id; status })`, `leads.addNote({ id; body })`
  - `leads.reconcile` (also run by a scheduled Lambda after an Oracle manifest upgrade, Task 11).
  - `context.ts` reads the `crm_ws` cookie; if it is missing, it issues a new random workspace id (httpOnly, Secure, SameSite=Lax, 7 days) and calls `ensureWorkspace` with the seed leads from `apps/api/src/seed-leads.ts` (a handful of real Broward properties from the deployed manifest). `leads.*` always use the cookie's workspace.
  - `place.resolve({ name })` → Oracle `resolve_place` (for the no-map center control).
  - `lambda.ts`: `handler = awsLambdaRequestHandler({ router: appRouter, createContext })` with Powertools Logger/Tracer/Metrics middleware; `server.ts` remains the local development adapter.
  - The agent is **not** on this API (it runs on its own Function URL, Task 8), so API Gateway's 29 s limit never applies to model calls.

- [ ] **Step 1: Write failing tests**
```ts
test("map.search returns fixture candidates around Fort Lauderdale", …);
test("leads.create captures manifestCid and signals from oracle", …);
test("leads.createMany reports created vs existing", …);
test("property.get unknown id → NOT_FOUND", …);
test("meta.snapshot reports manifestMismatch when the Oracle serves another run", …);   // Review Focus 6
test("lambda handler answers an API Gateway v2 event for map.search", …);
test("first request without a cookie issues crm_ws and seeds the workspace; later requests reuse it", …);
test("leads.list accepts roof-age, open-years, permit-status and radius filters", …);
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: tRPC API for map, details and leads (Lambda handler)`.

### Task 5: Map experience (county default, GPS, pin, radius, layers)

**Files:**
- Create: `apps/web/src/features/map/{MapView,SearchControls,useGeolocation,layers}.tsx`
- Test: `apps/web/src/features/map/*.test.tsx`

**Interfaces:**
- Consumes: `trpc.map.search`, `trpc.meta.snapshot`, shared constants.
- Produces:
  - `useGeolocation(): { status: "idle"|"locating"|"ok"|"denied"|"unavailable"; position?: LatLon; locate(): void }`.
  - `MapView` props `{ center; radiusMiles; candidates; onPinDrop(c: LatLon): void; selectedId?; onSelect(id) }`.
  - Layers: radius circle, aged-roof markers (color by roof age), open-permit markers sized/emphasized by open years.
  - A degraded-data banner from `meta.snapshot`.
  - `CenterControl`: address/city search (`trpc.place.resolve`), lat/lon inputs and "Use my location", so the center can be set without clicking the map.
  - WebGL fallback: if MapLibre cannot create a WebGL context, `MapView` renders a notice ("Map unavailable in this browser — results are listed below") and the rest of the page keeps working.

- [ ] **Step 1: Write failing tests**
```tsx
test("map initializes at Broward center, zoom 10", …);
test("city search 'Fort Lauderdale' re-centers the search without touching the map", …);
test("without WebGL the notice shows and candidates still list", …);
test("clicking map drops a pin and re-centers search", …);
test("GPS denied shows message and keeps county center", …);           // Review Focus 5
test("radius slider clamps to 0.25–25 and updates query", …);
test("outsideCoverage result shows 'Outside Broward coverage' banner", …); // Review Focus 1
test("long-open permits render with emphasized style", …);
test("manifest mismatch shows a degraded-data banner", …);               // Review Focus 6
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with MapLibre (OpenFreeMap style URL), circle via turf `circle`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: map with GPS, pin drop, radius and lead layers`.

### Task 6: Candidate list, filters, property/permit detail

**Files:**
- Create: `apps/web/src/features/candidates/{CandidateList,Filters,DetailDrawer}.tsx`
- Test: same folder `*.test.tsx`

**Interfaces:**
- Consumes: `SearchResult`, `trpc.property.get`, `trpc.permit.get`, `trpc.leads.create/createMany`.
- Produces:
  - Filters for roof age (years), permit status, minimum open years and radius.
  - A list with multi-select and "Convert to leads".
  - A detail drawer showing: address, roof age + basis, permits (status, issued date, open duration, contractor name, license, BBB grade/accreditation or "No BBB data"), owner location class, provenance links, run manifest CID.

- [ ] **Step 1: Write failing tests**
```tsx
test("filtering by min open years hides newer permits", …);
test("detail shows contractor and BBB grade; missing grade shows 'No BBB data'", …);
test("radius crossing jurisdictions without permit data shows a coverage note naming them", …);
test("bulk convert creates leads and reports duplicates as existing", …);
test("provenance link opens source URL", …);
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: candidate list, filters and detail drawer`.

### Task 7: Leads management

**Files:**
- Create: `apps/web/src/features/leads/{LeadsPage,LeadDetail,StatusControl,Notes}.tsx`
- Test: same folder `*.test.tsx`

**Interfaces:**
- Consumes: `trpc.leads.*`.
- Produces:
  - A Leads page (table + status columns) with filters for **roof age, permit status, minimum open years and location radius** (center from the map or `CenterControl`), mirroring the candidate filters (README demo: "filtering leads by roof age, permit status/open duration, and location radius").
  - Status changes limited to the allowed transitions.
  - Notes, and a stale badge with its reason.
  - A "Show on map" action, and a mocked "Contact" action (disabled, tooltip "Outreach coming soon").

- [ ] **Step 1: Write failing tests**
```tsx
test("leads page filters by roof age, open years, permit status and radius", …);
test("status control offers only allowed transitions", …);
test("stale lead shows badge and reason", …);
test("adding a note appends to timeline", …);
test("contact action is disabled with tooltip", …);
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: lead management page`.

### Task 8: RAG-backed agent

Load `apply-engineering-guidelines` (rule `stack-ai-sdk-for-llm`) before writing this task's code: every LLM call goes through the Vercel AI SDK, and direct provider SDKs are forbidden. Use the `claude-api` skill only to choose the model ID.

**Files:**
- Create: `packages/agent/src/{agent,mcp-tools,prompt,budget}.ts`, `apps/api/src/agent-lambda.ts` (Function URL handler with Powertools), `apps/web/src/features/agent/AgentPanel.tsx`
- Test: `packages/agent/test/agent.test.ts` (AI SDK mock language model from `ai/test` + fake MCP server), `apps/web/src/features/agent/AgentPanel.test.tsx`

**Interfaces:**
- Consumes: Oracle MCP tools (`resolve_place`, `find_aged_roofs`, `find_open_roof_permits`, `search_records`, `get_property`, `get_permit`, `dataset_info`, `find_long_held_properties`, `find_out_of_area_owners`, `find_by_occupancy`) via `@ai-sdk/mcp` (Streamable HTTP to `ORACLE_MCP_URL`; in development, the local fixture Oracle's `/mcp`).
- Produces:
  - `loadOracleTools(opts: { url: string }): Promise<{ tools: ToolSet; close(): Promise<void> }>` (AI SDK MCP client → AI SDK tools; restricted to the read-only tools above).
  - `createRoofingAgent(deps: { tools: ToolSet; model: LanguageModel }): RoofingAgent`; `RoofingAgent.ask(i: { message: string; history: ChatTurn[]; mapContext?: { center: LatLon; radiusMiles: number } }): Promise<AgentAnswer>`.
  - `AgentAnswer { text: string; results: { propertyId: string; lat: number; lon: number; label: string }[]; citations: { propertyId?: string; permitId?: string; sourceUrl: string }[]; assumptions: string[]; steps: { tool: string; args: Record<string, unknown>; rowCount: number; sample: string[] }[]; context: { center?: LatLon; placeName?: string; radiusMiles?: number } }` (zod; structured output via the AI SDK). `steps` comes from the AI SDK step results (what was actually retrieved over MCP), not model text. `context` goes back in the next turn's history so follow-ups reuse the previous area.
  - `POST /agent` on a Lambda Function URL (CORS limited to the Amplify domain), guarded by `BudgetGuard { allow(ip: string): boolean; record(tokens: number): void }` (per-IP rate limit + daily token budget; counters in the leads table with TTL). The model call has a timeout and a friendly failure (documented sync boundary, architecture §0.1).
  - Prompt rules:
    - answer only from tool results;
    - resolve places with `resolve_place`; if it returns null, use `mapContext.center` and add an assumption (or ask when there is no map context);
    - a follow-up that refers to "that area" / "near there" reuses the previous turn's `context` and says so;
    - always cite IDs + source URLs; state missing data (e.g. no BBB rating; areas in the radius without permit data, from the Oracle's `permitCoverage`);
    - retrieval is shown: cite the `search_records` hits used;
    - `stopWhen: stepCountIs(8)`.
  - `AgentPanel`: chat UI; a collapsible **"Retrieved evidence"** list per answer (tool, args, row count, sample IDs); "Show results on map" pushes `results` to the map layer.
  - Budget sizing: the daily budget and per-IP limit cover several full grading runs from one IP; budget use is a CloudWatch metric (alarm in Task 11).

- [ ] **Step 1: Write failing tests**
```ts
test("'open roofing permits older than five years within five miles of Fort Lauderdale' calls resolve_place then find_open_roof_permits{radiusMiles:5,minOpenYears:5}", …);
test("unknown place → assumption recorded, map center used", …);  // Review Focus 2
test("unknown place without map context → asks a clarifying question, no tool search", …);
test("answer citations reference only IDs returned by tools", …);
test("follow-up 'which of those near that area have permits open over 5 years?' reuses the previous center and radius and records the assumption", …);
test("answer.steps lists each MCP tool call with args and row counts", …);
test("panel renders assumptions, the 'Retrieved evidence' list and 'Show on map' button", …);
test("over budget → friendly limit message, no model call", …);
test("Oracle MCP unreachable → friendly failure, no invented results", …);
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `generateText` and the MCP-derived tools; model from `CRM_AGENT_MODEL` via `@ai-sdk/anthropic`; key from SSM when hosted.
- [ ] **Step 4:** Run → PASS. Manual check with a real API key against the local fixture Oracle.
- [ ] **Step 5:** Commit `feat: RAG agent (Vercel AI SDK) over Oracle MCP tools`.

### Task 9: Disabled future sections

**Files:**
- Create: `apps/web/src/layout/{Sidebar,ComingSoon}.tsx`
- Test: `apps/web/src/layout/Sidebar.test.tsx`

**Interfaces:**
- Produces:
  - Active sidebar items: **Map**, **Leads**.
  - Disabled sidebar items: **Campaigns**, **Estimates & Quotes**, **Jobs & Scheduling**, **Invoicing**, **Storm Tracking**, **Team & Territories**. Each has `aria-disabled="true"`, a lock icon and a "Coming soon" tooltip, and no route.

- [ ] **Step 1: Write failing test**
```tsx
test("future sections are visible, aria-disabled, and not navigable", …);
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: disabled future CRM sections`.

### Task 10: End-to-end demo and run docs

**Files:**
- Create: `e2e/demo.spec.ts` (Playwright; geolocation permission granted at Fort Lauderdale; runs against `BASE_URL` = local build on the fixture Oracle, or the hosted URL), `docs/DEMO.md`
- Modify: `README.md` (setup, env, `pnpm dev` against a local fixture Oracle, hosted URL)

- [ ] **Step 1: Write the e2e spec** mirroring the README demo transcript:
  1. open at the county → GPS → radius 5 (and, in a second project, set the center by city search instead);
  2. aged-roof layer → open-permit layer with long-open emphasis;
  3. open a detail (contractor + BBB) → convert two candidates → the Leads page shows them;
  4. agent query with results on the map, then a "near that area" follow-up;
  5. filters by roof age / permit open years / radius on both the candidate list and the Leads page;
  6. disabled sections visible.
  Playwright projects: `default` (geolocation granted) and `grader-like` (headless Chromium with `--disable-gpu --disable-webgl`, no geolocation permission, fresh cookies). Both must pass the whole transcript.
- [ ] **Step 2:** `pnpm playwright test e2e/demo.spec.ts` → FAIL until wiring is complete; fix gaps.
- [ ] **Step 3:** Re-run → PASS on the fixture, then on a local `oracle serve --manifest <run 2 CID>` (M4 exit).
- [ ] **Step 4 (M5):** After the Oracle's county-scale runs (Oracle Task 18), redeploy the hosted CRM with the latest real `ORACLE_MANIFEST_CID` and run `leads.reconcile`. Then run `BASE_URL=<hosted URL> pnpm playwright test e2e/demo.spec.ts` and rehearse `docs/DEMO.md` on the hosted URL.
- [ ] **Step 5:** Commit `e2e/ docs/ README.md` with message `test: end-to-end demo and documentation`.

### Task 11: Hosted deployment (AWS, CDK)

Load `apply-engineering-guidelines` (`cloud-aws-primary`, `observability-logging-tracing`) and `build-frontend-backends` (`rules/amplify-frontend.md`, `rules/cdk-api-infrastructure.md`, `rules/trpc-backend.md`) before writing this task's code.

**Files:**
- Create: `infra/bin/crm.ts`, `infra/lib/crm-stack.ts`, `infra/cdk.json`, `apps/web/amplify.yml`, `deploy/README.md` (AWS setup, SSM parameters, upgrade to a new Oracle manifest, HF Spaces fallback), `.github/workflows/uptime.yml` (scheduled ping of the API `/health` and the web URL)
- Modify: `README.md` (hosted URL)
- Test: `infra/test/crm-stack.test.ts` (CDK assertions), `apps/api/test/lambda.test.ts` (tRPC Lambda handler with an API Gateway v2 event against the fake Oracle + DynamoDB Local)

**Interfaces:**
- Consumes: `appRouter` Lambda handler, agent Lambda handler, `createLeadsRepo`, `createOracleData`, `loadOracleTools`.
- Produces `CrmStack` (CDK, `env: { region: "us-east-2" }`, `tags: { project_name: "roofing-crm" }`):
  - DynamoDB table (on-demand, TTL attribute `expiresAt` for budget counters and demo workspaces, point-in-time recovery).
  - API Lambda (tRPC) behind an API Gateway HTTP API (CORS to the Amplify domain).
  - Agent Lambda with a Function URL (60 s timeout).
  - Scheduled reconcile Lambda (daily).
  - Amplify app for `apps/web` (env `VITE_API_URL`, `VITE_AGENT_URL`).
  - SSM SecureString for the Anthropic key; Lambda env `ORACLE_API_URL`, `ORACLE_MCP_URL`, `ORACLE_MANIFEST_CID`, `LEADS_TABLE`, `CRM_AGENT_MODEL`, `AGENT_DAILY_TOKEN_BUDGET`, `RATE_LIMIT_PER_MINUTE`, `ANTHROPIC_KEY_PARAM`.
  - Powertools on every Lambda; CloudWatch error alarm → SNS email (documented PagerDuty replacement); agent budget-use alarm at 80% of `AGENT_DAILY_TOKEN_BUDGET`; AWS Budgets alarm at $5/month. Env also `LEAD_CREATES_PER_DAY`.
  - Outputs: web URL, API URL, agent URL.

- [ ] **Step 1: Write failing tests**
```ts
test("stack: region us-east-2, every resource tagged project_name", …);
test("stack: DynamoDB on-demand table with TTL; API Lambda behind HTTP API; agent Lambda with Function URL", …);
test("stack: Anthropic key from SSM, never a plain env value", …);
test("stack: budget alarm, error alarm and agent budget-use alarm exist", …);
test("lambda: map.search and leads.create work through the API Gateway handler", …);
```
- [ ] **Step 2:** `pnpm vitest run infra/test apps/api/test/lambda.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Put the key in SSM (`aws ssm put-parameter --type SecureString`, never committed); `cdk deploy`; connect Amplify to the fork's branch; enable the uptime workflow.
- [ ] **Step 4:** Run → PASS. Open the Amplify URL in a clean browser over HTTPS:
  - the map opens on Broward and the GPS prompt works;
  - a second browser profile gets its own seeded workspace and does not see the first one's leads;
  - a lead survives a redeploy;
  - the agent answers via the hosted Oracle `/mcp`.

  Record cold-start times and idle monthly cost in `deploy/README.md`.
- [ ] **Step 5:** Commit `feat: hosted CRM on AWS (Amplify, Lambda, DynamoDB) via CDK`. Open the **draft PR** (fork → `prismteam-ai/roofing-crm`; outward-facing, confirm with the user first) and run a Slowking gate check against it and the hosted URL.

### Task 12: Submission — demo video, PR, Slowking self-check

**Files:**
- Create: `docs/SUBMISSION.md` (PR description source), `docs/video.md` (video link + chapter timestamps)

- [ ] **Step 1:** Confirm the hosted CRM runs on a **county-scale** Oracle manifest. Record the demo video on the hosted URL following the README demo transcript: county default → pin/GPS + radius → aged roofs → long-open permits → contractor + BBB detail → convert to leads → agent query with retrieved evidence expanded → "near that area" follow-up → lead filters (roof age, open duration, radius) → disabled sections. Upload it to a link reachable without sign-in.
- [ ] **Step 2:** Write `docs/SUBMISSION.md` with:
  - Access: hosted URL, credentials ("public — each browser gets its own demo workspace with seeded leads"), demo video.
  - Oracle data: Oracle manifest CID and Oracle URL used.
  - Reproduction: setup steps (`pnpm dev` against a local fixture Oracle, `cdk deploy`).
  - Kit: skills used (`build-frontend-backends`, `apply-engineering-guidelines`, `build-local-rag-pocs`, …) and the **kit-deviation table** (architecture §0.1).
  - Known limitations and open-question answers.
- [ ] **Step 3:** Push the branch to the `shengda` fork and turn the draft PR (fork → `prismteam-ai/roofing-crm`) into a ready PR with `SUBMISSION.md` as the description (outward-facing — confirm with the user first).
- [ ] **Step 4:** Self-check with the team-kit `slowking` agent (Playwright MCP connected) against the PR and hosted URL; fix any `Failed` gate or low-scoring point, then re-check.
- [ ] **Step 5:** Make the final commit; afterwards commit only to fix a grading blocker. Speed is measured to the PR head's latest commit, so later notes go in PR comments.
