// The results container (CRM-HANDOFF §4.2; prototype Explore1440 `cards` + `sheet-handle`).
// Below 1280 px: a bottom sheet over the map that peeks (header and first card) and expands to
// nearly full height — tap the handle, drag it, or use the arrow keys on it. From 1280 px the
// same element is the right-hand results pane and the handle is hidden (CSS only; one DOM, so
// every data-state/test id inside keeps working at every width). Render-only.
import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import styles from "./ResultsSheet.module.css";

export type SheetState = "peek" | "full";

/** Drag distance, px, that counts as a swipe rather than a tap. */
const DRAG_THRESHOLD = 40;

export interface ResultsSheetProps {
  readonly children: ReactNode;
  /** `compact` when the sheet only holds a notice (index down, no results, loading): it peeks
   *  small and gives the map the rest. `results` (default) keeps the full peek. */
  readonly peek?: "compact" | "results";
}

export function ResultsSheet({ children, peek = "results" }: ResultsSheetProps): ReactElement {
  const [state, setState] = useState<SheetState>("peek");
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const full = state === "full";

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>): void => {
    dragStart.current = e.clientY;
    dragged.current = false;
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>): void => {
    const start = dragStart.current;
    dragStart.current = null;
    if (start === null) return;
    const dy = e.clientY - start;
    if (dy <= -DRAG_THRESHOLD) {
      dragged.current = true;
      setState("full");
    } else if (dy >= DRAG_THRESHOLD) {
      dragged.current = true;
      setState("peek");
    }
  };
  const onClick = (): void => {
    // A drag already set the state; the click that follows it must not undo that.
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setState((s) => (s === "full" ? "peek" : "full"));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setState("full");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setState("peek");
    }
  };

  return (
    <section className={styles.sheet} aria-label="Results" data-sheet={state} data-peek={peek}>
      <button
        type="button"
        className={styles.handle}
        aria-expanded={full}
        aria-label={full ? "Shrink the results sheet" : "Expand the results sheet"}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
        onKeyDown={onKeyDown}
      />
      <div className={styles.body}>{children}</div>
    </section>
  );
}
