// The map's mode and the agent's question in the URL (Ask in the map, CRM-HANDOFF section 4.7):
// `mode=ai&q=...` opens the AI panel with the question prefilled (never run); `mode=filters` opens
// the filters; no `mode` is the map. Every other key (centre, radius, roof, sel, view, triage...)
// is kept, so reload, back and a shared link reopen the same state.
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

export type MapMode = "map" | "filters" | "ai";

const MODES: readonly MapMode[] = ["map", "filters", "ai"];

export interface MapModeParam {
  readonly mode: MapMode;
  /** The prefilled question; null when none. */
  readonly q: string | null;
  readonly setMode: (mode: MapMode) => void;
  /** Takes the prefilled question out of the URL (replace, no history entry) once it was used.
   *  With `closeDrawer`, also clears `sel` so the property drawer does not cover the answer (the
   *  property stays pinned on the map: the search centre and answer pins are not in `sel`). */
  readonly clearQuestion: (options?: { readonly closeDrawer?: boolean }) => void;
}

export function parseMapMode(params: URLSearchParams): { mode: MapMode; q: string | null } {
  const raw = params.get("mode");
  const mode = MODES.find((m) => m === raw) ?? "map";
  const q = params.get("q");
  return { mode, q: q === null || q.trim() === "" ? null : q };
}

export function patchMapMode(
  params: URLSearchParams,
  patch: { mode?: MapMode; q?: string | null },
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (patch.mode !== undefined) {
    if (patch.mode === "map") next.delete("mode");
    else next.set("mode", patch.mode);
    // A question belongs to AI mode: leaving it takes the question along.
    if (patch.mode !== "ai" && patch.q === undefined) next.delete("q");
  }
  if (patch.q !== undefined) {
    if (patch.q === null || patch.q.trim() === "") next.delete("q");
    else next.set("q", patch.q);
  }
  return next;
}

export function useMapMode(): MapModeParam {
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parseMapMode(params), [params]);
  const setMode = useCallback(
    (mode: MapMode) => setParams((prev) => patchMapMode(prev, { mode })),
    [setParams],
  );
  const clearQuestion = useCallback(
    (options?: { readonly closeDrawer?: boolean }) =>
      setParams(
        (prev) => {
          const next = patchMapMode(prev, { q: null });
          if (options?.closeDrawer === true) next.delete("sel");
          return next;
        },
        { replace: true, state: null },
      ),
    [setParams],
  );
  return { ...parsed, setMode, clearQuestion };
}

const THREAD_KEY = "crm.askThread.v1";

/** A fresh agent thread id (the same kind the Ask page used). */
function makeThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `t-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The map session's agent thread: kept in sessionStorage so a reload keeps the conversation's
 *  memory, and replaced by `newThreadId` on "New question". With storage blocked it lives for the
 *  page only (every access in try/catch). */
let memoryThread: string | null = null;

export function readThreadId(): string {
  try {
    const stored = sessionStorage.getItem(THREAD_KEY);
    if (stored !== null && stored !== "") return stored;
    const fresh = makeThreadId();
    sessionStorage.setItem(THREAD_KEY, fresh);
    return fresh;
  } catch {
    memoryThread ??= makeThreadId();
    return memoryThread;
  }
}

export function newThreadId(): string {
  const fresh = makeThreadId();
  memoryThread = fresh;
  try {
    sessionStorage.setItem(THREAD_KEY, fresh);
  } catch {
    // Storage blocked: the page-lifetime copy above is the thread.
  }
  return fresh;
}
