// Pure clamping logic for the anchored Popover: given the anchor, the popover's width and the
// bounds it must stay inside (its pane intersected with the viewport), return the horizontal
// offset from the anchor's left edge and the maximum width. Rects are viewport coordinates.
export interface Box {
  readonly left: number;
  readonly right: number;
}

export interface Placement {
  /** Offset in px from the anchor's left edge (the popover's CSS `left`). */
  readonly left: number;
  /** Maximum width in px so the popover can never exceed the available space. */
  readonly maxWidth: number;
}

export function computePlacement(
  anchor: Box,
  width: number,
  bounds: Box,
  align: "start" | "end",
  margin: number,
): Placement {
  const available = Math.max(0, bounds.right - bounds.left - 2 * margin);
  const w = Math.min(width, available);
  const desired = align === "end" ? anchor.right - w : anchor.left;
  const min = bounds.left + margin;
  const max = bounds.right - margin - w;
  const clamped = Math.max(min, Math.min(desired, max));
  return { left: clamped - anchor.left, maxWidth: available };
}

/** Intersect the viewport with the nearest clipping ancestor (the anchor's pane), if any. */
export function boundsFor(el: HTMLElement, viewportWidth: number): Box {
  let left = 0;
  let right = viewportWidth;
  for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowX;
    if (o !== "visible" && o !== "") {
      const r = p.getBoundingClientRect();
      left = Math.max(left, r.left);
      right = Math.min(right, r.right);
      break;
    }
  }
  return { left, right };
}
