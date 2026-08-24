/**
 * Catalog key for a county published by Elephant MCP (wire value, e.g. lee).
 *
 * Only non-empty keys are valid; unpublished or blank input must not become a key.
 */
export type CountyCatalogKey = string & {
  readonly __countyCatalogKeyBrand: unique symbol;
};

/**
 * Parses a raw catalog key into a CountyCatalogKey.
 *
 * Trims and lowercases so UI/API casing variants resolve to the same key.
 * Empty or whitespace-only input throws — it is never a published county.
 */
export function parseCountyCatalogKey(raw: string): CountyCatalogKey {
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error("CountyCatalogKey must be a non-empty published catalog key");
  }
  return normalized as CountyCatalogKey;
}
