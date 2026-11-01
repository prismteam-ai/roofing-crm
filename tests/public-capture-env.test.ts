import { expect, it } from "vitest";
import { publicCaptureEnvironment } from "../packages/test-support/src/public-capture-env";
it("public browser servers receive no inherited private source lanes, digests, auth or model enablement", () => {
  const privateNames = [
    "PRISM_OWNER_DERIVATIVES",
    "PRISM_OWNER_DERIVATIVES_SHA256",
    "PRISM_PRIVATE_ENRICHMENT",
    "PRISM_PRIVATE_ENRICHMENT_SHA256",
    "PRISM_PERMITSTACK_SOURCE_OBSERVATIONS",
    "PRISM_PERMITSTACK_SOURCE_OBSERVATIONS_SHA256",
    "PRISM_PRIVATE_PROVIDER_OBSERVATIONS",
    "PRISM_PRIVATE_PROVIDER_OBSERVATIONS_SHA256",
    "PRISM_PRIVATE_TRANSFER_OBSERVATIONS",
    "PRISM_PRIVATE_TRANSFER_OBSERVATIONS_SHA256",
    "PRISM_PRIVATE_SOURCE_RUNS",
    "PRISM_PRIVATE_SOURCE_RUNS_SHA256",
    "PRISM_PRIVATE_FULL_SOURCES",
    "PRISM_PRIVATE_OPERATIONAL_DIR",
    "PRISM_PRIVATE_SOURCE_RUN_EVIDENCE",
    "PRISM_ENABLE_FULL_SOURCE_VIEW",
    "PRISM_FUTURE_PRIVATE_LANE",
    "PRISM_SIGNING_KEY",
    "PRISM_CLOUD_EXECUTION_APPROVED",
    "PRISM_LIVE_INFERENCE_APPROVED",
  ];
  const input = {
    ...Object.fromEntries(
      privateNames.map((name) => [name, "synthetic-private-value"]),
    ),
    PRISM_REQUIRE_AUTH: "1",
    PRISM_STAGE: "review",
    PRISM_REGION: "us-east-1",
    PRISM_FIXTURE_RUN_DIR: "/synthetic-private-work-output",
    PRISM_ENABLE_PROTECTED_VIEW: "1",
    PRISM_ENABLE_MODEL: "true",
    PRISM_ENABLE_MAP: "true",
    PRISM_SNAPSHOT_DIR: "/synthetic-explicit-public-snapshot",
    PATH: "/system-path",
  };
  const output = publicCaptureEnvironment(input, "real");
  for (const name of privateNames) expect(output[name], name).toBe("");
  expect(output).toMatchObject({
    PRISM_REQUIRE_AUTH: "0",
    PRISM_ENABLE_PROTECTED_VIEW: "0",
    PRISM_ENABLE_MODEL: "false",
    PRISM_ENABLE_MAP: "false",
    PRISM_ACCESS_MODE: "local",
    PRISM_STAGE: "local",
    PRISM_REGION: "us-east-2",
    PRISM_FIXTURE_RUN_DIR: "data/public-browser-fixture-runs",
    PRISM_DATA_MODE: "real",
    PRISM_SNAPSHOT_DIR: input.PRISM_SNAPSHOT_DIR,
  });
  expect(output).not.toHaveProperty("PATH");
  expect(input.PRISM_REQUIRE_AUTH).toBe("1");
  expect(publicCaptureEnvironment(input, "synthetic").PRISM_SNAPSHOT_DIR).toBe(
    "",
  );
});

it("protected browser capture cannot opt in through the public environment helper", () => {
  expect(() =>
    publicCaptureEnvironment({}, "protected-real" as "real"),
  ).toThrow("authenticated hosted workflow");
});
