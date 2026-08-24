/**
 * RagStack: managed OpenSearch domain, S3 corpus, indexer scheduler, SAM replay Lambda.
 *
 * Uses a managed OpenSearch domain (service `es`) instead of OpenSearch
 * Serverless because the org SCP explicitly denies `aoss:*` in this account
 * (see p-pq348tvn). The domain is a single small data node — the corpus is a
 * few hundred chunks — but it must be a non-t instance type because the k-NN
 * plugin (knn_vector mapping) is unavailable on t2/t3 search instances.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import type { Construct } from "constructs";

import { DEFAULT_RAG_INDEX_NAME } from "../../src/rag/opensearch-retrieval-index.js";
import { CHESTER_DEMO_RAG_READ_ALIAS } from "../../src/rag/chester-demo-rag-contract.js";
import { ELEPHANT_MCP_LAMBDA_ENV } from "../../src/elephant-mcp-env.js";

/**
 * ESM bundles keep `import.meta.url` (fixture path resolution) working, and the
 * banner restores `require` for transitive CJS deps inside the ESM output.
 */
const ESM_REQUIRE_SHIM_BANNER =
  "import { createRequire } from 'module'; const require = createRequire(import.meta.url);";

const ragStackDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const apiPackageRootPath = path.join(ragStackDirectoryPath, "../..");
const monorepoRootPath = path.join(apiPackageRootPath, "../..");

function copyFixtureCorpusBundlingCommands(outputDir: string): string[] {
  return [
    `mkdir -p ${outputDir}/fixtures/rag/corpus`,
    `cp -R /asset-input/fixtures/rag/corpus/. ${outputDir}/fixtures/rag/corpus/`,
  ];
}

export interface RagStackProps extends cdk.StackProps {
  /**
   * When true, indexer loads fixtures only (no live MCP batch).
   */
  fixtureOnlyIndexer?: boolean;
}

/**
 * Provisions RAG infrastructure separate from the user-facing tRPC API.
 */
export class RagStack extends cdk.Stack {
  public readonly corpusBucket: s3.Bucket;
  public readonly openSearchDomain: opensearch.Domain;
  public readonly openSearchEndpoint: string;
  public readonly indexName: string;
  public readonly indexerFunction: lambda.DockerImageFunction;
  public readonly agentReplayFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: RagStackProps = {}) {
    super(scope, id, props);

    this.indexName = DEFAULT_RAG_INDEX_NAME;

    this.corpusBucket = new s3.Bucket(this, "RagCorpusBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.openSearchDomain = new opensearch.Domain(this, "RagDomain", {
      version: opensearch.EngineVersion.OPENSEARCH_2_19,
      capacity: {
        dataNodes: 1,
        // Smallest graviton data node that supports the k-NN plugin.
        dataNodeInstanceType: "m6g.large.search",
        multiAzWithStandbyEnabled: false,
      },
      ebs: {
        volumeSize: 10,
        volumeType: ec2.EbsDeviceVolumeType.GP3,
      },
      zoneAwareness: { enabled: false },
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: { enabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      // Resource policy delegates to IAM identity policies: only principals in
      // this account granted es:ESHttp* (indexer, replay, tRPC handler) pass.
      accessPolicies: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AccountPrincipal(this.account)],
          actions: ["es:ESHttp*"],
          resources: ["*"],
        }),
      ],
    });

    this.openSearchEndpoint = this.openSearchDomain.domainEndpoint;

    // Same container image as the tRPC API Lambda: elephant-mcp + DuckDB +
    // pre-staged Lee parquet exceed the 250 MB zip Lambda limit, and the image
    // already ships an `indexer.js` entrypoint (see apps/api/Dockerfile.lambda).
    const indexerImage = new ecr_assets.DockerImageAsset(this, "RagIndexerImage", {
      directory: monorepoRootPath,
      file: path.join("apps", "api", "Dockerfile.lambda"),
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    this.indexerFunction = new lambda.DockerImageFunction(this, "RagIndexerV2", {
      code: lambda.DockerImageCode.fromEcr(indexerImage.repository, {
        tagOrDigest: indexerImage.imageTag,
        cmd: ["indexer.handler"],
      }),
      memorySize: 3008,
      timeout: cdk.Duration.minutes(10),
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        // elephant-mcp writes SQLite/DuckDB state under $HOME; Lambda only allows /tmp.
        HOME: "/tmp",
        TMPDIR: "/tmp",
        OPENSEARCH_ENDPOINT: `https://${this.openSearchEndpoint}`,
        RAG_INDEX_NAME: this.indexName,
        RAG_CORPUS_BUCKET_NAME: this.corpusBucket.bucketName,
        RAG_INDEXER_FIXTURE_ONLY: props.fixtureOnlyIndexer === true ? "1" : "0",
        RAG_INDEXER_MAX_MCP_PROPERTIES: "200",
        // Titan embed on-demand quota is 0 in this account (hard 429). Hash
        // embeddings are deterministic and must match the API's query-time
        // setting so kNN vectors compare like-for-like.
        RAG_USE_BEDROCK_EMBEDDINGS: "0",
        RAG_RETRIEVAL_MODE: "bm25_structured_v1",
        RAG_PREFER_CHESTER_DEMO_CORPUS: "1",
        CHESTER_DEMO_RAG_ENABLED: "1",
        CHESTER_DEMO_RAG_READ_ALIAS,
        ...ELEPHANT_MCP_LAMBDA_ENV,
      },
    });

    this.corpusBucket.grantReadWrite(this.indexerFunction);
    this.openSearchDomain.grantReadWrite(this.indexerFunction);

    this.agentReplayFunction = new nodejs.NodejsFunction(
      this,
      "RoofingOpportunityAgentReplay",
      {
        entry: path.join(
          apiPackageRootPath,
          "src/rag/roofing-opportunity-agent-lambda.ts",
        ),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: 1024,
        timeout: cdk.Duration.seconds(60),
        projectRoot: monorepoRootPath,
        depsLockFilePath: path.join(monorepoRootPath, "pnpm-lock.yaml"),
        environment: {
          NODE_OPTIONS: "--enable-source-maps",
          OPENSEARCH_ENDPOINT: `https://${this.openSearchEndpoint}`,
          RAG_INDEX_NAME: this.indexName,
          RAG_USE_BEDROCK_EMBEDDINGS: "0",
          RAG_RETRIEVAL_MODE: "bm25_structured_v1",
        },
        bundling: {
          minify: true,
          sourceMap: true,
          target: "node22",
          format: nodejs.OutputFormat.ESM,
          banner: ESM_REQUIRE_SHIM_BANNER,
          mainFields: ["module", "main"],
          forceDockerBundling: true,
          commandHooks: {
            beforeBundling(): string[] {
              return [];
            },
            beforeInstall(): string[] {
              return [];
            },
            afterBundling(_inputDir: string, outputDir: string): string[] {
              return copyFixtureCorpusBundlingCommands(outputDir);
            },
          },
        },
      },
    );

    this.openSearchDomain.grantRead(this.agentReplayFunction);

    this.indexerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      }),
    );

    const schedulerRole = new iam.Role(this, "RagIndexerSchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    this.indexerFunction.grantInvoke(schedulerRole);

    new scheduler.CfnSchedule(this, "RagIndexerSchedule", {
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: "rate(1 day)",
      target: {
        arn: this.indexerFunction.functionArn,
        roleArn: schedulerRole.roleArn,
      },
    });

    cdk.Tags.of(this).add("project_name", "roofing-crm-challenge");

    new cdk.CfnOutput(this, "RagOpenSearchEndpoint", {
      value: `https://${this.openSearchEndpoint}`,
      description: "Managed OpenSearch domain endpoint for RAG retrieval",
    });

    new cdk.CfnOutput(this, "RagIndexName", {
      value: this.indexName,
      description: "OpenSearch index name for roofing opportunity chunks",
    });

    new cdk.CfnOutput(this, "RagIndexerFunctionName", {
      value: this.indexerFunction.functionName,
      description:
        "Invoke once after deploy to seed OpenSearch before agent.ask traffic",
    });
    new cdk.CfnOutput(this, "RagCorpusBucketName", {
      value: this.corpusBucket.bucketName,
      description: "S3 bucket for indexed corpus JSONL snapshots",
    });
  }
}
