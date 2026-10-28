import { buildConcurrencyPolicy } from "./concurrency";
import { loadConcurrencyProof } from "./concurrency-file";
export async function deploymentConcurrency(
  env: Readonly<Record<string, string | undefined>>,
  protectedRoots: readonly string[],
  context: { mode?: unknown; quota?: unknown } = {},
) {
  const selected = {
    PRISM_RESERVED_CONCURRENCY: env.PRISM_RESERVED_CONCURRENCY,
    PRISM_API_RATE_PER_SECOND: env.PRISM_API_RATE_PER_SECOND,
    PRISM_API_BURST: env.PRISM_API_BURST,
    PRISM_CONCURRENCY_MODE: env.PRISM_CONCURRENCY_MODE,
    PRISM_EXISTING_ACCOUNT_CONCURRENCY: env.PRISM_EXISTING_ACCOUNT_CONCURRENCY,
    PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED:
      env.PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED,
  };
  for (const [key, value] of [
    ["PRISM_CONCURRENCY_MODE", context.mode],
    ["PRISM_EXISTING_ACCOUNT_CONCURRENCY", context.quota],
  ] as const) {
    if (value !== undefined) {
      const v = String(value);
      if (selected[key] !== undefined && selected[key] !== v)
        throw new Error("Mixed concurrency context/environment rejected");
      selected[key] = v;
    }
  }
  const policy = buildConcurrencyPolicy(selected);
  let proof: Awaited<ReturnType<typeof loadConcurrencyProof>> | undefined;
  if (policy.mode === "existing-account-shared") {
    if (!env.PRISM_ACCOUNT_CONCURRENCY_PROOF || !env.PRISM_EXPECTED_ACCOUNT_ID)
      throw new Error(
        "Approved private account concurrency proof and exact account pin required",
      );
    try {
      proof = await loadConcurrencyProof(
        env.PRISM_ACCOUNT_CONCURRENCY_PROOF,
        env.PRISM_EXPECTED_ACCOUNT_ID,
        protectedRoots,
      );
    } catch {
      throw new Error(
        "Approved private account concurrency proof unavailable or invalid",
      );
    }
  }
  return {
    policy,
    metadata: {
      ...policy,
      memoryMiB: 512,
      proofSha256: proof?.sha256 ?? "not-applicable",
      proofObservedAt: proof?.observedAt ?? null,
      taskFunctionsObserved: proof?.totalFunctionCount ?? null,
      deviation:
        policy.mode === "reserved"
          ? `Bounded per-function reserved concurrency${policy.reservedConcurrentExecutions}`
          : "Approved FreeRoute deviation: no per-function reservation; actual existing account-wide shared pool10. This is not equivalent to reserved concurrency2.",
    },
  };
}
export function deployedConcurrency(outputs: Record<string, string>) {
  const mode = outputs.ConcurrencyMode;
  if (mode !== "reserved" && mode !== "existing-account-shared")
    throw new Error("Deployed concurrency metadata missing");
  const policy = buildConcurrencyPolicy(
    mode === "reserved"
      ? {
          PRISM_RESERVED_CONCURRENCY: outputs.FunctionReservedConcurrency,
          PRISM_API_RATE_PER_SECOND: outputs.ApiRatePerSecond,
          PRISM_API_BURST: outputs.ApiBurst,
        }
      : {
          PRISM_CONCURRENCY_MODE: mode,
          PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED: "yes",
          PRISM_EXISTING_ACCOUNT_CONCURRENCY: "10",
          PRISM_API_RATE_PER_SECOND: outputs.ApiRatePerSecond,
          PRISM_API_BURST: outputs.ApiBurst,
        },
  );
  if (
    outputs.FunctionReservedConcurrency !==
      (mode === "reserved"
        ? String(policy.reservedConcurrentExecutions)
        : "none") ||
    outputs.ApiRatePerSecond !== String(policy.apiRatePerSecond) ||
    outputs.ApiBurst !== String(policy.apiBurst) ||
    outputs.ExistingAccountConcurrency !==
      (mode === "reserved" ? "not-used" : "10") ||
    outputs.FunctionMemoryMiB !== "512" ||
    (mode === "existing-account-shared" &&
      !/^[a-f0-9]{64}$/.test(outputs.ConcurrencyProofSha256 ?? ""))
  )
    throw new Error("Deployed concurrency metadata inconsistent");
  return {
    ...policy,
    memoryMiB: 512,
    proofSha256: outputs.ConcurrencyProofSha256,
    deviation:
      mode === "reserved"
        ? `Bounded per-function reserved concurrency${policy.reservedConcurrentExecutions}`
        : "Approved FreeRoute deviation: shared account pool10, no per-function reserved2 guarantee",
  };
}
/** Compare actual Lambda/API readings, never infer capacity only from stack outputs. */
export function verifyRuntimeConcurrency(
  policy: ReturnType<typeof deployedConcurrency>,
  observed: {
    reservedConcurrentExecutions?: unknown;
    memoryMiB: unknown;
    apiRatePerSecond?: unknown;
    apiBurst?: unknown;
  },
) {
  if (
    observed.reservedConcurrentExecutions !==
      (policy.reservedConcurrentExecutions === null
        ? undefined
        : policy.reservedConcurrentExecutions) ||
    observed.memoryMiB !== policy.memoryMiB ||
    observed.apiRatePerSecond !== policy.apiRatePerSecond ||
    observed.apiBurst !== policy.apiBurst
  )
    throw new Error(
      "Actual Lambda concurrency/memory or API throttle differs from deployed bounded policy",
    );
  return { actualVerified: true, ...policy };
}

/** AWS CLI emits no stdout for a successful unreserved GetFunctionConcurrency call.
 * Call only after the CLI's nonzero exit has propagated; no other AWS response uses this exception.
 */
export function parseFunctionConcurrencyOutput(stdout: string): {
  ReservedConcurrentExecutions?: number;
} {
  if (!stdout.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Invalid Lambda concurrency response");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "ReservedConcurrentExecutions")
  )
    throw new Error("Invalid Lambda concurrency response");
  const reserved = (value as { ReservedConcurrentExecutions?: unknown })
    .ReservedConcurrentExecutions;
  if (
    reserved !== undefined &&
    (!Number.isSafeInteger(reserved) ||
      typeof reserved !== "number" ||
      reserved < 0)
  )
    throw new Error("Invalid Lambda concurrency response");
  return reserved === undefined
    ? {}
    : { ReservedConcurrentExecutions: reserved as number };
}
