// `/ask` is no longer a page of its own: the agent is the map's AI mode (CRM-HANDOFF 4.7, E-58).
// The old route and any `?q=` link keep working by redirecting to `/?mode=ai`, carrying `q` so the
// panel prefills its box (never asks). The panel itself is `AskPanel.tsx`.
import type { ReactElement } from "react";
import { Navigate, useSearchParams } from "react-router";
import { ASK_QUESTION_PARAM } from "../../components/Onboarding/firstVisit.js";

export { AskPanel, OUTCOME_STATE, prefillFrom, type AskPanelProps } from "./AskPanel.js";

/** Where `/ask` goes: the map in AI mode, with the question when there is one. */
export function askRedirectTo(search: string): string {
  const q = new URLSearchParams(search).get(ASK_QUESTION_PARAM);
  const next = new URLSearchParams({ mode: "ai" });
  if (q !== null && q.trim() !== "") next.set(ASK_QUESTION_PARAM, q);
  return `/?${next.toString()}`;
}

export function Component(): ReactElement {
  const [params] = useSearchParams();
  return <Navigate to={askRedirectTo(params.toString())} replace />;
}
