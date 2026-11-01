import { createHash } from "node:crypto";
export function canonicalValue(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(canonicalValue)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, item]) => [key, canonicalValue(item)]),
        )
      : value;
}
export function canonicalDigest(value: unknown): string {
  return createHash("sha256")
    .update(
      typeof value === "string" ? value : JSON.stringify(canonicalValue(value)),
    )
    .digest("hex");
}
