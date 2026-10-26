// The 390 "More" tab and sheet (CRM-HANDOFF E-64/E-94; boards CrmBottomNav, CrmShell390). The tab
// matches its siblings (pill with `more_horiz` over the label); while the sheet is open it does
// not take the active pill, so the page's own tab (Map on the map) stays the one active tab. The sheet opens above the bottom
// navigation (which stays visible and usable) over a scrim, and lists the five Coming-soon
// sections (icon, name, one line, "Coming soon"), then Apps (CountyLens, Roofing CRM ✓, Landing
// page) and Sign out with who is signed in. Escape, the Close button, the scrim or choosing a row
// closes it; Escape returns focus to the tab. Hidden from 600 px, where the rail and the top bar
// carry the same items.
import { useCallback, useRef, useState, type ReactElement } from "react";
import { Icon, IconButton } from "@crm/ui";
import { identityFromSession } from "../../auth/identity.js";
import { loadSession } from "../../auth/session.js";
import { AppLinks } from "./AppLinks.js";
import { useOpenWhatCanIAsk } from "./HelpMenu.js";
import { RoadmapItem } from "./RoadmapItem.js";
import { ROADMAP_NAV } from "./navigation.js";
import { useDismiss } from "./useDismiss.js";
import { useSignOut } from "./useSignOut.js";
import styles from "./MoreSheet.module.css";

export function MoreSheet(): ReactElement {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(open, close, panel, trigger);
  const signOut = useSignOut();
  const askWhatCanI = useOpenWhatCanIAsk();
  const identity = open ? identityFromSession(loadSession()) : undefined;
  const who = identity?.email ?? identity?.username ?? null;
  const role = identity?.groups[0] ?? null;

  return (
    <div className={styles.wrapper}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls="more-sheet-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.pill}>
          <Icon name="more_horiz" />
        </span>
        <span>More</span>
      </button>
      {open && (
        <>
          <div className={styles.scrim} aria-hidden="true" />
          <div
            ref={panel}
            id="more-sheet-panel"
            role="dialog"
            aria-label="More"
            className={styles.panel}
          >
            <div className={styles.header}>
              <h2 className={styles.heading}>Coming soon</h2>
              <IconButton icon="close" label="Close" onClick={close} />
            </div>
            {ROADMAP_NAV.map((item) => (
              <RoadmapItem key={item.section} item={item} layout="sheet" onNavigate={close} />
            ))}
            <h2 className={`${styles.heading} ${styles.section}`}>Apps</h2>
            <AppLinks onNavigate={close} />
            <button
              type="button"
              className={styles.helpItem}
              onClick={() => {
                close();
                askWhatCanI();
              }}
            >
              <Icon name="lightbulb" />
              What can I ask?
            </button>
            <button type="button" className={styles.signOut} onClick={signOut}>
              <Icon name="logout" />
              <span className={styles.signOutLabel}>Sign out</span>
              {who !== null && <span className={styles.who}>{who}</span>}
              {role !== null && (
                <span
                  className={styles.role}
                >{`${role.charAt(0).toUpperCase()}${role.slice(1)}`}</span>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
