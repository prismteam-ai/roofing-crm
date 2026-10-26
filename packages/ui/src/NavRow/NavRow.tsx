// T027: shared Atlas component for a not-yet-built roadmap section (plan.md "Patterns the code
// must show" — lives in packages/ui, not apps/web, per the module-boundary table). Real
// `aria-disabled="true"`, not merely styled to look disabled (agent-design.md §4): the row is
// still focusable (`tabIndex={0}`) so the "Coming soon" tooltip is keyboard-reachable, and its
// click handler still routes to `/coming-soon/:section` (AC-5 — tapping it must open a real page,
// never do nothing). Reused as-is by both the >=768px nav rail and the 390px "More" sheet.
import { useCallback, type KeyboardEvent, type ReactElement } from "react";
import { useNavigate } from "react-router";
import styles from "./NavRow.module.css";

export interface NavRowProps {
  readonly section: string;
  readonly label: string;
}

export function NavRow({ section, label }: NavRowProps): ReactElement {
  const navigate = useNavigate();

  const onActivate = useCallback(() => {
    navigate(`/coming-soon/${section}`);
  }, [navigate, section]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
    [onActivate],
  );

  return (
    <div
      role="button"
      aria-disabled="true"
      tabIndex={0}
      title="Coming soon"
      data-roadmap-section={section}
      className={styles.row}
      onClick={onActivate}
      onKeyDown={onKeyDown}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.badge}>Coming soon</span>
    </div>
  );
}
