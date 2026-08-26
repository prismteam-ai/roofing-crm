/**
 * CDK stack that deploys the tRPC API Lambda behind API Gateway HTTP API.
 *
 * Publishes the default execute-api HTTPS URL (no custom domain). CORS origins
 * accept an Amplify placeholder until the SPA host is known.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import { ELEPHANT_MCP_LAMBDA_ENV } from "../../src/elephant-mcp-env.js";
import { DEFAULT_RAG_INDEX_NAME } from "../../src/rag/opensearch-retrieval-index.js";
import { CHESTER_DEMO_RAG_READ_ALIAS } from "../../src/rag/chester-demo-rag-contract.js";

const apiStackDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const apiPackageRootPath = path.join(apiStackDirectoryPath, "../..");
const monorepoRootPath = path.join(apiPackageRootPath, "../..");

/**
 * Placeholder Amplify origin until the SPA host exists.
 * API Gateway CORS requires an explicit origin string (not a wildcard subdomain).
 */
export const AMPLIFY_WEB_ORIGIN_PLACEHOLDER =
  "https://amplify-origin-placeholder.amplifyapp.com";

/**
 * tRPC HTTP methods attached to Lambda. OPTIONS is omitted on purpose:
 * a catch-all method forwards preflight to tRPC, which returns 415 and the
 * browser treats CORS as failed even when ACAO is present.
 */
const TRPC_LAMBDA_HTTP_METHODS = [
  apigatewayv2.HttpMethod.GET,
  apigatewayv2.HttpMethod.POST,
];

export interface ApiStackProps extends cdk.StackProps {
  /**
   * LeadRecord DynamoDB table from LeadsStack.
   */
  leadRecordTable: dynamodb.ITable;

  /**
   * Browser origins allowed by CORS. Defaults to the Amplify placeholder so
   * deploy succeeds before the SPA URL exists; replace with the real Amplify
   * origin after hosting is created.
   */
  amplifyWebOrigins?: string[];

  /**
   * Optional RagStack outputs for OpenSearch-backed agent.ask.
   */
  ragOpenSearchEndpoint?: string;
  ragIndexName?: string;
  ragCorpusBucket?: s3.IBucket;
  ragOpenSearchDomainArn?: string;
}

/**
 * Provisions the public tRPC HTTP API (Lambda + API Gateway v2, no custom domain).
 */
export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigatewayv2.HttpApi;
  public readonly trpcHandler: lambda.DockerImageFunction;
  public readonly trpcHandlerLiveAlias: lambda.Alias;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const amplifyWebOrigins = props.amplifyWebOrigins ?? [
      AMPLIFY_WEB_ORIGIN_PLACEHOLDER,
    ];

    const serviceName = "roofing-crm-api";

    const ragOpenSearchEndpoint = props.ragOpenSearchEndpoint;
    const ragIndexName = props.ragIndexName ?? DEFAULT_RAG_INDEX_NAME;

    const trpcHandlerImage = new ecr_assets.DockerImageAsset(this, "TrpcHandlerImage", {
      directory: monorepoRootPath,
      file: path.join("apps", "api", "Dockerfile.lambda"),
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    // Slowking runtime quality: the account's total concurrency quota is 10 and
    // Lambda requires unreserved >= 10, so any reserved/provisioned concurrency
    // is rejected at deploy (verified 2026-08-24: PC=1 on the live alias failed with
    // "decreases account's UnreservedConcurrentExecution below its minimum value").
    // Until a quota increase lands, EventBridge MCP warmup (below) keeps DuckDB hot.
    this.trpcHandler = new lambda.DockerImageFunction(this, "TrpcHandler", {
      code: lambda.DockerImageCode.fromEcr(trpcHandlerImage.repository, {
        tagOrDigest: trpcHandlerImage.imageTag,
      }),
      memorySize: 2048,
      timeout: cdk.Duration.seconds(120),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        POWERTOOLS_SERVICE_NAME: serviceName,
        POWERTOOLS_METRICS_NAMESPACE: "RoofingCrmApi",
        // elephant-mcp writes SQLite under $HOME; Lambda only allows /tmp writes.
        HOME: "/tmp",
        TMPDIR: "/tmp",
        LEAD_RECORD_TABLE_NAME: props.leadRecordTable.tableName,
        ...(ragOpenSearchEndpoint !== undefined
          ? {
              OPENSEARCH_ENDPOINT: ragOpenSearchEndpoint,
              RAG_INDEX_NAME: ragIndexName,
              // Titan embed on-demand quota is 0 in this account; hash
              // embeddings must match the RagIndexer setting (rag-stack.ts).
              RAG_USE_BEDROCK_EMBEDDINGS: "0",
              RAG_RETRIEVAL_MODE: "bm25_structured_v1",
              CHESTER_DEMO_RAG_ENABLED: "1",
              CHESTER_DEMO_RAG_READ_ALIAS,
              // Generation falls back to extractive answers on throttle.
              RAG_USE_BEDROCK_GENERATION: "1",
              ...(props.ragCorpusBucket !== undefined
                ? {
                    RAG_CORPUS_BUCKET_NAME: props.ragCorpusBucket.bucketName,
                  }
                : {}),
            }
          : {}),
        ...ELEPHANT_MCP_LAMBDA_ENV,
      },
    });

    props.leadRecordTable.grantReadWriteData(this.trpcHandler);

    if (props.ragCorpusBucket !== undefined) {
      props.ragCorpusBucket.grantRead(this.trpcHandler);
    }

    if (props.ragOpenSearchDomainArn !== undefined) {
      this.trpcHandler.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpHead"],
          resources: [
            props.ragOpenSearchDomainArn,
            `${props.ragOpenSearchDomainArn}/*`,
          ],
        }),
      );
    }

    this.trpcHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-lite-v1:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-micro-v1:0`,
        ],
      }),
    );

    const trpcHandlerVersion = this.trpcHandler.currentVersion;
    this.trpcHandlerLiveAlias = new lambda.Alias(this, "TrpcHandlerLiveAlias", {
      aliasName: "live",
      version: trpcHandlerVersion,
    });

    this.httpApi = new apigatewayv2.HttpApi(this, "HttpApi", {
      apiName: "roofing-crm-challenge-api",
      description:
        "tRPC HTTP API for roofing-crm-challenge (execute-api URL, no custom domain)",
      corsPreflight: {
        allowOrigins: amplifyWebOrigins,
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.PATCH,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Content-Type", "Authorization", "x-trpc-source", "trpc-accept"],
        // Public demo: SPA calls without cookies; revisit when auth lands.
        allowCredentials: false,
      },
    });

    const lambdaIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      "TrpcLambdaIntegration",
      this.trpcHandlerLiveAlias,
      {
        // HTTP API max ~29s. Lambda timeout is 120s, so MCP overruns
        // surface as API Gateway 503 rather than a tRPC error body.
        timeout: cdk.Duration.seconds(29),
      },
    );

    this.httpApi.addRoutes({
      path: "/{proxy+}",
      methods: TRPC_LAMBDA_HTTP_METHODS,
      integration: lambdaIntegration,
    });

    // tRPC clients often hit the API root as well as nested procedure paths.
    this.httpApi.addRoutes({
      path: "/",
      methods: TRPC_LAMBDA_HTTP_METHODS,
      integration: lambdaIntegration,
    });

    const mcpWarmupRule = new events.Rule(this, "TrpcMcpWarmupRule", {
      description: "Keep elephant-mcp queryProperties warm; HTTP API times out at 29s",
      schedule: events.Schedule.rate(cdk.Duration.minutes(4)),
    });
    mcpWarmupRule.addTarget(
      new targets.LambdaFunction(this.trpcHandlerLiveAlias, {
        event: events.RuleTargetInput.fromObject({
          source: "roofing-crm.mcp-warmup",
        }),
      }),
    );

    cdk.Tags.of(this).add("project_name", "roofing-crm-challenge");

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.httpApi.apiEndpoint,
      description: "Public execute-api HTTPS URL for the tRPC API (no custom domain)",
    });

    new cdk.CfnOutput(this, "AmplifyWebOriginsCors", {
      value: amplifyWebOrigins.join(","),
      description:
        "CORS allowOrigins currently configured (replace placeholder after Amplify deploy)",
    });
  }
}
