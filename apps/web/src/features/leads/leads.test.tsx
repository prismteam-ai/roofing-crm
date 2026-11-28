import type { Lead } from "@crm/leads-db/schema";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { callsTo, lead, renderApp, withHistory } from "../../../test/mock-api.tsx";

vi.mock("../map/webgl.ts", () => ({ webglAvailable: () => false }));

const open = async (l: Lead) =>
  fireEvent.click(within(await screen.findByTestId(`lead-${l.propertyId}`)).getByRole("button"));

describe("leads page", () => {
  test("filters by roof age, open years, permit status and radius", async () => {
    const { calls } = renderApp(
      { "leads.list": () => [lead()] },
      { hash: "#/leads", initialSearch: { placeName: "Fort Lauderdale" } },
    );
    await screen.findByTestId("lead-504202150320");
    fireEvent.change(screen.getByLabelText(/Roof age ≥/), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText(/Permit open ≥/), { target: { value: "5" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Permit status" })).getByLabelText("Other"));
    fireEvent.click(screen.getByLabelText(/Within/));
    fireEvent.change(screen.getByLabelText("Lead radius in miles"), { target: { value: "3" } });
    await waitFor(() =>
      expect(callsTo(calls, "leads.list").at(-1)?.input).toEqual({
        minRoofAgeYears: 20,
        minOpenYears: 5,
        permitStatus: ["open", "needs_review"],
        near: { center: { lat: 26.15, lon: -80.3 }, radiusMiles: 3 },
      }),
    );
  });

  test("the status control offers only allowed transitions", async () => {
    const l = lead();
    const { calls } = renderApp(
      {
        "leads.list": () => [l],
        "leads.get": () => withHistory(l),
        "leads.updateStatus": ({ status }) => ({ ...l, status }),
      },
      { hash: "#/leads" },
    );
    await open(l);
    const select = await screen.findByLabelText("Change status");
    expect([...select.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "Move to…",
      "Contacted",
      "Lost",
    ]);
    fireEvent.change(select, { target: { value: "contacted" } });
    await waitFor(() =>
      expect(callsTo(calls, "leads.updateStatus")[0]?.input).toEqual({ id: "L1", status: "contacted" }),
    );
  });

  test("a stale lead shows a badge and its reason", async () => {
    const l = lead({ stale: true, staleReason: "roof age changed 85 → 2 in run bafyNEW" });
    renderApp({ "leads.list": () => [l], "leads.get": () => withHistory(l) }, { hash: "#/leads" });
    const row = await screen.findByTestId("lead-504202150320");
    expect(within(row).getByText("stale")).toHaveAttribute("title", "roof age changed 85 → 2 in run bafyNEW");
    await open(l);
    expect(await screen.findByText(/Stale: roof age changed 85 → 2/)).toBeInTheDocument();
  });

  test("adding a note appends it to the timeline", async () => {
    const l = lead();
    const notes: { at: string; body: string }[] = [];
    renderApp(
      {
        "leads.list": () => [l],
        "leads.get": () => withHistory(l, [...notes]),
        "leads.addNote": ({ body }) => {
          const n = { at: "2026-11-27T12:00:00.000Z", body };
          notes.push(n);
          return n;
        },
      },
      { hash: "#/leads" },
    );
    await open(l);
    fireEvent.change(await screen.findByLabelText("Add a note"), {
      target: { value: "Owner asked for a quote" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(screen.getByTestId("timeline")).toHaveTextContent("Owner asked for a quote"));
    expect(screen.getByTestId("timeline")).toHaveTextContent("Lead created");
  });

  test("the contact action is disabled with a tooltip", async () => {
    const l = lead();
    renderApp({ "leads.list": () => [l], "leads.get": () => withHistory(l) }, { hash: "#/leads" });
    await open(l);
    const btn = await screen.findByRole("button", { name: "Contact" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Outreach coming soon");
  });

  test("'Show on map' centers the map on the lead", async () => {
    const l = lead();
    renderApp({ "leads.list": () => [l], "leads.get": () => withHistory(l) }, { hash: "#/leads" });
    await open(l);
    fireEvent.click(await screen.findByRole("button", { name: "Show on map" }));
    await waitFor(() =>
      expect(screen.getByTestId("center-label")).toHaveTextContent("1515 NE 2 ST (26.1236, -80.1268)"),
    );
  });
});
