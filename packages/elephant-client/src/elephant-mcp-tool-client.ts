/**
 * Parses Elephant MCP tool payloads into CRM-usable JSON.
 *
 * MCP stdio/HTTP wrappers often nest JSON in `content[].text`. Callers pass
 * either that envelope or an already-decoded object.
 */

/**
 * Unwraps an MCP tool result into JSON (or the original value when not nested).
 */
export function parseElephantMcpToolJson(rawToolResult: unknown): unknown {
  if (rawToolResult === null || typeof rawToolResult !== "object") {
    return rawToolResult;
  }

  const content = (rawToolResult as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return rawToolResult;
  }

  const textParts: string[] = [];
  for (const part of content) {
    if (
      part !== null &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      textParts.push((part as { text: string }).text);
    }
  }

  if (textParts.length === 0) {
    return rawToolResult;
  }

  const joined = textParts.join("");
  try {
    return JSON.parse(joined) as unknown;
  } catch {
    return joined;
  }
}

/**
 * Reads property rows from a `queryProperties` payload.
 *
 * Accepts a top-level array or a `{ rows }` / `{ data }` object.
 */
export function parseQueryPropertiesRows(rawQueryResult: unknown): unknown[] {
  const payload = parseElephantMcpToolJson(rawQueryResult);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload !== null && typeof payload === "object") {
    const record = payload as { rows?: unknown; data?: unknown };
    if (Array.isArray(record.rows)) {
      return record.rows;
    }
    if (Array.isArray(record.data)) {
      return record.data;
    }
  }
  // Surface the tool's own error text (e.g. DuckDB OOM) instead of hiding it.
  const payloadPreview = JSON.stringify(payload)?.slice(0, 500) ?? "undefined";
  throw new Error(
    `queryProperties payload did not include a row array: ${payloadPreview}`,
  );
}

/**
 * Server-side Elephant MCP tool port.
 *
 * Implemented by stdio/HTTP adapters in `apps/api`. Never imported from the browser.
 */
export interface ElephantMcpToolClient {
  callTool(toolName: string, arguments_: Record<string, unknown>): Promise<unknown>;
}
