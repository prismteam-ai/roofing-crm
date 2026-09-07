import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { McpError } from "@/lib/mcp/types";
import { DatabaseNotConfiguredError } from "@/lib/db/client";

/**
 * Shared JSON error mapping for route handlers.
 *
 * @module http
 */
export function jsonError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
  }
  if (err instanceof RangeError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof McpError) {
    return NextResponse.json({ error: err.message, tool: err.tool }, { status: 502 });
  }
  if (err instanceof DatabaseNotConfiguredError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }
  console.error(err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Unexpected error" },
    { status: 500 },
  );
}

/** Parse URLSearchParams into a plain object (repeated keys keep the last value). */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}
