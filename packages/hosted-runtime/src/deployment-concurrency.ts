import { buildConcurrencyPolicy } from "./concurrency";
import { loadConcurrencyProof } from "./concurrency-file";
export async function deploymentConcurrency(
  env: Readonly<Record<string, string | undefined>>,
  protectedRoots: readonly string[],
  context: { mode?: unknown; quota?: unknown } = {},
) {
  const selected = {
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
          ? "Original per-function reserved concurrency2"
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
      ? {}
      : {
          PRISM_CONCURRENCY_MODE: mode,
          PRISM_SHARED_ACCOUNT_CONCURRENCY_APPROVED: "yes",
          PRISM_EXISTING_ACCOUNT_CONCURRENCY: "10",
        },
  );
  if (
    outputs.FunctionReservedConcurrency !==
      (mode === "reserved" ? "2" : "none") ||
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
        ? "Original per-function reserved concurrency2"
        : "Approved FreeRoute deviation: shared account pool10, no per-function reserved2 guarantee",
  };
}
