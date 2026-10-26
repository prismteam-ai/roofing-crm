// The Help menu of the top bar (PO decision 2026-10-25): an icon button with one menu item,
// "What can I ask?", which reopens the first-visit card that explains what the agent and the
// search box understand. Also reachable in the 390 More sheet (MoreSheet uses `WhatCanIAskItem`).
// The card itself lives with the Map screen (components/Onboarding): on the map this reopens it
// in place, from any other screen it goes to the map with the card forced open.
import { useRef, type ReactElement } from "react";
import { Icon, IconButton } from "@crm/ui";
import { useMatch, useNavigate } from "react-router";
import { WHAT_CAN_I_ASK_PATH, openWhatCanIAsk } from "../Onboarding/firstVisit.js";
import { useDismiss } from "./useDismiss.js";
import styles from "./ShellTopBar.module.css";

/** What the "What can I ask?" entries do: on the map the first-visit card reopens in place; from
 *  any other screen the person goes to the map with the card forced open (`?first=1`), because
 *  the card lives with the map and only listens while it is mounted. */
export function useOpenWhatCanIAsk(): () => void {
  const navigate = useNavigate();
  const onMap = useMatch({ path: "/", end: true }) !== null;
  return () => {
    if (onMap) openWhatCanIAsk();
    else void navigate(WHAT_CAN_I_ASK_PATH);
  };
}

export interface HelpMenuProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}

export function HelpMenu({ open, onToggle, onClose }: HelpMenuProps): ReactElement {
  const trigger = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, menu, trigger);
  const ask = useOpenWhatCanIAsk();
  return (
    <div className={`${styles.anchor} ${styles.help}`}>
      <span ref={trigger} className={styles.triggerWrap}>
        <IconButton
          icon="help"
          label="Help"
          className={styles.iconButton}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onToggle}
        />
      </span>
      {open && (
        <div ref={menu} role="menu" aria-label="Help" className={styles.menu}>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onClose();
              ask();
            }}
          >
            <Icon name="lightbulb" />
            What can I ask?
          </button>
        </div>
      )}
    </div>
  );
}
