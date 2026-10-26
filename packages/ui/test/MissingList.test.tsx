// Missing list: one bullet per reason, collapse past three, keyboard-operable disclosure, real <ul>.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MissingList, type MissingListGroup } from "../src/MissingList/MissingList.js";

afterEach(cleanup);

const group = (n: number, count?: string): MissingListGroup => ({
  key: `r${String(n)}`,
  reason: `Reason ${String(n)}`,
  fields: `field a${String(n)}, field b${String(n)}`,
  count,
});

describe("MissingList", () => {
  it("renders nothing for no groups", () => {
    const { container } = render(<MissingList groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("is a real list: one item per reason, reason verbatim with its fields joined", () => {
    render(<MissingList groups={[group(1), group(2, "25 rows")]} />);
    const list = screen.getByRole("list", { name: "Missing data" });
    expect(list.tagName).toBe("UL");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Reason 1: field a1, field b1");
    expect(items[1]?.textContent).toContain("(25 rows)");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows three bullets, then a Show all N disclosure that reveals the rest", () => {
    render(<MissingList groups={[1, 2, 3, 4, 5].map((n) => group(n))} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const button = screen.getByRole("button", { name: "Show all 5" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.tagName).toBe("BUTTON");
    fireEvent.click(button);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    const back = screen.getByRole("button", { name: "Show fewer" });
    expect(back.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(back);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
