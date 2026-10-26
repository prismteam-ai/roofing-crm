// The CRM's first-visit guide (CRM-HANDOFF section 4.10, E-28): its constants and the little
// state around it. The 5-step tour and welcome screen were cut; this one card replaces them.
// Pure and DOM-light so the Help menu (components/AppShell/HelpMenu.tsx) can import it.
import { COUNTY_NAME } from "../AppShell/navigation.js";

/** The query param the map's AI mode reads to prefill its question box. The example links below
 *  set it; the panel must only prefill the box, never run the question (every ask costs model
 *  money). */
export const ASK_QUESTION_PARAM = "q";

/** `?first=1` forces the card open (demos and tests), even after it was dismissed. */
export const FIRST_VISIT_PARAM = "first";

/** Window event the shell's Help menu dispatches (through `openWhatCanIAsk`) to reopen the card. */
export const WHAT_CAN_I_ASK_EVENT = "crm:open-what-can-i-ask";

/** Versioned, so a changed card (new questions, new wording) can be shown again by bumping it. */
export const WHAT_CAN_I_ASK_STORAGE_KEY = "crm.whatCanIAsk.v1";

/** Where the card lives: the map. A caller on another route navigates here, then opens it. */
export const WHAT_CAN_I_ASK_PATH = `/?${FIRST_VISIT_PARAM}=1`;

/** One line on what the data is: only what Task A publishes (review-log rows 1, 2 and 4). */
export const WHAT_CAN_I_ASK_INTRO = `Roofing leads from Task A's published ${COUNTY_NAME} run: roof age, permits, and contractors where published. BBB ratings and some addresses may be missing; every missing value says why. Every answer shows its sources.`;

/** Three example questions, verbatim from tests/agent/golden.json (G1, G3, G4): each one the
 *  agent is graded on, so none promises something it cannot answer. */
export const EXAMPLE_QUESTIONS: readonly string[] = [
  `Which properties in ${COUNTY_NAME} within five miles of Pflugerville have roofs older than 15 years?`,
  "Show me open or stalled roofing permits older than five years within five miles of Austin, sorted by open duration",
  "Which homes near Lakeway haven't changed owners in 10+ years and have owners outside the area?",
];

/** The map's AI mode with the question prefilled in its box (not run): Ask lives inside the map
 *  (CRM-HANDOFF section 4.7), `/?mode=ai&q=...`. */
/** Navigation state a click puts on the link to `askHref`: "ask this now". It lives in the history
 *  entry, not the URL, and the map clears it once used, so a pasted link or a reload only prefills. */
export const ASK_NOW_STATE = { askNow: true } as const;

export function askHref(question: string): string {
  return `/?mode=ai&${ASK_QUESTION_PARAM}=${encodeURIComponent(question)}`;
}

/** Set the moment the card is dismissed, so it stays gone for the rest of this page load even when
 *  both kinds of storage are blocked. */
let dismissedThisPage = false;

/** True once the person dismissed the card on this browser. Storage can be blocked or throw
 *  (private window, cleared site data): then the card simply shows, and the page still works. */
export function isDismissed(): boolean {
  if (dismissedThisPage) return true;
  for (const read of [() => localStorage, () => sessionStorage]) {
    try {
      if (read().getItem(WHAT_CAN_I_ASK_STORAGE_KEY) === "dismissed") return true;
    } catch {
      // Blocked storage: try the next place.
    }
  }
  return false;
}

/** Forgets the in-page flag (tests, and "show it again" from the Help menu). */
export function resetDismissedForPage(): void {
  dismissedThisPage = false;
}

export function markDismissed(): void {
  dismissedThisPage = true;
  // localStorage lasts across visits; sessionStorage is the fallback that at least covers this tab's
  // session when the first is blocked.
  for (const write of [() => localStorage, () => sessionStorage]) {
    try {
      write().setItem(WHAT_CAN_I_ASK_STORAGE_KEY, "dismissed");
    } catch {
      // Nothing to remember it with here: the in-page flag still keeps it closed.
    }
  }
}

/** Reopens the card (the Help menu's "What can I ask?"). Works when the map is mounted; from any
 *  other route, navigate to `WHAT_CAN_I_ASK_PATH` instead. */
export function openWhatCanIAsk(): void {
  window.dispatchEvent(new CustomEvent(WHAT_CAN_I_ASK_EVENT));
}
