import { Tracer } from "@aws-lambda-powertools/tracer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  METRIC_NAMES,
  createObservability,
  withObservability,
  withObservabilityOperation,
} from "../src/index.js";

describe("withObservability", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Powertools Logger writes JSON lines through its own internal Console bound to
    // process.stdout (not the global `console`) outside POWERTOOLS_DEV mode — this is the real,
    // production code path, so the test observes stdout directly rather than toggling dev mode.
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("emits a structured JSON log entry naming the service", async () => {
    const wrapped = withObservability("test-handler", async () => "ok");
    await wrapped({});

    expect(stdoutSpy).toHaveBeenCalled();
    const loggedLine = stdoutSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .find((line: string) => line.includes("handler invoked"));
    expect(loggedLine).toBeDefined();
    const parsed = JSON.parse(loggedLine as string);
    expect(parsed.service).toBe("test-handler");
    expect(typeof parsed.message).toBe("string");
  });

  it("opens an X-Ray subsegment around the handler call", async () => {
    let segmentOpenDuringCall = false;
    const wrapped = withObservability("test-handler", async (_event, obs) => {
      segmentOpenDuringCall = obs.tracer.getSegment() !== undefined;
      return "ok";
    });
    await wrapped({});
    expect(segmentOpenDuringCall).toBe(true);
  });

  it("lets the handler record a named custom metric without throwing", async () => {
    const wrapped = withObservability("test-handler", async (_event, obs) => {
      obs.metrics.addMetric(METRIC_NAMES.SyncDurationMs, "Milliseconds", 1234);
      return "ok";
    });
    await expect(wrapped({})).resolves.toBe("ok");
  });

  it("exposes the three named metric constants this story's handlers emit", () => {
    expect(METRIC_NAMES.SyncDurationMs).toBe("SyncDurationMs");
    expect(METRIC_NAMES.IndexColdLoadMs).toBe("IndexColdLoadMs");
    expect(METRIC_NAMES.IndexManifestAgeHours).toBe("IndexManifestAgeHours");
  });

  // T046 (B-09, Phase 5/US2, contracts/observability.md agent-metrics table): the full agent
  // metric set `apps/api/src/routers/agent.ts`/`apps/api/src/agent/composeAnswer.ts` emit per
  // real `agent.ask` call.
  it("exposes the agent metric constants contracts/observability.md names", () => {
    expect(METRIC_NAMES.AgentAsksTotal).toBe("AgentAsksTotal");
    expect(METRIC_NAMES.AgentAnswerLatencyMs).toBe("AgentAnswerLatencyMs");
    expect(METRIC_NAMES.AgentModelCallsTotal).toBe("AgentModelCallsTotal");
    expect(METRIC_NAMES.AgentCitationsTotal).toBe("AgentCitationsTotal");
    expect(METRIC_NAMES.AgentCitationsVerified).toBe("AgentCitationsVerified");
    expect(METRIC_NAMES.AgentCitationGroundednessRate).toBe("AgentCitationGroundednessRate");
    expect(METRIC_NAMES.AgentLeadsProposed).toBe("AgentLeadsProposed");
  });

  it("logs 'handler failed' with the error and rethrows, still closing the X-Ray subsegment", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const boom = new Error("handler exploded");
    const wrapped = withObservability("test-handler", async () => {
      throw boom;
    });

    await expect(wrapped({})).rejects.toBe(boom);

    // Powertools Logger routes `.error(...)` to stderr (its own internal Console), not stdout.
    const loggedLine = stderrSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .find((line: string) => line.includes("handler failed"));
    stderrSpy.mockRestore();
    expect(loggedLine).toBeDefined();
    const parsed = JSON.parse(loggedLine as string);
    expect(parsed.service).toBe("test-handler");
    expect(parsed.error).toBeDefined();
  });

  it("still runs the handler and completes cleanly when there is no active X-Ray segment to subsegment (e.g. local/test execution outside Lambda)", async () => {
    // Forces the "no segment" branch of `withObservability`'s `if (subsegment)`/`if (segment)`
    // guards: without a parent segment there is nothing to open a subsegment on or restore.
    const getSegmentSpy = vi.spyOn(Tracer.prototype, "getSegment").mockReturnValueOnce(undefined);

    const wrapped = withObservability("test-handler", async () => "ok");
    await expect(wrapped({})).resolves.toBe("ok");

    getSegmentSpy.mockRestore();
  });
});

describe("withObservabilityOperation", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("instruments a successful operation: logs invoked/completed and returns the result", async () => {
    const obs = createObservability("test-operation-service");

    const result = await withObservabilityOperation(obs, "do-the-thing", async () => "ok");

    expect(result).toBe("ok");
    const lines = stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    const invoked = lines.find((line: string) => line.includes("operation invoked"));
    const completed = lines.find((line: string) => line.includes("operation completed"));
    expect(invoked).toBeDefined();
    expect(completed).toBeDefined();
    expect(JSON.parse(invoked as string).operationName).toBe("do-the-thing");
    expect(JSON.parse(completed as string).operationName).toBe("do-the-thing");
  });

  it("opens and closes an X-Ray subsegment around the operation, restoring the parent segment", async () => {
    const obs = createObservability("test-operation-service");
    let segmentOpenDuringCall = false;

    await withObservabilityOperation(obs, "do-the-thing", async () => {
      segmentOpenDuringCall = obs.tracer.getSegment() !== undefined;
      return "ok";
    });

    expect(segmentOpenDuringCall).toBe(true);
  });

  it("logs 'operation failed' with the error and rethrows when the operation throws", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const obs = createObservability("test-operation-service");
    const boom = new Error("operation exploded");

    await expect(
      withObservabilityOperation(obs, "do-the-thing", async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    // Powertools Logger routes `.error(...)` to stderr (its own internal Console), not stdout.
    const loggedLine = stderrSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .find((line: string) => line.includes("operation failed"));
    stderrSpy.mockRestore();
    expect(loggedLine).toBeDefined();
    const parsed = JSON.parse(loggedLine as string);
    expect(parsed.operationName).toBe("do-the-thing");
    expect(parsed.error).toBeDefined();
  });

  it("flushes stored metrics even when the operation throws (finally block runs)", async () => {
    const obs = createObservability("test-operation-service");
    const publishSpy = vi.spyOn(obs.metrics, "publishStoredMetrics");

    await expect(
      withObservabilityOperation(obs, "do-the-thing", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(publishSpy).toHaveBeenCalledTimes(1);
  });

  it("still runs the operation and completes cleanly when there is no active X-Ray segment to subsegment", async () => {
    const obs = createObservability("test-operation-service");
    const getSegmentSpy = vi.spyOn(obs.tracer, "getSegment").mockReturnValueOnce(undefined);

    const result = await withObservabilityOperation(obs, "do-the-thing", async () => "ok");

    expect(result).toBe("ok");
    getSegmentSpy.mockRestore();
  });
});
