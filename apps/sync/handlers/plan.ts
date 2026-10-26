// Plan (T024, INDEX group, espeon): resolves the authoritative manifestCid, checks every
// profiles[].sha256 against the vendored packages/oracle-contract/oracle-views copy's own digest
// (ADR-07's drift guard — holds, never throws uncaught, on a mismatch), and the cost-gate check
// sized from the manifest's own declared byte size (never a live HEAD request, machamp's
// refinement in research.md). Records this run's start timestamp, read back by Promote (T022) to
// compute SyncDurationMs — a cross-task data dependency threaded through the Step Functions
// execution payload, not a side read.
import { createHash } from "node:crypto";
import { withObservability, type Observability } from "@crm/observability";
import { RunManifestV1, RunsIndexV1 } from "@crm/oracle-contract";
import { isCidV1 } from "@crm/oracle-contract/cid";
import { PROFILE } from "@crm/oracle-profile-travis-austin";
import { boundPartNames, gazetteer } from "@crm/oracle-views";
import { BUILD_INDEX_VIEWS } from "../src/batchCoverage.js";
import type { IndexMetaHeldReason } from "@crm/index-schema";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { contentAddressedKey } from "./fetchPart.js";
import { estimateCostFromManifest, evaluateCostGate } from "./costGate.js";

/** The manifest's own downloadable data files (`kind: "table"` — never the `car`/`directory`
 *  container-level artifacts, which nothing in this pipeline fetches directly). FetchPart's Map
 *  iterates this list, one per Step Functions Map item (contracts/sync-pipeline.md). */
const PART_KIND = "table";

const PLACES_PROFILE_NAME = "travis-places";

const FETCH_TIMEOUT_MS = 15_000;

/** Env var names for each gateway's base URL — the same names infra/lib/crm-sync-stack.ts wires
 *  onto both PlanFunction and FetchPartFunction (never a hard-coded domain here). CloudFront is
 *  tried first per ADR-02; an unset GATEWAY_CLOUDFRONT_BASE_URL (e.g. in a local/test run where
 *  the stack hasn't wired it) just skips straight to Filebase/Pinata rather than failing. */
const GATEWAY_BASE_URL_ENV = {
  cloudfront: "GATEWAY_CLOUDFRONT_BASE_URL",
  filebase: "GATEWAY_FILEBASE_BASE_URL",
  pinata: "GATEWAY_PINATA_BASE_URL",
} as const;

/** CloudFront serves Task A's CID copy at `/{cid}` directly (confirmed live, run-log.md Stage 0
 *  A1) — not the `/ipfs/{cid}` path every always-public gateway (Filebase, Pinata) uses. */
function gatewayManifestUrl(
  gateway: keyof typeof GATEWAY_BASE_URL_ENV,
  baseUrl: string,
  cid: string,
): string {
  return gateway === "cloudfront" ? `${baseUrl}/${cid}` : `${baseUrl}/ipfs/${cid}`;
}

/** ADR-02's fixed fallback order for the one lightweight fetch Plan needs (the manifest JSON
 *  only — never the 23 table parts; that network boundary belongs entirely to FetchPart/machamp).
 *  Falls back to Filebase's/Pinata's always-public default base URLs when the stack hasn't set
 *  their env vars (local dev, tests) — CloudFront has no such default since it is Task A's own
 *  deployed distribution, not a generic public gateway. */
function manifestGatewayUrls(cid: string): string[] {
  const cloudfrontBase = process.env[GATEWAY_BASE_URL_ENV.cloudfront];
  const filebaseBase = process.env[GATEWAY_BASE_URL_ENV.filebase] ?? "https://ipfs.filebase.io";
  const pinataBase = process.env[GATEWAY_BASE_URL_ENV.pinata] ?? "https://gateway.pinata.cloud";
  const urls: string[] = [];
  if (cloudfrontBase !== undefined && cloudfrontBase !== "") {
    urls.push(gatewayManifestUrl("cloudfront", cloudfrontBase, cid));
  }
  urls.push(gatewayManifestUrl("filebase", filebaseBase, cid));
  urls.push(gatewayManifestUrl("pinata", pinataBase, cid));
  return urls;
}

export interface PlanCostEstimate {
  predictedSpendUsd: number;
  predictedDocCount: number;
  predictedBytes: number;
}

export interface PlanProfileRef {
  name: string;
  version: string;
  sha256: string;
}

/** One manifest table artifact FetchPart will fetch. `path` doubles as this story's content-
 *  addressed S3 key input (`sha256(manifestCid + path)`, shared with FetchPart) and the row
 *  BuildIndex writes the downloaded bytes to under its local tablesDir layout. */
export interface PlanPart {
  name: string;
  path: string;
  cid: string;
  sha256: string;
}

export interface PlanResult {
  // Present (undefined) so callers (and T008's own fixture test) can read `.status`/
  // `.heldReason` off the PlanResult | PlanHeld union without narrowing first.
  status?: undefined;
  heldReason?: undefined;
  manifestCid: string;
  /** The S3 bucket every later step (FetchPart, BuildIndex, Validate) reads/writes. */
  bucket: string;
  /** S3 key of the verified manifest JSON bytes, written by this step (BuildIndex downloads it
   *  from here rather than re-fetching from a gateway). */
  manifestKey: string;
  parts: PlanPart[];
  profiles: PlanProfileRef[];
  costEstimate: PlanCostEstimate;
  /** This run's start timestamp — Promote (T022) reads this back to compute SyncDurationMs. */
  startedAt: string;
  /** The manifest's own `coverage.parcels_published.count` — Validate (T019) reconciles
   *  BuildIndex's row count against this, never a live recount of Task A's data. Null when Task A
   *  does not publish it (full-county manifests) — never defaulted to 0. */
  coverageParcelsPublished: number | null;
  /** The manifest's own `coverage.permits_emitted.count` (B-09): Validate reconciles crm_permit
   *  against it, exactly Task A's own publish gate. Null when absent. */
  coveragePermitsEmitted: number | null;
  /** The manifest's own `finishedAt` — carried through to Validate/Promote's `IndexMeta` rather
   *  than generated fresh at each later step. */
  finishedAt: string;
}

export interface PlanHeld {
  status: "Held";
  heldReason: IndexMetaHeldReason;
  manifestCid: string;
}

/** B-09 auto-sync idempotency: the resolved manifestCid is already `META#index.current`, so this
 *  run ends before fetching anything (the state machine routes it straight to a Succeed state). */
export interface PlanAlreadyPromoted {
  status: "AlreadyPromoted";
  heldReason?: undefined;
  manifestCid: string;
}

export interface PlanInput {
  manifestCidHint?: string;
  /** Operator override: rebuild and re-validate even when this manifestCid is already promoted
   *  (e.g. after a BuildIndex code change). Promote still no-ops on the pointer itself. */
  forceRebuild?: boolean;
  /** Test-only: forces the digest guard to see a mismatch, without needing a crafted manifest. */
  __testForceDigestMismatch?: boolean;
}

/** Multibase 'b' = base32 (RFC4648, lowercase, no padding) — the only multibase CIDv1 uses. */
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/**
 * Decodes a CIDv1, raw-codec (0x55), sha2-256 (multihash code 0x12, length 0x20) CID down to its
 * embedded 32-byte digest — the only CID shape Task A's published manifest/part CIDs use
 * (confirmed against the real sample manifest CID). Returns `undefined` for any other multibase/
 * version/codec/multihash shape; the caller treats that exactly like a verification failure,
 * never a thrown error. No `multiformats` (or any other CID-decoding) package is vendored or
 * installed anywhere in this workspace (ADR-07 vendors Task A's `query-core`/`contract` only,
 * never its CID tooling) — this is a minimal, self-contained decode of exactly the shape in use,
 * not a general-purpose CID library.
 */
function cidV1RawSha256Digest(cid: string): Buffer | undefined {
  if (!cid.startsWith("b")) return undefined;
  const body = cid.slice(1);
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of body) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) return undefined;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const [version, codec, multihashCode, multihashLength] = bytes;
  if (
    bytes.length < 4 + 32 ||
    version !== 0x01 ||
    codec !== 0x55 ||
    multihashCode !== 0x12 ||
    multihashLength !== 0x20
  ) {
    return undefined;
  }
  return Buffer.from(bytes.slice(4, 4 + 32));
}

/**
 * T047 (Phase 6 convergence, CRITICAL): verifies the manifest's own fetched bytes against the
 * `manifestCid` they were requested by — before this fix, only the manifest's *parts* were
 * verified downstream (FetchPart's sha256 check), never the manifest itself, contradicting
 * FR-001's "verify every byte... before use" and architecture-constitution.md §6/§8. Returns a
 * boolean rather than throwing — `planCore` turns a `false` result into a `Held` run, never an
 * uncaught exception or a silent pass-through of unverified bytes.
 */
function manifestBytesVerifyAgainstCid(cid: string, bytes: Uint8Array): boolean {
  const expectedDigest = cidV1RawSha256Digest(cid);
  if (expectedDigest === undefined) return false;
  const actualDigest = createHash("sha256").update(bytes).digest();
  return Buffer.compare(expectedDigest, actualDigest) === 0;
}

/** Reads one S3 object fully into memory as bytes, for the small `runs/index.json` hint file
 *  only (never used for the multi-megabyte manifest/table artifacts, which stream to disk via
 *  `packages/observability`'s `downloadS3ObjectToFile`). Works against both a real S3 SDK
 *  response body and a plain `Readable` test fixture (both are async-iterable), unlike
 *  `transformToByteArray()`, which only the real SDK's stream-mixin-wrapped body has. */
async function readS3ObjectBytes(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<Uint8Array | undefined> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = res.Body;
  if (body === undefined) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** Env var naming the SSM parameter that pins the authoritative manifestCid (research.md's
 *  decision: "A pinned manifest CID in SSM is the authority"). Unset in local/test runs and in
 *  any environment where `infra/lib/crm-sync-stack.ts` has not yet wired this parameter — Plan
 *  falls through to the `runs/index.json` hint, then to `input.manifestCidHint`, rather than
 *  failing, so this remains additive until that infra wiring lands. */
const MANIFEST_CID_SSM_PARAM_NAME_ENV = "MANIFEST_CID_SSM_PARAM_NAME";

const RUNS_INDEX_KEY = "runs/index.json";

/**
 * T049 (Phase 6 convergence, HIGH): resolves the authoritative manifestCid per research.md's
 * decision and contracts/sync-pipeline.md's Plan input comment — "SSM-pinned, or a verified
 * `runs/index.json` hint" — instead of trusting `input.manifestCidHint` outright. Tries the
 * SSM-pinned parameter first (if configured), then a verified `runs/index.json` hint in this
 * run's own S3 bucket (Zod-validated against the vendored `RunsIndexV1` schema, ADR-07; "verified"
 * here means schema-valid, since this is the CRM's own bucket, not a byte-for-byte CID check like
 * the manifest's own bytes get). Returns `undefined`, never throws, when neither source is
 * configured/reachable — `planCore` then falls back to `input.manifestCidHint` so an environment
 * with neither SSM nor a published runs/index.json yet (today's deploy, and every unit test) keeps
 * working exactly as before this fix.
 */
async function resolveAuthoritativeManifestCid(
  bucket: string,
  obs: Observability,
): Promise<string | undefined> {
  const ssmParamName = process.env[MANIFEST_CID_SSM_PARAM_NAME_ENV];
  if (ssmParamName !== undefined && ssmParamName !== "") {
    try {
      const ssm = new SSMClient({});
      const result = await ssm.send(new GetParameterCommand({ Name: ssmParamName }));
      const value = result.Parameter?.Value;
      if (value !== undefined && value !== "" && isCidV1(value)) {
        return value;
      }
      obs.logger.warn("Plan: SSM manifest CID parameter did not hold a valid CIDv1 value", {
        ssmParamName,
      });
    } catch (error) {
      obs.logger.warn("Plan: SSM manifest CID parameter unreadable, falling back", {
        ssmParamName,
        error,
      });
    }
  }

  try {
    const s3 = new S3Client({});
    const bytes = await readS3ObjectBytes(s3, bucket, RUNS_INDEX_KEY);
    if (bytes !== undefined) {
      const parsed = RunsIndexV1.parse(JSON.parse(new TextDecoder().decode(bytes)));
      const latest = parsed.runs.at(-1);
      if (latest !== undefined) return latest.manifestCid;
    }
  } catch (error) {
    obs.logger.info("Plan: no verified runs/index.json hint available, falling back", { error });
  }

  return undefined;
}

const META_INDEX_KEY = { pk: "META#index", sk: "META" } as const;

/**
 * True only when `META#index.current` (Promote's pointer item in crm-leads) is exactly this
 * manifestCid. Any other outcome — no table configured (local runs), no pointer yet (first run),
 * a different CID, or an unreadable pointer — returns false and the run proceeds; Promote's own
 * conditional write remains the guard against a duplicate flip.
 */
async function isAlreadyPromoted(manifestCid: string, obs: Observability): Promise<boolean> {
  const tableName = process.env.CRM_LEADS_TABLE_NAME;
  if (tableName === undefined || tableName === "") return false;
  try {
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    const result = await ddb.send(new GetCommand({ TableName: tableName, Key: META_INDEX_KEY }));
    return result.Item?.current === manifestCid;
  } catch (error) {
    obs.logger.warn("Plan: META#index unreadable, continuing without the already-promoted check", {
      error,
    });
    return false;
  }
}

async function fetchManifestBytes(cid: string): Promise<Uint8Array> {
  let lastError: unknown;
  for (const url of manifestGatewayUrls(cid)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Plan: every gateway failed for manifest ${cid}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function planCore(
  input: PlanInput,
  obs: Observability,
): Promise<PlanResult | PlanHeld | PlanAlreadyPromoted> {
  const bucket = process.env.CRM_INDEX_BUCKET_NAME;
  if (bucket === undefined || bucket === "") {
    throw new Error("Plan: CRM_INDEX_BUCKET_NAME is not set");
  }

  // T049: the authoritative source (SSM-pinned parameter, or a verified runs/index.json hint)
  // takes priority over the input hint — the hint is only ever the fallback when neither
  // authoritative source is configured/reachable, never trusted outright on its own.
  const authoritativeManifestCid = await resolveAuthoritativeManifestCid(bucket, obs);
  const manifestCid = authoritativeManifestCid ?? input.manifestCidHint;
  if (manifestCid === undefined || manifestCid === "") {
    throw new Error(
      "Plan: no authoritative manifestCid resolved (no SSM-pinned parameter, no runs/index.json " +
        "hint) and no manifestCidHint given",
    );
  }
  if (
    authoritativeManifestCid !== undefined &&
    input.manifestCidHint !== undefined &&
    input.manifestCidHint !== "" &&
    input.manifestCidHint !== authoritativeManifestCid
  ) {
    obs.logger.warn(
      "Plan: input manifestCidHint disagrees with the authoritative source (SSM/runs-index) — " +
        "using the authoritative CID; the hint is advisory only",
      { manifestCidHint: input.manifestCidHint, authoritativeManifestCid },
    );
  }

  if (input.forceRebuild !== true && (await isAlreadyPromoted(manifestCid, obs))) {
    obs.logger.info("Plan: no-op, this manifestCid is already the promoted index", {
      manifestCid,
    });
    return { status: "AlreadyPromoted", manifestCid };
  }

  const manifestBytes = await fetchManifestBytes(manifestCid);

  // T047: verify the manifest's own bytes against the CID they were fetched by, before parsing
  // or trusting anything in them — only the manifest's *parts* were verified downstream before
  // this fix (FetchPart's sha256 check), never the manifest itself. Holds, never throws
  // uncaught, on a mismatch (constitution P0-2/§8: "stop on a CID or sha256 mismatch ... no
  // bypass of a failed verification"). Reuses the existing `digest_mismatch` heldReason
  // (packages/index-schema's `IndexMetaHeldReason` enum) rather than adding a new one: both this
  // check and the profile-digest guard below are "a computed digest did not match the one this
  // byte source was supposed to produce," just checked against a different source of truth.
  if (!manifestBytesVerifyAgainstCid(manifestCid, manifestBytes)) {
    obs.logger.warn("Plan: held, fetched manifest bytes do not verify against their own CID", {
      manifestCid,
    });
    return { status: "Held", heldReason: "digest_mismatch", manifestCid };
  }

  const manifest = RunManifestV1.parse(JSON.parse(new TextDecoder().decode(manifestBytes)));

  const rulesProfile = manifest.profiles.find((p) => p.name === PROFILE.name);
  const placesProfile = manifest.profiles.find((p) => p.name === PLACES_PROFILE_NAME);

  // Mirrors vendored query-core's bindManifest (1ef8bff): a run that never captured places carries
  // no travis-places profile and binds with an empty ZCTA table; a *present* places profile whose
  // digest disagrees with the in-repo gazetteer is still a mismatch.
  const digestMismatch =
    input.__testForceDigestMismatch === true ||
    rulesProfile === undefined ||
    rulesProfile.sha256 !== PROFILE.sha256 ||
    rulesProfile.version !== PROFILE.version ||
    (placesProfile !== undefined && placesProfile.sha256 !== gazetteer.GAZETTEER.sha256);

  if (digestMismatch) {
    obs.logger.warn("Plan: held, profile digest mismatch against the vendored copy", {
      manifestCid,
    });
    return { status: "Held", heldReason: "digest_mismatch", manifestCid };
  }

  // CR-B-02 finding #3: this was a second, diverging implementation of the cost gate (its own
  // USD_PER_BYTE constant, ~6x stricter than costGate.ts's) — costGate.ts's
  // estimateCostFromManifest/evaluateCostGate is now the one place this math lives; Plan just
  // calls it, same as it calls the digest guard above.
  // B-09 (query-core 502bfe6): only the table parts the two views BuildIndex reads are fetched —
  // the same selection bindManifest makes, so FetchPart, this cost gate and BuildIndex all work
  // from this one list (Run 1: 124 of 204 parts, ~322 of ~556 MB). Each part keeps the CID and
  // SHA-256 from the CID-verified manifest above.
  const boundNames = new Set(boundPartNames(manifest.artifacts, BUILD_INDEX_VIEWS));
  const fetchedArtifacts = manifest.artifacts.filter(
    (artifact) => artifact.kind === PART_KIND && boundNames.has(artifact.name),
  );
  const { predictedSpendUsd, predictedDocCount, predictedBytes } = estimateCostFromManifest({
    artifacts: fetchedArtifacts,
    coverage: manifest.coverage,
  });
  const costGateResult = evaluateCostGate({ predictedSpendUsd, predictedDocCount, predictedBytes });

  if (costGateResult.held) {
    obs.logger.warn("Plan: held, predicted cost exceeds the cost gate", {
      manifestCid,
      predictedSpendUsd,
      predictedDocCount,
      predictedBytes,
    });
    return { status: "Held", heldReason: costGateResult.heldReason, manifestCid };
  }

  const manifestKey = contentAddressedKey(manifestCid, "manifest.json");
  // Content-addressed, If-None-Match write — same idempotency boundary as FetchPart's own parts
  // (AC-4/FR-004): a re-run against an already-indexed manifestCid writes this key once, not
  // twice (apps/sync/src/s3PartWriter.ts's PreconditionFailed → written:false, never thrown).
  const { createS3PartWriter } = await import("../src/s3PartWriter.js");
  await createS3PartWriter(bucket).putIfAbsent(manifestKey, manifestBytes);

  const parts: PlanPart[] = fetchedArtifacts.map((artifact) => ({
    name: artifact.name,
    path: artifact.name,
    cid: artifact.cid,
    sha256: artifact.sha256,
  }));

  return {
    manifestCid,
    bucket,
    manifestKey,
    parts,
    profiles: manifest.profiles.map((p) => ({
      name: p.name,
      version: p.version,
      sha256: p.sha256,
    })),
    costEstimate: { predictedSpendUsd, predictedDocCount, predictedBytes },
    startedAt: new Date().toISOString(),
    coverageParcelsPublished: manifest.coverage.parcels_published?.count ?? null,
    coveragePermitsEmitted: manifest.coverage.permits_emitted?.count ?? null,
    finishedAt: manifest.finishedAt,
  };
}

export const planHandler = withObservability("Plan", planCore);
