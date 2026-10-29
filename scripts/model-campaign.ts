/** Preselected finite assessment campaign; no network in plan mode. Secrets enter only on stdin. */
import { canonicalDigest as hash } from "../packages/agent/src/canonical";
import contractLock from "../packages/contracts/contract.lock.json" with { type: "json" };
import { SOURCE_ASSESSMENT_DATE } from "../packages/runtime-config/src/source-assessment";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { SOURCE_CLOSURE_CORPUS } from "../packages/agent/src/intent/source-corpus";
import type { NlCorpusCase } from "../packages/agent/src/intent/corpus";
import { P5_LIVE_CORPUS } from "../packages/agent/src/intent/live-corpus";
import { interpretIntent } from "../packages/agent/src/intent";
import {
  CAMPAIGN_LIMITS,
  CAMPAIGN_PHASE,
} from "../packages/agent/src/campaign";
import { officialPlaceResolver } from "../packages/places/src/index";
import {
  CONTRACT_VERSION,
  QuerySchema,
  SearchResponseSchema,
  type QueryInput,
} from "../packages/contracts/src/index";
import {
  propertyMatchesQuery,
  compareQueryRows,
} from "../packages/contracts/src/query-predicates";
import {
  validateReleasePins,
  assertPinnedSource,
  assertPackageIdentity,
  assertCostEnvelope,
  APPROVED_PUBLIC_MANIFEST_SHA256,
} from "../packages/hosted-runtime/src/release";
import { sourceIdentity } from "../packages/hosted-runtime/src/source-identity";
import type { AgentAnswer } from "../packages/agent/src/index";
import { assessAnswer, qualityFailure } from "../packages/agent/src/quality";
import {
  MICRO_MODEL,
  LITE_MODEL,
  reviewModel,
} from "../packages/runtime-config/src/index";
import { ROUTING_ARCHITECTURE } from "../packages/agent/src/bedrock";
const sourceClosure = process.argv.includes("--source-closure");
const selectedCorpus: (NlCorpusCase & { contextPlace: string })[] =
  sourceClosure
    ? SOURCE_CLOSURE_CORPUS.map((item) => ({
        ...item,
        contextPlace: "Troy, Michigan",
        classes: ["source-closure"],
      }))
    : P5_LIVE_CORPUS;
const profile = sourceClosure
  ? "source-closure-12-retrieval-v3"
  : "original-objective-36-retrieval-v3";
if (
  process.argv
    .slice(2)
    .some((x) => !["--execute", "--source-closure"].includes(x))
)
  throw Error("Use model-campaign [--source-closure] [--execute]");
if (!process.argv.includes("--execute")) {
  const plan =
    JSON.stringify(
      {
        mode: "plan",
        phase: CAMPAIGN_PHASE,
        profile,
        limits: CAMPAIGN_LIMITS,
        corpus: selectedCorpus,
        corpusSha256: hash(selectedCorpus),
        liveCalls: 0,
      },
      null,
      2,
    ) + "\n";
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(plan, (error) => (error ? reject(error) : resolve()));
  });
  process.exit(0);
}
if (
  process.env.PRISM_CLOUD_EXECUTION_APPROVED !== "yes" ||
  process.env.PRISM_LIVE_INFERENCE_APPROVED !== "yes"
)
  throw Error("Explicit cloud and inference gates required");
const get = (k: string) => {
  const v = process.env[k];
  if (!v) throw Error("Missing private input: " + k);
  return v;
};
const model = reviewModel(process.env.BEDROCK_MODEL_ID ?? MICRO_MODEL, true),
  revision = process.env.PRISM_MODEL_PROMPT_REVISION ?? "base";
if (revision !== "base" && revision !== "repair-1")
  throw Error("Invalid revision");
for (const [required, key, priorRevision] of [
  [
    model === LITE_MODEL || revision === "repair-1",
    "PRISM_MICRO_BASE_FAILURE_REPORT",
    "base",
  ],
  [model === LITE_MODEL, "PRISM_MICRO_REPAIR_FAILURE_REPORT", "repair-1"],
] as const)
  if (required)
    qualityFailure(JSON.parse(await readFile(get(key), "utf8")), priorRevision);
const source = sourceIdentity();
const pins = validateReleasePins({
  expectedAccountId: get("PRISM_EXPECTED_ACCOUNT_ID"),
  region: "us-east-2",
  stage: "review",
  head: get("PRISM_EXPECTED_HEAD"),
  tree: get("PRISM_EXPECTED_TREE"),
  archiveSha256: get("PRISM_EXPECTED_ARCHIVE_SHA256"),
  publicManifestSha256: APPROVED_PUBLIC_MANIFEST_SHA256,
  assetBucket: get("PRISM_DEPLOY_ASSET_BUCKET"),
  assetPrefix: "assessment/crm/",
  stackName: "PrismCrmAssessmentReview",
});
assertPinnedSource(pins, source);
const pkg = JSON.parse(await readFile("build/release-package.json", "utf8"));
const archive = await readFile("build/crm-lambda.zip");
assertPackageIdentity(
  pins,
  pkg.identity,
  createHash("sha256").update(archive).digest("hex"),
);
assertCostEnvelope({
  awsActual: Number(get("PRISM_AWS_ACTUAL_USD")),
  awsPending: Number(get("PRISM_AWS_PENDING_USD")),
  totalActual: Number(get("PRISM_PROJECT_ACTUAL_USD")),
  totalPending: Number(get("PRISM_PROJECT_PENDING_USD")),
});
const origin = get("PRISM_REVIEW_ORIGIN"),
  dir = path.resolve(get("PRISM_PRIVATE_OPERATIONS_DIR"));
if (
  !/^https:\/\/d[a-z0-9]+\.cloudfront\.net$/.test(origin) ||
  dir.startsWith(process.cwd() + path.sep) ||
  /(?:^|\/)return(?:\/|$)/.test(dir)
)
  throw Error("Exact origin and private output required");
await mkdir(dir, { recursive: true, mode: 0o700 });
let code = "",
  cookie = "";
class CampaignResponseError extends Error {
  constructor(
    readonly status: number,
    readonly correlationId: string | null,
    readonly responseDigest: string,
  ) {
    super("Campaign endpoint returned malformed JSON");
    this.name = "CampaignResponseError";
  }
}
for await (const b of process.stdin) {
  code += String(b);
  if (code.length > 1024) throw Error("Private input bound");
}
code = code.trim();
if (!code) throw Error("Private code on stdin required");
async function request(
  route: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  const r = await fetch(new URL(route, origin), {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(29000),
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  if (Buffer.byteLength(text) > 6 * 1024 ** 2)
    throw Error("Response byte bound");
  try {
    return {
      response: r,
      data: JSON.parse(text),
      bytes: Buffer.byteLength(text),
    };
  } catch {
    throw new CampaignResponseError(
      r.status,
      r.headers.get("x-amzn-requestid") ?? r.headers.get("x-request-id"),
      hash(text),
    );
  }
}
const health = (await request("/api/health")).data;
if (
  health.head !== source.head ||
  health.tree !== source.tree ||
  health.buildId !== pkg.identity.buildId ||
  health.contractSha256 !== pkg.identity.contractSha256 ||
  health.snapshotId !== get("PRISM_EXPECTED_SNAPSHOT_ID") ||
  (health.snapshotDigest ?? health.digest) !==
    get("PRISM_EXPECTED_SNAPSHOT_DIGEST") ||
  health.model?.phase !== CAMPAIGN_PHASE ||
  health.model?.sourceAssessmentDate !== SOURCE_ASSESSMENT_DATE ||
  health.model?.id !== model ||
  health.model?.promptRevision !== revision
)
  throw Error("Exact enabled current model/revision release required");
const login = await request("/api/session", { accessCode: code });
// eslint-disable-next-line no-useless-assignment -- Never persist or return the access credential.
code = "";
if (!login.response.ok) throw Error("Access denied");
cookie = login.response.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!cookie.startsWith("prism_review=")) throw Error("Missing session");
const startedAt = new Date().toISOString(),
  outcomes: Record<string, unknown>[] = [];
let campaignFailure: string | undefined;
try {
  for (const item of selectedCorpus) {
    const attemptedAt = new Date().toISOString();
    let agentEndpointAttempted = false;
    let stage = "plan",
      httpStatus: number | undefined,
      correlationId: string | undefined;
    try {
      const place = officialPlaceResolver.resolve(item.contextPlace);
      if (place.status !== "resolved")
        throw Error("Frozen context unavailable");
      const base: QueryInput = QuerySchema.parse({
          snapshotId: health.snapshotId,
          ...place.place.center,
          radiusMeters: 8046.72,
          limit: 50,
          ...item.base,
        }),
        plan = interpretIntent(item.prompt, base);
      if (plan.accepted !== (item.expected === "accepted"))
        throw Error("Frozen deterministic expectation drift");
      stage = "source-baseline";
      const baseline = plan.accepted
        ? SearchResponseSchema.parse(
            (await request("/api/search", plan.query)).data,
          )
        : undefined;
      stage = "agent-endpoint";
      agentEndpointAttempted = true;
      const at = new Date().toISOString(),
        live = await request("/api/agent", {
          prompt: item.prompt,
          query: base,
        });
      httpStatus = live.response.status;
      correlationId =
        live.response.headers.get("x-amzn-requestid") ??
        live.response.headers.get("x-request-id") ??
        undefined;
      const answer = live.data as AgentAnswer;
      const checks: Record<string, boolean> = {};
      if (item.expected === "refused") {
        checks.explicitPreModelRefusal =
          !live.response.ok &&
          live.data.mode === "refused-before-model" &&
          ["UNSUPPORTED_TOOL", "INVALID_INPUT"].includes(live.data.code);
        checks.blockedMaterialLedger =
          live.data.intent?.accepted === false &&
          live.data.intent?.ledger?.some(
            (e: { material: boolean; classification: string }) =>
              e.material && e.classification !== "applied",
          );
        checks.noModelAudit = !live.data.modelAudit;
      } else {
        const q = QuerySchema.parse(plan.query),
          ids = new Set(baseline!.rows.map((p) => p.id));
        checks.httpSuccess = live.response.ok;
        checks.sameTypedQuery =
          JSON.stringify(QuerySchema.parse(answer.query)) === JSON.stringify(q);
        checks.appliedLedger =
          answer.intent?.accepted === true &&
          !answer.intent.ledger.some(
            (e) => e.material && e.classification !== "applied",
          );
        checks.sourceSubset =
          Array.isArray(answer.results) &&
          new Set(answer.results.map((p) => p.id)).size ===
            answer.results.length &&
          answer.results.every(
            (p) =>
              ids.has(p.id) &&
              propertyMatchesQuery(p, q) &&
              hash(p) === hash(baseline!.rows.find((v) => v.id === p.id)),
          );
        checks.sourceOrder =
          !q.sort ||
          answer.results.every(
            (p, i, a) => i === 0 || compareQueryRows(a[i - 1]!, p, q) <= 0,
          );
        checks.minimizedEvidence =
          baseline!.rows.length === 0 ||
          (answer.toolTrace?.[0]?.modelSawMinimizedFacts === false &&
            answer.toolTrace?.[0]?.retrievalReads === 2 &&
            (answer.modelAudit?.minimizedRowCount ?? 0) > 0);
        checks.expectedModelPath =
          baseline!.rows.length === 0
            ? answer.mode === "evidence-empty" &&
              answer.modelAudit?.converseCalls === 0
            : answer.mode === "bedrock-grounded" &&
              answer.modelAudit?.converseCalls === 1 &&
              answer.results.length > 0 &&
              !answer.modelAudit?.failureCode;
        checks.exactGroundedTrace = assessAnswer(
          item.id,
          item.prompt,
          base,
          answer,
          baseline,
        ).passed;
        checks.modelIdentityAndTrace =
          answer.modelAudit?.modelId === model &&
          answer.modelAudit?.promptRevision === revision &&
          answer.modelAudit?.region === "us-east-2" &&
          answer.modelAudit?.promptDigest === hash(item.prompt) &&
          answer.modelAudit?.architecture === ROUTING_ARCHITECTURE &&
          answer.modelAudit?.evidenceDigest ===
            answer.toolTrace[0]?.evidenceDigest &&
          answer.modelAudit?.minimizedRowCount ===
            answer.toolTrace[0]?.minimizedRowCount &&
          answer.modelAudit?.unmeasuredCalls === 0;
        checks.measuredUsage =
          baseline!.rows.length === 0 ||
          Boolean(
            answer.modelAudit?.inputTokens &&
            answer.modelAudit.outputTokens &&
            answer.modelAudit.unmeasuredCalls === 0 &&
            answer.modelAudit.reservedMicroUsd > 0,
          );
      }
      outcomes.push({
        id: item.id,
        promptDigest: hash(item.prompt),
        at,
        expected: item.expected,
        agentEndpointAttempted,
        contextPlace: item.contextPlace,
        checks,
        passed: Object.values(checks).every(Boolean),
        httpStatus: live.response.status,
        mode: live.data.mode,
        code: live.data.code,
        planDigest: hash(plan),
        appliedQuery: plan.query ?? null,
        baselineTotal: baseline?.total ?? null,
        baselinePageRows: baseline?.rows.length ?? null,
        resultCount: answer.results?.length ?? null,
        resultIdsDigest: hash(answer.results?.map((p) => p.id) ?? []),
        responseDigest: hash(live.data),
        responseBytes: live.bytes,
        modelAudit: answer.modelAudit ?? null,
      });
    } catch (error) {
      if (error instanceof CampaignResponseError) {
        httpStatus = error.status;
        correlationId = error.correlationId ?? undefined;
      }
      outcomes.push({
        id: item.id,
        promptDigest: hash(item.prompt),
        at: attemptedAt,
        expected: item.expected,
        agentEndpointAttempted,
        contextPlace: item.contextPlace,
        passed: false,
        stage,
        httpStatus: httpStatus ?? null,
        correlationId: correlationId ?? null,
        reason: "transport-or-response-validation-failure",
        failureClass: error instanceof Error ? error.name : "UnknownError",
        responseDigest:
          error instanceof CampaignResponseError ? error.responseDigest : null,
        automaticRetry: false,
        modelUsageNotAssumedZero: stage === "agent-endpoint",
        rawBodyReturned: false,
      });
    }
    await writeFile(
      path.join(dir, "model-campaign-progress.json"),
      JSON.stringify({ startedAt, outcomes }, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
} catch (error) {
  campaignFailure = error instanceof Error ? error.name : "UnknownError";
} finally {
  try {
    const logout = await request("/api/session", undefined, "DELETE");
    if (!logout.response.ok) campaignFailure = "SessionRevocationFailed";
  } catch {
    campaignFailure = "SessionRevocationFailed";
  }
  await writeFinalReport();
}
async function writeFinalReport() {
  const report = {
    profile,
    contractVersion: CONTRACT_VERSION,
    contractModuleGraphSha256: contractLock.moduleGraphSha256,
    sourceAssessmentDate: SOURCE_ASSESSMENT_DATE,
    architecture: ROUTING_ARCHITECTURE,
    modelId: model,
    region: "us-east-2",
    revision,
    accepted:
      !campaignFailure &&
      outcomes.length === selectedCorpus.length &&
      outcomes.every((x) => x.passed),
    phase: CAMPAIGN_PHASE,
    startedAt,
    completedAt: new Date().toISOString(),
    release: pkg.identity,
    archiveSha256: pins.archiveSha256,
    snapshotId: health.snapshotId,
    snapshotDigest: health.snapshotDigest,
    placeIndexDigest: officialPlaceResolver.indexDigest,
    corpusSha256: hash(selectedCorpus),
    preselectedCases: selectedCorpus.length,
    acceptedCases: selectedCorpus.filter((item) => item.expected === "accepted")
      .length,
    refusalCases: selectedCorpus.filter((item) => item.expected === "refused")
      .length,
    limits: CAMPAIGN_LIMITS,
    allChecksPassed:
      !campaignFailure &&
      outcomes.length === selectedCorpus.length &&
      outcomes.every((x) => x.passed),
    campaignFailure: campaignFailure ?? null,
    endpointAttemptCount: outcomes.filter(
      (x) => x.agentEndpointAttempted === true,
    ).length,
    requestAccounting:
      "Durable request counters count validated agent executions; endpoint quotas also count pre-model refusals. No existing counter is reset.",
    outcomes,
    usage: {
      classification: "known-reported-audit-subtotal",
      unknownUsageAttempts: outcomes.filter(
        (x) =>
          x.agentEndpointAttempted === true &&
          !x.modelAudit &&
          !(x.checks as Record<string, boolean> | undefined)
            ?.explicitPreModelRefusal,
      ).length,
      usageComplete: !outcomes.some(
        (x) =>
          x.agentEndpointAttempted === true &&
          !x.modelAudit &&
          !(x.checks as Record<string, boolean> | undefined)
            ?.explicitPreModelRefusal,
      ),
      knownReportedConverseCalls: outcomes.reduce(
        (n, x) =>
          n +
          Number(
            (x.modelAudit as AgentAnswer["modelAudit"])?.converseCalls ?? 0,
          ),
        0,
      ),
      inputTokens: outcomes.reduce(
        (n, x) =>
          n +
          Number((x.modelAudit as AgentAnswer["modelAudit"])?.inputTokens ?? 0),
        0,
      ),
      outputTokens: outcomes.reduce(
        (n, x) =>
          n +
          Number(
            (x.modelAudit as AgentAnswer["modelAudit"])?.outputTokens ?? 0,
          ),
        0,
      ),
      measuredMicroUsd: outcomes.reduce(
        (n, x) =>
          n +
          Number(
            (x.modelAudit as AgentAnswer["modelAudit"])?.measuredMicroUsd ?? 0,
          ),
        0,
      ),
    },
  };
  const file = path.join(dir, "model-campaign-" + Date.now() + ".json");
  await writeFile(file, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      file,
      passed: report.allChecksPassed,
      cases: outcomes.length,
      usage: report.usage,
    }),
  );
  if (!report.allChecksPassed) process.exitCode = 1;
}
