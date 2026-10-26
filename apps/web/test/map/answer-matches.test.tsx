// Ask AI matches render through the SAME components as the filter results (PM review 2026-10-26),
// the List view shows the answer's rows with their source label, and the Missing list groups reasons.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentAnswer } from "@crm/shared";
import type { CrmProperty, Provenanced } from "@crm/index-schema";
import { AnswerMatches } from "../../src/routes/Map/AnswerMatches";
import { AnswerList } from "../../src/routes/Map/Candidates/AnswerList";
import { ResultRow } from "../../src/routes/Map/ResultRow";
import { answerMatchTotal, answerRowsNote, missingGroups } from "../../src/routes/Ask/askCopy";

afterEach(cleanup);

const row = (
  n: number,
  over: Record<string, unknown> = {},
): NonNullable<AgentAnswer["rows"]>[number] =>
  ({
    propertyCid: `bafkreirow${String(n)}`,
    tcadId: `020188${String(n).padStart(4, "0")}`,
    lat: 30.4,
    lon: -97.6,
    citationId: n,
    nearPlace: { name: "Pflugerville", distanceMi: 1.26 },
    roofAgeYears: 24,
    roofAgeBasis: "permit",
    roofAgeConfidence: "high",
    missing: [{ field: "city_name", reason: "not_in_export" }],
    ...over,
  }) as NonNullable<AgentAnswer["rows"]>[number];

const answer = (rows = [row(1), row(2)], matched = 28062): AgentAnswer =>
  ({
    outcome: "answered",
    claims: [],
    citations: [],
    counts: {
      matched,
      shown: rows.length,
      excludedNoCoordinates: 0,
      excludedNoRoofDate: 0,
      truncated: true,
    },
    missing: [{ field: "coordinates", reason: "no_coordinates", count: 3 }],
    rows,
  }) as unknown as AgentAnswer;

const propertyRow = {
  propertyCid: "bafkreiprop",
  requestIdentifier: "0201885122",
  latitude: 30.4,
  longitude: -97.6,
  coordinateSource: "gis_centroid",
  propertyType: "Residential",
  propertyUsageType: null,
  roofAgeYears: 24,
  roofAgeBasis: "permit",
  roofAgeConfidence: "high",
  isLongTenure: null,
  ownerKind: null,
  ownerAreaClass: null,
  ownerIsOutOfArea: null,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [],
  capturedAt: "2026-10-20T00:00:00Z",
  cid: "bafkreitablecid",
  runId: "run-3",
} as unknown as Provenanced<CrmProperty>;

const inRouter = (ui: React.ReactElement): ReturnType<typeof render> =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("one match design for filter and AI rows", () => {
  it("a filter row and an answer row are the same card component with the same structure", () => {
    const { container: filterC } = render(
      <ResultRow row={propertyRow} onSelect={() => undefined} />,
    );
    const filterCard = filterC.querySelector("article[data-result-row]") as HTMLElement;
    cleanup();
    const { container: aiC } = inRouter(
      <AnswerMatches answer={answer()} focusedCitation={null} onOpen={() => undefined} />,
    );
    const aiCard = aiC.querySelector("article[data-result-row]") as HTMLElement;
    expect(filterCard).not.toBeNull();
    expect(aiCard).not.toBeNull();
    // Same element classes on the card, its header, title, chip row and buttons.
    const shape = (el: HTMLElement): string[] =>
      [el, ...Array.from(el.querySelectorAll("header, h4, button, [class*='badgeRow']"))].map(
        (n) =>
          `${n.tagName}.${(n.getAttribute("class") ?? "")
            .split(" ")
            .filter((c) => c !== "")
            .filter((c) => !/citation|focused/.test(c))
            .join(".")}`,
      );
    expect(shape(aiCard)).toEqual(shape(filterCard));
    expect(within(aiCard).getByRole("button", { name: "Expand details" })).toBeTruthy();
    expect(within(aiCard).getByRole("button", { name: "Open details" })).toBeTruthy();
  });

  it("header 'Matches N' is the real total, the note says the rows are the top part, rows are numbered like the pins", () => {
    inRouter(<AnswerMatches answer={answer()} focusedCitation={2} onOpen={() => undefined} />);
    expect(screen.getByText("Matches 28062")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Showing the top 2 of 28,062 matching properties.",
    );
    const cards = document.querySelectorAll("article[data-result-row]");
    expect(Array.from(cards).map((c) => c.getAttribute("data-citation-id"))).toEqual(["1", "2"]);
    expect(cards[1]?.getAttribute("data-focused")).toBe("true");
    expect(cards[0]?.getAttribute("data-focused")).toBe("false");
    expect(screen.getByText(/Showing 1–2 of the top 2/)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeTruthy();
  });

  it("fields the answer lacks show the same placeholder with an honest reason, never invented", () => {
    inRouter(
      <AnswerMatches
        answer={answer([row(1, { roofAgeConfidence: undefined })])}
        focusedCitation={null}
        onOpen={() => undefined}
      />,
    );
    expect(screen.getByText(/Street address not part of this answer/)).toBeTruthy();
    // No type chip on the card (the same chips as a search card); the reason is in the detail list.
    expect(screen.queryByText(/Type not published/)).toBeNull();
    expect(screen.getByText("Confidence not in this answer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expand details" }));
    expect(document.querySelector("li[data-fields='property_usage_type']")).not.toBeNull();
    expect(screen.getByLabelText("Missing data").tagName).toBe("UL");
    expect(screen.getByText(/No source record attached/)).toBeTruthy();
  });

  it("an answer row with an address leads with it and shows the TCAD id under it, like a search card", () => {
    inRouter(
      <AnswerMatches
        answer={answer([row(1, { address: "1200 CONGRESS AVE" })])}
        focusedCitation={null}
        onOpen={() => undefined}
      />,
    );
    const title = document.querySelector("article[data-result-row] h4") as HTMLElement;
    const parts = Array.from(title.querySelectorAll("span > span")).map((n) => n.textContent);
    expect(parts).toEqual(["1200 CONGRESS AVE", "TCAD 0201880001"]);
    expect(screen.queryByText(/Street address not part/)).toBeNull();
    expect(screen.getByText("Roof 24 yrs")).toBeTruthy();
    expect(screen.getByText(/Confidence/)).toBeTruthy();
  });

  it("totals and notes", () => {
    expect(answerMatchTotal(answer([row(1)], 5))).toBe(5);
    expect(answerMatchTotal(answer([row(1), row(2)], 0))).toBe(2);
    expect(answerRowsNote(answer([row(1)], 1))).toBeUndefined();
  });
});

describe("missingGroups", () => {
  it("groups fields under one verbatim reason and keeps per-row totals", () => {
    const groups = missingGroups([
      { field: "city_name", reason: "not_in_export" },
      { field: "zip_code", reason: "not_in_export" },
      { field: "coordinates", reason: "no_coordinates", count: 25 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.fields).toMatch(/^city, zip/i);
    expect(groups[1]?.count).toBe("25 rows");
  });
});

describe("AnswerList (List view)", () => {
  it("lists the answer's rows with the same columns, a source label and a way back", () => {
    const back = vi.fn();
    inRouter(
      <AnswerList
        answer={answer()}
        asked="roofs older than 15 near Pflugerville"
        onShowFilterResults={back}
        onSelect={() => undefined}
      />,
    );
    expect(
      screen.getByText("From your question: roofs older than 15 near Pflugerville"),
    ).toBeTruthy();
    const headers = screen.getAllByRole("columnheader", { hidden: true }).map((h) => h.textContent);
    expect(headers).toEqual([
      "#",
      "Address",
      "Roof",
      "Basis",
      "Conf.",
      "Permit",
      "Mi",
      "Lat, lon",
      "Actions",
    ]);
    expect(screen.getByText("28,062")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("top 2 of 28,062");
    const numbers = Array.from(document.querySelectorAll("[data-citation-number]")).map(
      (n) => n.textContent,
    );
    expect(numbers).toEqual(["1", "2"]);
    expect(screen.getAllByLabelText("Missing data").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Show filter results" }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("one property, one card", () => {
  const permitRow = row(1, {
    citationId: undefined,
    address: "100 MAIN ST, AUSTIN, TX 78701",
    permit: { permitCid: "bafkreiperm", number: "2001-1 BP", statusClass: "stalled", openDays: 40 },
  });
  const lookup = (): AgentAnswer =>
    ({
      ...answer([row(1), permitRow], 1),
      plan: { intent: "lookup_property" },
    }) as unknown as AgentAnswer;

  it("lists the property once with its permit, counts 1, prints the row's address and no distance", () => {
    const { container } = inRouter(
      <AnswerMatches answer={lookup()} focusedCitation={null} onOpen={() => undefined} />,
    );
    expect(container.querySelectorAll("article[data-result-row]")).toHaveLength(1);
    expect(container.textContent).toContain("100 MAIN ST, AUSTIN, TX 78701");
    expect(container.textContent).not.toMatch(/near Pflugerville/);
  });

  it("the List view counts one match and omits the distance", () => {
    const { container } = inRouter(
      <AnswerList
        answer={lookup()}
        asked="Tell me about TCAD 0201880001"
        onShowFilterResults={() => undefined}
      />,
    );
    expect(container.querySelectorAll("[data-answer-row]")).toHaveLength(1);
    expect(container.querySelector("[data-matches]")?.getAttribute("data-matches")).toBe("1");
    expect(container.textContent).not.toMatch(/near Pflugerville/);
  });
});
