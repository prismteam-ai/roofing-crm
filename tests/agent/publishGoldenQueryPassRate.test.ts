// B-09 review fix (porygon Minor): the publisher uses the shared metric-name constants the
// dashboard reads (no repeated literal), and golden.test.ts calls it at the end of every real
// run — only when the run itself can happen (RUNTIME_URL etc.) and AWS credentials are present.
// No AWS call is made here: the CloudWatch client is a stub.
import { describe, expect, it } from "vitest";
import { METRIC_NAMES, METRICS_NAMESPACE } from "@crm/observability/metric-names";
import {
  goldenQueryPassRatePercent,
  publishGoldenQueryPassRate,
  shouldPublishGoldenQueryPassRate,
} from "./publishGoldenQueryPassRate.js";

describe("publishGoldenQueryPassRate", () => {
  it("puts one Percent datapoint named by the shared constants (what the dashboard reads)", async () => {
    const sent: unknown[] = [];
    await publishGoldenQueryPassRate({
      passedCount: 18,
      totalCount: 21,
      client: {
        send: async (command: unknown) => {
          sent.push(command);
          return {} as never;
        },
      } as never,
    });
    expect(sent).toHaveLength(1);
    const input = (sent[0] as { input: { Namespace: string; MetricData: unknown[] } }).input;
    expect(input.Namespace).toBe(METRICS_NAMESPACE);
    expect(input.MetricData).toEqual([
      expect.objectContaining({
        MetricName: METRIC_NAMES.GoldenQueryPassRate,
        Unit: "Percent",
        Value: (18 / 21) * 100,
      }),
    ]);
  });

  it("refuses a run with nothing attempted rather than publishing a fake 0% or 100%", () => {
    expect(() => goldenQueryPassRatePercent(0, 0)).toThrow(/totalCount/);
  });
});

describe("shouldPublishGoldenQueryPassRate (the skip guard)", () => {
  it("publishes when the harness ran for real and AWS credentials are present", () => {
    for (const creds of [
      { AWS_ACCESS_KEY_ID: "AKIA-test", AWS_SECRET_ACCESS_KEY: "x" },
      { AWS_PROFILE: "assess" },
      { AWS_WEB_IDENTITY_TOKEN_FILE: "/var/run/token" },
      { AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://169.254.170.23/v1/credentials" },
    ]) {
      expect(shouldPublishGoldenQueryPassRate({ harnessRan: true, env: creds })).toBe(true);
    }
  });

  it("never publishes when the harness did not run (no RUNTIME_URL), even with credentials", () => {
    expect(
      shouldPublishGoldenQueryPassRate({ harnessRan: false, env: { AWS_PROFILE: "assess" } }),
    ).toBe(false);
  });

  it("skips quietly when no AWS credentials are configured", () => {
    expect(shouldPublishGoldenQueryPassRate({ harnessRan: true, env: {} })).toBe(false);
  });

  it("honours an explicit opt-out", () => {
    expect(
      shouldPublishGoldenQueryPassRate({
        harnessRan: true,
        env: { AWS_PROFILE: "assess", CRM_PUBLISH_GOLDEN_METRIC: "false" },
      }),
    ).toBe(false);
  });
});
