/**
 * Design tests for RoofRadar AI freshness copy.
 */
import { describe, expect, it } from "vitest";

import { formatAgentAskFreshnessCopy } from "../../src/map/format-agent-ask-freshness-copy";

describe("formatAgentAskFreshnessCopy", () => {
  it("names Lee samples without corpus jargon", () => {
    expect(
      formatAgentAskFreshnessCopy({
        corpusSource: "lee_fixture_corpus",
        documentCount: 12,
        indexedAt: "2026-08-24T18:00:00.000Z",
      }),
    ).toBe("Lee County samples · 12 records · as of 2026-08-24");
  });

  it("names published records without an index timestamp when missing", () => {
    expect(
      formatAgentAskFreshnessCopy({
        corpusSource: "published_elephant_mcp",
        documentCount: 1,
        indexedAt: null,
      }),
    ).toBe("Published county records · 1 record");
  });
});
