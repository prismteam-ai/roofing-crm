import { readFile, readdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = process.cwd();
async function markdown(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === "history") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...(await markdown(p)));
    else if (e.name.endsWith(".md")) found.push(p);
  }
  return found;
}
const files = [
  "README.md",
  "IMPLEMENTATION.md",
  "QUICKSTART.md",
  ...(await markdown("docs")),
];
const scripts = (
  JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;
let links = 0,
  commands = 0;
for (const file of files) {
  const source = await readFile(file, "utf8");
  const historical = /^# Historical|^> \*\*Historical/m.test(source);
  for (const m of source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1].split("#")[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const p = path.resolve(path.dirname(file), decodeURIComponent(target));
    if (!p.startsWith(root + path.sep))
      throw new Error("Documentation link escapes source");
    await access(p);
    links++;
  }
  for (const m of (historical ? "" : source).matchAll(
    /\bpnpm\s+(?:run\s+)?([A-Za-z][\w:-]*)/g,
  )) {
    if (!["install", "exec"].includes(m[1]) && !Object.hasOwn(scripts, m[1]))
      throw new Error(`Undeclared documented command in ${file}`);
    commands++;
  }
  if (
    /\b(?:P2|P3|P4|P5)\b|p3-review|BootstraplessSynthesizer|cloudformation deploy/.test(
      source,
    ) &&
    !historical
  )
    throw new Error(
      "Stale phase/deployment identity in active documentation: " + file,
    );
}
const history = JSON.parse(
  await readFile("docs/history/P5_SOURCE_DOCUMENTS.json", "utf8"),
) as {
  base: string;
  documents: { originalPath: string; archivedPath: string; sha256: string }[];
};
for (const record of history.documents) {
  const bytes = await readFile(record.archivedPath);
  const original = execFileSync("git", [
    "show",
    `${history.base}:${record.originalPath}`,
  ]);
  if (
    !bytes.equals(original) ||
    createHash("sha256").update(bytes).digest("hex") !== record.sha256
  )
    throw new Error("Historical documentation identity drift");
}
console.log(
  JSON.stringify({
    status:
      "PASS_CURRENT_DOC_LINKS_COMMAND_TARGETS_AND_EXACT_HISTORICAL_CONTEXT",
    currentDocuments: files.length,
    links,
    documentedCommands: commands,
    historicalDocuments: history.documents.length,
  }),
);
