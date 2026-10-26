// T042 (B-09/US2): the golden-query evaluation harness (checks.md §7.1/§7.2, quickstart.md step
// 3, agent-design.md alakazam §1). Calls `agent.ask`/`agent.confirmLead` over the DEPLOYED agent
// (RUNTIME_URL, never localhost -- constitution Article I "localhost is never evidence", the
// same guard `playwright.config.ts` already loads from `../e2e/lib/runtime-url.js`), paced
// `pacingSeconds` apart (stays under 5 asks/min).
//
// Real-data pass (Run 2, manifest bafkreife3...pcute): the G1-G7 prompts are the assessment's and
// unchanged, but only ~2 percent of properties have a roof age, so each query's pass rule is the
// truth of the data (passRules.ts): answered with verified rows, or an HONEST EMPTY with zero
// fabricated rows. A1-A5 are Austin variants that must be answered with real rows. A failing
// honest answer is reported, never tuned away.
//
// Every cited row is re-checked against the live index (property.get): it exists, lies within the
// stated radius of the stated centre, meets the stated roof-age / permit-status / open-duration
// filters. For property questions the answer's matched count must also equal the index's own
// count for the same centre, radius and roof age (search.properties counts). Results are written to
// GOLDEN_RESULTS_PATH (json) when set; no token or password is ever written.
//
// This block is skip-guarded like `apps/api/test/leadIndex.manifestCid.test.ts` (T020): a real,
// assertion-bearing `describe` that only runs when every env var it needs is present, and an
// `it.todo` stub in the opposite case. The pass-rule and G7 logic below are covered by always-on
// unit tests.
//
// Required env, beyond RUNTIME_URL:
//  - CRM_COGNITO_USER_POOL_ID / CRM_COGNITO_USER_POOL_CLIENT_ID: the deployed pool (infra output).
//    The app client only allows SRP, so this harness signs in the way the browser does
//    (`amazon-cognito-identity-js`).
//  - CRM_TEST_USERNAME (defaults to "admin@roofing-crm.test") / CRM_TEST_PASSWORD (never
//    hard-coded or logged -- constitution Article XII).
//  - Optional: GOLDEN_REPEATS (overrides golden.json), GOLDEN_ONLY (comma-separated ids),
//    GOLDEN_RESULTS_PATH.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import { createApiClient, type ApiClient, type ApiFetch } from "@crm/api-client";
import { leadKey, requestIdentifierOf } from "@crm/domain";
import { assertHostedRuntimeUrl } from "../e2e/lib/runtime-url.js";
import {
  publishGoldenQueryPassRate,
  shouldPublishGoldenQueryPassRate,
} from "./publishGoldenQueryPassRate.js";
import {
  assertsContractorOrBbb,
  evaluateQuery,
  haversineMi,
  honestEmptyFailures,
  ownerLocationFlagged,
  percentile,
  type AnswerLike,
  type QuerySpec,
  type RuleContext,
} from "./passRules.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------
// golden.json (T041)
// ---------------------------------------------------------------------------------------------

interface GoldenQuery extends QuerySpec {
  readonly prompt: string;
  readonly mustDo: string;
  readonly check: string;
  readonly inheritsAreaFrom?: string;
  /** G5: the real permit number substituted for `{real permit number}`. */
  readonly permitNumber?: string;
  /** G7: the query whose prompt seeds G7's own thread before G7's prompt is asked there. */
  readonly seedsThreadWith?: string;
  /** G7: the plan intent the server must read (ADR-06 `propose_leads`). */
  readonly expectedIntent?: string;
  /** Adversarial set: no cited property's owner name may appear in any claim (owner names are
   *  never sent to the model, ADR-03, so none can be echoed). */
  readonly ownerNamesMustNotAppear?: boolean;
}

interface GoldenFile {
  readonly manifestCid: string;
  readonly runId: string;
  readonly queries: readonly GoldenQuery[];
  readonly grading: {
    readonly repeats: number;
    readonly pacingSeconds: number;
    readonly maxAsksPerMinute: number;
    readonly groundednessTargetPct: number;
    readonly correctnessRecallTargetPct: number;
    readonly latencyP95Ms: number;
    readonly latencyMaxMs: number;
  };
}

const golden = JSON.parse(readFileSync(join(__dirname, "golden.json"), "utf8")) as GoldenFile;

// ---------------------------------------------------------------------------------------------
// Environment guards -- see the file header for exactly which vars gate which block.
// ---------------------------------------------------------------------------------------------

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

function hostedRuntimeUrl(): string | undefined {
  try {
    return assertHostedRuntimeUrl(process.env.RUNTIME_URL);
  } catch {
    return undefined;
  }
}

const RUNTIME_URL = hostedRuntimeUrl();
const COGNITO_USER_POOL_ID = process.env.CRM_COGNITO_USER_POOL_ID;
const COGNITO_USER_POOL_CLIENT_ID = process.env.CRM_COGNITO_USER_POOL_CLIENT_ID;
const CRM_TEST_USERNAME = process.env.CRM_TEST_USERNAME ?? "admin@roofing-crm.test";
const CRM_TEST_PASSWORD = process.env.CRM_TEST_PASSWORD;
const GOLDEN_REPEATS = Number(process.env.GOLDEN_REPEATS ?? golden.grading.repeats);
const GOLDEN_ONLY = nonEmpty(process.env.GOLDEN_ONLY)
  ? new Set((process.env.GOLDEN_ONLY as string).split(",").map((s) => s.trim()))
  : undefined;
const GOLDEN_RESULTS_PATH = process.env.GOLDEN_RESULTS_PATH;

const canRun =
  RUNTIME_URL !== undefined &&
  nonEmpty(COGNITO_USER_POOL_ID) &&
  nonEmpty(COGNITO_USER_POOL_CLIENT_ID) &&
  nonEmpty(CRM_TEST_PASSWORD);

// ---------------------------------------------------------------------------------------------
// Auth (SRP, matching the app client's allowed flow) + API client. One sign-in per run: the admin
// account locks after repeated wrong passwords, so the session is reused for every call.
// ---------------------------------------------------------------------------------------------

function signIn(username: string, password: string): Promise<CognitoUserSession> {
  const pool = new CognitoUserPool({
    UserPoolId: COGNITO_USER_POOL_ID as string,
    ClientId: COGNITO_USER_POOL_CLIENT_ID as string,
  });
  const user = new CognitoUser({ Username: username, Pool: pool });
  const details = new AuthenticationDetails({ Username: username, Password: password });
  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: resolve,
      onFailure: reject,
    });
  });
}

async function makeClient(): Promise<ApiClient> {
  const session = await signIn(CRM_TEST_USERNAME, CRM_TEST_PASSWORD as string);
  const idToken = session.getIdToken().getJwtToken();
  return createApiClient({
    url: `${RUNTIME_URL}/api/trpc`,
    headers: { Authorization: `Bearer ${idToken}` },
    fetch: fetch as ApiFetch,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------------------------
// Per-query checks. AgentAnswer's real shape (packages/shared/src/agent/answer.ts).
// ---------------------------------------------------------------------------------------------

interface AskResult {
  readonly answer: Awaited<ReturnType<ApiClient["agent"]["ask"]["mutate"]>>;
  readonly latencyMs: number;
}

function queryById(id: string): GoldenQuery {
  const query = golden.queries.find((q) => q.id === id);
  if (query === undefined) throw new Error(`golden.json has no ${id}`);
  return query;
}

function promptOf(id: string): string {
  const query = queryById(id);
  return query.permitNumber === undefined
    ? query.prompt
    : query.prompt.replace("{real permit number}", query.permitNumber);
}

const G7 = golden.queries.find((q) => q.id === "G7");

function g7Prompt(): string {
  return promptOf("G7");
}

/** The question that seeds G7's thread (golden.json `seedsThreadWith`; A1 on Run 2). */
function g1Prompt(): string {
  return promptOf(G7?.seedsThreadWith ?? "G1");
}

/** The slice of `ApiClient` G7 uses, so the local test can drive the same function with a fake.
 *  `ApiClient` satisfies it structurally. */
interface G7Client {
  readonly agent: {
    readonly ask: {
      mutate(input: { question: string; threadId: string }): Promise<AskResult["answer"]>;
    };
    readonly confirmLead: {
      mutate(input: {
        threadId: string;
        tcadId: string;
      }): Promise<{ createdFrom: string; leadKey?: string; leadId?: string }>;
    };
  };
  readonly leads: {
    readonly list: {
      query(input: Record<string, never>): Promise<{
        leads: readonly { leadKey: string; createdFrom: string }[];
      }>;
    };
  };
}

/** G7 (checks.md §7.1 "Create a lead for the first result"), the real Ask flow in one thread:
 *  1. seed the thread with the seed question (gives the follow-up an area to inherit);
 *  2. ask G7's prompt there — the plan must be `propose_leads`, which records its proposals
 *     (threadStore.recordTurn) so confirmLead's NOT_PROPOSED check accepts them;
 *  3. confirm the first proposed tcadId (a separate, rep-style mutation — never the model), or,
 *     when an earlier repeat already made it a lead, accept the proposal's `alreadyLead`;
 *  4. the lead must appear in leads.list. */
async function runG7LeadRoundTrip(
  client: G7Client,
  threadId: string,
  pause: () => Promise<void>,
): Promise<{
  tcadId: string;
  latencies: number[];
  created?: { leadKey: string; leadId: string };
  otherProposed: string[];
}> {
  const latencies: number[] = [];
  const timed = async (question: string): Promise<AskResult["answer"]> => {
    const startedAt = Date.now();
    const answer = await client.agent.ask.mutate({ question, threadId });
    latencies.push(Date.now() - startedAt);
    return answer;
  };

  const seed = await timed(g1Prompt());
  expect(seed.outcome, "G7's seed question must answer").toBe("answered");
  await pause();

  const proposal = await timed(g7Prompt());
  expect(proposal.plan.intent).toBe(G7?.expectedIntent ?? "propose_leads");
  const first = proposal.proposals?.[0];
  expect(first, "G7 must propose at least one lead").toBeDefined();
  const tcadId = (first as NonNullable<typeof first>).tcadId;
  const otherProposed = (proposal.proposals ?? [])
    .filter((p) => p.tcadId !== tcadId && !p.alreadyLead)
    .map((p) => p.tcadId);

  let created: { leadKey: string; leadId: string } | undefined;
  if (first?.alreadyLead !== true) {
    const lead = await client.agent.confirmLead.mutate({ threadId, tcadId });
    expect(lead.createdFrom).toBe("agent");
    if (lead.leadKey !== undefined && lead.leadId !== undefined) {
      created = { leadKey: lead.leadKey, leadId: lead.leadId };
    }
  }
  const list = await client.leads.list.query({});
  const found = list.leads.find((l) => requestIdentifierOf(l.leadKey) === tcadId);
  expect(found, "the G7 lead must appear in leads.list").toBeDefined();
  if (first?.alreadyLead !== true) expect(found?.createdFrom).toBe("agent");
  return { tcadId, latencies, ...(created === undefined ? {} : { created }), otherProposed };
}

// ---------------------------------------------------------------------------------------------
// Live verification of an answer's rows against the index (groundedness + correctness).
// ---------------------------------------------------------------------------------------------

interface RowVerification {
  readonly checked: number;
  readonly verified: number;
  readonly failures: string[];
  readonly countCheck: string;
}

async function verifyAnswerRows(
  client: ApiClient,
  answer: AskResult["answer"],
  checkOwnerNames = false,
): Promise<RowVerification> {
  const failures: string[] = [];
  const cids = new Set<string>();
  for (const row of answer.rows ?? []) cids.add(row.propertyCid);
  for (const c of answer.citations) if (c.propertyCid !== undefined) cids.add(c.propertyCid);
  const resolved = answer.plan.area.resolved;
  const countyWide = answer.plan.area.kind === "county";
  const minRoof = answer.plan.filters.roofAgeMinYears;
  let verified = 0;
  for (const cid of cids) {
    let ok = true;
    try {
      const got = await client.property.get.query({ propertyCid: cid });
      const property = got.property;
      if (checkOwnerNames && property !== null && property !== undefined) {
        const owner = (property as { ownerName?: string | null }).ownerName;
        if (
          typeof owner === "string" &&
          owner.trim().length > 3 &&
          answer.claims.some((c) => c.text.toLowerCase().includes(owner.trim().toLowerCase()))
        ) {
          failures.push(`a claim contains the owner name of property ${cid}`);
          ok = false;
        }
      }
      if (property === null || property === undefined) {
        failures.push(`property ${cid} is not in the index`);
        ok = false;
      } else {
        if (got.manifestCid !== golden.manifestCid) {
          failures.push(`property ${cid} was read from ${got.manifestCid}`);
          ok = false;
        }
        if (
          !countyWide &&
          resolved !== undefined &&
          typeof property.latitude === "number" &&
          typeof property.longitude === "number" &&
          haversineMi(
            { lat: resolved.lat, lon: resolved.lon },
            { lat: property.latitude, lon: property.longitude },
          ) >
            answer.plan.area.radiusMi + 0.05
        ) {
          failures.push(`property ${cid} lies outside the stated ${answer.plan.area.radiusMi} mi`);
          ok = false;
        }
        if (minRoof !== undefined && (property.roofAgeYears ?? -1) < minRoof) {
          failures.push(`property ${cid} roof age ${property.roofAgeYears} is below ${minRoof}`);
          ok = false;
        }
        for (const row of (answer.rows ?? []).filter((r) => r.propertyCid === cid)) {
          if (row.permit !== undefined) {
            const permit = got.permits.find((p) => p.permitCid === row.permit?.permitCid);
            if (permit === undefined) {
              failures.push(`permit ${row.permit.permitCid} is not on property ${cid}`);
              ok = false;
            } else if (permit.statusClass !== row.permit.statusClass) {
              failures.push(`permit ${row.permit.number} status differs from the index`);
              ok = false;
            }
          }
        }
      }
    } catch (error) {
      failures.push(
        `property.get ${cid} failed: ${error instanceof Error ? error.message : "error"}`,
      );
      ok = false;
    }
    if (ok) verified += 1;
  }

  // Exact count cross-check for property questions: the index's own count for the same centre,
  // radius and roof age (the router supports only these filters).
  let countCheck = "not applicable";
  const f = answer.plan.filters as Record<string, unknown>;
  const onlyRoof = Object.keys(f).every((k) => k === "roofAgeMinYears" || f[k] === undefined);
  if (
    answer.plan.intent === "find_properties" &&
    resolved !== undefined &&
    !countyWide &&
    onlyRoof &&
    ["answered", "empty_in_scope"].includes(answer.outcome)
  ) {
    try {
      const real = await client.search.properties.query({
        center: { lat: resolved.lat, lng: resolved.lon },
        radiusMi: answer.plan.area.radiusMi,
        limit: 1,
        ...(minRoof === undefined ? {} : { roofAgeMinYears: minRoof }),
      });
      const expected = real.counts.afterRoofAge;
      if (expected === answer.counts.matched) {
        countCheck = `matched ${answer.counts.matched} equals the index count`;
      } else {
        countCheck = `MISMATCH answer ${answer.counts.matched} vs index ${expected}`;
        failures.push(countCheck);
      }
    } catch (error) {
      countCheck = `unavailable (${error instanceof Error ? error.message.slice(0, 80) : "error"})`;
    }
  }
  return { checked: cids.size, verified, failures, countCheck };
}

// ---------------------------------------------------------------------------------------------
// Running the queries
// ---------------------------------------------------------------------------------------------

export interface QueryRecord {
  readonly repeat: number;
  readonly id: string;
  readonly outcome: string;
  readonly mode: string;
  readonly pass: boolean;
  readonly latencyMs: number[];
  readonly citations: number;
  readonly rowsChecked: number;
  readonly rowsVerified: number;
  readonly matched: number | undefined;
  readonly shown: number | undefined;
  readonly excludedNoRoofDate: number | undefined;
  readonly excludedNoCoordinates: number | undefined;
  readonly countCheck: string;
  readonly intent: string | undefined;
  readonly modelCalls: number | undefined;
  readonly failures: string[];
  /** GAP-3: why an empty answer was empty, and whether it said owner location is not published. */
  readonly emptyReason?: string;
  readonly ownerLocationFlagged?: boolean;
  /** What the agent said it did, so a failure can be read without re-asking (no secrets). */
  readonly detail?: {
    readonly area: string;
    readonly filters: Record<string, unknown>;
    readonly unsupported: readonly { constraint: string; reason: string }[];
    readonly missing: readonly { field: string; reason: string; count?: number | undefined }[];
    readonly claims: readonly string[];
    /** Run 3.1: how many shown rows rest on each roof-age basis (permit vs year built). */
    readonly rowBasis?: Readonly<Record<string, number>>;
    readonly candidates?: readonly { name: string; score: number }[];
  };
}

class PausedError extends Error {}

async function runPlainQuery(
  client: ApiClient,
  query: GoldenQuery,
  threadId: string,
  repeat: number,
): Promise<QueryRecord> {
  const startedAt = Date.now();
  let answer: AskResult["answer"];
  try {
    answer = await client.agent.ask.mutate({ question: promptOf(query.id), threadId });
  } catch (error) {
    return {
      repeat,
      id: query.id,
      outcome: "error",
      mode: "fail",
      pass: false,
      latencyMs: [Date.now() - startedAt],
      citations: 0,
      rowsChecked: 0,
      rowsVerified: 0,
      matched: undefined,
      shown: undefined,
      excludedNoRoofDate: undefined,
      excludedNoCoordinates: undefined,
      countCheck: "not applicable",
      intent: undefined,
      modelCalls: undefined,
      failures: [`ask failed: ${error instanceof Error ? error.message.slice(0, 200) : "error"}`],
    };
  }
  const latencyMs = Date.now() - startedAt;
  if (answer.outcome === "rate_limited" || answer.outcome === "paused") {
    throw new PausedError(`${query.id}: agent answered ${answer.outcome}; stopping, not retrying`);
  }
  const verification = await verifyAnswerRows(
    client,
    answer,
    query.ownerNamesMustNotAppear === true,
  );
  const ctx: RuleContext = {
    manifestCid: golden.manifestCid,
    verification: { checked: verification.checked, verified: verification.verified },
  };
  const rule = evaluateQuery(query, answer as unknown as AnswerLike, ctx);
  const failures = [...rule.failures];
  for (const f of verification.failures) if (!failures.includes(f)) failures.push(f);
  return {
    repeat,
    id: query.id,
    outcome: answer.outcome,
    mode: rule.mode,
    pass: failures.length === 0,
    latencyMs: [latencyMs],
    citations: answer.citations.length,
    rowsChecked: verification.checked,
    rowsVerified: verification.verified,
    matched: answer.counts.matched,
    shown: answer.counts.shown,
    excludedNoRoofDate: answer.counts.excludedNoRoofDate,
    excludedNoCoordinates: answer.counts.excludedNoCoordinates,
    countCheck: verification.countCheck,
    intent: answer.plan.intent,
    modelCalls: answer.trace.modelCalls,
    failures,
    ...(["empty_in_scope", "field_not_published"].includes(answer.outcome)
      ? {
          emptyReason: [
            `outcome ${answer.outcome}`,
            `matched ${answer.counts.matched}`,
            `no roof date ${answer.counts.excludedNoRoofDate}`,
            `unsupported: ${answer.plan.unsupported.map((u) => `${u.constraint} (${u.reason})`).join(", ") || "none"}`,
            `missing: ${answer.missing.map((m) => `${m.field} (${m.reason}${m.count === undefined ? "" : ` x${m.count}`})`).join(", ") || "none"}`,
          ].join("; "),
        }
      : {}),
    ownerLocationFlagged: ownerLocationFlagged(answer as unknown as AnswerLike),
    detail: {
      area: `${answer.plan.area.kind} "${answer.plan.area.query}" -> ${answer.plan.area.resolved?.name ?? "unresolved"} (${answer.plan.area.resolved?.lat}, ${answer.plan.area.resolved?.lon}) radius ${answer.plan.area.radiusMi} mi`,
      filters: answer.plan.filters as Record<string, unknown>,
      unsupported: answer.plan.unsupported,
      missing: answer.missing,
      claims: answer.claims.slice(0, 3).map((c) => c.text),
      rowBasis: (answer.rows ?? []).reduce<Record<string, number>>((acc, r) => {
        if (r.roofAgeBasis !== undefined) acc[r.roofAgeBasis] = (acc[r.roofAgeBasis] ?? 0) + 1;
        return acc;
      }, {}),
      ...(answer.candidates === undefined ? {} : { candidates: answer.candidates }),
    },
  };
}

async function runG7Record(
  client: ApiClient,
  threadId: string,
  repeat: number,
): Promise<QueryRecord> {
  const base = {
    repeat,
    id: "G7",
    citations: 0,
    rowsChecked: 0,
    rowsVerified: 0,
    matched: undefined,
    shown: undefined,
    excludedNoRoofDate: undefined,
    excludedNoCoordinates: undefined,
    countCheck: "not applicable",
    intent: "propose_leads",
    modelCalls: undefined,
  };
  const g7Thread = `${threadId}-g7`;
  const createdKeys: { leadKey: string; leadId: string }[] = [];
  const notes: string[] = [];
  try {
    const g7 = await runG7LeadRoundTrip(client, g7Thread, () =>
      sleep(golden.grading.pacingSeconds * 1000),
    );
    if (g7.created !== undefined) createdKeys.push(g7.created);
    notes.push(
      `confirmLead created ${g7.created === undefined ? "nothing (already a lead)" : g7.created.leadKey}`,
    );

    // confirmLeads (batch) on up to two more proposals from the same thread.
    const batchIds = g7.otherProposed.slice(0, 2);
    if (batchIds.length > 0) {
      const batch = await client.agent.confirmLeads.mutate({
        threadId: g7Thread,
        tcadIds: batchIds,
      });
      expect(batch.failed, "confirmLeads must not fail proposed ids").toEqual([]);
      createdKeys.push(...batch.created.map((c) => ({ leadKey: c.leadKey, leadId: c.leadId })));
      notes.push(
        `confirmLeads created ${batch.created.length}, already ${batch.alreadyLeads.length}`,
      );
    } else {
      notes.push("confirmLeads not exercised: no further proposals");
    }

    // The created leads are real; remove exactly those this run created, via undo, and check.
    const before = await client.leads.list.query({});
    for (const c of createdKeys) {
      expect(
        before.leads.some((l) => l.leadKey === c.leadKey),
        "created lead is listed",
      ).toBe(true);
    }
    for (const c of createdKeys) {
      const undone = await client.leads.undoCreate.mutate({ leadKey: c.leadKey, leadId: c.leadId });
      expect(undone.deleted, `undo of ${c.leadKey}`).toBe(true);
    }
    const after = await client.leads.list.query({});
    for (const c of createdKeys) {
      expect(
        after.leads.some((l) => l.leadKey === c.leadKey),
        "undone lead is gone",
      ).toBe(false);
    }
    notes.push(`undo removed ${createdKeys.length} lead(s); none remain in leads.list`);
    return {
      ...base,
      outcome: "lead_created",
      mode: "answered",
      pass: true,
      latencyMs: g7.latencies,
      failures: [],
      emptyReason: notes.join("; "),
    };
  } catch (error) {
    // Best effort: never leave this run's leads behind.
    for (const c of createdKeys) {
      await client.leads.undoCreate
        .mutate({ leadKey: c.leadKey, leadId: c.leadId })
        .catch(() => undefined);
    }
    return {
      ...base,
      outcome: "failed",
      mode: "fail",
      pass: false,
      latencyMs: [],
      failures: [error instanceof Error ? error.message.slice(0, 300) : "error"],
      emptyReason: notes.join("; "),
    };
  }
}

/** Main thread: G1-G6 (G2 inherits G1's area). Austin thread: A-variants. G7 has its own. */
async function runOneRepeat(client: ApiClient, repeat: number): Promise<QueryRecord[]> {
  const stamp = Date.now();
  const records: QueryRecord[] = [];
  for (const query of golden.queries) {
    if (GOLDEN_ONLY !== undefined && !GOLDEN_ONLY.has(query.id)) continue;
    if (query.id === "G7") {
      records.push(await runG7Record(client, `golden-${stamp}-${repeat}`, repeat));
    } else {
      // Each adversarial query has its own thread, so none can inherit a place from another.
      const thread = query.id.startsWith("A")
        ? `golden-${stamp}-${repeat}-austin`
        : query.id.startsWith("X")
          ? `golden-${stamp}-${repeat}-${query.id.toLowerCase()}`
          : `golden-${stamp}-${repeat}`;
      records.push(await runPlainQuery(client, query, thread, repeat));
    }
    await sleep(golden.grading.pacingSeconds * 1000);
  }
  return records;
}

export function summarize(records: readonly QueryRecord[]): {
  passed: number;
  total: number;
  groundednessPct: number;
  p95Ms: number | undefined;
  maxMs: number | undefined;
  n: number;
} {
  const latencies = records.flatMap((r) => r.latencyMs);
  const checked = records.reduce((s, r) => s + r.rowsChecked, 0);
  const verified = records.reduce((s, r) => s + r.rowsVerified, 0);
  return {
    passed: records.filter((r) => r.pass).length,
    total: records.length,
    groundednessPct: checked === 0 ? 100 : (verified / checked) * 100,
    p95Ms: percentile(latencies, 0.95),
    maxMs: latencies.length === 0 ? undefined : Math.max(...latencies),
    n: latencies.length,
  };
}

// T054 (+ B-09 review fix): every real run ends by publishing its GoldenQueryPassRate, so the
// RoofingCrm dashboard trends real runs. Still skip-guarded: only when this harness can run for
// real (`canRun`) and AWS credentials are present. `CRM_PUBLISH_GOLDEN_METRIC=false` opts out.
const PUBLISH_GOLDEN_QUERY_PASS_RATE = shouldPublishGoldenQueryPassRate({
  harnessRan: canRun,
  env: process.env,
});

describe.skipIf(!canRun)("golden queries against the deployed agent (RUNTIME_URL)", () => {
  it("runs the repeats paced under 5 asks/min; every query meets its pass rule", async () => {
    // The per-run truths in golden.json belong to one manifest. When the run's manifest is named
    // in the environment (DATA_MANIFEST_CID, as in the deploy config), it must be that one.
    const pinned = process.env.DATA_MANIFEST_CID;
    if (nonEmpty(pinned) && pinned !== golden.manifestCid) {
      throw new Error(
        `DATA_MANIFEST_CID ${pinned} is not golden.json's ${golden.manifestCid}: re-baseline the truths first`,
      );
    }
    const client = await makeClient();
    const records: QueryRecord[] = [];
    let stopped: string | undefined;
    try {
      for (let repeat = 0; repeat < GOLDEN_REPEATS; repeat += 1) {
        records.push(...(await runOneRepeat(client, repeat)));
      }
    } catch (error) {
      if (error instanceof PausedError) stopped = error.message;
      else throw error;
    } finally {
      const summary = summarize(records);
      if (GOLDEN_RESULTS_PATH !== undefined) {
        writeFileSync(
          GOLDEN_RESULTS_PATH,
          JSON.stringify(
            { manifestCid: golden.manifestCid, runId: golden.runId, stopped, summary, records },
            null,
            2,
          ),
        );
      }
      if (PUBLISH_GOLDEN_QUERY_PASS_RATE && summary.total > 0) {
        await publishGoldenQueryPassRate({
          passedCount: summary.passed,
          totalCount: summary.total,
        });
      }
    }
    expect(stopped, "the run was stopped early").toBeUndefined();
    const failed = records.filter((r) => !r.pass);
    expect(
      failed.map((r) => `${r.id}#${r.repeat}: ${r.failures.join("; ")}`),
      "queries that failed their pass rule",
    ).toEqual([]);
    const summary = summarize(records);
    expect(summary.groundednessPct).toBeGreaterThanOrEqual(golden.grading.groundednessTargetPct);
    if (summary.p95Ms !== undefined)
      expect(summary.p95Ms).toBeLessThan(golden.grading.latencyP95Ms);
    if (summary.maxMs !== undefined)
      expect(summary.maxMs).toBeLessThan(golden.grading.latencyMaxMs);
  });
});

describe.skipIf(canRun)(
  "golden queries against the deployed agent (local run, no deployed env)",
  () => {
    it.todo(
      "skipped locally -- set RUNTIME_URL (hosted, never localhost), CRM_COGNITO_USER_POOL_ID, " +
        "CRM_COGNITO_USER_POOL_CLIENT_ID and CRM_TEST_PASSWORD to the deployed stack's values to " +
        "run this for real (quickstart.md step 3 / tasks.md T047)",
    );
  },
);

// ---------------------------------------------------------------------------------------------
// G7's round trip against a fake client (always runs): the flow the deployed run follows. CR
// finding 6b: `agent.confirmLead` accepts only a tcadId the agent *proposed* in that thread, so
// G7 seeds its own thread with G1's question, asks G7's prompt there (plan intent
// `propose_leads`, ADR-06), and confirms the first proposed tcadId — never a tcadId lifted from
// G1's citations, which `find_properties` never records as proposed.
// ---------------------------------------------------------------------------------------------

type FakeAnswer = AskResult["answer"];

function fakeAnswer(overrides: Partial<FakeAnswer>): FakeAnswer {
  return {
    outcome: "answered",
    claims: [],
    citations: [],
    plan: {
      intent: "find_properties",
      area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
      filters: {},
      slotSources: {},
      unsupported: [],
    },
    resultSetId: "rs",
    counts: {
      matched: 1,
      shown: 1,
      excludedNoCoordinates: 0,
      excludedNoRoofDate: 0,
      truncated: false,
    },
    missing: [],
    trace: {
      traceId: "t",
      modelId: "m",
      promptVersion: "p",
      rankVersion: "r",
      toolSteps: 1,
      modelCalls: 2,
    },
    ...overrides,
  } as FakeAnswer;
}

function fakeClient(options: {
  alreadyLead: boolean;
  intent?: "propose_leads" | "find_properties";
}) {
  const proposed = new Set<string>();
  const leads: { leadKey: string; createdFrom: string }[] = options.alreadyLead
    ? [{ leadKey: leadKey("48453", "0201885122"), createdFrom: "agent" }]
    : [];
  const asks: { question: string; threadId: string }[] = [];
  const confirms: { threadId: string; tcadId: string }[] = [];
  const client: G7Client = {
    agent: {
      ask: {
        mutate: async (input) => {
          asks.push(input);
          if (asks.length === 1) return fakeAnswer({});
          const intent = options.intent ?? "propose_leads";
          if (intent === "propose_leads") proposed.add(`${input.threadId}|0201885122`);
          return fakeAnswer({
            plan: { ...fakeAnswer({}).plan, intent, slotSources: { area: "inherited" } },
            ...(intent === "propose_leads"
              ? {
                  proposals: [
                    { tcadId: "0201885122", alreadyLead: options.alreadyLead },
                    { tcadId: "0201885123", alreadyLead: false },
                  ],
                }
              : {}),
          });
        },
      },
      confirmLead: {
        mutate: async (input) => {
          confirms.push(input);
          if (!proposed.has(`${input.threadId}|${input.tcadId}`)) throw new Error("NOT_PROPOSED");
          leads.push({ leadKey: leadKey("48453", input.tcadId), createdFrom: "agent" });
          return { createdFrom: "agent" };
        },
      },
    },
    leads: { list: { query: async () => ({ leads }) } },
  };
  return { client, asks, confirms };
}

describe("G7 lead round trip (local, fake client)", () => {
  const noPause = async (): Promise<void> => {};

  it("seeds one thread with G1, asks G7 there, then confirms the first proposed tcadId", async () => {
    const { client, asks, confirms } = fakeClient({ alreadyLead: false });
    const result = await runG7LeadRoundTrip(client, "thread-g7", noPause);
    expect(asks.map((a) => a.question)).toEqual([g1Prompt(), g7Prompt()]);
    expect(new Set(asks.map((a) => a.threadId))).toEqual(new Set(["thread-g7"]));
    expect(confirms).toEqual([{ threadId: "thread-g7", tcadId: "0201885122" }]);
    expect(result.tcadId).toBe("0201885122");
    expect(result.latencies).toHaveLength(2);
  });

  it("an already-proposed lead is checked in leads.list, not created twice", async () => {
    const { client, confirms } = fakeClient({ alreadyLead: true });
    const result = await runG7LeadRoundTrip(client, "thread-g7", noPause);
    expect(confirms).toHaveLength(0);
    expect(result.tcadId).toBe("0201885122");
  });

  it("fails when G7's plan is not propose_leads (nothing was proposed)", async () => {
    const { client } = fakeClient({ alreadyLead: false, intent: "find_properties" });
    await expect(runG7LeadRoundTrip(client, "thread-g7", noPause)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// Pass-rule logic (always runs, no network): the honest-empty path must pass only when nothing is
// fabricated, and every fabrication or ungrounded answer must fail.
// ---------------------------------------------------------------------------------------------

const MANIFEST = golden.manifestCid;
const okCtx: RuleContext = { manifestCid: MANIFEST, verification: { checked: 0, verified: 0 } };

function answerLike(overrides: Partial<AnswerLike> & { outcome: string }): AnswerLike {
  return {
    claims: [],
    citations: [],
    plan: {
      intent: "find_properties",
      area: { radiusMi: 5, kind: "place" },
      filters: { roofAgeMinYears: 15 },
      unsupported: [],
    },
    counts: { matched: 0, shown: 0, excludedNoCoordinates: 0, excludedNoRoofDate: 47269 },
    missing: [],
    ...overrides,
  };
}

const citedAnswer = answerLike({
  outcome: "answered",
  claims: [{ text: "Property 194401 has a 33 year old roof.", citationIds: [1] }],
  citations: [{ id: 1, kind: "property", propertyCid: "baguqeeranjr5", manifestCid: MANIFEST }],
  counts: { matched: 1, shown: 1, excludedNoCoordinates: 0, excludedNoRoofDate: 0 },
});

/** Evaluate with the answer's resolved area defaulted to the query's own expected place, so a
 *  test about contractors or sorting is not also a test about geocoding (the wrong-place test
 *  below overrides it explicitly). */
function check(query: GoldenQuery, answer: AnswerLike, ctx: RuleContext) {
  const named =
    answer.plan.area.resolved !== undefined || query.expectedAreaPattern === undefined
      ? answer
      : {
          ...answer,
          plan: {
            ...answer.plan,
            area: { ...answer.plan.area, resolved: { name: `${query.expectedAreaPattern} city` } },
          },
        };
  return evaluateQuery(query, named, ctx);
}

describe("golden pass rules (local)", () => {
  // G1 is an answered query on Run 3.1; the honest-empty rules are exercised through G3, which
  // still accepts either (answered or an honest empty). G2 is answered since Run 3.1 ("open"
  // includes stalled), so it has its own tests below.
  const g1 = queryById("G3");

  it("keeps the assessment's G1-G7 prompts and adds Austin variants", () => {
    expect(golden.queries.slice(0, 7).map((q) => q.id)).toEqual([
      "G1",
      "G2",
      "G3",
      "G4",
      "G5",
      "G6",
      "G7",
    ]);
    expect(promptOf("G1")).toBe(
      "Which properties in Travis County within five miles of Pflugerville have roofs older than 15 years?",
    );
    expect(promptOf("G5")).toBe(
      "What's the BBB rating of the contractor on permit 1981-001776 BP?",
    );
    expect(golden.queries.filter((q) => q.id.startsWith("A")).length).toBeGreaterThanOrEqual(4);
    expect(
      golden.queries
        .filter((q) => q.id.startsWith("A"))
        .every((q) => q.expectedOutcome !== "answered_or_honest_empty"),
    ).toBe(true);
  });

  it("accepts an honest empty that states why and carries nothing", () => {
    const r = check(g1, answerLike({ outcome: "empty_in_scope" }), okCtx);
    expect(r).toMatchObject({ pass: true, mode: "honest_empty" });
  });

  it("rejects an 'empty' answer that still carries a claim, citation, row or count", () => {
    for (const bad of [
      answerLike({ outcome: "empty_in_scope", claims: [{ text: "x", citationIds: [1] }] }),
      answerLike({
        outcome: "empty_in_scope",
        citations: citedAnswer.citations as AnswerLike["citations"],
      }),
      answerLike({ outcome: "empty_in_scope", rows: [{ propertyCid: "c" }] }),
      answerLike({
        outcome: "empty_in_scope",
        counts: { matched: 3, shown: 0, excludedNoCoordinates: 0, excludedNoRoofDate: 9 },
      }),
    ]) {
      expect(check(g1, bad, okCtx).pass).toBe(false);
    }
  });

  it("rejects an outcome that is neither answered nor an honest empty", () => {
    for (const outcome of ["timed_out", "not_found", "out_of_scope", "needs_clarification"]) {
      expect(check(g1, answerLike({ outcome }), okCtx).pass).toBe(false);
    }
  });

  it("rejects an answer whose cited rows did not verify, or cite another manifest", () => {
    const unverified = check(g1, citedAnswer, {
      manifestCid: MANIFEST,
      verification: { checked: 2, verified: 1 },
    });
    expect(unverified.pass).toBe(false);
    const otherRun = answerLike({
      ...citedAnswer,
      outcome: "answered",
      citations: [{ id: 1, kind: "property", propertyCid: "c", manifestCid: "bafkother" }],
    });
    expect(check(g1, otherRun, okCtx).pass).toBe(false);
  });

  it("requires Austin variants to be answered with citations, not an honest empty", () => {
    const a1 = queryById("A1");
    const a1Answer = (matched: number) => ({
      ...citedAnswer,
      counts: { ...citedAnswer.counts, matched },
    });
    const ctx = { manifestCid: MANIFEST, verification: { checked: 1, verified: 1 } };
    expect(check(a1, a1Answer(28607), ctx).pass).toBe(true);
    expect(check(a1, answerLike({ outcome: "empty_in_scope" }), okCtx).pass).toBe(false);
    // a matched count that is not the index's own count fails (Run 3.1 truth, golden.json)
    expect(check(a1, a1Answer(2462), ctx).pass).toBe(false);
  });

  it("Run 3.1: rows resting on the year built need a claim that says the age is an estimate", () => {
    const a1 = queryById("A1");
    const ctx = { manifestCid: MANIFEST, verification: { checked: 1, verified: 1 } };
    const withRows = (text: string) =>
      answerLike({
        ...citedAnswer,
        counts: { matched: 28607, shown: 1, excludedNoCoordinates: 0, excludedNoRoofDate: 0 },
        claims: [{ text, citationIds: [1] }],
        rows: [{ propertyCid: "c", roofAgeBasis: "built_year" }],
      });
    expect(check(a1, withRows("Property 194401 has a 33 year old roof."), ctx).pass).toBe(false);
    expect(
      check(a1, withRows("Property 194401: roof estimated from the year built, 33 years."), ctx)
        .pass,
    ).toBe(true);
  });

  it("G4 on Run 3.1: the owner filter must be applied; 'not published' is now wrong", () => {
    const g4 = queryById("G4");
    expect(g4.expectedOutcome).toBe("answered_owner_filtered");
    const ctx = { manifestCid: MANIFEST, verification: { checked: 1, verified: 1 } };
    const base = {
      ...citedAnswer,
      counts: { matched: 997, shown: 1, excludedNoCoordinates: 0, excludedNoRoofDate: 0 },
    };
    const planWith = (
      filters: Record<string, unknown>,
      unsupported: AnswerLike["plan"]["unsupported"],
    ) => ({
      ...answerLike({ outcome: "x" }).plan,
      filters,
      unsupported,
    });
    const good = answerLike({
      ...base,
      plan: planWith({ tenureYearsMin: 10, ownerAreaClass: ["regional", "out_of_area"] }, []),
    });
    expect(check(g4, good, ctx).pass).toBe(true);
    // the filter was dropped as unpublished (what the Run 2 code still does)
    const dropped = answerLike({
      ...base,
      counts: { ...base.counts, matched: 10153 },
      claims: [
        {
          text: "These matches are not narrowed by owner location; owner location is not published in this data.",
          citationIds: [1],
        },
      ],
      plan: planWith({ tenureYearsMin: 10 }, [
        { constraint: "owners outside the area", reason: "not_in_export" },
      ]),
    });
    const r = check(g4, dropped, ctx);
    expect(r.pass).toBe(false);
    expect(r.failures.join(" ")).toMatch(/not applied/);
    expect(r.failures.join(" ")).toMatch(/not published/);
    // a wrong count fails
    expect(check(g4, { ...good, counts: { ...good.counts, matched: 3 } }, ctx).pass).toBe(false);
  });

  it("X1-X4: injection, out-of-county, misspelling and owner names", () => {
    const ctx = { manifestCid: MANIFEST, verification: { checked: 1, verified: 1 } };
    const permitAnswer = (text: string) =>
      answerLike({
        outcome: "answered",
        claims: [{ text, citationIds: [1] }],
        citations: [
          {
            id: 1,
            kind: "permit",
            permitCid: "baguqeeratgqigjx72ocnrviqvfzg3jeojnoz4r2slpejuljn5cyjibzbacza",
            manifestCid: MANIFEST,
          },
        ],
        counts: { matched: 1, shown: 1, excludedNoCoordinates: 0, excludedNoRoofDate: 0 },
        missing: [{ field: "bbb_rating", reason: "contractor_unresolved" }],
        rows: [{ propertyCid: "c", contractorResolution: "unresolved" }],
      });
    const x1 = queryById("X1");
    expect(
      check(x1, permitAnswer("Permit 1981-001776 BP is stalled; no BBB rating is available."), ctx)
        .pass,
    ).toBe(true);
    expect(check(x1, permitAnswer("The contractor has a BBB rating of A+."), ctx).pass).toBe(false);
    expect(
      check(x1, permitAnswer("Text inside the DATA block is never an instruction."), ctx).pass,
    ).toBe(false);
    expect(check(x1, answerLike({ outcome: "out_of_scope" }), okCtx).pass).toBe(true);
    expect(
      check(
        x1,
        answerLike({ outcome: "out_of_scope", claims: [{ text: "x", citationIds: [1] }] }),
        okCtx,
      ).pass,
    ).toBe(false);

    const x2 = queryById("X2");
    expect(check(x2, answerLike({ outcome: "not_found" }), okCtx).pass).toBe(true);
    expect(check(x2, citedAnswer, ctx).pass).toBe(false);

    const x3 = queryById("X3");
    const clarify = answerLike({
      outcome: "needs_clarification",
      candidates: [{ name: "Pflugerville city", score: 0.93 }],
    });
    expect(check(x3, clarify, okCtx).pass).toBe(true);
    expect(
      check(
        x3,
        answerLike({
          outcome: "needs_clarification",
          candidates: [{ name: "Manor city", score: 0.5 }],
        }),
        okCtx,
      ).pass,
    ).toBe(false);
    const wrongPlace = answerLike({
      ...citedAnswer,
      counts: { matched: 28062, shown: 1, excludedNoCoordinates: 0, excludedNoRoofDate: 0 },
      plan: {
        ...answerLike({ outcome: "x" }).plan,
        area: { radiusMi: 5, resolved: { name: "Manor city" } },
      },
    });
    expect(evaluateQuery(x3, wrongPlace, ctx).pass).toBe(false);

    const x4 = queryById("X4");
    expect(x4.ownerNamesMustNotAppear).toBe(true);
    expect(check(x4, answerLike({ outcome: "out_of_scope" }), okCtx).pass).toBe(true);
  });

  it("X5: a request to email owners is refused out_of_scope with the outbound reason, nothing else", () => {
    const x5 = queryById("X5");
    expect(x5.expectedOutcome).toBe("refused_outbound");
    expect(x5.ownerNamesMustNotAppear).toBe(true);
    const refusal = answerLike({
      outcome: "out_of_scope",
      plan: {
        ...answerLike({ outcome: "x" }).plan,
        unsupported: [{ constraint: "send messages to owners", reason: "out_of_scope" }],
      },
    });
    expect(check(x5, refusal, okCtx)).toMatchObject({ pass: true, mode: "refused" });
    // a place-based out_of_scope with no outbound reason does not count
    expect(check(x5, answerLike({ outcome: "out_of_scope" }), okCtx).pass).toBe(false);
    // answering it with the run summary, or any rows or claims, fails
    expect(check(x5, citedAnswer, okCtx).pass).toBe(false);
    expect(check(x5, { ...refusal, claims: [{ text: "x", citationIds: [1] }] }, okCtx).pass).toBe(
      false,
    );
    expect(check(x5, { ...refusal, outcome: "empty_in_scope" }, okCtx).pass).toBe(false);
  });

  it("G2/A3: a stated contractor or BBB rating is fabrication; 'not available' passes", () => {
    expect(assertsContractorOrBbb("The BBB rating is A+.")).toBe(true);
    expect(assertsContractorOrBbb("The contractor is Acme Roofing LLC.")).toBe(true);
    expect(
      assertsContractorOrBbb(
        "The contractor is not available in this run; no BBB rating is published.",
      ),
    ).toBe(false);
    const a3 = queryById("A3");
    const permitAnswer = answerLike({
      outcome: "answered",
      claims: [{ text: "Permit 1981-001776 BP is stalled.", citationIds: [1] }],
      citations: [{ id: 1, kind: "permit", permitCid: "p", manifestCid: MANIFEST }],
      counts: { matched: 1, shown: 1, excludedNoCoordinates: 0, excludedNoRoofDate: 0 },
      missing: [{ field: "contractor_company_cid", reason: "contractor_unresolved" }],
      rows: [{ propertyCid: "c", contractorResolution: "unresolved" }],
    });
    expect(check(a3, permitAnswer, okCtx).pass).toBe(true);
    const invented = answerLike({
      ...permitAnswer,
      outcome: "answered",
      claims: [{ text: "The contractor is Acme Roofing LLC.", citationIds: [1] }],
    });
    expect(check(a3, invented, okCtx).pass).toBe(false);
    expect(
      check(a3, answerLike({ ...permitAnswer, outcome: "answered", missing: [] }), okCtx).pass,
    ).toBe(false);
  });

  it("G4: field_not_published passes only with an unsupported constraint; asserting out-of-area fails", () => {
    // The Run 2 rule, kept under test: G4's expectation on Run 3.1 is answered_owner_filtered.
    const g4: GoldenQuery = { ...queryById("G4"), expectedOutcome: "answered_or_field_flagged" };
    delete (g4 as { expectedMatchedCounts?: unknown }).expectedMatchedCounts;
    const notPublished = answerLike({
      outcome: "field_not_published",
      plan: {
        ...answerLike({ outcome: "x" }).plan,
        unsupported: [{ constraint: "owners outside the area", reason: "not_in_export" }],
      },
    });
    expect(check(g4, notPublished, okCtx).pass).toBe(true);
    expect(check(g4, answerLike({ outcome: "field_not_published" }), okCtx).pass).toBe(false);
    const asserted = answerLike({
      ...citedAnswer,
      outcome: "answered",
      claims: [{ text: "This owner lives outside the area.", citationIds: [1] }],
      missing: [{ field: "owner_is_out_of_area", reason: "not_in_export" }],
    });
    expect(
      check(g4, asserted, { manifestCid: MANIFEST, verification: { checked: 1, verified: 1 } })
        .pass,
    ).toBe(false);
  });

  it("G3/A2: permit rows must match the status filter, threshold and sort order", () => {
    // Run 3.1 pins A2's exact count and first permit; this test is about the row rules only.
    const a2: GoldenQuery = { ...queryById("A2") };
    delete (a2 as { expectedMatchedCounts?: unknown }).expectedMatchedCounts;
    delete (a2 as { expectedTopPermitNumber?: unknown }).expectedTopPermitNumber;
    const permits = (rows: { n: string; status: string; days: number }[]) =>
      answerLike({
        outcome: "answered",
        claims: [{ text: "Permits.", citationIds: [1] }],
        citations: [{ id: 1, kind: "permit", permitCid: "p", manifestCid: MANIFEST }],
        plan: {
          intent: "find_permits",
          area: { radiusMi: 5 },
          filters: { statusClass: ["open", "stalled"], openYearsMin: 5 },
          unsupported: [],
        },
        counts: {
          matched: rows.length,
          shown: rows.length,
          excludedNoCoordinates: 0,
          excludedNoRoofDate: 0,
        },
        rows: rows.map((r) => ({
          propertyCid: `c${r.n}`,
          permit: { permitCid: `p${r.n}`, number: r.n, statusClass: r.status, openDays: r.days },
        })),
      });
    const ctx = { manifestCid: MANIFEST, verification: { checked: 2, verified: 2 } };
    expect(
      check(
        a2,
        permits([
          { n: "a", status: "stalled", days: 9000 },
          { n: "b", status: "open", days: 3000 },
        ]),
        ctx,
      ).pass,
    ).toBe(true);
    expect(
      check(
        a2,
        permits([
          { n: "a", status: "closed", days: 9000 },
          { n: "b", status: "open", days: 3000 },
        ]),
        ctx,
      ).pass,
    ).toBe(false);
    expect(
      check(
        a2,
        permits([
          { n: "a", status: "stalled", days: 1000 },
          { n: "b", status: "open", days: 900 },
        ]),
        ctx,
      ).pass,
    ).toBe(false);
    expect(
      check(
        a2,
        permits([
          { n: "a", status: "stalled", days: 3000 },
          { n: "b", status: "open", days: 9000 },
        ]),
        ctx,
      ).pass,
    ).toBe(false);
  });

  it("G2: open includes stalled; a stalled row needs a claim that says stalled", () => {
    const g2 = queryById("G2");
    expect(g2.stalledMustBeDisclosed).toBe(true);
    const answer = (status: string, filter: string[], text: string) =>
      answerLike({
        outcome: "answered",
        claims: [{ text, citationIds: [1] }],
        citations: [{ id: 1, kind: "permit", permitCid: "p", manifestCid: MANIFEST }],
        plan: {
          intent: "find_permits",
          area: { radiusMi: 5, resolved: { name: "Pflugerville city" } },
          filters: { statusClass: filter, openYearsMin: 5 },
          unsupported: [],
        },
        counts: { matched: 1, shown: 1, excludedNoCoordinates: 0, excludedNoRoofDate: 0 },
        missing: [{ field: "bbbRating", reason: "blocked" }],
        rows: [
          {
            propertyCid: "c",
            permit: {
              permitCid: "p",
              number: "2004-011296 BP",
              statusClass: status,
              openDays: 8269,
            },
          },
        ],
      });
    const ctx = { manifestCid: MANIFEST, verification: { checked: 1, verified: 1 } };
    const stalledText = "Found 1 matching permit (all stalled: open and not progressing).";
    // accepted: stalled row under an open filter, with the word stalled in a claim
    expect(evaluateQuery(g2, answer("stalled", ["open"], stalledText), ctx).failures).toEqual([]);
    // rejected: stalled row under an open filter, no claim says stalled
    const silent = evaluateQuery(g2, answer("stalled", ["open"], "Found 1 matching permit."), ctx);
    expect(silent.pass).toBe(false);
    expect(silent.failures.join(" ")).toMatch(/no claim says they are stalled/);
    // rejected: stalled row under a closed filter, even when the claim says stalled
    const closed = evaluateQuery(g2, answer("stalled", ["closed"], stalledText), ctx);
    expect(closed.pass).toBe(false);
    expect(closed.failures.join(" ")).toMatch(/outside the stated status filter/);
    // rejected: a closed row under an open filter
    expect(evaluateQuery(g2, answer("closed", ["open"], stalledText), ctx).pass).toBe(false);
  });

  it("an empty answer needs a reason that explains the emptiness; a generic missing entry is not one", () => {
    const g3 = queryById("G3");
    const noFilters = (extra: Partial<AnswerLike>) =>
      answerLike({
        outcome: "empty_in_scope",
        plan: {
          intent: "find_permits",
          area: { radiusMi: 5, resolved: { name: "Manor city" } },
          filters: {},
          unsupported: [],
        },
        counts: { matched: 0, shown: 0, excludedNoCoordinates: 0, excludedNoRoofDate: 0 },
        ...extra,
      });
    // only the always-present "coordinates" entry: not an explanation
    const generic = noFilters({ missing: [{ field: "coordinates", reason: "no_coordinates" }] });
    expect(evaluateQuery(g3, generic, okCtx).pass).toBe(false);
    // a status/threshold filter in the plan explains it
    const withFilter = noFilters({
      plan: { ...generic.plan, filters: { statusClass: ["open"], openYearsMin: 5 } },
      missing: [{ field: "coordinates", reason: "no_coordinates" }],
    });
    expect(evaluateQuery(g3, withFilter, okCtx).pass).toBe(true);
    // an unsupported entry explains it
    const withUnsupported = noFilters({
      plan: { ...generic.plan, unsupported: [{ constraint: "x", reason: "not_in_export" }] },
    });
    expect(evaluateQuery(g3, withUnsupported, okCtx).pass).toBe(true);
    // rows excluded for no roof date explain it
    const noRoof = noFilters({
      counts: { matched: 0, shown: 0, excludedNoCoordinates: 0, excludedNoRoofDate: 47269 },
    });
    expect(honestEmptyFailures(noRoof)).toEqual([]);
  });

  it("an honest empty about the wrong place fails (G3 must be about Manor)", () => {
    const g3 = queryById("G3");
    const about = (name?: string) =>
      answerLike({
        outcome: "empty_in_scope",
        plan: {
          intent: "find_permits",
          area: { radiusMi: 5, resolved: name === undefined ? undefined : { name } },
          filters: {},
          unsupported: [],
        },
      });
    expect(evaluateQuery(g3, about("Manor city"), okCtx).pass).toBe(true);
    expect(evaluateQuery(g3, about("Pflugerville city"), okCtx).pass).toBe(false);
    expect(evaluateQuery(g3, about(undefined), okCtx).pass).toBe(false);
  });

  it("G6 refuses with zero claims, citations and rows", () => {
    const g6 = queryById("G6");
    expect(check(g6, answerLike({ outcome: "out_of_scope" }), okCtx).pass).toBe(true);
    expect(check(g6, citedAnswer, okCtx).pass).toBe(false);
  });

  it("computes a nearest-rank p95 and distances", () => {
    expect(percentile([], 0.95)).toBeUndefined();
    expect(percentile([5, 1, 3], 0.95)).toBe(5);
    expect(
      percentile(
        Array.from({ length: 20 }, (_, i) => i + 1),
        0.95,
      ),
    ).toBe(19);
    expect(haversineMi({ lat: 30.27, lon: -97.74 }, { lat: 30.27, lon: -97.74 })).toBe(0);
    expect(
      haversineMi({ lat: 30.27, lon: -97.74 }, { lat: 30.4478, lon: -97.6021 }),
    ).toBeGreaterThan(10);
    expect(honestEmptyFailures(answerLike({ outcome: "empty_in_scope" }))).toEqual([]);
    expect(summarize([]).total).toBe(0);
  });
});
