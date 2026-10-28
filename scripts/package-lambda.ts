import { buildIdentity } from "./build-identity";
import { build } from "esbuild";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
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
execFileSync("python3", [
  "-c",
  'import zipfile,pathlib; out=zipfile.ZipFile("build/crm-lambda.zip","w",compression=zipfile.ZIP_DEFLATED);\nfor name in sorted(["index.mjs","package.json","PACKAGE_PROOF.json","THIRD_PARTY_NOTICES.txt","third-party-notices.json"]):\n p=pathlib.Path("build/lambda")/name; i=zipfile.ZipInfo(name,(2000,1,1,0,0,0)); i.compress_type=zipfile.ZIP_DEFLATED; i.external_attr=0o644<<16; out.writestr(i,p.read_bytes())\nout.close()',
]);
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
