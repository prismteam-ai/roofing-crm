// Numbered answer pins on the map (Ask in the map, CRM-HANDOFF E-58): the same number as the
// answer's citation, a 48 px hit area, a selected state, and the fit for "Show on map".
import { describe, expect, it, vi } from "vitest";
import { pinBounds, pinElement, setPinSelected } from "../../../src/components/Map/answerPins.js";

describe("pinElement", () => {
  it("is a button carrying the citation number, with a name and a 48 px hit area", () => {
    const el = pinElement(3, false, vi.fn());
    expect(el.tagName).toBe("BUTTON");
    expect(el.textContent).toBe("3");
    expect(el.getAttribute("aria-label")).toBe("Source 3");
    expect(el.dataset.answerPin).toBe("3");
    expect(el.style.width).toBe("48px");
    expect(el.style.height).toBe("48px");
  });

  it("names the property when it is known: Source N: TCAD id", () => {
    const el = pinElement(3, false, vi.fn(), "TCAD 0201885122");
    expect(el.getAttribute("aria-label")).toBe("Source 3: TCAD 0201885122");
    expect(el.textContent).toBe("3");
    expect(pinElement(2, false, vi.fn(), "").getAttribute("aria-label")).toBe("Source 2");
  });

  it("uses Atlas tokens, never a colour literal", () => {
    const html = pinElement(1, false, vi.fn()).outerHTML;
    expect(html).toContain("var(--md-sys-color-primary)");
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("selects with a click and reports its number", () => {
    const onSelect = vi.fn();
    pinElement(4, false, onSelect).click();
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it("shows its selected state, and can change it in place", () => {
    const el = pinElement(2, true, vi.fn());
    expect(el.getAttribute("aria-pressed")).toBe("true");
    expect(el.dataset.selected).toBe("true");
    setPinSelected(el, false);
    expect(el.getAttribute("aria-pressed")).toBe("false");
    expect(el.dataset.selected).toBeUndefined();
  });
});

describe("pinBounds", () => {
  const pins = [
    { n: 1, propertyCid: "a", lat: 30.4, lon: -97.7 },
    { n: 2, propertyCid: "b", lat: 30.5, lon: -97.5 },
  ];

  it("fits the pins [west, south] to [east, north]", () => {
    expect(pinBounds(pins)).toEqual([
      [-97.7, 30.4],
      [-97.5, 30.5],
    ]);
  });

  it("widens to include the search ring when there is one", () => {
    expect(
      pinBounds(pins, [
        [-97.9, 30.3],
        [-97.4, 30.6],
      ]),
    ).toEqual([
      [-97.9, 30.3],
      [-97.4, 30.6],
    ]);
  });

  it("has nothing to fit without pins", () => {
    expect(pinBounds([])).toBeNull();
  });

  it("fits a single pin to a point", () => {
    expect(pinBounds([pins[0] as (typeof pins)[0]])).toEqual([
      [-97.7, 30.4],
      [-97.7, 30.4],
    ]);
  });
});
