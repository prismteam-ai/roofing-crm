import { describe, expect, it, vi } from "vitest";

import { createHashEmbeddingService } from "./bedrock-embedding-service.js";
import { buildSearchInRadiusFromCorpus } from "./build-search-in-radius-from-corpus.js";
import { createInMemoryRetrievalIndex } from "./in-memory-retrieval-index.js";
import { buildChunksByIdMap, loadLeeFixtureCorpus } from "./load-lee-fixture-corpus.js";
import { loadChesterDemoFixtureCorpus } from "./load-chester-demo-fixture-corpus.js";
import { embedChunksWithHash } from "./opensearch-retrieval-index.js";
import {
  AGENT_NO_OPEN_PERMITS_IN_RADIUS_COPY,
  AGENT_WEST_CHESTER_LEE_INDEX_COPY,
  buildExtractiveRoofingOpportunityAnswer,
  runRoofingOpportunityAgent,
} from "./run-roofing-opportunity-agent.js";
import {
  LEE_DEMO_RADIUS_CENTER,
  LEE_DEMO_RADIUS_MILES,
} from "./index-published-roofing-chunks.js";

async function buildIndexedLeeDependencies() {
  const chunks = await loadLeeFixtureCorpus();
  const retrievalIndex = createInMemoryRetrievalIndex();
  await retrievalIndex.upsertChunks(embedChunksWithHash(chunks));
  return {
    retrievalIndex,
    embeddingService: createHashEmbeddingService(),
    chunksById: buildChunksByIdMap(chunks),
    searchInRadius: buildSearchInRadiusFromCorpus(chunks),
  };
}

describe("runRoofingOpportunityAgent", () => {
  it("answers permit questions with Lee citations when indexed", async () => {
    const dependencies = await buildIndexedLeeDependencies();

    const response = await runRoofingOpportunityAgent(
      {
        county: "lee",
        message: "Which properties have open roofing permits older than five years?",
        center: LEE_DEMO_RADIUS_CENTER,
        radiusMiles: LEE_DEMO_RADIUS_MILES,
      },
      dependencies,
    );

    expect(response.indexed).toBe(true);
    expect(response.citations.length).toBeGreaterThan(0);
    expect(response.citations[0]?.sourceUri).toMatch(/^elephant:\/\/lee\/property\//);
    expect(response.citations[0]?.latitude).toEqual(expect.any(Number));
    expect(response.citations[0]?.longitude).toEqual(expect.any(Number));
    expect(
      response.citations.some((citation) => citation.propertyId === "lee-prop-202"),
    ).toBe(true);
    expect(response.answer.toLowerCase()).not.toContain("chester");
    expect(response.coverageNote.toLowerCase()).toContain(
      "chester county is not included",
    );
  });

  it("refuses West Chester questions on the Lee index without Chester citations", async () => {
    const dependencies = await buildIndexedLeeDependencies();

    const response = await runRoofingOpportunityAgent(
      {
        county: "lee",
        message: "Which roofs in West Chester have open permits?",
        center: LEE_DEMO_RADIUS_CENTER,
        radiusMiles: LEE_DEMO_RADIUS_MILES,
      },
      dependencies,
    );

    expect(response.indexed).toBe(true);
    expect(response.answer).toBe(AGENT_WEST_CHESTER_LEE_INDEX_COPY);
    expect(response.citations).toEqual([]);
    expect(
      response.citations.every((citation) => !citation.sourceUri.includes("chester")),
    ).toBe(true);
    expect(response.answer.toLowerCase()).toContain("west chester");
  });

  it("returns structured-search-only for real Chester without RAG retrieval", async () => {
    const dependencies = await buildIndexedLeeDependencies();
    const searchInRadius = vi.fn(async () => []);

    const response = await runRoofingOpportunityAgent(
      {
        county: "chester",
        message: "open roofing permits near West Chester",
        center: { lat: 39.9607, lng: -75.6055 },
        radiusMiles: 5,
      },
      {
        ...dependencies,
        resolveMapSearchReady: async () => true,
        searchInRadius,
      },
    );

    expect(response.indexed).toBe(false);
    expect(response.citations).toEqual([]);
    expect(response.answer.toLowerCase()).toContain("real chester");
    expect(searchInRadius).not.toHaveBeenCalled();
  });

  it("invokes search.inRadius for structured geo asks and keeps citations in tool results", async () => {
    const dependencies = await buildIndexedLeeDependencies();
    const searchInRadius = vi.fn(async () => [
      {
        propertyId: "lee-prop-202",
        parcelIdentifier: "p-202",
        latitude: 26.6388,
        longitude: -81.8745,
        builtYear: 2005,
        builtYearSource: null,
        addressStreet: "880 Cypress Lane",
        addressCity: "Fort Myers",
        gisMuni: null,
        distanceMiles: 0.4,
        hasPermits: true,
      },
      {
        propertyId: "lee-prop-999",
        parcelIdentifier: "p-999",
        latitude: 26.64,
        longitude: -81.87,
        builtYear: 1990,
        builtYearSource: null,
        addressStreet: "999 Outside Radius St",
        addressCity: "Fort Myers",
        gisMuni: null,
        distanceMiles: 0.2,
        hasPermits: null,
      },
    ]);

    const response = await runRoofingOpportunityAgent(
      {
        county: "lee",
        message:
          "Which properties near Fort Myers have open roofing permits older than five years?",
        center: LEE_DEMO_RADIUS_CENTER,
        radiusMiles: LEE_DEMO_RADIUS_MILES,
      },
      {
        ...dependencies,
        searchInRadius,
      },
    );

    expect(searchInRadius).toHaveBeenCalledTimes(1);
    const citationPropertyIds = response.citations.map(
      (citation) => citation.propertyId,
    );
    expect(
      citationPropertyIds.some((propertyId) => propertyId === "lee-prop-202"),
    ).toBe(true);
    expect(
      response.citations.find((citation) => citation.propertyId === "lee-prop-202")
        ?.parcelIdentifier,
    ).toBe("p-202");
    expect(
      citationPropertyIds.every((propertyId) =>
        ["lee-prop-202", "lee-prop-101", "lee-prop-301"].includes(propertyId),
      ),
    ).toBe(true);
    expect(citationPropertyIds).not.toContain("lee-prop-999");
  });

  it("requires map context for structured geo asks", async () => {
    const dependencies = await buildIndexedLeeDependencies();

    const response = await runRoofingOpportunityAgent(
      {
        county: "lee",
        message: "Which properties have open roofing permits older than five years?",
      },
      dependencies,
    );

    expect(response.citations).toEqual([]);
    expect(response.answer).toContain("pin");
  });

  it("answers permit questions honestly with roof-age citations when the county publishes no permits", async () => {
    // Live Lee has no permit dataset: index only permit-free property chunks.
    const chunks = (await loadLeeFixtureCorpus()).filter(
      (chunk) =>
        chunk.documentKind !== "roofing_permit" &&
        chunk.has_open_roofing_permit !== true,
    );
    const retrievalIndex = createInMemoryRetrievalIndex();
    await retrievalIndex.upsertChunks(embedChunksWithHash(chunks));

    const response = await runRoofingOpportunityAgent(
      {
        county: "lee",
        message:
          "Which properties near Fort Myers have open roofing permits older than five years?",
        center: LEE_DEMO_RADIUS_CENTER,
        radiusMiles: LEE_DEMO_RADIUS_MILES,
      },
      {
        retrievalIndex,
        embeddingService: createHashEmbeddingService(),
        chunksById: buildChunksByIdMap(chunks),
        searchInRadius: buildSearchInRadiusFromCorpus(chunks),
      },
    );

    expect(response.indexed).toBe(true);
    expect(response.answer).toContain(AGENT_NO_OPEN_PERMITS_IN_RADIUS_COPY);
    expect(response.citations.length).toBeGreaterThan(0);
    expect(response.citations[0]?.sourceUri).toMatch(/^elephant:\/\/lee\/property\//);
  });

  it("falls back to extractive answers when generation throws a throttle error", async () => {
    const dependencies = await buildIndexedLeeDependencies();

    const response = await runRoofingOpportunityAgent(
      {
        county: "lee",
        message: "Which properties have open roofing permits older than five years?",
        center: LEE_DEMO_RADIUS_CENTER,
        radiusMiles: LEE_DEMO_RADIUS_MILES,
      },
      {
        ...dependencies,
        generateAnswer: async (arguments_) => {
          try {
            throw new Error("ThrottlingException: rate exceeded");
          } catch {
            return buildExtractiveRoofingOpportunityAnswer(arguments_);
          }
        },
      },
    );

    expect(response.indexed).toBe(true);
    expect(response.citations.length).toBeGreaterThan(0);
    expect(response.answer.toLowerCase()).toContain("published lee county records");
  });

  it("answers Chester-demo permit questions with synthetic citations", async () => {
    const leeChunks = await loadLeeFixtureCorpus();
    const chesterChunks = await loadChesterDemoFixtureCorpus();
    const chunks = [...leeChunks, ...chesterChunks];
    const retrievalIndex = createInMemoryRetrievalIndex();
    await retrievalIndex.upsertChunks(embedChunksWithHash(chunks));

    const response = await runRoofingOpportunityAgent(
      {
        county: "chester-demo",
        message:
          "Which properties near West Chester have open roofing permits at least five years?",
        center: { lat: 39.9607, lng: -75.6055 },
        radiusMiles: 1,
      },
      {
        retrievalIndex,
        embeddingService: createHashEmbeddingService(),
        chunksById: buildChunksByIdMap(chunks),
        searchInRadius: buildSearchInRadiusFromCorpus(chunks),
      },
    );

    expect(response.indexed).toBe(true);
    expect(
      response.citations.some((citation) => citation.propertyId === "1-10-67.24"),
    ).toBe(true);
    expect(response.answer.toLowerCase()).toContain("synthetic");
    expect(response.coverageNote.toLowerCase()).toContain("demo");
    expect(response.answer).not.toBe(AGENT_WEST_CHESTER_LEE_INDEX_COPY);
  });
});
