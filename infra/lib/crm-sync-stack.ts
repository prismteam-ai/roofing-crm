// T038: the crm-sync Step Functions state machine (Plan → FetchPart(Map) → BuildIndex → Validate
// → Promote, architecture-constitution.md §2.3) and its five Lambda handlers. No longer
// "intentionally empty" (B-01 T005) — infra/test/crm-sync-stack.test.ts and
// infra/test/iam-deny.test.ts (T009, T037).
//
// This is the one hard INDEX/SYNC convergence point (tasks.md's Dependencies section): it wires
// Plan/BuildIndex/Validate/Promote (espeon's handlers, built concurrently in this same build
// wave) by file path, alongside FetchPart and the DLQ/alarm this file also owns (machamp). If
// espeon's handler files don't exist yet when this stack is synthesized, `NodejsFunction`'s
// esbuild bundling throws — that is expected mid-build-wave (Phase 5's integration check runs
// after both groups finish), not a defect in this file.
import { Duration, RemovalPolicy, Size, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as cr from "aws-cdk-lib/custom-resources";
import type { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { taskADenyStatement } from "./task-a-deny.js";

export interface CrmSyncStackProps extends StackProps {
  /** Path to apps/sync/handlers/plan.ts (espeon, T024). */
  readonly planHandlerEntry: string;
  /** Path to apps/sync/handlers/fetchPart.ts (machamp, T030). */
  readonly fetchPartHandlerEntry: string;
  /** Path to apps/sync/handlers/buildIndex.ts (espeon, T015/T017). */
  readonly buildIndexHandlerEntry: string;
  /** Path to apps/sync/handlers/validate.ts (espeon, T019/T020a). */
  readonly validateHandlerEntry: string;
  /** Path to apps/sync/handlers/promote.ts (espeon, T022). */
  readonly promoteHandlerEntry: string;
  /** The private S3 bucket this story's CrmData stack creates (crm-data-stack.ts) — imported by
   * name, not a typed cross-stack bucket reference, so this stack (and its tests) can exercise
   * it without needing CrmData's construct tree, matching the pre-written
   * infra/test/crm-sync-stack.test.ts fixture shape. */
  readonly indexBucketName: string;
  /** The existing `crm-leads` DynamoDB table (B-07 creates it) — reused for the `META#index`
   * pointer item (architecture-constitution.md §9: "no new table"). Imported by name; this stack
   * never creates a DynamoDB table. */
  readonly leadsTableName: string;
  /** Config value (ARD-B §13's accepted SNS-instead-of-PagerDuty deviation): an optional email
   * subscriber for the FetchPart DLQ alarm. No subscription is created when omitted. */
  readonly alarmEmail?: string;
  /** `DATA_MANIFEST_CID` from `@crm/config` (already CIDv1-validated there): the Task A run
   *  manifest this deployment serves. B-09 auto-sync: it is pinned in an SSM parameter Plan treats
   *  as authoritative, and a change to it starts one crm-sync execution during the deploy. */
  readonly dataManifestCid: string;
  /** `CrmAppConfig.deployNonce` (infra/src/config.ts): changes every deploy, so the deploy-time
   *  StartExecution below gets a new name and new custom-resource properties each time — every
   *  deploy re-attempts the sync of `dataManifestCid`. */
  readonly deployNonce: string;
  /** Task A's CloudFront host (cdk context `crm:taskACloudFrontBaseUrl`): ADR-02's first gateway. */
  readonly taskACloudFrontBaseUrl: string;
}

/** Step Functions execution names: 1–80 chars of [A-Za-z0-9_-]. */
const EXECUTION_NAME_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** `{manifestCid}-{deployNonce}`: still traceable to the run it syncs, and never a name an
 *  earlier deploy used (Standard execution names can't be reused for 90 days). */
export function deploySyncExecutionName(manifestCid: string, deployNonce: string): string {
  const name = `${manifestCid}-${deployNonce}`;
  if (!EXECUTION_NAME_PATTERN.test(name)) {
    throw new Error(
      `CrmSync: "${name}" is not a valid Step Functions execution name (1-80 chars of [A-Za-z0-9_-])`,
    );
  }
  return name;
}

interface HandlerSizing {
  readonly memoryMb: number;
  readonly timeout: Duration;
  /** Lambda /tmp size; omitted = Lambda's 512 MB default. */
  readonly ephemeralStorageMb?: number;
  /** DuckDB `memory_limit` for handlers that open DuckDB (apps/sync/src/engine/duckdb.ts). */
  readonly duckDbMemoryLimit?: string;
}

/** Plan, FetchPart, Promote: one manifest JSON, one ≤ ~6 MB part, one DynamoDB write. */
const DEFAULT_SIZING: HandlerSizing = { memoryMb: 1024, timeout: Duration.minutes(5) };

/**
 * B-09 full-county sizing (Task A Run 2: 441,961 properties, 15,025 roofing permits; measured on
 * the similar Run 1 manifest: 204 `kind: "table"` parts, ~556 MB). BuildIndex downloads every
 * part into /tmp, binds the views in DuckDB, streams the mapped rows to NDJSON and writes the
 * Parquet output, all in /tmp:
 * - memory 3008 MB: the largest size proven to run in this (new, Free-plan) account — another
 *   function here already runs at 3008 MB; new accounts can be capped there, so nothing above it
 *   is assumed. ~1.7 vCPU at this size.
 * - DuckDB memory_limit 2600 MB, spilling to /tmp beyond it. Run 3 failed the hosted build at 1800 MB;
 *   Run 3.1 (situs address text, owner mailing ZIP/state lists) fails at 2400 MB with "could not
 *   allocate block (2.2 GiB/2.2 GiB used)" in the v_property aggregation (threads=1 and
 *   preserve_insertion_order=false did not help). Measured in a linux/arm64 container capped at
 *   3008 MB (the Lambda size): 2600 MB passed 3 of 3 full builds in 51-88 s, so ~400 MB of the
 *   3008 MB is left for Node, the native module and the S3 upload buffers. macOS resident size
 *   reads higher (3.1-3.5 GB) and is not the Lambda measure. JS-side rows are streamed per DuckDB
 *   chunk.
 * - /tmp 4096 MB: ~556 MB parts + ~0.5 GB NDJSON + Parquet output + DuckDB spill, ~2.5x headroom.
 * - timeout 15 min (Lambda's maximum): architecture-constitution.md §10 budgets the build step at
 *   < 12 min (else switch to Fargate); 15 min leaves margin above that budget, not a new target.
 */
const BUILD_INDEX_SIZING: HandlerSizing = {
  memoryMb: 3008,
  timeout: Duration.minutes(15),
  ephemeralStorageMb: 4096,
  duckDbMemoryLimit: "2600MB",
};

/** Validate downloads BuildIndex's two full-county Parquet files and reads every row's
 *  sourceManifestCid (442k values) back through DuckDB — more than the 1024 MB default holds
 *  comfortably, far less than BuildIndex. */
const VALIDATE_SIZING: HandlerSizing = {
  memoryMb: 2048,
  timeout: Duration.minutes(10),
  ephemeralStorageMb: 1024,
  duckDbMemoryLimit: "1200MB",
};

/** Must exceed the sum of every step's own timeout (Plan + one FetchPart item + BuildIndex +
 *  Validate + Promote = 40 min) plus the Map's ~204 rate-limited part fetches. NFR-001's
 *  ≤ 30 min is the measured target (`SyncDurationMs`); this is only the hard ceiling. */
const STATE_MACHINE_TIMEOUT = Duration.minutes(60);

/** CDK-managed SSM parameter holding `DATA_MANIFEST_CID` — the authoritative CID Plan resolves
 *  first (apps/sync/handlers/plan.ts). The CRM's own `/crm/` namespace; never `/countylens/*`. */
const MANIFEST_CID_PARAMETER_NAME = "/crm/sync/data-manifest-cid";
/** NFR-002 / ADR-02: FetchPart's Map runs with bounded concurrency 2–3. */
const FETCH_PART_MAP_CONCURRENCY = 3;
/** ADR-02: CloudFront first, then Filebase, then Pinata. Task A's own deployed distribution
 *  (confirmed public, OAC to a private bucket, CORS `*` — ARD-B ADR-02; live-checked
 *  specs/002-lead-index/run-log.md Stage 0 A1: `{this host}/{cid}` → 200). CR-B-02 finding #2:
 *  this was never wired into either PlanFunction or FetchPartFunction's environment, so
 *  productionFetchers()/manifestGatewayUrls() always fell straight to Filebase/Pinata — the
 *  fallback order ADR-02 names as second and third, silently promoted to first and second.
 *  The host is config, not a literal: cdk context `crm:taskACloudFrontBaseUrl` (infra/cdk.json),
 *  passed in as `props.taskACloudFrontBaseUrl`; this names the variable the handlers read it from. */
const TASK_A_CLOUDFRONT_ENV_VAR = "GATEWAY_CLOUDFRONT_BASE_URL";

/**
 * FetchPart's DLQ and its one self-resolving CloudWatch alarm (constitution Article VII; tasks.md
 * T033/T034). Exported standalone — built directly on `scope`, with no dependency on any pipeline
 * Lambda — so T033's test (`apps/sync/test/dlq.test.ts`) can exercise this wiring with no
 * dependency on every pipeline handler's entry file existing (this story's one hard convergence
 * point is the state machine definition below, not this DLQ/alarm pair).
 */
export function addFetchPartDlqAndAlarm(
  scope: Construct,
  props: { readonly alarmTopic?: sns.ITopic | undefined } = {},
): { readonly queue: sqs.Queue; readonly alarm: cloudwatch.Alarm } {
  const queue = new sqs.Queue(scope, "FetchPartDlq", {
    queueName: "crm-sync-fetch-part-dlq",
    retentionPeriod: Duration.days(14),
    enforceSSL: true,
  });
  NagSuppressions.addResourceSuppressions(queue, [
    {
      id: "AwsSolutions-SQS3",
      reason:
        "This queue is itself FetchPart's terminal DLQ (constitution Article VII) — it is the sink a failed message lands on after exhausting retries, so it has no DLQ of its own by design; a part that fails here is held for operator review (architecture-constitution.md §8), never silently dropped.",
    },
  ]);

  const alarm = new cloudwatch.Alarm(scope, "FetchPartDlqAlarm", {
    alarmName: "crm-sync-fetch-part-dlq-depth",
    alarmDescription:
      "FetchPart DLQ depth > 0 (architecture-constitution.md §8). CloudWatch alarms are state-" +
      "based, so this fires once per transition into ALARM (never once per message) and returns " +
      "to OK on its own as soon as the queue's own ApproximateNumberOfMessagesVisible metric " +
      "reports 0 again — no extra treat-missing-data handling needed; SQS always publishes that " +
      "metric, including the zero value, once the queue is drained.",
    metric: queue.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
    threshold: 0,
    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });

  if (props.alarmTopic !== undefined) {
    alarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmTopic));
    alarm.addOkAction(new cloudwatchActions.SnsAction(props.alarmTopic));
  }

  return { queue, alarm };
}

export class CrmSyncStack extends Stack {
  public readonly stateMachine: sfn.StateMachine;
  public readonly fetchPartDlq: sqs.Queue;
  /** B-09 T053: exported so `CrmOpsStack`'s `RoofingCrm` dashboard can build an `AlarmStatusWidget`
   *  for this exact alarm — no second alarm definition, no duplicated threshold. */
  public readonly fetchPartDlqAlarm: cloudwatch.Alarm;
  /** B-09 T055: exported so `CrmOpsStack`'s `AgentCitationGroundednessRate` alarm can fan out to
   *  the same SNS topic as the DLQ alarm (contracts/observability.md: "subscribed to the same SNS
   *  topic as the DLQ alarm"), not a second topic with its own, easy-to-miss email subscription.
   *  Undefined when `alarmEmail` is omitted — same optionality as the DLQ alarm's own action. */
  public readonly alarmTopic: sns.ITopic | undefined;

  constructor(scope: Construct, id: string, props: CrmSyncStackProps) {
    super(scope, id, props);

    const indexBucket = s3.Bucket.fromBucketName(this, "IndexBucket", props.indexBucketName);
    const leadsTable = dynamodb.Table.fromTableName(this, "LeadsTable", props.leadsTableName);

    const alarmTopic =
      props.alarmEmail === undefined
        ? undefined
        : new sns.Topic(this, "SyncAlarmsTopic", { enforceSSL: true });
    if (alarmTopic !== undefined && props.alarmEmail !== undefined) {
      alarmTopic.addSubscription(new snsSubscriptions.EmailSubscription(props.alarmEmail));
      // `enforceSSL: true` alone only takes effect once a resource (topic) policy actually
      // exists (aws-cdk-lib's TopicBase#addToResourcePolicy appends the SSL-only deny statement
      // the first time any statement is added) — found live via cdk-nag's AwsSolutions-SNS3:
      // CloudWatch's own alarm->SNS publish needs no resource policy at all, and
      // `addSubscription` alone never creates one either, so without this explicit statement the
      // topic was left with no policy and `enforceSSL` silently did nothing. This statement is
      // also the real, least-privilege grant CloudWatch alarms need to publish here.
      const allowCloudWatchPublish = new iam.PolicyStatement({
        sid: "AllowCloudWatchAlarmsPublish",
        actions: ["sns:Publish"],
        effect: iam.Effect.ALLOW,
        resources: [alarmTopic.topicArn],
      });
      // addServicePrincipal, not `principals: [new iam.ServicePrincipal(...)]`: the latter doesn't
      // type-check as IPrincipal under this repo's exactOptionalPropertyTypes.
      allowCloudWatchPublish.addServicePrincipal("cloudwatch.amazonaws.com");
      alarmTopic.addToResourcePolicy(allowCloudWatchPublish);
    }
    this.alarmTopic = alarmTopic;

    const makeHandler = (
      id: string,
      functionName: string,
      entry: string,
      environment: Record<string, string>,
      handlerExportName: string,
      options: {
        readonly nodeModules?: string[];
        readonly architecture?: lambda.Architecture;
        readonly depsLockFilePath?: string;
        readonly sizing?: HandlerSizing;
      } = {},
    ): NodejsFunction => {
      const nodeModules = options.nodeModules ?? [];
      const architecture = options.architecture ?? lambda.Architecture.X86_64;
      const { depsLockFilePath } = options;
      const sizing = options.sizing ?? DEFAULT_SIZING;
      // An explicit LogGroup (rather than NodejsFunction's `logRetention` prop) avoids spinning
      // up CDK's LogRetention custom-resource Lambda per function — keeping this stack's Lambda
      // count exactly the five pipeline handlers plus the one deploy-time sync starter
      // (infra/test/crm-sync-stack.test.ts's literal `resourceCountIs` assertion).
      const logGroup = new logs.LogGroup(this, `${id}Logs`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const fn = new NodejsFunction(this, id, {
        functionName,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture,
        entry,
        ...(depsLockFilePath === undefined
          ? {}
          : {
              depsLockFilePath,
              // depsLockFilePath's directory becomes the bundling project root by default —
              // repoint it at the real monorepo root so esbuild can still resolve `entry`
              // (apps/sync/handlers/...) relative to it.
              projectRoot: new URL("../../", import.meta.url).pathname,
            }),
        handler: handlerExportName,
        memorySize: sizing.memoryMb,
        timeout: sizing.timeout,
        ...(sizing.ephemeralStorageMb === undefined
          ? {}
          : { ephemeralStorageSize: Size.mebibytes(sizing.ephemeralStorageMb) }),
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          POWERTOOLS_SERVICE_NAME: functionName,
          POWERTOOLS_METRICS_NAMESPACE: "RoofingCrm",
          ...(sizing.duckDbMemoryLimit === undefined
            ? {}
            : { DUCKDB_MEMORY_LIMIT: sizing.duckDbMemoryLimit }),
          ...environment,
        },
        logGroup,
        bundling: {
          format: OutputFormat.ESM,
          minify: true,
          // Same esbuild/ESM CJS-interop fix as every other NodejsFunction in this repo
          // (crm-api-stack.ts, crm-ops-stack.ts) — a dependency's CJS `require()` call doesn't
          // convert on its own in ESM output.
          banner:
            "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
          // @duckdb/node-api ships a platform-specific native .node binding that esbuild cannot
          // resolve statically (it's a dynamic `require()` switched on process.platform/arch) —
          // excluding it from the bundle and letting CDK npm-install it alongside instead is the
          // standard NodejsFunction pattern for native-addon dependencies.
          externalModules: nodeModules,
          nodeModules,
          // Found live (Runtime.ImportModuleError): nodeModules' install step runs on the build
          // host by default, so a local pnpm install on this arm64 Mac resolves the darwin-arm64
          // native binding, not the linux x86_64 one the Lambda runtime needs. Forcing Docker
          // bundling runs that install inside the same Amazon Linux image the function deploys
          // to, so the installed @duckdb/node-bindings variant always matches the runtime.
          forceDockerBundling: nodeModules.length > 0,
        },
      });
      fn.role?.addToPrincipalPolicy(taskADenyStatement(this));
      return fn;
    };

    // B-09 auto-sync: the config CID, pinned where Plan treats it as authoritative (ahead of the
    // runs/index.json hint and the execution's own manifestCidHint).
    const manifestCidParameter = new ssm.StringParameter(this, "DataManifestCidParameter", {
      parameterName: MANIFEST_CID_PARAMETER_NAME,
      stringValue: props.dataManifestCid,
      description:
        "DATA_MANIFEST_CID (@crm/config): the Task A run manifest crm-sync builds and promotes. Managed by CDK; change it in config and deploy.",
    });

    const planFn = makeHandler(
      "PlanFunction",
      "crm-sync-plan",
      props.planHandlerEntry,
      {
        CRM_INDEX_BUCKET_NAME: props.indexBucketName,
        MANIFEST_CID_SSM_PARAM_NAME: manifestCidParameter.parameterName,
        // Plan's already-promoted check reads META#index from this table (GetItem only).
        CRM_LEADS_TABLE_NAME: props.leadsTableName,
        // ADR-02: CloudFront first for the one lightweight fetch Plan does (the manifest JSON).
        // plan.ts's manifestGatewayUrls() falls back to Filebase/Pinata's public defaults when
        // this is unset (local dev, tests), so this is additive, not a required env var.
        [TASK_A_CLOUDFRONT_ENV_VAR]: props.taskACloudFrontBaseUrl,
      },
      "planHandler",
    );
    const fetchPartFn = makeHandler(
      "FetchPartFunction",
      "crm-sync-fetch-part",
      props.fetchPartHandlerEntry,
      {
        CRM_INDEX_BUCKET_NAME: props.indexBucketName,
        // CR-B-02 finding #2 (E2 fixer): CloudFront is now wired as the first gateway tried, per
        // ADR-02 — fetchPart.ts's createHttpGatewayFetcher() fetches it at `/{cid}` directly
        // (GATEWAY_PART_PATH), never the `/ipfs/{cid}` path Filebase/Pinata use, so this was a
        // one-line path-shape fix, not a redesign. Found live (before this fix): these three were
        // never all wired together, so productionFetchers() silently promoted Filebase/Pinata to
        // first/second instead of second/third.
        [TASK_A_CLOUDFRONT_ENV_VAR]: props.taskACloudFrontBaseUrl,
        GATEWAY_FILEBASE_BASE_URL: "https://ipfs.filebase.io",
        GATEWAY_PINATA_BASE_URL: "https://gateway.pinata.cloud",
      },
      "handler",
    );
    const buildIndexFn = makeHandler(
      "BuildIndexFunction",
      "crm-sync-build-index",
      props.buildIndexHandlerEntry,
      { CRM_INDEX_BUCKET_NAME: props.indexBucketName },
      "buildIndexHandler",
      {
        nodeModules: ["@duckdb/node-api"],
        sizing: BUILD_INDEX_SIZING,
        // ARM64, not the X86_64 default: Docker bundling on this Apple Silicon host runs native
        // arm64 containers with no emulation, so the native DuckDB binding it installs is
        // linux-arm64 — matching this architecture, not X86_64 (ARM64 Lambda is also the AWS-
        // recommended, cheaper default; nothing else in this stack requires X86_64).
        architecture: lambda.Architecture.ARM_64,
        // Found live: this workspace's pnpm-lock.yaml is lockfileVersion-incompatible with the
        // CDK build image's bundled pnpm, which then tries to re-resolve from the registry and
        // hits a known old-pnpm/fetch bug (ERR_INVALID_THIS) — unrelated to architecture. A plain
        // npm lockfile naming only this one native dependency sidesteps pnpm entirely for this
        // one function's nodeModules install.
        depsLockFilePath: new URL("../duckdb-lambda-deps/package-lock.json", import.meta.url)
          .pathname,
      },
    );
    const validateFn = makeHandler(
      "ValidateFunction",
      "crm-sync-validate",
      props.validateHandlerEntry,
      {
        CRM_INDEX_BUCKET_NAME: props.indexBucketName,
        CRM_LEADS_TABLE_NAME: props.leadsTableName,
      },
      "validateHandler",
      {
        sizing: VALIDATE_SIZING,
        // Validate also reads Parquet via apps/sync/src/engine/duckdb.ts now (it proves row
        // counts/provenance against BuildIndex's own output) — same native-binding treatment as
        // BuildIndexFunction (ARM64 + the npm-only lockfile for the Docker-bundled pnpm bug).
        nodeModules: ["@duckdb/node-api"],
        architecture: lambda.Architecture.ARM_64,
        depsLockFilePath: new URL("../duckdb-lambda-deps/package-lock.json", import.meta.url)
          .pathname,
      },
    );
    const promoteFn = makeHandler(
      "PromoteFunction",
      "crm-sync-promote",
      props.promoteHandlerEntry,
      { CRM_LEADS_TABLE_NAME: props.leadsTableName },
      "promoteHandler",
    );

    indexBucket.grantWrite(planFn);
    indexBucket.grantReadWrite(fetchPartFn);
    indexBucket.grantReadWrite(buildIndexFn);
    indexBucket.grantRead(validateFn);
    leadsTable.grantReadData(validateFn);
    leadsTable.grantReadWriteData(promoteFn);
    // Least privilege for Plan's two new reads: exactly one SSM parameter, one DynamoDB action.
    planFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [manifestCidParameter.parameterArn],
      }),
    );
    planFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem"],
        resources: [leadsTable.tableArn],
      }),
    );

    const { queue: fetchPartDlq, alarm: fetchPartDlqAlarm } = addFetchPartDlqAndAlarm(this, {
      alarmTopic,
    });
    this.fetchPartDlq = fetchPartDlq;
    this.fetchPartDlqAlarm = fetchPartDlqAlarm;
    fetchPartDlq.grantSendMessages(fetchPartFn);

    // --- Step Functions definition (architecture-constitution.md §2.3) ---
    //
    // The Map iterates Plan's `parts` (the manifest's own table artifacts, not `profiles` — a
    // profile is a vendored code reference checked by the digest guard, never a fetch target).
    // Each item is one PlanPart ({path}); itemSelector pairs it with the run's manifestCid so
    // FetchPart receives the {manifestCid, part} shape its contract requires.

    const planTask = new tasks.LambdaInvoke(this, "Plan", {
      lambdaFunction: planFn,
      outputPath: "$.Payload",
    });

    const heldNoPromotion = new sfn.Pass(this, "HeldNoPromotion", {
      comment:
        "Plan or Validate held this run (digest mismatch, lineage fork, cost gate, unexplained " +
        "reconcile diff, or an unverified part) — the current promoted index keeps serving " +
        "(constitution P0-3: no partial promotion).",
    });

    const fetchPartInvoke = new tasks.LambdaInvoke(this, "FetchPartInvoke", {
      lambdaFunction: fetchPartFn,
      outputPath: "$.Payload",
    });

    const sendToFetchPartDlq = new tasks.SqsSendMessage(this, "SendToFetchPartDlq", {
      queue: fetchPartDlq,
      messageBody: sfn.TaskInput.fromJsonPathAt("$"),
      // Discarding the SQS response keeps this Map item's own output as FetchPart's original
      // {status: "dlq", ...} result rather than replacing it with SQS's send-message metadata —
      // Validate (via BuildIndex's pass-through) needs to see which items were DLQ'd.
      resultPath: sfn.JsonPath.DISCARD,
    });

    // Keeps only status and partPath of each FetchPart result before it joins the Map's aggregated
    // result array (Step Functions state has a 256 KB limit). FetchPart itself never returns the
    // downloaded bytes either (they are in S3 for BuildIndex): a single 6 MB part in the task
    // result failed Task A's Run 2 sync with States.DataLimitExceeded, which this Pass state
    // alone could not prevent because the limit applies to the Lambda task's own response.
    const partVerified = new sfn.Pass(this, "PartVerified", {
      parameters: {
        "status.$": "$.status",
        "partPath.$": "$.partPath",
      },
    });

    const fetchPartResultChoice = new sfn.Choice(this, "FetchPartResultChoice")
      .when(sfn.Condition.stringEquals("$.status", "dlq"), sendToFetchPartDlq)
      .otherwise(partVerified);

    const fetchPartsMap = new sfn.Map(this, "FetchPartsMap", {
      // ADR-02 / NFR-002: bounded concurrency 2–3 parallel fetches.
      maxConcurrency: FETCH_PART_MAP_CONCURRENCY,
      itemsPath: sfn.JsonPath.stringAt("$.parts"),
      itemSelector: {
        "manifestCid.$": "$.manifestCid",
        "part.$": "$$.Map.Item.Value",
      },
      // Kept (not discarded): BuildIndex echoes this array's statuses forward as
      // `anyPartUnverified` for Validate (T020a) — a run is never promoted with one DLQ'd part.
      resultPath: "$.fetchResults",
    });
    fetchPartsMap.itemProcessor(fetchPartInvoke.next(fetchPartResultChoice));

    const buildIndexTask = new tasks.LambdaInvoke(this, "BuildIndex", {
      lambdaFunction: buildIndexFn,
      outputPath: "$.Payload",
    });

    const validateTask = new tasks.LambdaInvoke(this, "Validate", {
      lambdaFunction: validateFn,
      // payloadResponseOnly unwraps the Lambda's return value itself (not the full Invoke API
      // response) before it's merged — resultPath keeps it under its own key rather than
      // replacing state the way outputPath: "$.Payload" does elsewhere, since IndexMeta is a
      // strict Zod schema with no room for extra fields, but Promote still needs `startedAt`
      // (as planStartedAt), which rode this far in state since BuildIndex echoed it forward.
      // Found live, twice: first without payloadResponseOnly, resultPath captured the whole raw
      // Invoke response (ExecutionArn/StatusCode/Payload/...) under $.indexMeta, not the IndexMeta
      // value itself, so $.indexMeta.status didn't exist either.
      payloadResponseOnly: true,
      resultPath: "$.indexMeta",
    });

    const promoteTask = new tasks.LambdaInvoke(this, "Promote", {
      lambdaFunction: promoteFn,
      payload: sfn.TaskInput.fromObject({
        "indexMeta.$": "$.indexMeta",
        tableName: props.leadsTableName,
        "planStartedAt.$": "$.startedAt",
      }),
      outputPath: "$.Payload",
    });

    const validateResultChoice = new sfn.Choice(this, "ValidateResultChoice")
      .when(sfn.Condition.stringEquals("$.indexMeta.status", "Validated"), promoteTask)
      .otherwise(heldNoPromotion);

    const alreadyPromoted = new sfn.Succeed(this, "AlreadyPromotedNoOp", {
      comment:
        "Plan found this manifestCid is already META#index.current — nothing to fetch, build or " +
        "promote (a repeat of the deploy-time start, or a rollback re-running it).",
    });

    const planResultChoice = new sfn.Choice(this, "PlanResultChoice")
      // Plan's success shape (contracts/sync-pipeline.md's PlanResult) never sets `status` at all
      // — Condition.stringEquals on a path that's genuinely absent throws rather than evaluating
      // to false, so `isPresent` must gate it first.
      .when(
        sfn.Condition.and(
          sfn.Condition.isPresent("$.status"),
          sfn.Condition.stringEquals("$.status", "Held"),
        ),
        heldNoPromotion,
      )
      .when(
        sfn.Condition.and(
          sfn.Condition.isPresent("$.status"),
          sfn.Condition.stringEquals("$.status", "AlreadyPromoted"),
        ),
        alreadyPromoted,
      )
      .otherwise(fetchPartsMap.next(buildIndexTask).next(validateTask).next(validateResultChoice));

    // A step that throws (BuildIndex out of memory or timeout, a Validate crash, a failed Promote)
    // ends in one named Fail state, so the execution list and the failed-run alarm show a clear
    // cause rather than the raw task error. Lambda service errors are retried before this
    // (LambdaInvoke's default retry); the previous index keeps serving either way.
    const syncFailed = new sfn.Fail(this, "SyncFailed", {
      error: "CrmSyncFailed",
      cause:
        "A crm-sync step failed after its retries; the index was not promoted and the previous " +
        "index keeps serving. See the failing state's error in the execution history.",
    });
    for (const step of [planTask, buildIndexTask, validateTask, promoteTask]) {
      step.addCatch(syncFailed, { errors: ["States.ALL"], resultPath: "$.error" });
    }

    const definition = planTask.next(planResultChoice);

    const stateMachineLogGroup = new logs.LogGroup(this, "StateMachineLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    this.stateMachine = new sfn.StateMachine(this, "CrmSyncStateMachine", {
      stateMachineName: "crm-sync",
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: STATE_MACHINE_TIMEOUT,
      tracingEnabled: true,
      logs: { destination: stateMachineLogGroup, level: sfn.LogLevel.ALL },
    });
    // Whole-run failure alerting (constitution P0-12). The FetchPart DLQ alarm only sees part
    // fetch failures; a BuildIndex out-of-memory error or timeout, a Validate crash or a Promote
    // failure ends the execution Failed/TimedOut/Aborted and used to notify nobody. LambdaInvoke
    // already retries Lambda service errors (retryOnServiceExceptions), so what reaches these
    // alarms is a real failure. Each alarm is state-based and returns to OK by itself.
    const executionAlarms: ReadonlyArray<readonly [string, string, cloudwatch.Metric]> = [
      [
        "Failed",
        "crm-sync-execution-failed",
        this.stateMachine.metricFailed({ period: Duration.minutes(5) }),
      ],
      [
        "TimedOut",
        "crm-sync-execution-timed-out",
        this.stateMachine.metricTimedOut({ period: Duration.minutes(5) }),
      ],
      [
        "Aborted",
        "crm-sync-execution-aborted",
        this.stateMachine.metricAborted({ period: Duration.minutes(5) }),
      ],
    ];
    for (const [id, alarmName, metric] of executionAlarms) {
      const executionAlarm = new cloudwatch.Alarm(this, `Execution${id}Alarm`, {
        alarmName,
        alarmDescription: `A crm-sync execution ${id.toLowerCase()}: the index was not rebuilt or promoted. Open the execution in Step Functions; the previous index keeps serving.`,
        metric,
        threshold: 0,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      if (alarmTopic !== undefined) {
        executionAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
        executionAlarm.addOkAction(new cloudwatchActions.SnsAction(alarmTopic));
      }
    }

    // BuildIndex memory headroom: DuckDB is limited to 2600 MB inside a 3008 MB Lambda, and the
    // run that crosses the Lambda limit dies without warning. Lambda's own REPORT line carries
    // "Max Memory Used"; this filter turns it into a metric and the alarm fires at 85 % of the
    // function's memory (2,560 MB), the signal to move BuildIndex to Fargate (docs/runbook.md).
    const buildIndexMemory = new logs.MetricFilter(this, "BuildIndexMaxMemoryFilter", {
      logGroup: buildIndexFn.logGroup,
      metricNamespace: "CrmSync",
      metricName: "BuildIndexMaxMemoryUsedMb",
      filterPattern: logs.FilterPattern.spaceDelimited(
        "type",
        "rl",
        "rid",
        "dl",
        "dur",
        "dms",
        "bl1",
        "bl2",
        "bd",
        "bms",
        "ml1",
        "ml2",
        "mem",
        "mmb",
        "xl1",
        "xl2",
        "xl3",
        "maxmem",
        "xmb",
        "...",
      ).whereString("type", "=", "REPORT"),
      metricValue: "$maxmem",
    });
    const buildIndexMemoryAlarm = new cloudwatch.Alarm(this, "BuildIndexMemoryAlarm", {
      alarmName: "crm-sync-build-index-memory-high",
      alarmDescription:
        "BuildIndex used more than 85 % of its 3,008 MB (2,560 MB). The next larger run may run out of memory; move BuildIndex to Fargate (docs/runbook.md, BuildIndex memory).",
      metric: buildIndexMemory.metric({ period: Duration.minutes(5), statistic: "Maximum" }),
      threshold: 2560,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (alarmTopic !== undefined) {
      buildIndexMemoryAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
      buildIndexMemoryAlarm.addOkAction(new cloudwatchActions.SnsAction(alarmTopic));
    }

    // A held run (cost gate, digest mismatch, lineage fork, unverified part, unexplained diff)
    // ends as a SUCCEEDED execution, so the alarms above never see it and the stale index would
    // keep serving unnoticed. Count entries into HeldNoPromotion from the state machine's own log.
    const heldMetric = new logs.MetricFilter(this, "HeldNoPromotionFilter", {
      logGroup: stateMachineLogGroup,
      metricNamespace: "CrmSync",
      metricName: "HeldNoPromotion",
      filterPattern: logs.FilterPattern.literal(
        '{ $.type = "PassStateEntered" && $.details.name = "HeldNoPromotion" }',
      ),
      metricValue: "1",
      defaultValue: 0,
    });
    const heldAlarm = new cloudwatch.Alarm(this, "HeldNoPromotionAlarm", {
      alarmName: "crm-sync-held-no-promotion",
      alarmDescription:
        "A crm-sync run was held (cost gate, profile digest, lineage, unverified part or reconcile diff) and not promoted; the previous index keeps serving. See the execution's HeldNoPromotion input for the reason.",
      metric: heldMetric.metric({ period: Duration.minutes(5), statistic: "Sum" }),
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (alarmTopic !== undefined) {
      heldAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
      heldAlarm.addOkAction(new cloudwatchActions.SnsAction(alarmTopic));
    }
    // Defense in depth (constitution P0-1): every role this stack creates carries the Deny,
    // including the state machine's own orchestration role, even though it only ever invokes
    // this stack's own Lambdas and its own DLQ (infra/test/iam-deny.test.ts, T037).
    this.stateMachine.role.addToPrincipalPolicy(taskADenyStatement(this));

    // --- B-09 auto-sync on deploy ---
    //
    // One states:StartExecution call, made by CloudFormation through a custom resource whose
    // properties carry the manifest CID and this deploy's nonce. CloudFormation re-invokes a
    // custom resource only when its properties change; the nonce changes every deploy, so every
    // deploy starts one execution. That is what makes a redeploy retry a failed first sync of a
    // CID, and an A→B→A rollback re-sync A: the execution is named `{manifestCid}-{deployNonce}`,
    // never the bare CID, because a Standard execution name can't be reused for 90 days.
    // Repeats are harmless: Plan ends the run as AlreadyPromoted (one SSM read + one DynamoDB
    // GetItem, no fetch) when the CID is already META#index.current, and Promote's conditional
    // write stays the second guard. StartExecution returns once the execution is accepted, so the
    // deploy never waits on, or fails with, the sync itself — a failed run is the DLQ alarm's job
    // (constitution P0-12). ExecutionAlreadyExists can now only mean CloudFormation re-sent this
    // same deploy's request (same name, same input), so it is still safe to ignore.
    const startSyncCall: cr.AwsSdkCall = {
      service: "SFN",
      action: "startExecution",
      parameters: {
        stateMachineArn: this.stateMachine.stateMachineArn,
        name: deploySyncExecutionName(props.dataManifestCid, props.deployNonce),
        input: JSON.stringify({ manifestCidHint: props.dataManifestCid }),
      },
      physicalResourceId: cr.PhysicalResourceId.of(`crm-sync-${props.dataManifestCid}`),
      ignoreErrorCodesMatching: "ExecutionAlreadyExists",
    };
    // Accepted exception to "Powertools Logger/Tracer/Metrics on every Lambda" (constitution
    // Article VIII): this custom resource's Lambda is CDK's own framework handler — it runs no app
    // code we could instrument, only the one SDK call above. Its CloudWatch log group below is the
    // observability it gets; infra/test/crm-sync-stack.test.ts names it as the only exception.
    const startSyncOnDeploy = new cr.AwsCustomResource(this, "StartSyncOnManifestChange", {
      functionName: "crm-sync-start-on-deploy",
      // Least privilege: exactly states:StartExecution on this one state machine. The custom
      // resource creates and owns the role (no hand-made iam.Role, which doesn't type-check as
      // IRole under exactOptionalPropertyTypes); the Task A Deny is added to it just below.
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["states:StartExecution"],
          resources: [this.stateMachine.stateMachineArn],
        }),
      ]),
      onCreate: startSyncCall,
      onUpdate: startSyncCall,
      // No onDelete: removing this resource (or the stack) never starts or stops a sync.
      installLatestAwsSdk: false,
      timeout: Duration.minutes(2),
      logGroup: new logs.LogGroup(this, "StartSyncOnDeployLogs", {
        logGroupName: "/aws/lambda/crm-sync-start-on-deploy",
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
    startSyncOnDeploy.grantPrincipal.addToPrincipalPolicy(taskADenyStatement(this));
    // The new CID must be in SSM and Plan's new configuration live before the execution starts.
    startSyncOnDeploy.node.addDependency(manifestCidParameter, this.stateMachine, planFn);
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "AwsSolutions-L1",
          reason:
            "AWS679f53fa... is CDK's own internal Provider Lambda for AwsCustomResource (the deploy-time crm-sync starter), not app code — its runtime version is chosen and updated by the CDK framework, not by this stack (same accepted suppression as CrmOps).",
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWSLambdaBasicExecutionRole is the standard CloudWatch Logs write policy every Lambda needs for Powertools Logger/Tracer (constitution Article VIII); a hand-written equivalent would grant the same actions (demo project, Article III cost-consciousness).",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "The wildcards are CDK's own auto-generated, resource-scoped grants: Bucket.grantRead/grantReadWrite's action-group wildcards (s3:GetObject*, s3:List*, s3:GetBucket*, s3:DeleteObject*, s3:Abort*) scoped to this stack's own imported index bucket; the state machine role's Lambda-invoke grants, which CDK always suffixes with ':*' to cover every published version/alias of a function this stack itself creates; and every Lambda's X-Ray tracing permissions (xray:PutTraceSegments/PutTelemetryRecords, constitution Article VIII), which AWS does not support scoping to a resource ARN at all — not an app-authored blanket grant.",
          appliesTo: [
            { regex: "/^Action::s3:(GetObject|List|GetBucket|DeleteObject|Abort)\\*$/" },
            { regex: "/^Resource::arn:aws:s3:::<IndexBucket[A-Za-z0-9]+>\\/\\*$/" },
            {
              regex:
                "/^Resource::<(BuildIndexFunction|FetchPartFunction|PlanFunction|PromoteFunction|ValidateFunction)[A-Za-z0-9]+\\.Arn>:\\*$/",
            },
            "Resource::*",
          ],
        },
      ],
      true,
    );
  }
}
