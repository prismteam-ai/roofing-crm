import type { Point } from '@roofing-crm/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseUrlState, serializeUrlState, type UrlState } from './urlState.js';

export type UrlStatePatch = Partial<UrlState> | ((current: UrlState) => Partial<UrlState>);

/**
 * App state that lives in the query string, so any search can be reproduced from its link.
 * Switching view adds a history entry (Back works); everything else replaces the current one.
 */
export function useUrlState(
  /** Pin to start from when the link carries none, so the first screen already shows data. */
  defaultPin: Point | null = null,
): [UrlState, (patch: UrlStatePatch) => void] {
  const [state, setState] = useState<UrlState>(() => {
    const parsed = parseUrlState(window.location.search);
    if (parsed.pin || !defaultPin) return parsed;
    return { ...parsed, pin: { lat: defaultPin.lat, lon: defaultPin.lon } };
  });
  const lastView = useRef(state.view);

  useEffect(() => {
    const next = serializeUrlState(state);
    if (next !== window.location.search) {
      const url = `${window.location.pathname}${next}${window.location.hash}`;
      if (state.view !== lastView.current) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    }
    lastView.current = state.view;
  }, [state]);

  useEffect(() => {
    const onPop = (): void => {
      const parsed = parseUrlState(window.location.search);
      lastView.current = parsed.view;
      setState(parsed);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const update = useCallback((patch: UrlStatePatch) => {
    setState((current) => ({
      ...current,
      ...(typeof patch === 'function' ? patch(current) : patch),
    }));
  }, []);

  return [state, update];
}
