// Filters "Suggestions": one tap sets the roof, permit and owner filters together.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FILTER_PRESETS,
  parseMapQuery,
  patchMapParams,
  presetMatches,
  presetPatch,
} from "../src/routes/Map/ExploreFilters.state";
import { FilterSheet } from "../src/routes/Map/FilterSheet";

afterEach(cleanup);

const WHERE = "lat=30.3&lng=-97.7&r=5&sel=abc";
const apply = (id: string, from = `${WHERE}&roof=any&tenure=3&permit=open&permitYrs=1&ooa=1`) => {
  const preset = FILTER_PRESETS.find((p) => p.id === id);
  if (preset === undefined) throw new Error(id);
  return patchMapParams(new URLSearchParams(from), presetPatch(preset));
};

describe("preset URL state", () => {
  const expected: Record<string, string> = {
    "old-roof-live-permit": "roof=20&permit=open",
    "long-open-permit": "roof=15&permit=open&permitYrs=5",
    "out-of-area-old-roof": "roof=20&ooa=1",
    "long-tenure": "roof=15&tenure=10",
    "stalled-3yrs": "roof=any&permit=stalled&permitYrs=3",
    "oldest-roofs": "roof=25",
  };
  it("has four to six presets", () => {
    expect(FILTER_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(FILTER_PRESETS.length).toBeLessThanOrEqual(6);
    expect(Object.keys(expected).sort()).toEqual(FILTER_PRESETS.map((p) => p.id).sort());
  });
  for (const [id, filters] of Object.entries(expected)) {
    it(`${id} sets exactly its filters, replacing the old ones and keeping place and radius`, () => {
      const next = apply(id);
      const want = new URLSearchParams(filters);
      for (const key of ["roof", "permit", "permitYrs", "tenure", "ooa"]) {
        expect(next.get(key), key).toBe(want.get(key));
      }
      expect(next.get("lat")).toBe("30.3");
      expect(next.get("r")).toBe("5");
      expect(next.get("sel")).toBe("abc");
    });
    it(`${id} is pressed after it is applied, and no other preset is`, () => {
      const q = parseMapQuery(apply(id));
      const state = {
        roofAgeMinYears: q.roofAgeMinYears,
        permitStatus: q.permitStatus,
        permitOpenYrs: q.permitOpenYrs,
        tenureYearsMin: q.tenureYearsMin,
        outOfArea: q.outOfArea,
      };
      expect(FILTER_PRESETS.filter((p) => presetMatches(p, state)).map((p) => p.id)).toEqual([id]);
    });
  }
  it("a default-roof state (no params) matches no preset", () => {
    const q = parseMapQuery(new URLSearchParams(WHERE));
    expect(
      FILTER_PRESETS.some((p) =>
        presetMatches(p, {
          roofAgeMinYears: q.roofAgeMinYears,
          permitStatus: q.permitStatus,
          permitOpenYrs: q.permitOpenYrs,
          tenureYearsMin: q.tenureYearsMin,
          outOfArea: q.outOfArea,
        }),
      ),
    ).toBe(false);
  });
});

function Harness({ onUrl }: { onUrl: (p: URLSearchParams) => void }): ReactElement {
  const [params, setParams] = useState(new URLSearchParams(WHERE));
  const q = parseMapQuery(params);
  onUrl(params);
  return (
    <FilterSheet
      roofAgeMinYears={q.roofAgeMinYears}
      onRoofAgeMinYearsChange={vi.fn()}
      permitStatus={q.permitStatus}
      onPermitStatusChange={vi.fn()}
      permitOpenYrs={q.permitOpenYrs}
      onPermitOpenYrsChange={vi.fn()}
      tenureYearsMin={q.tenureYearsMin}
      outOfArea={q.outOfArea}
      matchCount={7}
      inline
      onApplyPreset={(preset) => setParams((prev) => patchMapParams(prev, presetPatch(preset)))}
      onClear={() =>
        setParams((prev) =>
          patchMapParams(prev, {
            roof: null,
            tenure: null,
            ooa: null,
            permit: null,
            permitYrs: null,
          }),
        )
      }
    />
  );
}

describe("FilterSheet Suggestions", () => {
  it("shows the section after Owner, presses a preset, and Clear resets", () => {
    let last = new URLSearchParams();
    render(<Harness onUrl={(p) => (last = p)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const section = document.querySelector("[data-filter-suggestions]") as HTMLElement;
    const owner = screen.getByRole("group", { name: "Owner" });
    expect(owner.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.textContent).toContain("Suggestions");

    const button = screen.getByRole("button", { name: "Out-of-area owners, roof 20+" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(last.get("ooa")).toBe("1");
    expect(last.get("roof")).toBe("20");
    expect(
      screen
        .getByRole("button", { name: "Out-of-area owners, roof 20+" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    // Changing a filter by hand un-presses it.
    fireEvent.click(screen.getByRole("button", { name: "Stalled permits for 3+ years" }));
    expect(last.get("permit")).toBe("stalled");
    expect(last.get("ooa")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Out-of-area owners, roof 20+" })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(screen.getByText("Clear"));
    expect(last.get("roof")).toBeNull();
    expect(last.get("permit")).toBeNull();
    expect(last.get("lat")).toBe("30.3");
    for (const b of section.querySelectorAll("button")) {
      expect(b.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("is hidden when no apply handler is given", () => {
    render(
      <FilterSheet
        roofAgeMinYears={15}
        onRoofAgeMinYearsChange={vi.fn()}
        permitStatus="any"
        onPermitStatusChange={vi.fn()}
        permitOpenYrs={undefined}
        onPermitOpenYrsChange={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-filter-suggestions]")).toBeNull();
  });

  it("its chips wrap and keep 48 px targets (no horizontal scroll)", () => {
    const css = readFileSync(join(__dirname, "../src/routes/Map/FilterSheet.module.css"), "utf8");
    const rule = (css.match(/\.presetChip \{[^}]*\}/) ?? [""])[0];
    expect(rule).toMatch(/white-space:\s*normal/);
    expect(rule).toMatch(/max-width:\s*100%/);
    expect((css.match(/\.presets \{[^}]*\}/) ?? [""])[0]).toMatch(/flex-wrap:\s*wrap/);
  });
});
