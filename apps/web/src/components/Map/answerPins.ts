// Numbered answer pins (Ask in the map, CRM-HANDOFF E-58): the agent's cited properties drawn on
// the map with the same number as the citation in the answer. A real button (a keyboard reaches
// it, a screen reader names it "Source 3"), a 48 px hit area around a 28 px disc, Atlas tokens
// only. DOM, not WebGL: an answer has at most a few dozen pins. Pure DOM helpers, so they test
// without a MapLibre canvas.
import type { AnswerPin } from "@crm/shared";

const HIT = "48px";

function paint(el: HTMLButtonElement, selected: boolean): void {
  el.setAttribute("aria-pressed", selected ? "true" : "false");
  if (selected) el.dataset.selected = "true";
  else delete el.dataset.selected;
  const disc = el.firstElementChild as HTMLElement | null;
  if (disc === null) return;
  disc.style.width = selected ? "36px" : "28px";
  disc.style.height = selected ? "36px" : "28px";
  disc.style.boxShadow = selected
    ? "0 0 0 3px var(--md-sys-color-surface), 0 0 0 5px var(--md-sys-color-primary)"
    : "0 0 0 2px var(--md-sys-color-surface)";
}

export function pinElement(
  n: number,
  selected: boolean,
  onSelect: (n: number) => void,
  label?: string,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.answerPin = String(n);
  // "Source 3: TCAD 0201885122" when the property is known (never a bare number to a screen reader).
  el.setAttribute(
    "aria-label",
    label === undefined || label === "" ? `Source ${String(n)}` : `Source ${String(n)}: ${label}`,
  );
  el.style.width = HIT;
  el.style.height = HIT;
  el.style.padding = "0";
  el.style.border = "0";
  el.style.background = "transparent";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.cursor = "pointer";
  // Above the roof markers (added earlier) and the hexagon layer.
  el.style.zIndex = "3";
  const disc = document.createElement("span");
  disc.textContent = String(n);
  disc.style.display = "grid";
  disc.style.placeItems = "center";
  disc.style.borderRadius = "50%";
  disc.style.background = "var(--md-sys-color-primary)";
  disc.style.color = "var(--md-sys-color-on-primary)";
  disc.style.fontFamily = "var(--md-sys-typescale-label-large-font)";
  disc.style.fontSize = "var(--md-sys-typescale-label-large-size)";
  disc.style.fontWeight = "var(--md-sys-typescale-label-large-weight)";
  disc.style.lineHeight = "1";
  el.appendChild(disc);
  // The text is the number; the button's accessible name is the aria-label above.
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(n);
  });
  paint(el, selected);
  return el;
}

export function setPinSelected(el: HTMLButtonElement, selected: boolean): void {
  paint(el, selected);
}

/** [[west, south], [east, north]] around the pins, widened to `extra` (the search ring) when
 *  given; null with no pins (nothing to show, so nothing to fit). */
export function pinBounds(
  pins: readonly AnswerPin[],
  extra?: readonly [readonly [number, number], readonly [number, number]],
): [[number, number], [number, number]] | null {
  if (pins.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const pin of pins) {
    west = Math.min(west, pin.lon);
    east = Math.max(east, pin.lon);
    south = Math.min(south, pin.lat);
    north = Math.max(north, pin.lat);
  }
  if (extra !== undefined) {
    west = Math.min(west, extra[0][0]);
    south = Math.min(south, extra[0][1]);
    east = Math.max(east, extra[1][0]);
    north = Math.max(north, extra[1][1]);
  }
  return [
    [west, south],
    [east, north],
  ];
}
