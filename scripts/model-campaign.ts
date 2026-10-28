/** Finite quality campaign. No provider or endpoint is contacted without the explicit live execution gate. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  QUALITY_CORPUS,
  assessAnswer,
  type QualityOutcome,
  qualityFailure,
  QUALITY_CASE_MAPS,
  qualityCaseQuery,
} from "../packages/agent/src/quality";
import {
  CAMPAIGN_PHASE,
  CAMPAIGN_LIMITS,
} from "../packages/agent/src/campaign";
import { ROUTING_ARCHITECTURE } from "../packages/agent/src/bedrock";
import { answerQuestion, type AgentAnswer } from "../packages/agent/src/index";
import {
  QuerySchema,
  SearchResponseSchema,
  PropertySchema,
  type QueryInput,
} from "../packages/contracts/src/index";
import {
  MICRO_MODEL,
  LITE_MODEL,
  reviewModel,
} from "../packages/runtime-config/src/index";
import {
  assertPinnedSource,
  assertCostEnvelope,
  validateReleasePins,
  assertPackageIdentity,
  APPROVED_PUBLIC_MANIFEST_SHA256,
} from "../packages/hosted-runtime/src/release";
import { sourceIdentity } from "../packages/hosted-runtime/src/source-identity";
const execute = process.argv.includes("--execute");
if (process.argv.slice(2).some((x) => x !== "--execute"))
  throw new Error("Use campaign [--execute]");
if (!execute) {
  console.log(
    JSON.stringify(
      {
        mode: "plan",
        phase: CAMPAIGN_PHASE,
        architecture: ROUTING_ARCHITECTURE,
        durableLimits: CAMPAIGN_LIMITS,
        region: "us-east-1",
        model: MICRO_MODEL,
        corpus: QUALITY_CORPUS,
        caseMaps: QUALITY_CASE_MAPS,
        limits: {
          requestsTotal: 80,
          requestsPerDay: 60,
          requestsPerSessionHour: 20,
          converseTotal: 80,
          conversePerDay: 60,
          conversePerSessionHour: 20,
          turns: 1,
          readTools: 1,
          presentationTools: 1,
          aggregateTokens: 12000,
          outputPerCall: 1000,
          modelUsd: 3,
        },
        progression:
          "P4 Micro one-call grounded evidence selection; one measured repair, then one measured alternative if needed. Separate immutable P4 counters preserve P3 history.",
        liveInferenceCalls: 0,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (
  process.env.PRISM_CLOUD_EXECUTION_APPROVED !== "yes" ||
  process.env.PRISM_LIVE_INFERENCE_APPROVED !== "yes"
)
  throw new Error("Parent-owned cloud and live inference approvals required");
const get = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing private campaign input: ${k}`);
  return v;
};
const source = sourceIdentity();
const pins = validateReleasePins({
  expectedAccountId: get("PRISM_EXPECTED_ACCOUNT_ID"),
  region: "us-east-1",
  stage: "p3-review",
  head: get("PRISM_EXPECTED_HEAD"),
  tree: get("PRISM_EXPECTED_TREE"),
  archiveSha256: get("PRISM_EXPECTED_ARCHIVE_SHA256"),
  publicManifestSha256: APPROVED_PUBLIC_MANIFEST_SHA256,
  assetBucket: get("PRISM_DEPLOY_ASSET_BUCKET"),
  assetPrefix: "prism-p3/crm/",
  stackName: "PrismCrmP3Review",
});
assertPinnedSource(pins, source);
const packaged = JSON.parse(
  await readFile("build/release-package.json", "utf8"),
);
assertPackageIdentity(
  pins,
  packaged.identity,
  createHash("sha256")
    .update(await readFile("build/crm-lambda.zip"))
    .digest("hex"),
);
assertCostEnvelope({
  awsActual: Number(get("PRISM_AWS_ACTUAL_USD")),
  awsPending: Number(get("PRISM_AWS_PENDING_USD")),
  totalActual: Number(get("PRISM_P3_ACTUAL_USD")),
  totalPending: Number(get("PRISM_P3_PENDING_USD")),
});
const origin = get("PRISM_REVIEW_ORIGIN");
if (!/^https:\/\/d[a-z0-9]+\.cloudfront\.net$/.test(origin))
  throw new Error("Exact review CloudFront HTTPS origin required");
const dir = path.resolve(get("PRISM_PRIVATE_OPERATIONS_DIR"));
if (
  dir.startsWith(process.cwd() + path.sep) ||
  /(?:^|\/)return(?:\/|$)/.test(dir)
)
  throw new Error(
    "Campaign records require a private path outside source/returned evidence",
  );
await mkdir(dir, { recursive: true, mode: 0o700 });
const revision = process.env.PRISM_MODEL_PROMPT_REVISION ?? "base";
if (!["base", "repair-1"].includes(revision))
  throw new Error("Invalid prompt revision");
const model = reviewModel(process.env.BEDROCK_MODEL_ID ?? MICRO_MODEL, true);
// Parent promotes only verified failure digests to the shared campaign gate; this local proof cannot grant a model allowance.
for (const [required, env] of [
  [
    model === LITE_MODEL || revision === "repair-1",
    "PRISM_MICRO_BASE_FAILURE_REPORT",
  ],
  [model === LITE_MODEL, "PRISM_MICRO_REPAIR_FAILURE_REPORT"],
] as const) {
  if (required) {
    const prior = JSON.parse(await readFile(get(env), "utf8"));
    qualityFailure(prior, env.includes("REPAIR") ? "repair-1" : "base");
  }
}
let accessCode = "";
for await (const chunk of process.stdin) {
  accessCode += String(chunk);
  if (accessCode.length > 1024) throw new Error("Private input too long");
}
accessCode = accessCode.trim();
if (!accessCode) throw new Error("Review code required privately on stdin");
let cookie = "";
const hash = (x: string) => createHash("sha256").update(x).digest("hex");
async function request(
  route: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetch(new URL(route, origin), {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400)
    )
      throw new Error("Redirect rejected");
    const text = await response.text();
    if (Buffer.byteLength(text) > 4000000)
      throw new Error("Campaign response bound exceeded");
    return { response, data: JSON.parse(text) };
  } finally {
    clearTimeout(timer);
  }
}
const health = (await request("/api/health")).data;
if (
  health.buildId !== packaged.identity.buildId ||
  health.snapshotId !== get("PRISM_EXPECTED_SNAPSHOT_ID") ||
  (health.snapshotDigest ?? health.digest) !==
    get("PRISM_EXPECTED_SNAPSHOT_DIGEST") ||
  health.head !== source.head ||
  health.tree !== source.tree ||
  health.region !== "us-east-1" ||
  health.stage !== "p3-review" ||
  health.provider !== "bedrock-grounded" ||
  health.model?.architecture !== ROUTING_ARCHITECTURE ||
  health.model?.phase !== CAMPAIGN_PHASE ||
  health.model?.id !== model ||
  health.model?.promptRevision !== revision
)
  throw new Error("Campaign runtime is not the exact enabled pinned release");
const login = await request("/api/session", { accessCode });
// eslint-disable-next-line no-useless-assignment -- Drop private input reference after login; it is never retained.
accessCode = "";
if (!login.response.ok) throw new Error("Access denied");
cookie = login.response.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!cookie.startsWith("prism_review="))
  throw new Error("Session cookie missing");
const query: QueryInput = QuerySchema.parse({
    snapshotId: health.snapshotId,
    lat: 42.66,
    lng: -83.29,
    radiusMeters: 5 * 1609.344,
    includeUnknown: true,
    limit: 50,
  }),
  outcomes: QualityOutcome[] = [];
const reader = {
  search: async (q: QueryInput) => {
    const r = await request("/api/search", q);
    if (!r.response.ok)
      throw new Error("Evidence query unsupported or unavailable");
    return SearchResponseSchema.parse(r.data);
  },
  detail: async (id: string, snapshotId: string) =>
    PropertySchema.parse(
      (
        await request(
          `/api/properties/${encodeURIComponent(id)}?snapshotId=${encodeURIComponent(snapshotId)}`,
        )
      ).data,
    ),
};
let campaignFailure: string | undefined;
try {
  for (const item of QUALITY_CORPUS) {
    let baseline: AgentAnswer | undefined;
    const itemQuery = qualityCaseQuery(item.id, query);
    try {
      baseline = await answerQuestion(reader, item.prompt, itemQuery);
    } catch {
      /* Explicit unavailable/unsupported evidence is recorded below, never substituted with invented rows. */
    }
    const live = await request("/api/agent", {
      prompt: item.prompt,
      query: itemQuery,
    });
    if (item.refusal) {
      outcomes.push({
        id: item.id,
        passed:
          !live.response.ok &&
          ["UNSUPPORTED_TOOL", "INVALID_INPUT"].includes(live.data.code) &&
          live.data.mode === "refused-before-model",
        reason: live.response.ok
          ? "unsafe-request-accepted"
          : "explicit-refusal",
        promptDigest: hash(item.prompt),
        mode: live.data.mode,
        activeMap: {
          ...QUALITY_CASE_MAPS[item.id],
          radiusMeters: itemQuery.radiusMeters,
        },
        refusalProviderCalls:
          live.data.mode === "refused-before-model" ? 0 : undefined,
      });
      continue;
    }
    if (!live.response.ok) {
      outcomes.push({
        id: item.id,
        passed:
          !baseline &&
          ["UNSUPPORTED_TOOL", "INVALID_INPUT"].includes(live.data.code),
        reason: !baseline
          ? "explicit-evidence-unavailable"
          : "live-answer-failed",
        promptDigest: hash(item.prompt),
      });
      continue;
    }
    const answer = live.data as AgentAnswer;
    const reference = await reader.search(answer.query);
    const result = assessAnswer(
      item.id,
      item.prompt,
      itemQuery,
      answer,
      reference,
    );
    if (
      answer.mode !== "bedrock-grounded" ||
      answer.modelAudit?.architecture !== ROUTING_ARCHITECTURE ||
      answer.modelAudit?.converseCalls !== 1 ||
      answer.modelAudit?.evidenceDigest !==
        answer.toolTrace[0]?.evidenceDigest ||
      answer.modelAudit?.minimizedRowCount !==
        answer.toolTrace[0]?.minimizedRowCount ||
      answer.modelAudit?.unmeasuredCalls !== 0 ||
      answer.modelAudit?.modelId !== model ||
      answer.modelAudit?.promptRevision !== revision ||
      answer.modelAudit?.promptDigest !== hash(item.prompt)
    ) {
      result.passed = false;
      result.reason = "model-identity-or-protocol-failure";
    } else if (!baseline) {
      result.passed = false;
      result.reason = "deterministic-baseline-unavailable";
    } else if (baseline.results.length > 0 && answer.results.length === 0) {
      result.passed = false;
      result.reason = "empty-model-route-with-nonempty-baseline";
    }
    outcomes.push(result);
  }
} catch {
  campaignFailure = "transport-or-runtime-failure-private-details-redacted";
} finally {
  try {
    await request("/api/session", undefined, "DELETE");
  } catch {
    campaignFailure = "logout-or-runtime-failure-private-details-redacted";
  }
  cookie = "";
}
const accepted = outcomes.length === 8 && outcomes.every((x) => x.passed),
  report = {
    version: 2,
    phase: CAMPAIGN_PHASE,
    architecture: ROUTING_ARCHITECTURE,
    head: source.head,
    tree: source.tree,
    buildId: health.buildId,
    contractVersion: health.contractVersion,
    snapshotId: health.snapshotId,
    snapshotDigest: health.snapshotDigest ?? health.digest,
    modelId: model,
    region: "us-east-1",
    revision,
    outcomes,
    caseMaps: QUALITY_CASE_MAPS,
    campaignFailure,
    accepted,
    completedAt: new Date().toISOString(),
    rawProviderTracesRetained: false,
    modelAllowanceSource: "separate-durable-p4-hosted-campaign",
  };
const filename = path.join(
  dir,
  `campaign-${model === MICRO_MODEL ? "micro" : "lite"}-${revision}-${Date.now()}.json`,
);
await writeFile(filename, JSON.stringify(report, null, 2) + "\n", {
  mode: 0o600,
});
console.log(
  JSON.stringify(
    {
      accepted,
      phase: CAMPAIGN_PHASE,
      architecture: ROUTING_ARCHITECTURE,
      modelId: model,
      revision,
      passed: outcomes.filter((x) => x.passed).length,
      total: outcomes.length,
      evidenceSha256: hash(JSON.stringify(report)),
      recordIds: "digest-only",
      rawProviderTracesRetained: false,
    },
    null,
    2,
  ),
);
if (!accepted) process.exitCode = 1;
