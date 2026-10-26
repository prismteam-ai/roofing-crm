// T007: API Gateway HTTP API + one Lambda (tRPC AppRouter, health router only this story),
// Powertools wired via the Lambda's own code (apps/api/src/handlers/health.ts), Cognito JWT
// authorizer attached to every route except health.ping (contracts/health.md). Declares an
// explicit CDK dependency on CrmOps (plan.md "Data Flow & Integration Points": the authorizer
// needs CrmOps's user pool/app client to exist first — the one recorded deviation from
// architecture-constitution.md §11's literal stack order, justified in plan.md's Complexity
// Tracking table).
import { Annotations, Duration, Stack, Token, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { RegionInfo } from "aws-cdk-lib/region-info";
import type { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { taskADenyStatement } from "./task-a-deny.js";

/** Escapes a literal for use inside a cdk-nag `appliesTo` regex. */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

/** ADR-06 §6.1 nested timeouts: 23 s server abort < 28 s Lambda < 30 s HTTP API. The 23 s is
 *  `@crm/shared`'s `AGENT_TURN_LIMIT_MS`; infra/test/crm-api-stack.agent.test.ts asserts this
 *  value nests around it (limit + margin <= Lambda <= HTTP API). */
export const TRPC_LAMBDA_TIMEOUT_SECONDS = 28;
/** Memory of the `crm-api-trpc` function; the reason is at its use below. */
export const TRPC_LAMBDA_MEMORY_MB = 2048;

/** Destination regions a system-defined *geographic* Bedrock cross-region inference profile
 *  (`<geo>.<model id>`) may route a request to. Source: `bedrock:GetInferenceProfile` for
 *  `eu.anthropic.claude-sonnet-4-6` in eu-north-1, account 515618610572, 2026-10-24 (read-only).
 *  The foundation-model grant is scoped to exactly these regions (no `*` region), and only for
 *  calls made *through* the configured profile (`bedrock:InferenceProfileArn` condition). If
 *  AWS adds a destination region, InvokeModel fails with AccessDenied for requests routed there —
 *  re-run GetInferenceProfile and update this list. A geo prefix not listed here fails synth
 *  rather than silently granting nothing (or everything). */
export const BEDROCK_GEO_PROFILE_DESTINATION_REGIONS: Readonly<Record<string, readonly string[]>> =
  {
    eu: ["eu-north-1", "eu-west-3", "eu-south-1", "eu-south-2", "eu-west-1", "eu-central-1"],
  };

export interface CrmApiStackProps extends StackProps {
  /** Path to apps/api/src/handlers/health.ts, relative to this file. */
  readonly healthHandlerEntry: string;
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  /** CrmOps's LockoutCounter table — auth.reportFailedAttempt writes to it (found deploying). */
  readonly lockoutTable: dynamodb.Table;
  /** CrmData's index bucket name (B-03: search.properties/search.permits/property.get read
   *  crm_property/crm_permit Parquet from here via the B-02 LeadIndex adapter) — same
   *  string-only pattern as crm-sync-stack.ts's indexBucketName (imported via fromBucketName,
   *  not passed as a construct, so this stack's own tests don't need a real CrmDataStack). */
  readonly indexBucketName: string;
  /** CountyLens's origin, set as `EXPLORER_BASE_URL` on the API Lambda (cdk context
   *  `crm:explorerBaseUrl`). Omitted: the variable is not set and the API reports the lineage link
   *  and the Apps menu's CountyLens entry as not available. */
  readonly explorerBaseUrl?: string;
  /** B-07's leads table name, for the META#index pointer read (ADR-05) — same string-only
   *  pattern as crm-sync-stack.ts's leadsTableName (no real table construct exists yet). */
  readonly leadsTableName: string;
  /** B-09 T017: the `crm-agent-usage` rate-limit/spend-cap table name (data-model.md), same
   *  string-only pattern as leadsTableName above. */
  readonly agentUsageTableName: string;
  /** B-09: apps/api/src/agent/getModel.ts reads these (never a hard-coded provider/model id,
   *  constitution VI) — resolved by `@crm/config`'s `loadConfig`, same one-place-for-config-
   *  literals pattern as `dataManifestCid`. */
  readonly aiProvider: string;
  readonly agentModelId: string;
  /** Keep-warm schedule on/off. Default: the `crm:keepWarm` context (true in cdk.json). */
  readonly keepWarm?: boolean;
  /** Secrets Manager secret holding the Vercel AI Gateway key; only used when `aiProvider` is
   *  `gateway`. Default: the `crm:aiGatewaySecretArn` context (unset: gateway fails synth). */
  readonly aiGatewaySecretArn?: string;
}

/** Event the keep-warm rule sends; apps/api/src/handlers/health.ts `isWarmEvent` matches it. */
export const KEEP_WARM_EVENT = { source: "crm.warm" } as const;
export const KEEP_WARM_RATE_MINUTES = 5;

const SECRET_ARN_PATTERN = /^arn:aws[a-z-]*:secretsmanager:[a-z0-9-]+:\d{12}:secret:.+$/;

export class CrmApiStack extends Stack {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: CrmApiStackProps) {
    super(scope, id, props);

    // @duckdb/node-api's native binding (B-03: search.properties/search.permits/property.get,
    // via apps/api/src/leadIndex.ts's DuckDbParquetLeadIndex) can't be statically bundled by
    // esbuild (found integrating B-03: "Could not resolve @duckdb/node-bindings-*/duckdb.node" —
    // the same class of error crm-sync-stack.ts's BuildIndex/Validate functions already hit and
    // fixed). Same remedy here: exclude it from the bundle and let CDK npm-install it alongside,
    // inside a Docker build on the target architecture so the installed native binding matches
    // the Lambda runtime, not this build host.
    const DUCKDB_NODE_MODULES = ["@duckdb/node-api"];
    const indexBucket = s3.Bucket.fromBucketName(this, "IndexBucket", props.indexBucketName);

    const trpcHandler = new NodejsFunction(this, "TrpcHandler", {
      functionName: "crm-api-trpc",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: props.healthHandlerEntry,
      // Found live (same fix as crm-sync-stack.ts's BuildIndex/Validate): this workspace's
      // pnpm-lock.yaml is lockfileVersion-incompatible with the CDK build image's bundled pnpm,
      // which then tries to re-resolve from the registry and hits a known old-pnpm/fetch bug
      // (ERR_INVALID_THIS) — unrelated to architecture. A plain npm lockfile naming only the one
      // native dependency sidesteps pnpm entirely for this function's nodeModules install.
      depsLockFilePath: new URL("../duckdb-lambda-deps/package-lock.json", import.meta.url)
        .pathname,
      // depsLockFilePath's directory becomes the bundling project root by default — repoint it
      // at the real monorepo root so esbuild can still resolve `entry` relative to it.
      projectRoot: new URL("../../", import.meta.url).pathname,
      handler: "handler",
      // 2048 MB (was 1024). Run 2's index is 441,961 properties (about 58 MB of Parquet) read by
      // an in-process DuckDB. At 1024 MB a permit search over a county-sized radius ran the
      // function out of memory (Runtime.OutOfMemory, GAP-1 in docs/evidence/B-09.md). The search
      // paths now count and page inside DuckDB (services/search.ts), which removes the cause;
      // the extra memory is headroom for DuckDB's buffer pool (capped at 60 percent of this size
      // by the adapter, spilling to /tmp) plus the Parquet footprint, and Lambda gives CPU in
      // proportion to memory, so a cold load and the scans also run faster. Cost: GB-seconds scale
      // with memory, a few cents a month at this demo's traffic. Still no provisioned concurrency.
      memorySize: TRPC_LAMBDA_MEMORY_MB,
      // ADR-06 §6.1 / architecture-constitution.md §8 nested timeouts: the agent aborts server-side
      // at 23 s (apps/api/src/agent/runAgent.ts RUN_AGENT_TIMEOUT_MS), this Lambda at 28 s, the
      // HTTP API at 30 s — so the rep sees a typed `timed_out` answer, never a 500/504.
      timeout: Duration.seconds(TRPC_LAMBDA_TIMEOUT_SECONDS),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        POWERTOOLS_SERVICE_NAME: "crm-api",
        POWERTOOLS_METRICS_NAMESPACE: "RoofingCrm",
        LOCKOUT_TABLE_NAME: props.lockoutTable.tableName,
        // B-03: apps/api/src/leadIndex.ts reads these (never a hard-coded bucket/table name,
        // architecture-constitution.md §9's module-boundary table).
        CRM_INDEX_BUCKET_NAME: props.indexBucketName,
        CRM_LEADS_TABLE_NAME: props.leadsTableName,
        // Bump when crm_property/crm_permit gain or change columns (apps/sync buildIndex). The API
        // keeps the loaded index per warm sandbox and the keep-warm ping stops it recycling, so an
        // index rebuilt under the same manifest CID is only read after the function changes: this
        // value changing is what gives a deploy fresh sandboxes. 2 = built year, last sale, tenure
        // years and source URLs (2026-10-26); 3 = situs address and owner mailing ZIP/state (Run 3.1).
        INDEX_SCHEMA_VERSION: "4",
        // B-09: apps/api/src/agent/{rateLimiter,spendCap}.ts read this (never a hard-coded table
        // name, architecture-constitution.md §9's module-boundary table).
        CRM_AGENT_USAGE_TABLE_NAME: props.agentUsageTableName,
        // B-09: apps/api/src/agent/getModel.ts reads these (constitution VI — never a hard-coded
        // provider or model id anywhere else).
        AI_PROVIDER: props.aiProvider,
        AGENT_MODEL_ID: props.agentModelId,
        // The lineage link and the Apps menu read this; the API has no built-in default host.
        ...(props.explorerBaseUrl === undefined
          ? {}
          : { EXPLORER_BASE_URL: props.explorerBaseUrl }),
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling: {
        format: OutputFormat.ESM,
        minify: true,
        // esbuild's ESM output can't convert a dependency's CJS `require()` calls on its own
        // ("Dynamic require of ... is not supported" at cold start, found deploying) — the
        // documented CDK workaround: a createRequire shim in the bundle banner.
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        // NodejsFunction defaults to externalModules: ['@aws-sdk/*'] (assumes the Lambda
        // runtime's built-in SDK), but its @smithy/* sub-dependencies aren't resolvable from
        // that built-in layer in ESM output (Runtime.ImportModuleError, found deploying) —
        // bundle the AWS SDK ourselves instead of depending on the runtime's version/layout.
        // @duckdb/node-api is the one exception (see DUCKDB_NODE_MODULES above).
        externalModules: DUCKDB_NODE_MODULES,
        nodeModules: DUCKDB_NODE_MODULES,
        forceDockerBundling: true,
      },
    });
    trpcHandler.role?.addToPrincipalPolicy(taskADenyStatement(this));
    props.lockoutTable.grantReadWriteData(trpcHandler);
    indexBucket.grantRead(trpcHandler);
    // B-07: leads read/write. TransactWriteItems is authorised per underlying action
    // (PutItem/UpdateItem/ConditionCheckItem); Query on GSI1/GSI2 needs the index ARNs, which
    // `grantIndexPermissions` adds. No Scan, no DeleteItem, no table-level admin actions.
    const leadsTable = dynamodb.Table.fromTableAttributes(this, "LeadsTable", {
      tableName: props.leadsTableName,
      grantIndexPermissions: true,
    });
    leadsTable.grantReadData(trpcHandler);
    leadsTable.grant(
      trpcHandler,
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:ConditionCheckItem",
    );
    // leads.undoCreate deletes the LEAD, SIGNALS and EVT#0 items in one TransactWriteItems call,
    // which is authorised per underlying action: DeleteItem. Granted on the TABLE ARN only (never
    // the GSI ARNs) and nowhere else; the conditions that make a delete safe live in the
    // transaction itself (leadRepo.undoCreate). leads.presence's BatchGetItem is already part of
    // grantReadData above, so no separate grant is added for it.
    trpcHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:DeleteItem"],
        resources: [leadsTable.tableArn],
      }),
    );

    // B-09 T017: `crm-agent-usage` rate-limit/spend-cap guard — rateLimiter.ts/spendCap.ts only
    // ever send one conditional UpdateItem per check (no reads, no transactions), so this grant
    // is UpdateItem-only, no Query/Scan/Delete (same minimal-actions pattern as leadsTable above).
    const agentUsageTable = dynamodb.Table.fromTableName(
      this,
      "AgentUsageTable",
      props.agentUsageTableName,
    );
    // GetItem (consistent read) is for the per-thread proposal record agent.confirmLead checks
    // (apps/api/src/agent/threadStore.ts) — one item by key, still no Query/Scan/Delete.
    agentUsageTable.grant(trpcHandler, "dynamodb:UpdateItem", "dynamodb:GetItem");

    this.grantModelAccess(
      trpcHandler,
      props.aiProvider,
      props.agentModelId,
      props.aiGatewaySecretArn,
    );

    this.addKeepWarm(trpcHandler, props.keepWarm);

    const authorizer = new authorizers.HttpUserPoolAuthorizer("CognitoAuthorizer", props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    // Same-origin only via the Amplify /api/* rewrite (ARD-B §2.2/§8); corsPreflight is
    // deliberately omitted (no CORS surface), not set to undefined.
    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "crm-api",
    });

    // AwsSolutions-APIG1: access logging on the default stage, via the L1 escape hatch (the L2
    // HttpStage in this CDK version has no typed accessLogSettings prop).
    const accessLogGroup = new logs.LogGroup(this, "AccessLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
    });
    const cfnStage = this.httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (cfnStage !== undefined) {
      cfnStage.accessLogSettings = {
        destinationArn: accessLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: "$context.requestId",
          ip: "$context.identity.sourceIp",
          requestTime: "$context.requestTime",
          httpMethod: "$context.httpMethod",
          routeKey: "$context.routeKey",
          status: "$context.status",
          protocol: "$context.protocol",
          responseLength: "$context.responseLength",
        }),
      };
    }
    accessLogGroup.grantWrite(new iam.ServicePrincipal("apigateway.amazonaws.com"));

    // auth.reportFailedAttempt is public and unauthenticated by necessity (routers/auth.ts), so
    // nothing stops a direct caller from invoking it without ever attempting a real sign-in —
    // confirmed exploitable as a credential-free DoS against the one seeded admin account (code
    // review, CR-B-01, Critical; decided with the user: rate-limit and accept the residual risk
    // for this one-shared-login demo account, not a full Custom Auth Challenge rearchitecture).
    // A tight route-level throttle (shared across all callers, not per-caller — HTTP API has no
    // per-IP throttling) raises the bar against casual/scripted abuse without blocking the
    // legitimate client's own occasional real report.
    if (cfnStage !== undefined) {
      cfnStage.routeSettings = {
        ...(cfnStage.routeSettings as Record<string, unknown> | undefined),
        "POST /trpc/auth.reportFailedAttempt": {
          // PascalCase, not CDK's usual camelCase: this L1 property is a raw passthrough map,
          // not a typed interface CDK converts for us (found deploying: camelCase keys were
          // silently rejected by the API Gateway resource handler with "Unrecognized field").
          // Burst must cover the full Playwright suite's legitimate use of this route, not just
          // one AC-3 run: the suite runs AC-3's 4-wrong-attempt flow once per viewport project
          // (3x) within a few minutes — found deploying: burst 2, then burst 5, each 429'd a
          // later project's run once the earlier ones had spent it faster than the steady-state
          // rate refilled.
          ThrottlingBurstLimit: 15,
          ThrottlingRateLimit: 0.2, // steady-state: 1 request per 5s once the burst is spent
        },
      };
    }

    const integration = new integrations.HttpLambdaIntegration("TrpcIntegration", trpcHandler);

    // health.ping: the one route with no authorizer (contracts/health.md).
    this.httpApi.addRoutes({
      path: "/trpc/health.ping",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration,
    });

    // auth.reportFailedAttempt: also unauthenticated — called from the sign-in page before any
    // session exists (found deploying; see routers/auth.ts). A tRPC mutation, POST only.
    this.httpApi.addRoutes({
      path: "/trpc/auth.reportFailedAttempt",
      methods: [apigwv2.HttpMethod.POST],
      integration,
    });

    // Every other tRPC route sits behind the Cognito JWT authorizer (constitution P0-11).
    this.httpApi.addRoutes({
      path: "/trpc/{proxy+}",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration,
      authorizer,
    });

    this.apiUrl = this.httpApi.apiEndpoint;

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWSLambdaBasicExecutionRole is the standard CloudWatch Logs write policy every Lambda needs for Powertools Logger/Tracer (constitution Article VIII); a hand-written equivalent would grant the same three log actions with no added protection (demo project, Article III cost-consciousness).",
          appliesTo: [
            "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "The wildcard is CDK's own auto-generated log-group-scoped policy (NodejsFunction/LogRetention), not an app-authored grant; it is scoped to this function's own log group by the construct, not to all resources.",
          appliesTo: ["Resource::*"],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "B-03: the wildcards are CDK's own auto-generated, resource-scoped grant from Bucket.grantRead (s3:GetObject*, s3:GetBucket*, s3:List* scoped to this stack's own imported index bucket) — the same pattern already accepted in crm-sync-stack.ts for the same bucket.",
          appliesTo: [
            { regex: "/^Action::s3:(GetObject|GetBucket|List)\\*$/" },
            { regex: "/^Resource::arn:aws:s3:::<IndexBucket[A-Za-z0-9]+>\\/\\*$/" },
          ],
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "B-07: Query on crm-leads' GSI1 (assignee) and GSI2 (status) is authorised only on the index ARN, so the grant is table/crm-leads/index/*, scoped to this one table's own indexes. The actions are read plus PutItem/UpdateItem/ConditionCheckItem; DeleteItem is granted separately on the table ARN only, never on the indexes (see the grant comments above).",
          appliesTo: [
            {
              regex: `/^Resource::arn:aws:dynamodb:${escapeRegex(this.region)}:(<AWS::AccountId>|[0-9]{12}):table\\/crm-leads\\/index\\/\\*$/`,
            },
          ],
        },
      ],
      true,
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.httpApi.node.path}/GET--trpc--health.ping/Resource`,
      [
        {
          id: "AwsSolutions-APIG4",
          reason:
            "health.ping is deliberately the one unauthenticated route in this story (contracts/health.md, constitution P0-11's named exception) — it exists specifically so AC-2/NFR-001's X-Ray trace check has nothing in front of it to confound timing.",
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.httpApi.node.path}/POST--trpc--health.ping/Resource`,
      [
        {
          id: "AwsSolutions-APIG4",
          reason:
            "health.ping is deliberately the one unauthenticated route in this story (contracts/health.md, constitution P0-11's named exception).",
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.httpApi.node.path}/POST--trpc--auth.reportFailedAttempt/Resource`,
      [
        {
          id: "AwsSolutions-APIG4",
          reason:
            "auth.reportFailedAttempt is deliberately unauthenticated — called from the sign-in page before any session exists (found deploying; decided with the user: client-reported failure count, server-enforced block — see auth/lockout-handler.ts).",
        },
      ],
    );
  }

  /** CR finding 2: the model grant for `AI_PROVIDER` (constitution VI — the model id is config,
   *  never a literal here). `bedrock`: InvokeModel(+WithResponseStream) on the configured
   *  inference profile in this account/region, plus the underlying foundation model in each
   *  destination region of that geo profile, conditioned on being invoked through that profile.
   *  `gateway`: no AWS grant at all; the Vercel AI Gateway key would have to come from Secrets
   *  Manager, which is not wired in this deployment — so synth fails closed instead of deploying
   *  a Lambda whose every ask would fail at its first model call. */
  /** Keep-warm: an EventBridge schedule invokes the function every 5 minutes with the internal
   *  `{ source: "crm.warm" }` event so a sandbox, and the 442k-row index loaded in it, stays alive
   *  (cold API start about 5 s, warm about 1 s). The handler only loads or confirms the index. The
   *  target's invoke permission is scoped to this one rule (CDK adds `lambda:InvokeFunction` for
   *  events.amazonaws.com with the rule ARN as source), no retries (the next tick is 5 minutes
   *  away). Cost: 12 per hour, about 8,640 invocations a month, well inside the Lambda free tier
   *  (1M requests and 400,000 GB-seconds a month; this is about 4,000 GB-seconds at 2 GB and
   *  0.25 s). The `crm:keepWarm` context (or the prop) turns the rule off without removing it. */
  private addKeepWarm(fn: NodejsFunction, override: boolean | undefined): void {
    const raw: unknown = this.node.tryGetContext("crm:keepWarm");
    const enabled = override ?? (raw === undefined ? true : String(raw) !== "false");
    new events.Rule(this, "KeepWarmRule", {
      description: "Keeps crm-api-trpc and its loaded index warm (handler: isWarmEvent).",
      schedule: events.Schedule.rate(Duration.minutes(KEEP_WARM_RATE_MINUTES)),
      enabled,
      targets: [
        new targets.LambdaFunction(fn, {
          event: events.RuleTargetInput.fromObject(KEEP_WARM_EVENT),
          retryAttempts: 0,
        }),
      ],
    });
  }

  private grantModelAccess(
    fn: NodejsFunction,
    aiProvider: string,
    agentModelId: string,
    secretArnOverride?: string,
  ): void {
    if (aiProvider === "gateway") {
      // Wired but off: the deployed provider stays Bedrock. Choosing gateway needs the secret that
      // holds the key (created outside this stack, never by it); the key is read at cold start by
      // apps/api/src/agent/getModel.ts and never lands in an env var, a log or the template.
      const raw: unknown = secretArnOverride ?? this.node.tryGetContext("crm:aiGatewaySecretArn");
      const secretArn = typeof raw === "string" ? raw.trim() : "";
      if (secretArn === "") {
        Annotations.of(this).addError(
          "AI_PROVIDER=gateway needs the AI Gateway key from Secrets Manager (never an env literal): set the CDK context crm:aiGatewaySecretArn to the secret's ARN (cdk synth -c crm:aiGatewaySecretArn=arn:aws:secretsmanager:...), or deploy with AI_PROVIDER=bedrock.",
        );
        return;
      }
      if (!SECRET_ARN_PATTERN.test(secretArn)) {
        Annotations.of(this).addError(
          `crm:aiGatewaySecretArn "${secretArn}" is not a Secrets Manager secret ARN (arn:aws:secretsmanager:<region>:<account>:secret:<name>).`,
        );
        return;
      }
      fn.addEnvironment("AI_GATEWAY_SECRET_ARN", secretArn);
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "ReadAiGatewayKey",
          actions: ["secretsmanager:GetSecretValue"],
          resources: [secretArn],
        }),
      );
      return;
    }
    if (aiProvider !== "bedrock") {
      Annotations.of(this).addError(`Unsupported AI_PROVIDER "${aiProvider}".`);
      return;
    }

    const [geo, ...rest] = agentModelId.split(".");
    const destinationRegions =
      geo === undefined ? undefined : BEDROCK_GEO_PROFILE_DESTINATION_REGIONS[geo];
    if (destinationRegions === undefined || rest.length === 0) {
      Annotations.of(this).addError(
        `AGENT_MODEL_ID "${agentModelId}" is not a known geographic inference profile id (expected "<geo>.<model id>" with geo in ${Object.keys(BEDROCK_GEO_PROFILE_DESTINATION_REGIONS).join(", ")}).`,
      );
      return;
    }
    const foundationModelId = rest.join(".");
    // A literal partition (not the `AWS::Partition` pseudo-parameter) when the region is known,
    // so the synthesized policy reads as plain ARNs a reviewer can check against
    // GetInferenceProfile's own output.
    const partition =
      (Token.isUnresolved(this.region) ? undefined : RegionInfo.get(this.region).partition) ??
      this.partition;
    const profileArn = this.formatArn({
      partition,
      service: "bedrock",
      resource: "inference-profile",
      resourceName: agentModelId,
    });
    const actions = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"];

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "InvokeAgentInferenceProfile",
        actions,
        resources: [profileArn],
      }),
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "InvokeAgentFoundationModelViaProfile",
        actions,
        resources: destinationRegions.map(
          (region) => `arn:${partition}:bedrock:${region}::foundation-model/${foundationModelId}`,
        ),
        conditions: { StringEquals: { "bedrock:InferenceProfileArn": profileArn } },
      }),
    );
  }
}
