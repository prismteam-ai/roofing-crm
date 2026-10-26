// Constitution XI ("missing data says why") with the repeated not_in_export notice shown as an icon:
// the reason stays in the page (screen readers) and as a hover tooltip; other reasons stay visible.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MissingReason } from "../src/MissingReason/MissingReason.js";

afterEach(cleanup);

describe("MissingReason", () => {
  it("not_in_export is icon-only: the reason is in the DOM and the title, but not visible text", () => {
    const { container } = render(
      <MissingReason field="unnormalized_address" reason="not_in_export" />,
    );
    const pill = container.querySelector("[data-reason='not_in_export']") as HTMLElement;
    expect(pill.getAttribute("title")).toBe("Not included in the published tables");
    expect(pill.textContent).toContain("Not included in the published tables");
    expect(pill.className).toMatch(/compact/);
    expect(pill.querySelector("[class*='srOnly']")).not.toBeNull();
  });

  it("every other reason stays visible text with no tooltip-only behaviour", () => {
    const { container } = render(<MissingReason field="roof_age_years" reason="no_roof_date" />);
    const pill = container.querySelector("[data-reason='no_roof_date']") as HTMLElement;
    expect(pill.getAttribute("title")).toBeNull();
    expect(pill.className).not.toMatch(/compact/);
    expect(pill.querySelector("[class*='srOnly']")).toBeNull();
  });

  it("a caller's label override is still what the tooltip says for not_in_export", () => {
    const { container } = render(
      <MissingReason
        field="owner_area_class"
        reason="not_in_export"
        label="Owner area not in the tables"
      />,
    );
    expect(container.querySelector("[data-reason='not_in_export']")?.getAttribute("title")).toBe(
      "Owner area not in the tables",
    );
  });
});
