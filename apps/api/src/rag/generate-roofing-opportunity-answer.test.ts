import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildExtractiveRoofingOpportunityAnswer,
  generateRoofingOpportunityAnswer,
} from "./generate-roofing-opportunity-answer.js";
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";

const sampleChunk: RoofingOpportunityChunk = {
  chunkId: "lee-prop-202#property-summary",
  propertyId: "lee-prop-202",
  county: "lee",
  documentKind: "property_summary",
  text: "Residential parcel at 880 Cypress Lane, Fort Myers FL.",
  sourceUri: "elephant://lee/property/lee-prop-202",
  built_year: 2005,
  has_open_roofing_permit: true,
  open_permit_years: 6,
  latitude: 26.6388,
  longitude: -81.8745,
};

describe("generateRoofingOpportunityAnswer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses extractive fallback when Bedrock generation is disabled", async () => {
    vi.stubEnv("RAG_USE_BEDROCK_GENERATION", "0");

    const answer = await generateRoofingOpportunityAnswer({
      message: "open roofing permits",
      retrievedChunks: [{ chunk: sampleChunk, score: 0.8 }],
      searchCandidates: [],
      county: "lee",
    });

    expect(answer.toLowerCase()).toContain("published lee county records");
    expect(answer.toLowerCase()).toContain("cypress lane");
  });

  it("buildExtractiveRoofingOpportunityAnswer matches generate path when Bedrock is off", async () => {
    vi.stubEnv("RAG_USE_BEDROCK_GENERATION", "0");
    const arguments_ = {
      message: "open roofing permits",
      retrievedChunks: [{ chunk: sampleChunk, score: 0.8 }],
      searchCandidates: [],
      county: "lee",
    };

    await expect(generateRoofingOpportunityAnswer(arguments_)).resolves.toBe(
      buildExtractiveRoofingOpportunityAnswer(arguments_),
    );
  });
});
