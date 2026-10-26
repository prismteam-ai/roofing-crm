// Collapsed or expanded, per pane, kept for the browser session (PO review: both panes can be
// minimised). Every storage access is in try/catch; with storage blocked the state lives for the
// page only. Default expanded, unless the caller passes `auto` (the right pane starts collapsed
// while it has nothing to show); the user's own toggle always wins for the session.
import { useCallback, useState } from "react";

export type PaneSide = "left" | "right";

const key = (side: PaneSide): string => `crm.pane.${side}.v1`;
const memory: Record<PaneSide, boolean | null> = { left: null, right: null };

/** The user's own choice this session, or null when they have not toggled the pane. */
function read(side: PaneSide): boolean | null {
  try {
    const stored = sessionStorage.getItem(key(side));
    if (stored === "collapsed") return true;
    if (stored === "expanded") return false;
  } catch {
    // Storage blocked: fall through to the page-lifetime copy.
  }
  return memory[side];
}

function write(side: PaneSide, collapsed: boolean): void {
  memory[side] = collapsed;
  try {
    sessionStorage.setItem(key(side), collapsed ? "collapsed" : "expanded");
  } catch {
    // Blocked: the copy above is all there is.
  }
}

export function usePaneCollapsed(side: PaneSide, auto = false): readonly [boolean, () => void] {
  const [choice, setChoice] = useState<boolean | null>(() => read(side));
  const collapsed = choice ?? auto;
  const toggle = useCallback(() => {
    write(side, !collapsed);
    setChoice(!collapsed);
  }, [side, collapsed]);
  return [collapsed, toggle];
}
