// B-03 generic anchored popover (the Layers popover, and any future small menu). A dialog that
// opens below its trigger, closes on Escape and on an outside click, and returns focus to the
// trigger on close (constitution § 10: dialogs trap focus and close with Escape). Render-only;
// the caller owns open/close state so it can be driven by the URL or any other store.
import { useEffect, useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import styles from "./Popover.module.css";
import { boundsFor, computePlacement } from "./placement.js";

const MARGIN = 8;

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly children: ReactNode;
  readonly align?: "start" | "end";
}

export function Popover({
  open,
  onClose,
  label,
  children,
  align = "start",
}: PopoverProps): ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  // Measure on open and on resize: keep the popover inside its pane and the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const place = (): void => {
      const el = ref.current;
      const anchor = el?.offsetParent;
      if (!el || !(anchor instanceof HTMLElement)) return;
      const bounds = boundsFor(anchor, window.innerWidth);
      el.style.maxWidth = `${Math.max(0, bounds.right - bounds.left - 2 * MARGIN)}px`;
      const width = el.getBoundingClientRect().width;
      const a = anchor.getBoundingClientRect();
      const p = computePlacement(a, width, bounds, align, MARGIN);
      el.style.left = `${p.left}px`;
      el.style.right = "auto";
      el.style.maxWidth = `${p.maxWidth}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, align]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      aria-modal="false"
      className={`${styles.popover} ${align === "end" ? styles.end : ""}`}
    >
      {children}
    </div>
  );
}
