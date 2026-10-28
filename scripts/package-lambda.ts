import { buildIdentity } from "./build-identity";
import { build } from "esbuild";
import {
  mkdir,
  writeFile,
  readFile,
  stat,
  chmod,
  utimes,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  collectThirdPartyNotices,
  NOTICE_FILE,
  NOTICE_MANIFEST,
} from "./third-party-notices";
const dir = "build/lambda";
const identity = buildIdentity();
await mkdir(dir, { recursive: true });
const result = await build({
  entryPoints: ["apps/api/src/lambda.ts"],
  outfile: `${dir}/index.mjs`,
  bundle: true,
  define: { __PRISM_BUILD__: JSON.stringify(identity) },
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: false,
  metafile: true,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  logLevel: "warning",
});
const notices = await collectThirdPartyNotices({
  root: process.cwd(),
  modules: Object.values(result.metafile!.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, value]) => value.bytesInOutput > 0)
      .map(([name]) => name),
  ),
});
await writeFile(`${dir}/${NOTICE_FILE}`, notices.notices);
await writeFile(`${dir}/${NOTICE_MANIFEST}`, notices.manifest);
await writeFile(
  `${dir}/package.json`,
  JSON.stringify({ type: "module", engines: { node: ">=24" } }) + "\n",
);
const bundle = await readFile(`${dir}/index.mjs`);
const digest = createHash("sha256").update(bundle).digest("hex");
await writeFile(
  `${dir}/PACKAGE_PROOF.json`,
  JSON.stringify(
    {
      identity,
      runtime: "nodejs24.x",
      platform: "linux",
      entry: "index.handler",
      bundleSha256: digest,
      bundleBytes: bundle.length,
      includesSdk: true,
      noticePackageCount: notices.packageCount,
      serviceCalls: 0,
      mode: "local-package-only",
    },
    null,
    2,
  ) + "\n",
);
const members = [
  "index.mjs",
  "package.json",
  "PACKAGE_PROOF.json",
  NOTICE_FILE,
  NOTICE_MANIFEST,
].sort();
for (const name of members) {
  await chmod(`${dir}/${name}`, 0o644);
  await utimes(
    `${dir}/${name}`,
    new Date("2000-01-01T00:00:00Z"),
    new Date("2000-01-01T00:00:00Z"),
  );
}
await rm("build/crm-lambda.zip", { force: true });
execFileSync("zip", ["-X", "-q", "-6", "../crm-lambda.zip", ...members], {
  cwd: dir,
  env: { ...process.env, TZ: "UTC" },
});
await writeFile(
  "build/release-package.json",
  JSON.stringify(
    {
      identity,
      archiveSha256: createHash("sha256")
        .update(await readFile("build/crm-lambda.zip"))
        .digest("hex"),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      bundleSha256: digest,
      zipSha256: createHash("sha256")
        .update(await readFile("build/crm-lambda.zip"))
        .digest("hex"),
      zipBytes: (await stat("build/crm-lambda.zip")).size,
      serviceCalls: 0,
    },
    null,
    2,
  ),
);
