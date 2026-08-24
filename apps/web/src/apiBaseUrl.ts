/**
 * Resolves the hosted tRPC API base URL for the SPA.
 *
 * Amplify injects `VITE_API_URL` at build time; local Vite may leave it unset.
 */
export function resolveApiBaseUrl(
  environmentApiBaseUrl: string | undefined = import.meta.env.VITE_API_URL,
): string {
  const trimmed = environmentApiBaseUrl?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new Error("VITE_API_URL is required (Amplify branch env or local .env).");
  }
  return trimmed.replace(/\/$/, "");
}
