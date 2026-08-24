import { describe, expect, it } from "vitest";

import {
  parseRoofingOpportunityChunkJsonl,
  roofingOpportunityChunkSchema,
} from "./roofing-opportunity-chunk.js";
import { hybridRetrieveRoofingChunks } from "./hybrid-retrieve-roofing-chunks.js";
import { createHashEmbeddingService } from "./bedrock-embedding-service.js";
import { buildChunksByIdMap, loadLeeFixtureCorpus } from "./load-lee-fixture-corpus.js";
import { createInMemoryRetrievalIndex } from "./in-memory-retrieval-index.js";
import { embedChunksWithHash } from "./opensearch-retrieval-index.js";
import { isStructuredRoofingSearchQuestion } from "./normalize-roofing-agent-question.js";

const FIXTURE_JSONL = `{"chunkId":"lee-prop-101#property-summary","propertyId":"lee-prop-101","county":"lee","documentKind":"property_summary","text":"Residential parcel at 412 Palm Court, Fort Myers FL. Structure built_year 1998 (roof-age proxy). No open roofing permit on the published row.","sourceUri":"elephant://lee/property/lee-prop-101","built_year":1998,"has_open_roofing_permit":false,"open_permit_years":null,"latitude":26.6412,"longitude":-81.8711}
{"chunkId":"lee-prop-202#permit-roofing","propertyId":"lee-prop-202","county":"lee","documentKind":"roofing_permit","text":"Open roofing permit on lee-prop-202. Permit has remained open about six years.","sourceUri":"elephant://lee/property/lee-prop-202","built_year":2005,"has_open_roofing_permit":true,"open_permit_years":6,"latitude":26.6388,"longitude":-81.8745}`;

describe("roofing-opportunity-chunk", () => {
  it("parses fixture jsonl lines", () => {
    const chunks = parseRoofingOpportunityChunkJsonl(FIXTURE_JSONL);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.sourceUri).toBe("elephant://lee/property/lee-prop-101");
    expect(roofingOpportunityChunkSchema.parse(chunks[1])).toBeTruthy();
  });
});

describe("hybridRetrieveRoofingChunks", () => {
  it("returns open-permit chunks for permit questions", async () => {
    const chunks = parseRoofingOpportunityChunkJsonl(FIXTURE_JSONL);
    const retrievalIndex = createInMemoryRetrievalIndex();
    await retrievalIndex.upsertChunks(embedChunksWithHash(chunks));

    const retrieved = await hybridRetrieveRoofingChunks({
      question: "open roofing permits older than five years near Fort Myers",
      filters: {
        county: "lee",
        hasOpenRoofingPermit: true,
        minOpenPermitYears: 5,
      },
      embeddingService: createHashEmbeddingService(),
      retrievalIndex,
      chunksById: buildChunksByIdMap(chunks),
    });

    expect(retrieved.length).toBeGreaterThan(0);
    expect(retrieved[0]?.chunk.propertyId).toBe("lee-prop-202");
  });

  it("loads lee fixture corpus from disk", async () => {
    const chunks = await loadLeeFixtureCorpus();
    expect(chunks.length).toBeGreaterThanOrEqual(4);
  });
});

describe("normalize-roofing-agent-question", () => {
  it("detects structured geo questions", () => {
    expect(
      isStructuredRoofingSearchQuestion(
        "Show me structures built before 2011 within five miles of Fort Myers.",
      ),
    ).toBe(true);
  });
});
