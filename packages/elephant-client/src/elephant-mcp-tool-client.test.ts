import { describe, expect, it } from "vitest";
import {
  parseElephantMcpToolJson,
  parseQueryPropertiesRows,
} from "./elephant-mcp-tool-client.js";

describe("parseElephantMcpToolJson", () => {
  it("parses JSON nested in MCP text content", () => {
    const payload = parseElephantMcpToolJson({
      content: [{ type: "text", text: '{"ok":true}' }],
    });
    expect(payload).toEqual({ ok: true });
  });
});

describe("parseQueryPropertiesRows", () => {
  it("reads a top-level row array", () => {
    const rows = parseQueryPropertiesRows([
      { property_id: "lee-1", latitude: 26.64, longitude: -81.87 },
    ]);
    expect(rows).toHaveLength(1);
  });

  it("reads a rows object", () => {
    const rows = parseQueryPropertiesRows({
      rows: [{ property_id: "lee-2" }],
    });
    expect(rows).toEqual([{ property_id: "lee-2" }]);
  });
});
