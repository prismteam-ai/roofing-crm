// The first-visit "What can I ask?" card (CRM-HANDOFF section 4.10, E-28; boards
// Welcome1440/768/390). One dismissible, non-modal dialog over the map: a line on what the data
// is, three example questions that open the map's AI mode and ask at once (the click carries in-app
// state; a URL alone only prefills), and
// Close / Got it. Placed per the boards by WhatCanIAsk.module.css: 16 px in from the map's left
// edge at 1440 and 768, full width at 390. `?first=1` forces it open; the Help menu reopens it
// through the `crm:open-what-can-i-ask` event.
import { Icon } from "@crm/ui";
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router";
import {
  EXAMPLE_QUESTIONS,
  FIRST_VISIT_PARAM,
  WHAT_CAN_I_ASK_EVENT,
  WHAT_CAN_I_ASK_INTRO,
  ASK_NOW_STATE,
  askHref,
  isDismissed,
  markDismissed,
} from "./firstVisit.js";
import styles from "./WhatCanIAsk.module.css";

export interface WhatCanIAskProps {
  /** Told whenever the card opens or closes, so the map can step its own overlays (legend, chips,
   *  results sheet reserve) aside while it is up: one overlay at a time (CRM-HANDOFF rule 11). */
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
}

export function WhatCanIAsk({ onOpenChange }: WhatCanIAskProps = {}): ReactElement | null {
  const [searchParams] = useSearchParams();
  const forced = searchParams.get(FIRST_VISIT_PARAM) === "1";
  const [open, setOpen] = useState(() => forced || !isDismissed());
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<Element | null>(null);

  const dismiss = useCallback(() => {
    markDismissed();
    setOpen(false);
  }, []);

  // `?first=1` arriving after mount (the Help menu navigating to the map) opens it too.
  useEffect(() => {
    if (forced) setOpen(true);
  }, [forced]);

  // The Help menu's "What can I ask?".
  useEffect(() => {
    const reopen = (): void => setOpen(true);
    window.addEventListener(WHAT_CAN_I_ASK_EVENT, reopen);
    return () => window.removeEventListener(WHAT_CAN_I_ASK_EVENT, reopen);
  }, []);

  // Non-modal, so focus is not trapped; but it moves into the card on open (named dialog, so a
  // screen reader announces it), Escape closes it when focus is in the card (a menu or sheet
  // elsewhere owns the key otherwise), and focus goes back to where it came from on close.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement;
    cardRef.current?.focus();
    return () => {
      const back = returnFocusRef.current;
      if (back instanceof HTMLElement && document.contains(back)) back.focus();
    };
  }, [open, dismiss]);

  if (!open) return null;
  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(event) => {
        // Only an Escape that happened inside the card and that no one else used.
        if (event.key === "Escape" && !event.defaultPrevented) dismiss();
      }}
      className={styles.card}
      data-testid="what-can-i-ask"
    >
      <div className={styles.header}>
        <Icon name="lightbulb" />
        <h2 id={titleId} className={styles.title}>
          What can I ask?
        </h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={dismiss}>
          <Icon name="close" />
        </button>
      </div>
      <p className={styles.intro}>{WHAT_CAN_I_ASK_INTRO}</p>
      <ul className={styles.list}>
        {EXAMPLE_QUESTIONS.map((question) => (
          <li key={question}>
            <Link
              to={askHref(question)}
              state={ASK_NOW_STATE}
              className={styles.question}
              onClick={markDismissed}
            >
              <Icon name="auto_awesome" />
              <span className={styles.questionText}>{question}</span>
              <Icon name="arrow_forward" />
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.gotIt} onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
