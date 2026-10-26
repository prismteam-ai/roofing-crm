// Shared open/close behaviour for the shell's menus, panel and sheet (CRM-HANDOFF E-92/E-94):
// on open, focus moves to the first control inside; Escape closes and returns focus to the
// trigger (or the button inside a trigger wrapper); a pointer press outside both the surface and its trigger closes without moving focus.
import { useEffect, type RefObject } from "react";

const FOCUSABLE = '[role="menuitem"]:not([aria-disabled="true"]), a[href], button';

export function useDismiss(
  open: boolean,
  onClose: () => void,
  surface: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    surface.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      onClose();
      const t = trigger.current;
      (t?.matches("button, a") === true ? t : t?.querySelector<HTMLElement>("button, a"))?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (surface.current?.contains(target) === true) return;
      if (trigger.current?.contains(target) === true) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose, surface, trigger]);
}
