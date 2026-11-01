export type MapFailureDisposition = "warning" | "retry-initial" | "fatal";

/** The style descriptor is essential; an individual tile, glyph or sprite is not. */
export function mapFailureDisposition(
  event: unknown,
  ready: boolean,
  styleUrl?: string,
): MapFailureDisposition {
  const data = event as {
    sourceId?: unknown;
    tile?: unknown;
    error?: { url?: unknown; status?: unknown; name?: unknown };
  } | null;
  if (data?.sourceId || data?.tile) return "warning";
  const error = data?.error;
  let descriptor = false;
  if (typeof error?.url === "string" && styleUrl) {
    try {
      const actual = new URL(error.url),
        expected = new URL(styleUrl);
      descriptor =
        actual.origin === expected.origin &&
        actual.pathname === expected.pathname;
    } catch {
      // An unclassified resource error is not a reason to discard a working map.
    }
  }
  if (!descriptor) return "warning";
  if (
    [400, 401, 403, 404].includes(Number(error?.status)) ||
    error?.name === "SyntaxError"
  )
    return "fatal";
  return ready ? "warning" : "retry-initial";
}

export const INITIAL_MAP_LOAD_TIMEOUT_MS = 8_000;
export const INITIAL_MAP_RETRY_DELAY_MS = 500;
