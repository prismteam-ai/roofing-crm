import type { GroundedFailureDetail } from "./failure-detail";
import { createHash } from "node:crypto";
import {
  TransactWriteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { DomainError } from "../../contracts/src/index";
import {
  MICRO_MODEL,
  LITE_MODEL,
  reviewModel,
} from "../../runtime-config/src/index";
export interface CampaignReservation {
  subject: string;
  kind: "request" | "converse";
  modelId: string;
  nowMs: number;
  reservedMicroUsd?: number;
}
export interface CampaignStore {
  reserve(input: CampaignReservation): Promise<void>;
  authorize(modelId: string, revision: "base" | "repair-1"): Promise<void>;
  record(input: CampaignAudit): Promise<void>;
}
export interface CampaignAudit {
  requestId: string;
  subjectDigest: string;
  promptDigest: string;
  modelId: string;
  revision: "base" | "repair-1";
  region: "us-east-1";
  at: string;
  architecture?: "one-call-grounded-selection-v1";
  evidenceDigest?: string;
  minimizedRowCount?: number;
  callIndex: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  measuredMicroUsd?: number;
  reservedMicroUsd?: number;
  unmeasuredCalls?: number;
  converseCalls?: number;
  failureCode?: string;
  failureDetail?: GroundedFailureDetail;
  status?: "provider-failed" | "evidence-empty";
  evidence?: {
    queryHash: string[];
    snapshotId: string;
    propertyIds: string[];
    citations: string[];
  };
}
export interface QualityGate {
  baseFailureSha256: string;
  repairFailureSha256?: string;
  repairAttempts: 1;
  measuredAt: string;
}
export function qualityAllows(
  gate: QualityGate | undefined,
  modelId: string,
  revision: "base" | "repair-1",
) {
  reviewModel(modelId, modelId === LITE_MODEL);
  if (modelId === MICRO_MODEL && revision === "base") return;
  if (
    !gate ||
    gate.repairAttempts !== 1 ||
    !/^[a-f0-9]{64}$/.test(gate.baseFailureSha256) ||
    !Number.isFinite(Date.parse(gate.measuredAt))
  )
    throw new DomainError(
      "COST_LIMIT_REACHED",
      "Measured Micro quality failure is required before one prompt repair",
    );
  if (
    modelId === LITE_MODEL &&
    (!gate.repairFailureSha256 ||
      !/^[a-f0-9]{64}$/.test(gate.repairFailureSha256) ||
      revision !== "base")
  )
    throw new DomainError(
      "COST_LIMIT_REACHED",
      "Lite requires measured failure of Micro and its one prompt repair",
    );
}
export const CAMPAIGN_PHASE = "prism-assessment-p4";
export const CAMPAIGN_LIMITS = Object.freeze({
  requestsTotal: 80,
  requestsPerDay: 60,
  requestsPerSessionHour: 20,
  converseTotal: 80,
  conversePerDay: 60,
  conversePerSessionHour: 20,
  modelMicroUsd: 3000000,
});
function entries(input: CampaignReservation) {
  reviewModel(input.modelId, input.modelId === LITE_MODEL);
  if (
    !Number.isFinite(input.nowMs) ||
    !input.subject ||
    !Number.isSafeInteger(input.reservedMicroUsd ?? 0) ||
    (input.reservedMicroUsd ?? 0) < 0 ||
    (input.kind === "converse" && (input.reservedMicroUsd ?? 0) < 1)
  )
    throw new DomainError("INVALID_INPUT", "Invalid campaign reservation");
  const hour = Math.floor(input.nowMs / 3600000),
    day = new Date(input.nowMs).toISOString().slice(0, 10),
    session = createHash("sha256").update(input.subject).digest("hex");
  const all = [
    { key: `${input.kind}#total`, limit: 80, units: 1 },
    { key: `${input.kind}#day#${day}`, limit: 60, units: 1 },
    { key: `${input.kind}#session#${session}#${hour}`, limit: 20, units: 1 },
    ...(input.kind === "converse"
      ? [
          {
            key: "cost#reserved-microusd",
            limit: 3000000,
            units: input.reservedMicroUsd ?? 0,
          },
        ]
      : []),
  ];
  if (all.some((x) => x.units > x.limit))
    throw new DomainError(
      "COST_LIMIT_REACHED",
      "Campaign reservation exceeds cap",
    );
  return all;
}
export class MemoryCampaignStore implements CampaignStore {
  private counts = new Map<string, number>();
  readonly audit: CampaignAudit[] = [];
  constructor(readonly gate?: QualityGate) {}
  async authorize(modelId: string, revision: "base" | "repair-1") {
    qualityAllows(this.gate, modelId, revision);
  }
  async record(input: CampaignAudit) {
    this.audit.push(structuredClone(input));
  }
  async reserve(input: CampaignReservation) {
    const all = entries(input);
    if (all.some((x) => (this.counts.get(x.key) ?? 0) + x.units > x.limit))
      throw new DomainError(
        "COST_LIMIT_REACHED",
        "P4 campaign request, invocation or reserved-cost cap reached",
      );
    for (const x of all)
      this.counts.set(x.key, (this.counts.get(x.key) ?? 0) + x.units);
  }
}
/** Counters intentionally have no TTL: the P4 total cannot reset during redeployment or review extension. */
export class DynamoCampaignStore implements CampaignStore {
  constructor(
    private readonly client: Pick<DynamoDBDocumentClient, "send">,
    private readonly table: string,
  ) {}
  async authorize(modelId: string, revision: "base" | "repair-1") {
    if (modelId === MICRO_MODEL && revision === "base") return;
    const result = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: `campaign#${CAMPAIGN_PHASE}`, sk: "quality-gate" },
        ConsistentRead: true,
      }),
    );
    qualityAllows(result.Item as QualityGate | undefined, modelId, revision);
  }
  async record(input: CampaignAudit) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          pk: `campaign#${CAMPAIGN_PHASE}`,
          sk: `usage#${input.requestId}#${input.callIndex}`,
          ...input,
          expiresAt: Math.floor(Date.parse(input.at) / 1000) + 14 * 86400,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  }
  async reserve(input: CampaignReservation) {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: entries(input).map((x) => ({
            Update: {
              TableName: this.table,
              Key: { pk: `campaign#${CAMPAIGN_PHASE}`, sk: x.key },
              UpdateExpression: "ADD #consumed :units",
              ConditionExpression:
                "attribute_not_exists(#consumed) OR #consumed <= :ceiling",
              ExpressionAttributeNames: { "#consumed": "consumed" },
              ExpressionAttributeValues: {
                ":units": x.units,
                ":ceiling": x.limit - x.units,
              },
            },
          })),
        }),
      );
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (
        error instanceof Error &&
        error.name === "TransactionCanceledException"
      )
        throw new DomainError("COST_LIMIT_REACHED", "P4 campaign cap reached");
      throw new DomainError(
        "COST_LIMIT_REACHED",
        "Campaign allowance unavailable; no provider call permitted",
      );
    }
  }
}
export interface VerifiedPrice {
  modelId: string;
  region: "us-east-1";
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  verifiedAt: string;
  source: string;
  priceListSha256?: string;
  priceListVersion?: string;
  priceListPublicationDate?: string;
  priceSkus?: { input: string; output: string };
}
export function reserveCost(
  inputBytes: number,
  price: VerifiedPrice,
  now = Date.now(),
): number {
  if (
    !price ||
    ![MICRO_MODEL, LITE_MODEL].includes(price.modelId as typeof MICRO_MODEL) ||
    price.region !== "us-east-1" ||
    !/^https:\/\/(?:aws\.amazon\.com\/bedrock\/pricing\/?|pricing\.us-east-1\.amazonaws\.com\/offers\/v1\.0\/aws\/AmazonBedrock\/.*)$/.test(
      price.source,
    ) ||
    !Number.isFinite(Date.parse(price.verifiedAt)) ||
    now - Date.parse(price.verifiedAt) > 86400000 ||
    Date.parse(price.verifiedAt) > now ||
    ![price.inputUsdPerMillion, price.outputUsdPerMillion].every(
      (x) => Number.isFinite(x) && x > 0,
    ) ||
    inputBytes < 1 ||
    inputBytes > 12000
  )
    throw new DomainError(
      "COST_LIMIT_REACHED",
      "Current approved regional model prices are required",
    );
  return Math.ceil(
    12000 * price.inputUsdPerMillion + 1000 * price.outputUsdPerMillion,
  );
}
