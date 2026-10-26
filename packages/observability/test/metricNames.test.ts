// B-09 review fix (porygon Critical + Minor): the dashboard/alarm read side (infra/lib/
// crm-ops-stack.ts) and the golden harness publisher (tests/agent/publishGoldenQueryPassRate.ts)
// import their namespace, metric names and dimension set from `@crm/observability/metric-names`.
// These tests pin (1) that module stays dependency-free, so the CDK app can import it without
// pulling Powertools in, and (2) the exact EMF dimension set an `agent.ask` flush really carries,
// so the read side's `{RoofingCrm,service,outcome}` dimension set is proven against real emission,
// not assumed.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createObservability, METRIC_NAMES as INDEX_METRIC_NAMES } from "../src/index.js";
import {
  AGENT_CITING_OUTCOMES,
  AGENT_METRIC_DIMENSIONS,
  API_SERVICE_NAME,
  METRIC_NAMES,
  METRICS_NAMESPACE,
} from "../src/metricNames.js";

describe("metric-names module", () => {
  it("imports nothing (safe to load from the CDK app without Powertools)", () => {
    const source = readFileSync(new URL("../src/metricNames.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("is what the package root re-exports (one definition, not two)", () => {
    expect(INDEX_METRIC_NAMES).toBe(METRIC_NAMES);
  });

  it("names GoldenQueryPassRate as a constant like every other metric", () => {
    expect(METRIC_NAMES.GoldenQueryPassRate).toBe("GoldenQueryPassRate");
    expect(METRICS_NAMESPACE).toBe("RoofingCrm");
  });

  it("lists only real AgentAnswer outcomes as the ones that can carry citations", () => {
    expect([...AGENT_CITING_OUTCOMES]).toEqual(["answered", "empty_in_scope"]);
  });
});

describe("agent metric EMF shape (what the RoofingCrm dashboard must read)", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("flushes agent metrics under exactly the [service, outcome] dimension set", () => {
    // Same sequence apps/api/src/routers/agent.ts runs per `agent.ask`: citation metrics are
    // stored first (composeAnswer.ts), the outcome dimension is added after, then one flush.
    const obs = createObservability(API_SERVICE_NAME);
    obs.metrics.addMetric(METRIC_NAMES.AgentCitationsTotal, "Count", 2);
    obs.metrics.addMetric(METRIC_NAMES.AgentCitationsVerified, "Count", 2);
    obs.metrics.addDimension("outcome", "answered");
    obs.metrics.addMetric(METRIC_NAMES.AgentAsksTotal, "Count", 1);
    obs.metrics.addMetric(METRIC_NAMES.AgentAnswerLatencyMs, "Milliseconds", 1200);
    obs.metrics.publishStoredMetrics();

    const emf = stdoutSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .map((line: string): Record<string, unknown> | undefined => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return undefined;
        }
      })
      .find(
        (parsed: Record<string, unknown> | undefined) => parsed !== undefined && "_aws" in parsed,
      ) as
      | {
          _aws: {
            CloudWatchMetrics: {
              Namespace: string;
              Dimensions: string[][];
              Metrics: { Name: string }[];
            }[];
          };
          service: string;
          outcome: string;
        }
      | undefined;

    expect(emf).toBeDefined();
    const [directive] = emf?._aws.CloudWatchMetrics ?? [];
    expect(directive?.Namespace).toBe(METRICS_NAMESPACE);
    expect(directive?.Dimensions).toEqual([[...AGENT_METRIC_DIMENSIONS]]);
    expect(directive?.Metrics.map((m) => m.Name)).toEqual(
      expect.arrayContaining([
        METRIC_NAMES.AgentCitationsTotal,
        METRIC_NAMES.AgentCitationsVerified,
        METRIC_NAMES.AgentAsksTotal,
        METRIC_NAMES.AgentAnswerLatencyMs,
      ]),
    );
    expect(emf?.service).toBe(API_SERVICE_NAME);
    expect(emf?.outcome).toBe("answered");
  });
});
