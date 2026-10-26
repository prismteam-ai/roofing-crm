// The top app bar (Atlas § 7; CRM-HANDOFF § Top bar; boards CrmShell1440, CrmShellApps1440/768,
// CrmShellData1440, CrmAccount). Left: Roofing CRM and the county (Travis County, TX — the one
// county CountyLens publishes, so a static label that says so rather than a picker with nothing
// else in it; hidden below 840 px). Right: the data chip (run from the API), Apps and Help (>= 600 px;
// at 390 the same rows sit in the More sheet) and the account menu with Sign out. One overlay open at a time (E-94).
// The universal search box stays on the Map screen, which owns search.
import { useCallback, useRef, useState, type ReactElement } from "react";
import { Icon, IconButton } from "@crm/ui";
import { identityFromSession } from "../../auth/identity.js";
import { loadSession } from "../../auth/session.js";
import { AppLinks } from "./AppLinks.js";
import { DataChip } from "./DataChip.js";
import { HelpMenu } from "./HelpMenu.js";
import { COUNTY_LABEL } from "./navigation.js";
import { useDismiss } from "./useDismiss.js";
import { useSignOut } from "./useSignOut.js";
import styles from "./ShellTopBar.module.css";

type Overlay = "data" | "apps" | "help" | "account" | null;

export interface ShellTopBarProps {
  readonly title: string;
}

function AppsMenu({
  open,
  onToggle,
  onClose,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}): ReactElement {
  const trigger = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, menu, trigger);
  return (
    <div className={`${styles.anchor} ${styles.apps}`}>
      <span ref={trigger} className={styles.triggerWrap}>
        <IconButton
          icon="apps"
          label="Apps"
          className={styles.iconButton}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onToggle}
        />
      </span>
      {open && (
        <div ref={menu} role="menu" aria-label="Apps" className={styles.menu}>
          <AppLinks itemRole="menuitem" onNavigate={onClose} />
        </div>
      )}
    </div>
  );
}

const UUID_LIKE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** Up to two capital letters for the avatar: the first letters of the name's words ("jane.doe@x"
 *  gives "JD"), or its first two letters when it is one word. Empty text gives "?". */
export function initialsOf(name: string | null): string {
  if (name === null) return "?";
  const local = name.split("@")[0] ?? name;
  const words = local.split(/[^A-Za-z0-9]+/).filter((w) => w !== "");
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
      : (words[0] ?? "").slice(0, 2);
  return letters === "" ? "?" : letters.toUpperCase();
}

/** "admin" gives "Admin" (a group name read from the token, shown as a word). */
export function capitalise(word: string): string {
  return word === "" ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

function AccountMenu({
  open,
  onToggle,
  onClose,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}): ReactElement {
  const trigger = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, menu, trigger);
  const signOut = useSignOut();
  const identity = identityFromSession(loadSession());
  // A Cognito username that is just the user's id says nothing to a person: prefer the email.
  const username =
    identity.username !== null && UUID_LIKE.test(identity.username) ? null : identity.username;
  const name = username ?? identity.email;

  return (
    <div className={styles.anchor}>
      <span ref={trigger} className={styles.triggerWrap}>
        <IconButton
          icon="account_circle"
          label="Account"
          className={styles.iconButton}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onToggle}
        />
      </span>
      {open && (
        <div ref={menu} role="menu" aria-label="Account" className={styles.menu}>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {initialsOf(name)}
            </span>
            <span className={styles.who}>
              <span className={styles.nameRow}>
                <span className={styles.name}>{name ?? "Signed in"}</span>
                {identity.groups.map((group) => (
                  <span key={group} className={styles.pill}>
                    {capitalise(group)}
                  </span>
                ))}
              </span>
              {identity.email !== null && identity.email !== name && (
                <span className={styles.detail}>{identity.email}</span>
              )}
            </span>
          </div>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={signOut}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function ShellTopBar({ title }: ShellTopBarProps): ReactElement {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const close = useCallback(() => setOverlay(null), []);
  const toggle = useCallback(
    (which: Exclude<Overlay, null>) => () =>
      setOverlay((current) => (current === which ? null : which)),
    [],
  );

  return (
    <div className={styles.row}>
      <h1 className={styles.title}>{title}</h1>
      <span
        className={styles.county}
        data-county=""
        title={`${COUNTY_LABEL} is the only county CountyLens publishes`}
      >
        <Icon name="location_on" size="medium" />
        {COUNTY_LABEL}
      </span>
      <span className={styles.spacer} />
      <DataChip open={overlay === "data"} onToggle={toggle("data")} onClose={close} />
      <AppsMenu open={overlay === "apps"} onToggle={toggle("apps")} onClose={close} />
      <HelpMenu open={overlay === "help"} onToggle={toggle("help")} onClose={close} />
      <AccountMenu open={overlay === "account"} onToggle={toggle("account")} onClose={close} />
    </div>
  );
}
