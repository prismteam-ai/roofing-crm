/**
 * Design tests for the roofing opportunity agent panel.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import {
  AGENT_PANEL_EMPTY_INVITE_BODY,
  AGENT_PANEL_EMPTY_INVITE_HEADING,
  AGENT_PANEL_NOT_CONNECTED_COPY,
  RoofingOpportunityAgentPanel,
} from "../../src/map/RoofingOpportunityAgentPanel";
import type { AgentAskApiClient } from "../../src/map/create-http-agent-ask-api-client";
import {
  SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_COVERAGE_COPY,
  SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY,
} from "../../src/map/search-in-radius-query-status-copy";

afterEach(() => {
  cleanup();
  stubMapSearchInRadiusCandidates = [];
});

let stubMapSearchInRadiusCandidates: MapLibreMapCanvasProps["searchInRadiusCandidates"] =
  [];

function StubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
  stubMapSearchInRadiusCandidates = props.searchInRadiusCandidates ?? [];
  return createElement(
    "button",
    {
      type: "button",
      "data-testid": "map-pin-drop",
      onClick: () => {
        props.onSearchMapCenterDrop({
          latitude: props.mapViewCenter.latitude,
          longitude: props.mapViewCenter.longitude,
        });
      },
    },
    "Drop pin",
  );
}

describe("Roofing opportunity agent panel design", () => {
  it("shows honest not-indexed copy from agent.ask", async () => {
    const agentAskApiClient: AgentAskApiClient = {
      ask: vi.fn(async () => ({
        answer: SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY,
        indexed: false,
        citations: [],
        confidence: 0,
        coverageNote: SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_COVERAGE_COPY,
      })),
    };

    render(
      createElement(RoofingOpportunityAgentPanel, {
        county: "lee",
        center: { lat: 26.64, lng: -81.87 },
        radiusMiles: 5,
        agentAskApiClient,
      }),
    );

    expect(screen.queryByText("Question")).toBeNull();
    expect(screen.getByTestId("roofing-opportunity-agent-empty-invite")).toBeTruthy();
    expect(
      screen.queryByTestId("roofing-opportunity-agent-connection-status"),
    ).toBeNull();
    expect(
      screen.getByTestId("roofing-opportunity-agent-submit").getAttribute("aria-label"),
    ).toBe("Send");

    fireEvent.change(screen.getByTestId("roofing-opportunity-agent-message"), {
      target: { value: "open roofing permits" },
    });
    fireEvent.click(screen.getByTestId("roofing-opportunity-agent-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("roofing-opportunity-agent-result")).toBeTruthy();
    });
    const result = screen.getByTestId("roofing-opportunity-agent-result");
    expect(result.textContent).toContain(
      SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY,
    );
    expect(result.textContent).toContain(
      SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_COVERAGE_COPY,
    );
    expect(result.textContent).not.toMatch(/Ask is not indexed|sourceUri|API yet/i);
    expect(screen.queryByTestId("roofing-opportunity-agent-empty-invite")).toBeNull();
  });

  it("maps a missing-index API error to the same roofs-in-radius copy", async () => {
    const agentAskApiClient: AgentAskApiClient = {
      ask: vi.fn(async () => {
        throw new Error("OPENSEARCH_ENDPOINT is not set");
      }),
    };

    render(
      createElement(RoofingOpportunityAgentPanel, {
        county: "lee",
        center: { lat: 26.64, lng: -81.87 },
        radiusMiles: 5,
        agentAskApiClient,
      }),
    );

    fireEvent.change(screen.getByTestId("roofing-opportunity-agent-message"), {
      target: { value: "open roofing permits" },
    });
    fireEvent.click(screen.getByTestId("roofing-opportunity-agent-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("roofing-opportunity-agent-result")).toBeTruthy();
    });
    const result = screen.getByTestId("roofing-opportunity-agent-result");
    expect(result.textContent).toContain(
      SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY,
    );
    expect(result.textContent).toContain(
      SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_COVERAGE_COPY,
    );
    expect(result.textContent).not.toMatch(/sourceUri|Fixture layout/i);
    expect(screen.queryByTestId("roofing-opportunity-agent-error")).toBeNull();
  });

  it("shows unmappable copy instead of ask when county is not map-ready", () => {
    const onSwitchToMapReadyCounty = vi.fn();

    render(
      createElement(RoofingOpportunityAgentPanel, {
        county: "chester",
        center: { lat: 39.9607, lng: -75.6055 },
        radiusMiles: 5,
        mapSearchReady: false,
        agentAskApiClient: {
          ask: vi.fn(),
        },
        onSwitchToMapReadyCounty,
      }),
    );

    expect(
      screen.getByTestId("roofing-opportunity-agent-county-not-map-ready"),
    ).toBeTruthy();
    const askForm = screen
      .getByTestId("roofing-opportunity-agent-message")
      .closest("form");
    expect(askForm?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(screen.getByTestId("roofing-opportunity-agent-switch-to-lee"));
    expect(onSwitchToMapReadyCounty).toHaveBeenCalledTimes(1);
  });

  it("invites an empty ask and reports disconnected status beside send", () => {
    render(
      createElement(RoofingOpportunityAgentPanel, {
        county: "lee",
        center: { lat: 26.64, lng: -81.87 },
        radiusMiles: 5,
      }),
    );

    expect(screen.getByTestId("roofing-opportunity-agent-empty-invite")).toBeTruthy();
    expect(screen.getByText(AGENT_PANEL_EMPTY_INVITE_HEADING)).toBeTruthy();
    expect(screen.getByText(AGENT_PANEL_EMPTY_INVITE_BODY)).toBeTruthy();
    expect(screen.getByText(AGENT_PANEL_NOT_CONNECTED_COPY)).toBeTruthy();
    expect(
      screen.getByTestId("roofing-opportunity-agent-submit").hasAttribute("disabled"),
    ).toBe(true);
  });

  it("citation click selects property in map shell", async () => {
    const agentAskApiClient: AgentAskApiClient = {
      ask: vi.fn(async () => ({
        answer: "One property may match.",
        indexed: true,
        confidence: 0.8,
        coverageNote: "Lee fixture only.",
        citations: [
          {
            sourceUri: "elephant://lee/property/lee-prop-202",
            propertyId: "lee-prop-202",
            reason: "Open roofing permit facts published for this street.",
            latitude: 26.6388,
            longitude: -81.8745,
            addressStreet: "202 Palm Ct",
            addressCity: "Fort Myers",
            builtYear: 2005,
          },
        ],
      })),
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [
          {
            propertyId: "lee-prop-202",
            parcelIdentifier: "p-202",
            latitude: 26.6388,
            longitude: -81.8745,
            builtYear: 2005,
            addressStreet: "202 Palm Ct",
            addressCity: "Fort Myers",
            gisMuni: null,
            distanceMiles: 0.4,
          },
        ],
        agentAskApiClient,
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));

    fireEvent.click(screen.getByTestId("plat-floating-bar-chat"));
    expect(screen.getByRole("heading", { name: "RoofRadar AI" })).toBeTruthy();

    fireEvent.change(screen.getByTestId("roofing-opportunity-agent-message"), {
      target: { value: "open roofing permits" },
    });
    fireEvent.click(screen.getByTestId("roofing-opportunity-agent-submit"));

    await waitFor(() => {
      expect(
        screen.getByTestId("roofing-opportunity-agent-citation-lee-prop-202"),
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByTestId("roofing-opportunity-agent-citation-lee-prop-202"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("published-property-drawer")).toBeTruthy();
    });
    expect(
      screen
        .getByTestId("roofing-opportunity-agent-citation-lee-prop-202")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("agent citations render on the map even when absent from the doors list", async () => {
    const agentAskApiClient: AgentAskApiClient = {
      ask: vi.fn(async () => ({
        answer: "One property may match.",
        indexed: true,
        confidence: 0.8,
        coverageNote: "Lee fixture only.",
        citations: [
          {
            sourceUri: "elephant://lee/property/lee-prop-202",
            propertyId: "lee-prop-202",
            reason: "Open roofing permit facts published for this street.",
            latitude: 26.6388,
            longitude: -81.8745,
            addressStreet: "202 Palm Ct",
            addressCity: "Fort Myers",
            builtYear: 2005,
          },
        ],
      })),
    };

    render(
      createElement(MapSearchShell, {
        defaultCountyKey: "lee",
        MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
        searchInRadiusCandidates: [],
        agentAskApiClient,
      }),
    );
    fireEvent.click(screen.getByTestId("map-pin-drop"));
    fireEvent.click(screen.getByTestId("plat-floating-bar-chat"));

    fireEvent.change(screen.getByTestId("roofing-opportunity-agent-message"), {
      target: { value: "open roofing permits" },
    });
    fireEvent.click(screen.getByTestId("roofing-opportunity-agent-submit"));

    await waitFor(() => {
      expect(
        stubMapSearchInRadiusCandidates?.some(
          (candidate) => candidate.propertyId === "lee-prop-202",
        ),
      ).toBe(true);
    });
  });

  it("shows indexed Lee answer with citation chips", async () => {
    const agentAskApiClient: AgentAskApiClient = {
      ask: vi.fn(async () => ({
        answer: "One Lee property has a long-open roofing permit.",
        indexed: true,
        confidence: 0.75,
        coverageNote:
          "Lee County published records only. Chester County is not included.",
        freshness: {
          corpusSource: "lee_fixture_corpus",
          documentCount: 12,
          indexedAt: "2026-08-24T18:00:00.000Z",
        },
        citations: [
          {
            sourceUri: "elephant://lee/property/lee-prop-202",
            propertyId: "lee-prop-202",
            reason: "Open roofing permit facts published for this street.",
            latitude: 26.6388,
            longitude: -81.8745,
            addressStreet: "202 Palm Ct",
            addressCity: "Fort Myers",
            builtYear: 2005,
          },
        ],
      })),
    };

    render(
      createElement(RoofingOpportunityAgentPanel, {
        county: "lee",
        center: { lat: 26.64, lng: -81.87 },
        radiusMiles: 5,
        agentAskApiClient,
      }),
    );

    fireEvent.change(screen.getByTestId("roofing-opportunity-agent-message"), {
      target: { value: "open roofing permits" },
    });
    fireEvent.click(screen.getByTestId("roofing-opportunity-agent-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("roofing-opportunity-agent-result")).toBeTruthy();
    });
    expect(
      screen.queryByText(SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY),
    ).toBeNull();
    expect(
      screen.getByTestId("roofing-opportunity-agent-citation-lee-prop-202"),
    ).toBeTruthy();
    expect(screen.getByTestId("roofing-opportunity-agent-freshness").textContent).toBe(
      "Lee County samples · 12 records · as of 2026-08-24",
    );
  });

  it("shows low-confidence fallback and applies structured map filters", async () => {
    const onApplyStructuredSearchFallback = vi.fn();
    const agentAskApiClient: AgentAskApiClient = {
      ask: vi.fn(async () => ({
        answer: "Not sure enough to pick a door from these records.",
        indexed: true,
        confidence: 0.1,
        coverageNote: "Lee fixture only.",
        citations: [],
        fallback: {
          type: "structured_search",
          searchInRadiusInput: {
            county: "lee",
            center: { lat: 26.64, lng: -81.87 },
            radiusMiles: 5,
            minOpenPermitYears: 5,
          },
        },
      })),
    };

    render(
      createElement(RoofingOpportunityAgentPanel, {
        county: "lee",
        center: { lat: 26.64, lng: -81.87 },
        radiusMiles: 5,
        agentAskApiClient,
        onApplyStructuredSearchFallback,
      }),
    );

    fireEvent.change(screen.getByTestId("roofing-opportunity-agent-message"), {
      target: { value: "open roofing permits" },
    });
    fireEvent.click(screen.getByTestId("roofing-opportunity-agent-submit"));

    await waitFor(() => {
      expect(
        screen.getByTestId("roofing-opportunity-agent-structured-fallback"),
      ).toBeTruthy();
    });
    expect(
      screen.getByText("Not sure enough to pick a door from these records."),
    ).toBeTruthy();
    expect(screen.queryByText(/retrieved records|Ask is not confident/i)).toBeNull();
    fireEvent.click(
      screen.getByTestId("roofing-opportunity-agent-structured-fallback"),
    );
    expect(onApplyStructuredSearchFallback).toHaveBeenCalledWith({
      minStructureAgeYears: undefined,
      minOpenPermitYears: 5,
    });
  });

  it("shows indexed Chester refusal copy distinct from not-indexed copy", async () => {
    const agentAskApiClient: AgentAskApiClient = {
      ask: vi.fn(async () => ({
        answer:
          "RoofRadar AI only covers published Lee County records. West Chester and Chester County are listed but not searchable yet. Walk Lee County to review doors near Fort Myers, or use the map filters.",
        indexed: true,
        confidence: 0,
        coverageNote:
          "Lee County published records only. Chester County is not included yet.",
        citations: [],
      })),
    };

    render(
      createElement(RoofingOpportunityAgentPanel, {
        county: "lee",
        center: { lat: 26.64, lng: -81.87 },
        radiusMiles: 5,
        agentAskApiClient,
      }),
    );

    fireEvent.change(screen.getByTestId("roofing-opportunity-agent-message"), {
      target: { value: "West Chester open permits" },
    });
    fireEvent.click(screen.getByTestId("roofing-opportunity-agent-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("roofing-opportunity-agent-result")).toBeTruthy();
    });
    expect(
      screen.queryByText(SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY),
    ).toBeNull();
    expect(screen.getByText(/West Chester and Chester County/i)).toBeTruthy();
    expect(
      screen.queryByTestId("roofing-opportunity-agent-citation-lee-prop-202"),
    ).toBeNull();
  });
});
