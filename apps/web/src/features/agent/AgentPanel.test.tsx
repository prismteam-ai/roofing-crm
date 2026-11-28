import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FakeMap } from "../../../test/fake-maplibre.ts";
import { FTL, renderApp } from "../../../test/mock-api.tsx";

vi.mock("../map/webgl.ts", () => ({ webglAvailable: () => true }));
vi.mock("maplibre-gl", async () => (await import("../../../test/fake-maplibre.ts")).maplibreMock());

const answer = {
  text: "2 permits have been open over 5 years.",
  results: [{ propertyId: "504202150320", lat: 26.1236, lon: -80.1268, label: "1515 NE 2 ST" }],
  citations: [{ propertyId: "504202150320", permitId: "ftl:R-1", sourceUrl: "https://ftl.gov/permit/R-1" }],
  assumptions: ['"Fort Lauderdale" was resolved to FORT LAUDERDALE (26.1412, -80.1467).'],
  missingData: ["No BBB rating is published for these contractors."],
  steps: [
    { tool: "resolve_place", args: { name: "Fort Lauderdale" }, rowCount: 1, sample: [] },
    {
      tool: "find_open_roof_permits",
      args: { radiusMiles: 5, minOpenYears: 5 },
      rowCount: 2,
      sample: ["ftl:R-1", "ftl:R-2"],
    },
  ],
  context: { center: FTL, radiusMiles: 5, placeName: "FORT LAUDERDALE" },
  model: "mock",
  usage: { totalTokens: 10 },
};

afterEach(() => vi.unstubAllGlobals());

const ask = (q: string) => {
  fireEvent.change(screen.getByLabelText("Question"), { target: { value: q } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
};

describe("agent panel", () => {
  test("renders assumptions, the 'Retrieved evidence' list and 'Show on map'; follow-ups send the previous context", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    FakeMap.instances = [];
    renderApp({});
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    act(() => FakeMap.instances[0].emit("load"));

    ask("open roofing permits older than five years within five miles of Fort Lauderdale");
    expect(await screen.findByText(answer.text)).toBeInTheDocument();
    expect(screen.getByText(answer.assumptions[0])).toBeInTheDocument();
    expect(screen.getByText(answer.missingData[0])).toBeInTheDocument();
    expect(screen.getByText(/Retrieved evidence \(2 tool calls\)/)).toBeInTheDocument();
    expect(screen.getByText("find_open_roof_permits").parentElement).toHaveTextContent(
      "→ 2 rows (e.g. ftl:R-1, ftl:R-2)",
    );
    expect(screen.getByRole("link", { name: "ftl:R-1" })).toHaveAttribute(
      "href",
      "https://ftl.gov/permit/R-1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Show 1 result on map" }));
    await waitFor(() => expect(FakeMap.instances[0].getSource("agent")?.data.features).toHaveLength(1));
    expect(screen.getByTestId("center-label")).toHaveTextContent("FORT LAUDERDALE");

    ask("which of those near that area have permits open over 8 years?");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body.history.at(-1)).toMatchObject({ role: "assistant", context: answer.context });
    expect(body.mapContext).toEqual({ center: FTL, radiusMiles: 5 });
  });

  test("a budget or outage error is shown as a friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "The assistant has used today's question budget." }), {
            status: 429,
          }),
      ),
    );
    renderApp({});
    ask("aged roofs near Weston");
    expect(await screen.findByText("The assistant has used today's question budget.")).toBeInTheDocument();
  });
});
