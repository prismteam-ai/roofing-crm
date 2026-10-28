/** Public/synthetic browser servers never inherit ambient private source, auth, model or cloud task configuration. */
export function publicCaptureEnvironment(
  inherited: Readonly<Record<string, string | undefined>>,
  mode: "real" | "synthetic",
): Record<string, string> {
  if (mode !== "real" && mode !== "synthetic")
    throw new Error(
      "Protected capture requires the separate authenticated hosted workflow",
    );
  const cleared = Object.fromEntries(
    Object.keys(inherited)
      .filter((key) => key.startsWith("PRISM_"))
      .map((key) => [key, ""]),
  );
  return {
    ...cleared,
    PRISM_DATA_MODE: mode,
    PRISM_ACCESS_MODE: "local",
    PRISM_STAGE: "local",
    PRISM_FIXTURE_RUN_DIR: "data/public-browser-fixture-runs",
    PRISM_REGION: "us-east-2",
    PRISM_DEPLOY_REGION: "us-east-2",
    PRISM_SNAPSHOT_DIR:
      mode === "real" ? (inherited.PRISM_SNAPSHOT_DIR ?? "") : "",
    PRISM_REQUIRE_AUTH: "0",
    PRISM_ENABLE_PROTECTED_VIEW: "0",
    PRISM_ENABLE_MODEL: "false",
    PRISM_ENABLE_MAP: "false",
  };
}
