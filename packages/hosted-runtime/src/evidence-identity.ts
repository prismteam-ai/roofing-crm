import type { RuntimeIdentity } from "./release";
const fields = ["head", "tree", "buildId", "region", "stage"] as const;
export function assertFrontendIdentity(
  dom: Record<string, string>,
  runtime: Pick<RuntimeIdentity, (typeof fields)[number]>,
  pinned: RuntimeIdentity,
) {
  if (
    pinned.sourceDirty ||
    pinned.stage !== "review" ||
    pinned.region !== "us-east-2" ||
    !/^[a-f0-9]{40}$/.test(pinned.head) ||
    !/^[a-f0-9]{40}$/.test(pinned.tree) ||
    !/^[a-f0-9]{64}$/.test(pinned.buildId)
  )
    throw new Error("Clean pinned frontend package identity required");
  for (const field of fields) {
    const attribute = field === "buildId" ? "data-build-id" : `data-${field}`;
    if (runtime[field] !== pinned[field] || dom[attribute] !== pinned[field])
      throw new Error(
        "Rendered frontend does not match the exact runtime/package identity",
      );
  }
}
export function assertAssetDigests(
  observed: Record<string, string>,
  expected: Record<string, string>,
) {
  if (!Object.keys(expected).length)
    throw new Error("Expected frontend asset manifest is empty");
  for (const [name, digest] of Object.entries(expected)) {
    if (
      !/^assets\/[A-Za-z0-9_.-]+\.(?:js|css)$/.test(name) ||
      !/^[a-f0-9]{64}$/.test(digest) ||
      observed[name] !== digest
    )
      throw new Error(
        "Loaded frontend assets do not match the pinned manifest",
      );
  }
  if (Object.keys(observed).some((name) => !Object.hasOwn(expected, name)))
    throw new Error("Unpinned frontend asset was loaded");
}
