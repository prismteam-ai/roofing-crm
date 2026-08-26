import { describe, expect, it } from "vitest";

import type { ElephantMcpToolClient } from "@roofing-crm-challenge/elephant-client";

import {
  DEFAULT_INDEXER_MAX_MCP_PROPERTIES,
  loadLeeDemoRadiusMcpChunks,
} from "./index-published-roofing-chunks.js";

function buildMockMcpPropertyRow(index: number) {
  const lat = 26.6406 + index * 0.0001;
  const lng = -81.8723 - index * 0.0001;
  return {
    property_id: `lee-prop-mcp-${String(index)}`,
    parcel_identifier: `parcel-mcp-${String(index)}`,
    latitude: lat,
    longitude: lng,
    built_year: 1998,
    address_street: `${String(index)} Palm Ave`,
    address_city: "Fort Myers",
  };
}

describe("index-published-roofing-chunks", () => {
  it("defaults hosted MCP batch size to the queryProperties row cap", () => {
    expect(DEFAULT_INDEXER_MAX_MCP_PROPERTIES).toBe(200);
  });

  it("builds MCP chunks for every property returned inside the demo radius", async () => {
    const propertyRows = Array.from({ length: 12 }, (_, index) =>
      buildMockMcpPropertyRow(index),
    );
    const getOraclePropertyCalls: string[] = [];

    const elephantMcpToolClient: ElephantMcpToolClient = {
      async callTool(toolName, arguments_) {
        if (toolName === "queryProperties") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(propertyRows),
              },
            ],
          };
        }
        if (toolName === "getOracleProperty") {
          const propertyId = String(arguments_.propertyId);
          getOraclePropertyCalls.push(propertyId);
          return {
            propertyId,
            builtYear: 1998,
            permits: [],
          };
        }
        throw new Error(`Unexpected tool ${toolName}`);
      },
    };

    const chunks = await loadLeeDemoRadiusMcpChunks(
      elephantMcpToolClient,
      DEFAULT_INDEXER_MAX_MCP_PROPERTIES,
    );

    const sourcePropertyIds = new Set(chunks.map((chunk) => chunk.propertyId));
    expect(sourcePropertyIds.size).toBe(12);
    expect(chunks.every((chunk) => chunk.provenance === "published_elephant_mcp")).toBe(
      true,
    );
    expect(
      chunks.some(
        (chunk) =>
          chunk.parcel_identifier === "parcel-mcp-0" &&
          chunk.propertyId === "lee-prop-mcp-0",
      ),
    ).toBe(true);
    expect(getOraclePropertyCalls.length).toBe(12);
  });
});
