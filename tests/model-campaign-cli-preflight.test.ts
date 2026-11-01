import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSync } from "esbuild";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { P5_LIVE_CORPUS } from "../packages/agent/src/intent/live-corpus";
import { SOURCE_CLOSURE_CORPUS } from "../packages/agent/src/intent/source-corpus";
import {
  CAMPAIGN_LIMITS,
  CAMPAIGN_PHASE,
} from "../packages/agent/src/campaign";
import { canonicalDigest } from "../packages/agent/src/canonical";
const repo = process.cwd(),
  root = mkdtempSync(path.join(os.tmpdir(), "prism-campaign-preflight-")),
  work = path.join(root, "source");
const effectsFile = path.join(work, "effects.json"),
  guard = path.join(work, "guard.mjs"),
  cli = path.join(work, "cli.mjs"),
  output = path.join(root, "private-output");
const account = "234567890123",
  archive = Buffer.from("SYNTHETIC-PREFLIGHT-NOT-A-DEPLOYMENT-PACKAGE"),
  archiveSha = createHash("sha256").update(archive).digest("hex");
let head: string, tree: string;
const git = (...args: string[]) =>
  execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: work,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
beforeAll(() => {
  mkdirSync(work);
  writeFileSync(
    path.join(work, ".gitignore"),
    "build/\ncli.mjs\nguard.mjs\neffects.json\nnode_modules\n",
  );
  writeFileSync(
    path.join(work, "README.md"),
    "Synthetic CLI preflight only. No source records or credentials.\n",
  );
  git("init", "--quiet");
  git("add", ".");
  git(
    "-c",
    "user.name=Synthetic preflight",
    "-c",
    "user.email=synthetic@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "synthetic fixture",
  );
  head = git("rev-parse", "HEAD");
  tree = git("rev-parse", "HEAD^{tree}");
  mkdirSync(path.join(work, "build"));
  writeFileSync(path.join(work, "build/crm-lambda.zip"), archive);
  writeFileSync(
    path.join(work, "build/release-package.json"),
    JSON.stringify({
      identity: {
        head,
        tree,
        sourceDirty: false,
        stage: "review",
        region: "us-east-2",
        buildId: "f".repeat(64),
        contractVersion: "0.5.0",
        contractSha256: "e".repeat(64),
      },
    }),
  );
  symlinkSync(
    path.join(repo, "node_modules"),
    path.join(work, "node_modules"),
    "dir",
  );
  // Compile the actual first-party CLI before the guarded child; its production dependencies stay pinned/external.
  buildSync({
    entryPoints: [path.join(repo, "scripts/model-campaign.ts")],
    outfile: cli,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node24",
    logLevel: "silent",
    banner: {
      js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);',
    },
  });
  writeFileSync(
    guard,
    `import fs from'node:fs';import http from'node:http';import https from'node:https';import net from'node:net';import tls from'node:tls';import cp from'node:child_process';import{syncBuiltinESMExports}from'node:module';
const effects={networkAttempts:0,businessChildAttempts:0,identityReads:[]};
const denyNetwork=()=>{effects.networkAttempts++;throw Error('Network dispatch blocked by synthetic preflight')};
globalThis.fetch=denyNetwork;http.request=denyNetwork;http.get=denyNetwork;https.request=denyNetwork;https.get=denyNetwork;net.connect=denyNetwork;net.createConnection=denyNetwork;net.Socket.prototype.connect=denyNetwork;tls.connect=denyNetwork;
const original=cp.execFileSync;cp.execFileSync=function(file,args,options){const allowed=[['rev-parse','HEAD'],['rev-parse','HEAD^{tree}'],['status','--porcelain']];if(file==='git'&&options?.cwd===process.cwd()&&allowed.some(x=>JSON.stringify(x)===JSON.stringify(args))){effects.identityReads.push(args);return Reflect.apply(original,this,[file,args,options]);}effects.businessChildAttempts++;throw Error('Business child dispatch blocked by synthetic preflight');};
for(const key of['spawn','spawnSync','exec','execSync','execFile','fork'])cp[key]=()=>{effects.businessChildAttempts++;throw Error('Business child dispatch blocked by synthetic preflight');};
process.on('exit',()=>fs.writeFileSync(${JSON.stringify(effectsFile)},JSON.stringify(effects)));syncBuiltinESMExports();`,
  );
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
function run(args: string[], overrides: Record<string, string> = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !name.startsWith("AWS_") &&
        !name.startsWith("PRISM_") &&
        !name.startsWith("BEDROCK_") &&
        name !== "NODE_OPTIONS",
    ),
  );
  Object.assign(env, {
    FORCE_COLOR: "0",
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_CONFIG_FILE: os.devNull,
    AWS_SHARED_CREDENTIALS_FILE: os.devNull,
    PRISM_CLOUD_EXECUTION_APPROVED: "yes",
    PRISM_LIVE_INFERENCE_APPROVED: "yes",
    PRISM_EXPECTED_ACCOUNT_ID: account,
    PRISM_EXPECTED_HEAD: head,
    PRISM_EXPECTED_TREE: tree,
    PRISM_EXPECTED_ARCHIVE_SHA256: archiveSha,
    PRISM_DEPLOY_ASSET_BUCKET: `cdk-prismrvw-assets-${account}-us-east-2`,
    PRISM_AWS_ACTUAL_USD: "36",
    PRISM_AWS_PENDING_USD: "0",
    PRISM_PROJECT_ACTUAL_USD: "36",
    PRISM_PROJECT_PENDING_USD: "0",
    PRISM_REVIEW_ORIGIN: "https://dsynthetic.cloudfront.net",
    PRISM_PRIVATE_OPERATIONS_DIR: output,
    ...overrides,
  });
  const result = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(guard).href, cli, ...args],
    {
      cwd: work,
      env,
      input: "",
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  const effects = JSON.parse(readFileSync(effectsFile, "utf8")) as {
    networkAttempts: number;
    businessChildAttempts: number;
    identityReads: string[][];
  };
  expect(effects.networkAttempts).toBe(0);
  expect(effects.businessChildAttempts).toBe(0);
  expect(existsSync(output)).toBe(false);
  return { ...result, effects };
}
describe.each([false, true])(
  "actual campaign CLI, source-closure=%s",
  (sourceClosure) => {
    const profileArgs = sourceClosure ? ["--source-closure"] : [];
    it("streams the complete exact plan through a pipe without validating private inputs", () => {
      const result = run(profileArgs);
      expect(result.status).toBe(0);
      expect(result.effects.identityReads).toHaveLength(0);
      const corpus = sourceClosure
        ? SOURCE_CLOSURE_CORPUS.map((item) => ({
            ...item,
            contextPlace: "Troy, Michigan",
            classes: ["source-closure"],
          }))
        : P5_LIVE_CORPUS;
      const expected = {
        mode: "plan",
        phase: CAMPAIGN_PHASE,
        profile: sourceClosure
          ? "source-closure-12-retrieval-v3"
          : "original-objective-36-retrieval-v3",
        limits: CAMPAIGN_LIMITS,
        corpus,
        corpusSha256: canonicalDigest(corpus),
        liveCalls: 0,
      };
      expect(JSON.parse(result.stdout)).toEqual(expected);
      expect(result.stdout).toBe(JSON.stringify(expected, null, 2) + "\n");
    });
    it("executes canonical pins/source/package validation and reaches the deliberate cost guard with zero dispatch", () => {
      const result = run([...profileArgs, "--execute"]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "Review cost envelope is missing, invalid or would exceed an authorized ceiling",
      );
      expect(result.stderr).not.toContain("Dedicated task asset bucket/prefix");
      expect(result.effects.identityReads).toEqual([
        ["rev-parse", "HEAD"],
        ["rev-parse", "HEAD^{tree}"],
        ["status", "--porcelain"],
      ]);
    });
  },
);
it("still rejects a mismatched clean-source pin before any dispatch", () => {
  const result = run(["--execute"], { PRISM_EXPECTED_HEAD: "b".repeat(40) });
  expect(result.stderr).toContain(
    "Release requires the exact pinned clean HEAD and tree",
  );
});
it("still rejects a mismatched measured package before any dispatch", () => {
  const result = run(["--execute"], {
    PRISM_EXPECTED_ARCHIVE_SHA256: "b".repeat(64),
  });
  expect(result.stderr).toContain(
    "Measured deployment package does not match the pinned staging release",
  );
});
