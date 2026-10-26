# Quickstart: validating B-09 end to end

Four validation layers, cheapest first; only the hosted URL counts as evidence (constitution I).

## 1. Unit checks (before anything is deployed)

```bash
pnpm --filter @crm/shared test     # QueryPlan/AgentAnswer Zod shapes, thresholds.ts bands
pnpm --filter @crm/domain test     # resolvePlace fuzzy-match pipeline order
pnpm --filter @crm/api test        # agent.ts router with MockLanguageModelV2; citation verifier
                                    # strips a planted fake property_cid (agent-design.md alakazam §3)
```

**Expected outcome**: a fake/unverifiable citation never reaches `AgentAnswer.claims`; a unit test
asserts `services/agent/tools.ts` imports no `LeadService`/`requireLeadService` (confirm-flow
bypass risk, agent-design.md ash §5).

## 2. Deploy

```bash
npx cdk diff   # expect: new crm-agent-usage DynamoDB table (crm-data-stack), RoofingCrmDashboard
               # (crm-ops-stack), confirm alarmEmail is set on CrmSyncStack (no new DLQ construct)
npx cdk deploy
git push origin 009-agent-hardening   # Amplify branch preview
```

Wait for `SUCCEED` on both the CDK deploy and the Amplify branch build before step 3.

## 3. Golden queries against the deployed agent (AC-1, AC-3, AC-4, part of AC-2)

```bash
RUNTIME_URL=https://009-agent-hardening.<amplify-app-id>.amplifyapp.com \
  pnpm --filter tests-agent test -- tests/agent/golden.test.ts
```

Runs `tests/agent/golden.json`'s G1–G7 (checks.md §7.1) against the hosted endpoint, 3 repeats
paced 13s apart (stays under 5 asks/min). **Expected**: groundedness 100% (every cited
`property_cid` resolves against `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`),
p95 < 20s, max < 23.5s, G6 returns zero fabricated results for ZIP 99999, G7's lead appears in
`leads.list` with `createdFrom: "agent"`. Record results in `docs/evidence/B-09.md`.

## 4. Full responsive suite + DLQ/dashboard proof (AC-5, AC-6, AC-8)

```bash
RUNTIME_URL=<same as above> npx playwright test tests/e2e/responsive/
```

**Expected**: every existing + new (`ask.spec.ts`) screen passes at 390/768/1440 with no
horizontal overflow and correct compact/rail control visibility.

For AC-6, force a sync-job failure (per existing B-02 evidence procedure) to land a message on
`FetchPartDlq`, confirm the `RoofingCrm` dashboard's alarm widget flips to ALARM, then let the
queue drain and confirm it flips back to OK automatically — screenshot both states.

For AC-8, re-diff every screen listed in `agent-design.md`'s smeargle section against
`design/prototype/CrmAsk*.dc.html` (corrected path) and the existing screen prototypes; log fixes
or explicit deferrals in `design/design-review-log.md`.

## 5. Evidence

`docs/evidence/B-09.md`: golden-query results table, citation audit, screenshots at 3 breakpoints,
CloudWatch dashboard screenshot (both alarm states), trace id for one full G1→G2 conversation.
