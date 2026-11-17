import { ZodError } from "zod";
import { workspaceSchema } from "./leads";

/** Run a handler and map failures to honest HTTP errors. */
export async function respond(handler: () => Promise<unknown>, okStatus = 200): Promise<Response> {
  try {
    return Response.json(await handler(), { status: okStatus });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid input", issues: error.issues }, { status: 400 });
    if (error instanceof NotFound) return Response.json({ error: error.message }, { status: 404 });
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 500 });
  }
}

export class NotFound extends Error {}

/** The caller's workspace, sent by the browser on every lead request. */
export function workspaceOf(request: Request): string {
  return workspaceSchema.parse(request.headers.get("x-workspace") ?? "");
}

/** Numbers from a query string, ignoring anything that is not one. */
export function numbers(request: Request, names: string[]): Record<string, number> {
  const params = new URL(request.url).searchParams;
  const out: Record<string, number> = {};
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value !== "" && Number.isFinite(Number(value))) out[name] = Number(value);
  }
  return out;
}
