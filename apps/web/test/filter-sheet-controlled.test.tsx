// B-03 FilterSheet tests (tasks.md T025a; AC-3, AC-5, FR-003, FR-005). Originally replaced the
// A-13/ORACLE-u version this file was copied from; updated again for the structural-rebuild fix
// (B-03, 2026-10-24) that removed the duplicate legacy controls (a standalone "Roof age" number
// field and a "Show open permits" checkbox) the earlier rebuild had left in place beside the new
// roof-age chips and permit-status controls. CRM-HANDOFF §4.2 names exactly one roof-age control
// (chips, or any number in "Other") and this file now tests that single control, plus the
// permit-status/permit-open-years controls which replaced the old checkbox (filter-sheet-
// extended.test.tsx covers their own cases in more depth).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOF_AGE_YEARS } from "@crm/domain";
import { committedRoofAge, FilterSheet } from "../src/routes/Map/FilterSheet";

afterEach(cleanup);

function renderSheet(
  overrides: Partial<Parameters<typeof FilterSheet>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <FilterSheet
      roofAgeMinYears={DEFAULT_ROOF_AGE_YEARS}
      onRoofAgeMinYearsChange={vi.fn()}
      permitStatus="any"
      onPermitStatusChange={vi.fn()}
      permitOpenYrs={undefined}
      onPermitOpenYrsChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("FilterSheet", () => {
  it("shows an Any chip that is pressed only when there is no roof filter, and choosing it sends undefined", () => {
    const onChange = vi.fn();
    renderSheet({ onRoofAgeMinYearsChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "15" }).getAttribute("aria-pressed")).toBe("true");
    expect(
      within(screen.getByRole("group", { name: "Roof age threshold", hidden: true }))
        .getByRole("button", { name: "Any", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    fireEvent.click(
      within(screen.getByRole("group", { name: "Roof age threshold", hidden: true })).getByRole(
        "button",
        { name: "Any", hidden: true },
      ),
    );
    expect(onChange).toHaveBeenCalledWith(undefined);
    cleanup();
    renderSheet({ roofAgeMinYears: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      within(screen.getByRole("group", { name: "Roof age threshold", hidden: true }))
        .getByRole("button", { name: "Any", hidden: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "15" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("B-03-TC-011: shows the roof-age 'Other' field with the default placeholder, and no second 'Roof age' field", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const input = screen.getByLabelText("Other, yrs or older") as HTMLInputElement;
    expect(input.value).toBe("15");
    // Only ONE roof-age control: the chip row's own label "Roof age ≥" is a <span>, not a
    // second <label htmlFor>, so there is exactly one labelled roof-age text box.
    expect(screen.queryAllByLabelText("Roof age")).toHaveLength(0);
  });

  it("commits an integer roof-age threshold typed into 'Other'", () => {
    const onChange = vi.fn();
    renderSheet({ roofAgeMinYears: 15, onRoofAgeMinYearsChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const input = screen.getByLabelText("Other, yrs or older");
    fireEvent.change(input, { target: { value: "25" } });
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it("an emptied 'Other' box clears the filter (undefined, never 0) — FR-003's 'no filter' state", () => {
    const onChange = vi.fn();
    renderSheet({ roofAgeMinYears: 15, onRoofAgeMinYearsChange: onChange });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const input = screen.getByLabelText("Other, yrs or older");
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("there is no 'Show open permits' checkbox (removed as a duplicate of Permit status)", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByRole("checkbox", { name: "Show open permits" })).toBeNull();
  });

  it("the sheet opens behind the 'Filters' button and closes with the X", () => {
    renderSheet();
    const toggle = screen.getByRole("button", { name: "Filters" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape closes the open sheet", () => {
    renderSheet();
    const toggle = screen.getByRole("button", { name: "Filters" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking the backdrop closes the open sheet", () => {
    const { container } = renderSheet();
    const toggle = screen.getByRole("button", { name: "Filters" });
    fireEvent.click(toggle);
    const backdrop = container.querySelector("[aria-hidden='true']");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("committedRoofAge", () => {
  it("rounds a decimal to the nearest integer", () => {
    expect(committedRoofAge("15.6")).toBe(16);
  });

  it("clamps a negative value to 0, never a negative age", () => {
    expect(committedRoofAge("-5")).toBe(0);
  });

  it("an empty string is 'no filter' (undefined), not 0", () => {
    expect(committedRoofAge("")).toBeUndefined();
  });

  it("non-numeric text is 'no filter' (undefined), never NaN", () => {
    expect(committedRoofAge("abc")).toBeUndefined();
  });
});

describe("FilterSheet role", () => {
  it("is a dialog as a sheet, and a region when it is a permanent pane beside the map", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).not.toBeNull();
    cleanup();
    renderSheet({ inline: true });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("region", { name: "Filters" })).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
  });
});
