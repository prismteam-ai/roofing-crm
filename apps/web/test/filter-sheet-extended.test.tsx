// B-03 structural rebuild: the roof-age chip row (CRM-HANDOFF §4.2, chips 10/13/15/20/25) and the
// permit-status/permit-open-years controls. Updated for the duplicate-controls fix (B-03,
// 2026-10-24): permit status/open-years are no longer optional additions kept beside a legacy
// "Show open permits" checkbox — they are the sheet's only permit controls, so their props are
// required and always rendered (filter-sheet-controlled.test.tsx covers the roof-age "Other"
// field and the sheet's open/close behaviour).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  committedTenure,
  filterSummary,
  FilterSheet,
  ROOF_AGE_CHIPS,
} from "../src/routes/Map/FilterSheet";

afterEach(cleanup);

function renderSheet(
  overrides: Partial<Parameters<typeof FilterSheet>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <FilterSheet
      roofAgeMinYears={15}
      onRoofAgeMinYearsChange={vi.fn()}
      permitStatus="any"
      onPermitStatusChange={vi.fn()}
      permitOpenYrs={undefined}
      onPermitOpenYrsChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("FilterSheet roof-age chips", () => {
  it("offers the five named thresholds and highlights the active one", () => {
    renderSheet({ roofAgeMinYears: 15 });
    // Below 840px (this test's jsdom width) the controls sit behind the "Filters" button.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    for (const years of ROOF_AGE_CHIPS) {
      expect(screen.getByRole("button", { name: String(years) })).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: "15" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a chip commits that threshold", () => {
    const onChange = vi.fn();
    renderSheet({ roofAgeMinYears: 15, onRoofAgeMinYearsChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "25" }));
    expect(onChange).toHaveBeenCalledWith(25);
  });
});

describe("FilterSheet permit status and open-years (the sheet's only permit controls)", () => {
  it("shows Open/Stalled/Any and reports the click", () => {
    const onChange = vi.fn();
    renderSheet({ permitStatus: "any", onPermitStatusChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onChange).toHaveBeenCalledWith("open");
  });

  it("the permit-open-years select reports Any as undefined", () => {
    const onChange = vi.fn();
    renderSheet({ permitOpenYrs: 5, onPermitOpenYrsChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Permit open ≥"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("FilterSheet owner group (tenure, out-of-area)", () => {
  const open = (): void => {
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  };

  it("the tenure chip toggles 11 (more than 10 years) on and off and shows aria-pressed", () => {
    const onChange = vi.fn();
    const view = renderSheet({ tenureYearsMin: undefined, onTenureYearsMinChange: onChange });
    open();
    const chip = screen.getByRole("button", { name: "Tenure > 10 yrs" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith(11);
    view.rerender(
      <FilterSheet
        roofAgeMinYears={15}
        onRoofAgeMinYearsChange={vi.fn()}
        permitStatus="any"
        onPermitStatusChange={vi.fn()}
        permitOpenYrs={undefined}
        onPermitOpenYrsChange={vi.fn()}
        tenureYearsMin={11}
        onTenureYearsMinChange={onChange}
      />,
    );
    const on = screen.getByRole("button", { name: "Tenure > 10 yrs" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(on);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("the out-of-area chip toggles and gives its reason only while on", () => {
    const onChange = vi.fn();
    const view = renderSheet({ outOfArea: false, onOutOfAreaChange: onChange });
    open();
    const chip = screen.getByRole("button", { name: "Out-of-area" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-out-of-area-hint]")).toBeNull();
    fireEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith(true);
    view.rerender(
      <FilterSheet
        roofAgeMinYears={15}
        onRoofAgeMinYearsChange={vi.fn()}
        permitStatus="any"
        onPermitStatusChange={vi.fn()}
        permitOpenYrs={undefined}
        onPermitOpenYrsChange={vi.fn()}
        outOfArea
        onOutOfAreaChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Out-of-area" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(document.querySelector("[data-out-of-area-hint]")?.textContent).toContain(
      "Out-of-area compares the owner's mailing ZIP with the county",
    );
    fireEvent.click(screen.getByRole("button", { name: "Out-of-area" }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("the tenure box commits whole years, a blank box turns it off, a bad value is not sent", () => {
    const onChange = vi.fn();
    renderSheet({ tenureYearsMin: 10, onTenureYearsMinChange: onChange });
    open();
    const box = screen.getByLabelText(/Tenure, yrs or more/);
    fireEvent.change(box, { target: { value: "25" } });
    expect(onChange).toHaveBeenLastCalledWith(25);
    fireEvent.change(box, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    onChange.mockClear();
    fireEvent.change(box, { target: { value: "150" } });
    fireEvent.change(box, { target: { value: "2.5" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(committedTenure("0")).toBe(0);
    expect(committedTenure("100")).toBe(100);
    expect(committedTenure("101")).toBeUndefined();
    expect(committedTenure("-1")).toBeUndefined();
  });

  it("shows the two helper texts", () => {
    renderSheet();
    open();
    expect(
      screen.getByText(
        "Tenure: years since the latest dated sale on record; properties without one are left out and counted.",
      ),
    ).not.toBeNull();
    expect(
      screen.getByText(
        "Out-of-area owner: the owner's mailing ZIP is outside the Travis County area (owner_area_class).",
      ),
    ).not.toBeNull();
  });

  it("the summary names the owner filters", () => {
    expect(filterSummary(undefined, "any", undefined, 11, true)).toBe(
      "tenure > 10 · out-of-area owner",
    );
    // A typed value reads as "N or more", never "more than N".
    expect(filterSummary(undefined, "any", undefined, 10, false)).toBe("tenure ≥ 10");
    expect(filterSummary(15, "any", undefined, undefined, false)).toBe("roof ≥ 15");
    expect(filterSummary(undefined, "any", undefined)).toBe("none");
  });

  it("Clear is enabled by an owner filter alone, and the bar shows the note when no count", () => {
    const onClear = vi.fn();
    renderSheet({
      roofAgeMinYears: undefined,
      outOfArea: true,
      inline: true,
      matchCount: undefined,
      matchNote: "Owner filters apply once you pick an area",
      onClear,
    });
    const bar = document.querySelector("[data-match-bar]") as HTMLElement;
    expect(bar.textContent).toContain("Owner filters apply once you pick an area");
    const clear = screen.getByText("Clear");
    expect((clear as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalled();
  });
});
