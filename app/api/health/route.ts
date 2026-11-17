/** Liveness check for the host's readiness probe. */
export function GET() {
  return Response.json({ status: "ok" });
}
