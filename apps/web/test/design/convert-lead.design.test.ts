/**
 * Design tests for converting a published property to a persistent LeadRecord.
 *
 * Uses an injectable LeadRecordApiClient (API stand-in). Asserts create input,
 * list after convert, and remount/reload still reading from the client — never
 * localStorage.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeadRecord } from "@roofing-crm-challenge/shared";

import type { MapLibreMapCanvasProps } from "../../src/map/map-libre-map-canvas-props";
import { MapSearchShell } from "../../src/map/MapSearchShell";
import type { SearchInRadiusCandidate } from "../../src/map/SearchInRadiusCandidateList";
import {
  createMemoryLeadRecordApiClient,
  LeadRecordListPanel,
  type LeadRecordApiClient,
} from "../../src/leads";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/**
 * Stub canvas so jsdom never loads MapLibre GL.
 */
function StubMapLibreMapCanvas(props: MapLibreMapCanvasProps): ReactElement {
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

const SAMPLE_SEARCH_IN_RADIUS_CANDIDATES: SearchInRadiusCandidate[] = [
  {
    propertyId: "lee-prop-301",
    parcelIdentifier: "301",
    latitude: 26.64,
    longitude: -81.87,
    builtYear: 1990,
    addressStreet: "789 Cypress Rd",
    addressCity: "Fort Myers",
    gisMuni: null,
    distanceMiles: 0.8,
  },
];

function confirmConvertPublishedPropertyToLead() {
  fireEvent.click(screen.getByTestId("convert-published-property-to-lead"));
  fireEvent.click(screen.getByTestId("confirm-convert-published-property-to-lead"));
}

function renderMapSearchShell(leadRecordApiClient: LeadRecordApiClient) {
  const view = render(
    createElement(MapSearchShell, {
      defaultCountyKey: "lee",
      MapLibreMapCanvasComponent: StubMapLibreMapCanvas,
      searchInRadiusCandidates: SAMPLE_SEARCH_IN_RADIUS_CANDIDATES,
      leadRecordApiClient,
    }),
  );
  fireEvent.click(screen.getByTestId("map-pin-drop"));
  return view;
}

describe("Convert property to persistent lead", () => {
  // Given a listed Lee property is open in the drawer
  // When the user converts it to a lead
  // Then leads.create is called with that propertyId and county lee
  it("convert calls leads.create with propertyId and lee", async () => {
    const createLeadRecord = vi.fn(
      async (input: { propertyId: string; county: string }) => ({
        leadId: "01TESTLEADCONVERT0000000001",
        propertyId: input.propertyId,
        parcelIdentifier: "301",
        countyKey: "lee" as const,
        municipalityName: null,
        gisMuni: null,
        addressSnapshot: "789 Cypress Rd, Fort Myers",
        builtYear: 1990,
        roofAgeBasis: "structure_year_built" as const,
        structureAgeYears: 36,
        openPermitIds: [],
        maxOpenPermitYears: null,
        contractorName: null,
        bbbRating: null,
        provenanceTier: "sourced",
        leadScore: 0,
        status: "new" as const,
        notes: "",
        createdAt: "2026-08-21T18:00:00.000Z",
        updatedAt: "2026-08-21T18:00:00.000Z",
      }),
    );
    const listLeadRecords = vi.fn(async () => []);
    const leadRecordApiClient: LeadRecordApiClient = {
      createLeadRecord,
      listLeadRecords,
      updateLeadRecord: vi.fn(),
      archiveLeadRecord: vi.fn(),
    };

    renderMapSearchShell(leadRecordApiClient);

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-301"));
    confirmConvertPublishedPropertyToLead();

    await waitFor(() => {
      expect(createLeadRecord).toHaveBeenCalledWith({
        propertyId: "lee-prop-301",
        county: "lee",
        addressSnapshot: "789 Cypress Rd",
      });
    });
  });

  // Given convert succeeded for a Lee property
  // When the Leads panel refreshes from the API client
  // Then the created lead appears in the list
  it("leads route lists the created lead", async () => {
    const leadRecordApiClient = createMemoryLeadRecordApiClient();

    renderMapSearchShell(leadRecordApiClient);

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-301"));
    confirmConvertPublishedPropertyToLead();

    await waitFor(() => {
      const list = screen.getByTestId("lead-record-list");
      expect(list.textContent).toContain("lee-prop-301");
      expect(list.textContent).toContain("789 Cypress Rd");
      expect(list.textContent).toMatch(/01[A-Z0-9]+/i);
      expect(
        screen.getByTestId("convert-published-property-to-lead-status").textContent,
      ).toBe("On your leads list.");
      expect(screen.queryByTestId("convert-published-property-to-lead")).toBeNull();
    });
  });

  // Given a lead was created through the API client
  // When the shell remounts (simulated reload) with the same client
  // Then the lead still lists from the API and localStorage was not used
  it("reload path still lists the lead from the API not localStorage", async () => {
    const leadRecordApiClient = createMemoryLeadRecordApiClient();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const firstMount = renderMapSearchShell(leadRecordApiClient);

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-301"));
    confirmConvertPublishedPropertyToLead();

    await waitFor(() => {
      expect(screen.getByTestId("lead-record-list").textContent).toContain(
        "lee-prop-301",
      );
    });

    const leadIdBeforeReload = screen
      .getByTestId("lead-record-row-lee-prop-301")
      .getAttribute("data-lead-id");

    firstMount.unmount();
    cleanup();

    renderMapSearchShell(leadRecordApiClient);

    await waitFor(() => {
      const row = screen.getByTestId("lead-record-row-lee-prop-301");
      expect(row.textContent).toContain("lee-prop-301");
      expect(row.getAttribute("data-lead-id")).toBe(leadIdBeforeReload);
    });

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    setItemSpy.mockRestore();
  });

  // Given a converted lead is listed
  // When the user clicks the lead row
  // Then the property drawer reopens for that street
  it("clicking a lead row reopens the property drawer", async () => {
    const leadRecordApiClient = createMemoryLeadRecordApiClient();

    renderMapSearchShell(leadRecordApiClient);

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-301"));
    confirmConvertPublishedPropertyToLead();

    await waitFor(() => {
      expect(screen.getByTestId("lead-record-list").textContent).toContain(
        "789 Cypress Rd",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /close roof details/i }));
    await waitFor(() => {
      expect(screen.queryByTestId("published-property-drawer")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("lead-record-select-lee-prop-301"));

    expect(screen.getByTestId("published-property-drawer").textContent).toContain(
      "789 Cypress Rd",
    );
  });

  // Given a converted lead is listed
  // When the user sets status to contacted
  // Then updateLeadRecord is called with contacted
  it("status control calls updateLeadRecord with contacted", async () => {
    const leadRecordApiClient = createMemoryLeadRecordApiClient();
    const updateLeadRecordSpy = vi.spyOn(leadRecordApiClient, "updateLeadRecord");

    renderMapSearchShell(leadRecordApiClient);

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-301"));
    confirmConvertPublishedPropertyToLead();

    await waitFor(() => {
      expect(
        (screen.getByTestId("lead-record-status-lee-prop-301") as HTMLSelectElement)
          .value,
      ).toBe("new");
    });

    const leadId =
      screen.getByTestId("lead-record-row-lee-prop-301").getAttribute("data-lead-id") ??
      "";

    fireEvent.change(screen.getByTestId("lead-record-status-lee-prop-301"), {
      target: { value: "contacted" },
    });

    await waitFor(() => {
      expect(updateLeadRecordSpy).toHaveBeenCalledWith(leadId, "contacted");
      expect(
        (screen.getByTestId("lead-record-status-lee-prop-301") as HTMLSelectElement)
          .value,
      ).toBe("contacted");
    });
  });

  // Given an archived LeadRecord row
  // When the list panel renders it
  // Then no status control is offered
  it("archived leads are not offered status change", () => {
    const archivedLeadRecord: LeadRecord = {
      leadId: "01ARCHIVEDLEAD000000000001",
      propertyId: "lee-prop-archived",
      parcelIdentifier: "archived",
      countyKey: "lee",
      municipalityName: null,
      gisMuni: null,
      addressSnapshot: "100 Archived Ln, Fort Myers",
      builtYear: 1985,
      roofAgeBasis: "structure_year_built",
      structureAgeYears: 41,
      openPermitIds: [],
      maxOpenPermitYears: null,
      contractorName: null,
      bbbRating: null,
      provenanceTier: "sourced",
      leadScore: 0,
      status: "archived",
      notes: "",
      createdAt: "2026-08-21T18:00:00.000Z",
      updatedAt: "2026-08-21T18:00:00.000Z",
    };

    render(
      createElement(LeadRecordListPanel, {
        leadRecords: [archivedLeadRecord],
        leadRecordListStatusMessage: null,
        onUpdateLeadRecord: vi.fn(),
        onArchiveLeadRecord: vi.fn(),
      }),
    );

    expect(screen.queryByTestId("lead-record-status-lee-prop-archived")).toBeNull();
    expect(screen.getByTestId("archive-lead-record-lee-prop-archived")).toBeTruthy();
  });

  // Given a converted lead is listed
  // When the user confirms archive
  // Then the lead leaves the active list and Convert is available again
  it("archive removes the lead and lets Convert run again", async () => {
    const leadRecordApiClient = createMemoryLeadRecordApiClient();

    renderMapSearchShell(leadRecordApiClient);

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-301"));
    confirmConvertPublishedPropertyToLead();

    await waitFor(() => {
      expect(screen.getByTestId("lead-record-list").textContent).toContain(
        "789 Cypress Rd",
      );
    });

    fireEvent.click(screen.getByTestId("archive-lead-record-lee-prop-301"));
    fireEvent.click(screen.getByTestId("confirm-archive-lead-record-lee-prop-301"));

    await waitFor(() => {
      expect(screen.getByTestId("lead-record-list-empty")).toBeTruthy();
    });

    expect(screen.getByTestId("convert-published-property-to-lead").textContent).toBe(
      "Save to leads list",
    );
  });

  it("stamps the floating Leads icon after a successful save", async () => {
    const leadRecordApiClient = createMemoryLeadRecordApiClient();

    renderMapSearchShell(leadRecordApiClient);

    expect(
      screen.getByTestId("plat-floating-bar-leads").getAttribute("data-lead-landed"),
    ).toBe("false");

    fireEvent.click(screen.getByTestId("search-in-radius-candidate-row-lee-prop-301"));
    confirmConvertPublishedPropertyToLead();

    await waitFor(() => {
      expect(
        screen.getByTestId("plat-floating-bar-leads").getAttribute("data-lead-landed"),
      ).toBe("true");
    });
    expect(
      screen.getByTestId("plat-floating-bar-leads").getAttribute("aria-label"),
    ).toMatch(/new lead saved/i);
  });
});
