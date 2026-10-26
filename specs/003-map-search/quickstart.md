# Quickstart: validating B-03 end to end

Two validation layers: a cheap local/unit check first (iteration speed only), then the real proof
on the Amplify branch preview (constitution Article I — only the hosted URL counts as evidence;
GPS tests specifically need HTTPS, which localhost cannot provide).

## 1. Local unit checks (before anything is deployed)

```bash
pnpm --filter @crm/domain test        # bboxFor, distanceMeters, isLongOpen, openDurationLabel
pnpm --filter @crm/api test           # extended LeadIndex query methods, search/property routers
```

**Expected outcome**: the radius math matches the vendored `oracle-views`' `geo()` shape on fixed
test vectors (same bbox/haversine constants); `isLongOpen(1826)` is `false` and `isLongOpen(1827)`
is `true`; the roof-age `counts.afterRoofAge` for a fixture with a known distribution drops when
the threshold is raised from 15 to 25.

## 2. Scale proof against the local synthetic fixture (AC-4 only)

```bash
pnpm --filter @crm/api test -- --grep "AC-4"
```

Runs against `tests/fixtures/sample-travis/` (a few thousand synthetic rows, marked `synthetic`,
generated for this test only — never deployed, never cited as real in evidence). Confirms the
15→25 count drop holds at a scale the 35-row real sample cannot exercise.

## 3. Deploy and smoke the preview

```bash
git push origin 003-map-search   # Amplify builds the branch preview automatically
```

Wait for the Amplify console (or `aws amplify get-job`) to report `SUCCEED` for the
`003-map-search` branch. No `cdk deploy` needed — this story adds no new stack or resource; the
new tRPC procedures ship inside the existing API Lambda build.

## 4. Playwright against the preview (every AC)

```bash
RUNTIME_URL=https://003-map-search.<app-id>.amplifyapp.com pnpm --filter @crm/web test:e2e -- tests/e2e/B-03-map-search.spec.ts
```

**Expected outcome** (one assertion + one screenshot per AC, per the test-case draft in
`testplans/B-03-test-cases.md`):
- AC-1: pin near Pflugerville, 5 mi radius → ring redraws, every result inside it.
- AC-2: `context.setGeolocation` denied → explicit "location denied" state, pin-drop fallback.
- AC-3: threshold 15 → only `roofAgeYears >= 15` rows, each with basis + confidence shown.
- AC-4: threshold 15 → 25 → visible count drops, matches a direct `search.properties` call with the same inputs.
- AC-5: permit layer → sorted longest-open first; a permit with `openDays > 1826` carries the "long-open" badge.
- AC-6: a property near Manor with an open permit → drawer shows status, open duration, contractor, and a working "View lineage in Explorer" link.
- AC-7: a permit with `bbb_status !== "rated"` → drawer shows "BBB rating not available" + the reason, never blank or invented.
- Edge case: 0.5 mi near Lago Vista → "widen to {n} mi" suggestion (increment per the Round 1 decision), not a blank list.
- Edge case: GPS mocked outside Travis County (Williamson County coordinates) → explicit "outside the covered county" state, not an empty map.

## 5. Evidence

Write `docs/evidence/B-03.md` (§ B-04, § B-05, § B-06): the Amplify preview URL, every input used,
real counts off the sample index, screenshots including the BBB-not-available case, and the trace
ID from each `search.properties`/`search.permits`/`property.get` response.
