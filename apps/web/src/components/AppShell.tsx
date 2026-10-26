// The shell of every authenticated page (A-03 T007, re-pointed at the CRM in B-01 T028; top bar,
// rail and More sheet brought to the CrmShell1440 / CrmShell390 boards in the 2026-10-25 UI fix).
// Atlas § 7: top app bar (64 px, `surface`, elevation 2 on scroll) with the county, data chip,
// Apps and account menus (AppShell/ShellTopBar); bottom navigation below 600 px and navigation
// rail from 600 px with the three real destinations, then the five Coming-soon sections
// (AppShell/NavRail at >= 600 px, AppShell/MoreSheet at 390). The nav table lives in
// AppShell/navigation.ts. Layout and colours come only from tokens.css through
// AppShell.module.css. DOM order is banner, navigation, main (ERR-13: Tab reaches the rail before
// the page content); the grid areas place the bottom navigation below main on compact widths, so
// nothing moves.
import { useCallback, useState, type MouseEvent, type ReactElement, type UIEvent } from "react";
import { Outlet, useMatch } from "react-router";
import { MoreSheet } from "./AppShell/MoreSheet.js";
import { NavRail } from "./AppShell/NavRail.js";
import { ShellNav } from "./AppShell/ShellNav.js";
import { ShellTopBar } from "./AppShell/ShellTopBar.js";
import styles from "./AppShell.module.css";

export { DESTINATIONS, type Destination } from "./AppShell/navigation.js";

export const APP_TITLE = "Roofing CRM";

const MAIN_ID = "main-content";

/** The hash alone moves the view but not always the focus; move both, so the next Tab starts in
 *  the page. */
function focusMain(event: MouseEvent<HTMLAnchorElement>): void {
  const main = document.getElementById(MAIN_ID);
  if (main === null) return;
  event.preventDefault();
  main.focus();
  main.scrollIntoView?.({ block: "start" });
}

/** Routes whose page draws edge to edge inside the main region (no page margin): the Map screen
 *  (CrmMap390/768/1440 put the map, panes and sheets flush against the bar, rail and window). */
const FULL_BLEED_ROUTE = "/";

export function AppShell(): ReactElement {
  // The main region is the scroll container (the bottom navigation stays in view on compact
  // widths without a non-token padding), so the bar's elevation follows its scroll offset.
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    setScrolled(event.currentTarget.scrollTop > 0);
  }, []);
  const fullBleed = useMatch({ path: FULL_BLEED_ROUTE, end: true }) !== null;

  return (
    <div className={styles.shell}>
      {/* The first Tab stop: jumps over the bar and navigation to the page (WCAG 2.4.1). It is
          drawn only while focused. */}
      <a className={styles.skip} href={`#${MAIN_ID}`} onClick={focusMain}>
        Skip to content
      </a>
      <header className={scrolled ? `${styles.bar} ${styles.barScrolled}` : styles.bar}>
        <ShellTopBar title={APP_TITLE} />
      </header>
      <nav className={styles.nav} aria-label="Primary">
        <ShellNav />
        <NavRail />
        <MoreSheet />
      </nav>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className={fullBleed ? `${styles.main} ${styles.mainFullBleed}` : styles.main}
        data-layout={fullBleed ? "full-bleed" : "padded"}
        onScroll={onScroll}
      >
        <Outlet />
      </main>
    </div>
  );
}
