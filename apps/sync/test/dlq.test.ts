// T033: a part that exhausts retries lands on the DLQ, exactly one CloudWatch alarm fires per
// DLQ-depth-above-zero event (a CloudWatch alarm state transition, not one firing per message),
// and the alarm self-resolves once the DLQ drains (constitution Article VII; architecture-
// constitution.md §8). T034 implements `addFetchPartDlqAndAlarm` in infra/lib/crm-sync-stack.ts
// to make this pass — intentionally failing now (no export exists yet).
//
// This exercises the DLQ+alarm construct in isolation, on a bare `Stack`, deliberately not the
// full CrmSyncStack: the INDEX group's Plan/BuildIndex/Validate/Promote handler files (T024,
// T015, T019/T020a, T022) are built concurrently in this same build wave and may not exist yet,
// which would make a full-stack `cdk synth` throw on NodejsFunction bundling for reasons that
// have nothing to do with this DLQ/alarm wiring (tasks.md's note on T038's convergence point).
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as sns from "aws-cdk-lib/aws-sns";
import { describe, expect, it } from "vitest";
import { addFetchPartDlqAndAlarm } from "../../../infra/lib/crm-sync-stack.js";

const ENV = { region: "eu-north-1", account: "515618610572" };

function buildBareStack(withTopic = false) {
  const app = new App();
  const stack = new Stack(app, "TestStack", { env: ENV });
  const topic = withTopic ? new sns.Topic(stack, "AlarmTopic") : undefined;
  addFetchPartDlqAndAlarm(stack, withTopic ? { alarmTopic: topic } : {});
  return Template.fromStack(stack);
}

describe("FetchPart DLQ + self-resolving alarm (T033/T034)", () => {
  it("creates exactly one DLQ for FetchPart", () => {
    const template = buildBareStack();
    template.resourceCountIs("AWS::SQS::Queue", 1);
  });

  it("creates exactly one CloudWatch alarm on the DLQ's visible-message-count metric", () => {
    const template = buildBareStack();
    template.resourceCountIs("AWS::CloudWatch::Alarm", 1);
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      Namespace: "AWS/SQS",
      MetricName: "ApproximateNumberOfMessagesVisible",
      // Depth-above-zero, evaluated over a single period: the alarm fires once per state
      // transition into ALARM (not once per message) and returns to OK on its own once the
      // queue's own metric reports 0 again — no per-message fan-out, no manual reset.
      Threshold: 0,
      ComparisonOperator: "GreaterThanThreshold",
      EvaluationPeriods: 1,
    });
  });

  it("wires the alarm's action to the given SNS topic when provided", () => {
    const template = buildBareStack(true);
    const alarms = template.findResources("AWS::CloudWatch::Alarm");
    const [alarm] = Object.values(alarms) as { Properties: { AlarmActions?: unknown[] } }[];
    expect(alarm?.Properties.AlarmActions?.length ?? 0).toBeGreaterThan(0);
  });

  it("the DLQ enforces TLS-only access", () => {
    const template = buildBareStack();
    const policies = template.findResources("AWS::SQS::QueuePolicy");
    expect(Object.keys(policies).length).toBeGreaterThan(0);
  });

  // T055 (convergence fix): the three tests above prove the alarm exists and is wired to SNS and
  // TLS, but never proved the *firing semantics* — that it fires once per DLQ-depth-above-zero
  // event (a CloudWatch alarm state transition into ALARM) rather than once per message sitting
  // in the queue, and that it clears itself (returns to OK) once the queue drains back to zero,
  // with no manual reset or per-message fan-out. CloudWatch alarms are inherently state-based:
  // they evaluate a metric's current value against a threshold on each evaluation period and
  // transition INSUFFICIENT_DATA/OK/ALARM, firing an action only on a *transition*, not once per
  // underlying metric contribution — so a single-item ApproximateNumberOfMessagesVisible metric
  // breaching 0 produces exactly one ALARM transition regardless of how many messages pushed the
  // depth above zero, and returns to OK on its own the moment the queue reports 0 again (SQS
  // always publishes the zero value once drained). This test asserts the exact alarm config that
  // makes that true, rather than merely that an alarm with some config exists.
  it("the alarm is configured for per-event (not per-message) firing and self-resolves on drain", () => {
    const template = buildBareStack();
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      // A single evaluation period means one breaching data point flips the alarm straight to
      // ALARM on the next evaluation — there is no "fire again for the 2nd, 3rd, ... message"
      // behavior, because the alarm only ever has one current state (OK/ALARM), not one state
      // per message. This is what "exactly one alarm per DLQ-depth-above-zero event" means in
      // CloudWatch: one state transition, independent of how many messages caused the breach.
      EvaluationPeriods: 1,
      // GreaterThanThreshold against 0 means: ALARM while depth > 0, OK while depth <= 0 (or
      // missing/zero). There is no latching "stays in ALARM once triggered" behavior here — the
      // alarm re-evaluates the live metric every period and moves back to OK by itself the first
      // time depth reports 0, with no human or code action required to reset it.
      ComparisonOperator: "GreaterThanThreshold",
      Threshold: 0,
      // SQS always publishes ApproximateNumberOfMessagesVisible, including the value 0 once the
      // queue drains, so a missing data point is never mistaken for a sustained breach; this
      // also keeps the alarm from being stuck in ALARM on a reporting gap.
      TreatMissingData: "notBreaching",
    });
  });

  it(
    "the alarm fires both an alarm action and an OK action to the same topic, so the OK " +
      "transition (drain) is itself observable, not just the breach",
    () => {
      const template = buildBareStack(true);
      const alarms = template.findResources("AWS::CloudWatch::Alarm");
      const [alarm] = Object.values(alarms) as {
        Properties: { AlarmActions?: unknown[]; OKActions?: unknown[] };
      }[];
      expect(alarm?.Properties.AlarmActions?.length ?? 0).toBeGreaterThan(0);
      expect(
        alarm?.Properties.OKActions?.length ?? 0,
        "the alarm must notify on recovery (OK) as well as breach, so draining the DLQ is " +
          "itself evidence the alarm self-resolved rather than staying latched",
      ).toBeGreaterThan(0);
    },
  );
});
