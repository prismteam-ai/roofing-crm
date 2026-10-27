/** P2 operation rehearsal. Live execution is deliberately outside this program and phase. */
const operation = process.argv[2];
const plans: Record<
  string,
  { intent: string; prerequisites: string[]; effect: string }
> = {
  deploy: {
    intent: "Publish built static assets and genuine CRM Lambda through CDK",
    prerequisites: [
      "Human-approved account/region/cost gate",
      "Oracle deployment exports shared session/quota table and HTTPS origin",
      "Shared review-access secret ARN reference",
      "Exact authorized Bedrock model parameters; model disabled until inference approval",
      "Passing frozen install, tests, package emulation and synthesis",
    ],
    effect: "Would create or update review resources; no deployment executed",
  },
  smoke: {
    intent:
      "Verify health, contract/snapshot, access challenge, signed session and bounded search",
    prerequisites: [
      "Approved HTTPS review domain",
      "Access code entered privately by the evaluator",
      "No inference in basic smoke",
    ],
    effect: "Plan only; no hosted endpoint contacted",
  },
  evidence: {
    intent:
      "Run Playwright against the chosen local mode and collect passing screenshots plus exact metadata",
    prerequisites: [
      "Final clean commits in both repositories",
      "Snapshot digest fixed",
      "PRISM_DATA_MODE explicit and separate evidence folder",
    ],
    effect: "Plan only; use pnpm test:browser for local execution",
  },
  "rotate-access": {
    intent: "Rotate shared review secret/key version and revoke prior sessions",
    prerequisites: [
      "Human Principal authorization",
      "Private Secrets Manager update in approved account",
      "Same secret ARN used by Oracle and CRM",
      "Never place secret material in CLI arguments or evidence",
    ],
    effect: "Plan only; no secret read or write",
  },
  destroy: {
    intent:
      "Export approved evidence and remove only authorized disposable review resources",
    prerequisites: [
      "Human Principal confirms evaluation acknowledgment and teardown",
      "Preserve immutable artifacts/evidence before destruction",
      "Review resources remain RETAIN by default",
      "Explicit stage=disposable and approvedDestroy=true synthesis review",
    ],
    effect: "Plan only; no resource deletion",
  },
};
if (
  !operation ||
  !plans[operation] ||
  process.argv.slice(3).some((x) => x !== "--dry-run")
)
  throw new Error(
    "Use deploy|smoke|evidence|rotate-access|destroy --dry-run; P2 executes no live operations",
  );
console.log(
  JSON.stringify(
    {
      operation,
      mode: "dry-run",
      ...plans[operation],
      serviceCalls: 0,
      spend: 0,
    },
    null,
    2,
  ),
);
