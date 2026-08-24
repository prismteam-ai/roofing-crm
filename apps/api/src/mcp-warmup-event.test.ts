import { describe, expect, it } from "vitest";
import {
  isMcpWarmupEvent,
  MCP_WARMUP_EVENT_SOURCE,
  MCP_WARMUP_SEARCH_INPUT,
} from "./mcp-warmup-event.js";

describe("MCP warmup event", () => {
  it("recognizes EventBridge warmup payloads and ignores HTTP API events", () => {
    expect(isMcpWarmupEvent({ source: MCP_WARMUP_EVENT_SOURCE })).toBe(true);
    expect(
      isMcpWarmupEvent({
        version: "2.0",
        rawPath: "/search.inRadius",
        requestContext: { http: { method: "GET" } },
      }),
    ).toBe(false);
  });

  it("warms the Fort Myers 2mi Lee pin used by just warmup-search", () => {
    expect(MCP_WARMUP_SEARCH_INPUT).toEqual({
      county: "lee",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 2,
      limit: 5,
    });
  });
});
