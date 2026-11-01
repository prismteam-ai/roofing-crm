import { useEffect, useRef, useState } from "react";
import type { AgentAnswer } from "../../../packages/agent/src/index";
import {
  IntentPlanSchema,
  type IntentPlan,
} from "../../../packages/agent/src/intent/types";
import {
  PropertySchema,
  SearchResponseSchema,
  type Lead,
  type Property,
  type QueryInput,
  type SearchResponse,
} from "../../../packages/contracts/src/index";
import {
  amazonLocationProvider,
  OFFLINE_BASEMAP,
  openStreetMapProvider,
  type BasemapProvider,
} from "../../../packages/map-domain/src/basemap";
import {
  queryFromUrl,
  queryToUrl,
  updateQueryContext,
  queryForPlace,
} from "../../../packages/map-domain/src/index";
import { isExplicitOpenRoofPermit } from "../../../packages/map-domain/src/signals";
import {
  OracleHealthSchema,
  type OracleHealth,
} from "../../../packages/oracle-client/src/index";
import {
  confirmedLead,
  LeadMutationGate,
  mergeLeadRows,
  parsedLeadRows,
  unchangedSubmittedDraft,
  type NoteDraft,
} from "./lead-state";
import "./style.css";

let apiSessionGeneration = 0;
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const requestSessionGeneration = apiSessionGeneration;
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const data = (await response.json()) as T & {
    message?: string;
    intent?: unknown;
  };
  if (
    response.status === 401 &&
    requestSessionGeneration === apiSessionGeneration &&
    !(path === "/api/session" && init?.method === "POST")
  )
    window.dispatchEvent(new Event("prism-session-expired"));
  if (!response.ok) {
    const error = new Error(data.message ?? "Request unavailable") as Error & {
      intent?: IntentPlan;
    };
    const parsed = IntentPlanSchema.safeParse(data.intent);
    if (parsed.success) error.intent = parsed.data;
    throw error;
  }
  return data;
}
const session = () => {
  let value = localStorage.getItem("prism-demo-session");
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem("prism-demo-session", value);
  }
  return value;
};
const age = (p: Property) =>
  p.roof.ageYears === null ? "Unknown" : `${p.roof.ageYears} years`;
const basis = (p: Property) =>
  ({
    completed_roof: "Completed roof evidence",
    completed_construction: "Construction evidence",
    built_year: "Building year proxy",
    unknown: "Age unavailable",
  })[p.roof.basis];
const declaredSynthetic = (property: Property) =>
  property.provenance.length > 0 &&
  property.provenance.every((source) => source.kind === "synthetic");
const knownOpenPermits = (property: Property): number | null =>
  !property.permits.length && !declaredSynthetic(property)
    ? null
    : property.permits.filter(isExplicitOpenRoofPermit).length;

function readLocationQuery(snapshotId?: string) {
  try {
    return { query: queryFromUrl(location.search, snapshotId), error: "" };
  } catch (error) {
    return {
      query: queryFromUrl("", snapshotId),
      error: (error as Error).message,
    };
  }
}
export function useCrmController() {
  const [initialUrl] = useState(() => readLocationQuery());
  const [query, setQuery] = useState<QueryInput>(initialUrl.query);
  const [queryUrlError, setQueryUrlError] = useState(initialUrl.error);
  const [health, setHealth] = useState<
    | (OracleHealth & {
        accessMode?: string;
        provider?: string;
        model?: { id: string; region: string; promptRevision: string };
      })
    | null
  >(null);
  const [ready, setReady] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [needsAccess, setNeedsAccess] = useState(false);
  const [bootError, setBootError] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSnapshot, setSelectedSnapshot] = useState("");
  const [selected, setSelected] = useState<Property | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<QueryInput | null>(null);
  const [placing, setPlacing] = useState(false);
  const [gps, setGps] = useState("");
  const [mapProvider, setMapProvider] =
    useState<BasemapProvider>(OFFLINE_BASEMAP);
  const [basemap, setBasemap] = useState(true);
  const [view, setView] = useState<"opportunities" | "leads">("opportunities");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [leadMutationBusy, setLeadMutationBusy] = useState(false);
  const leadMutationGate = useRef(new LeadMutationGate());
  const leadsRef = useRef<Lead[]>([]);
  const activeSessionId = useRef<string | null>(null);
  const noteDraft = useRef<NoteDraft>({ value: "", revision: 0 });
  const changeNote = (value: string) => {
    noteDraft.current = { value, revision: noteDraft.current.revision + 1 };
    setNote(value);
  };
  const [prompt, setPrompt] = useState(
    "Show me open permits older than five years within five miles",
  );
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [rejectedIntent, setRejectedIntent] = useState<IntentPlan | null>(null);
  const [appliedIntent, setAppliedIntent] = useState<IntentPlan | null>(null);
  const [sid, setSid] = useState(session);
  const seq = useRef(0),
    sessionGeneration = useRef(0),
    activeSession = useRef(false),
    bootstrapGeneration = useRef(0),
    detailGeneration = useRef(0),
    leadGeneration = useRef(0),
    agentGeneration = useRef(0);
  const [signingOut, setSigningOut] = useState(false);
  const sameSession = (generation: number) =>
    activeSession.current && generation === sessionGeneration.current;
  const closeDetail = () => {
    detailGeneration.current++;
    setSelected(null);
    setSelectedSnapshot("");
    setSelectedQuery(null);
  };
  const endSession = () => {
    apiSessionGeneration++;
    sessionGeneration.current++;
    bootstrapGeneration.current++;
    seq.current++;
    leadGeneration.current++;
    agentGeneration.current++;
    activeSession.current = false;
    activeSessionId.current = null;
    leadMutationGate.current.reset();
    setLeadMutationBusy(false);
    leadsRef.current = [];
    closeDetail();
    setReady(false);
    setNeedsAccess(true);
    setMapProvider(OFFLINE_BASEMAP);
    setResult(null);
    setLeads([]);
    setAnswer(null);
    setRejectedIntent(null);
    setAppliedIntent(null);
    setAgentError("");
    setAgentBusy(false);
    setStatus("");
    changeNote("");
    setError("");
    setAccessCode("");
    setPlacing(false);
    setGps("");
    setView("opportunities");
  };
  const beginSession = (id: string) => {
    apiSessionGeneration++;
    sessionGeneration.current++;
    seq.current++;
    detailGeneration.current++;
    leadGeneration.current++;
    agentGeneration.current++;
    activeSession.current = true;
    activeSessionId.current = id;
    leadMutationGate.current.reset();
    setLeadMutationBusy(false);
    leadsRef.current = [];
    setLeads([]);
    changeNote("");
    setSid(id);
    setNeedsAccess(false);
    setReady(true);
  };
  const synthetic =
    health?.mode === "synthetic" || health?.mode === "local-fixture";
  const connect = async () => {
    const generation = ++bootstrapGeneration.current,
      epoch = sessionGeneration.current;
    setBootError("");
    try {
      const raw = await api<
        OracleHealth & {
          accessMode?: string;
          provider?: string;
          model?: { id: string; region: string; promptRevision: string };
        }
      >("/api/health");
      if (
        generation !== bootstrapGeneration.current ||
        epoch !== sessionGeneration.current
      )
        return;
      const status = {
        ...OracleHealthSchema.parse(raw),
        accessMode: raw.accessMode,
        provider: raw.provider,
        model: raw.model,
      };
      setHealth(status);
      let id = sid;
      if (status.accessMode === "review-session") {
        try {
          const current = await api<{ session: { id: string } }>(
            "/api/session",
          );
          if (
            generation !== bootstrapGeneration.current ||
            epoch !== sessionGeneration.current
          )
            return;
          id = current.session.id;
        } catch {
          if (generation === bootstrapGeneration.current) setNeedsAccess(true);
          return;
        }
      }
      if (
        generation !== bootstrapGeneration.current ||
        epoch !== sessionGeneration.current
      )
        return;
      const url = readLocationQuery(status.snapshotId);
      setQuery(url.query);
      setQueryUrlError(url.error);
      beginSession(id);
    } catch (error) {
      if (
        generation === bootstrapGeneration.current &&
        epoch === sessionGeneration.current
      )
        setBootError((error as Error).message);
    }
  };
  useEffect(() => {
    void connect();
    const expired = () => endSession();
    window.addEventListener("prism-session-expired", expired);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", escape);
    return () => {
      endSession();
      window.removeEventListener("prism-session-expired", expired);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  const unlock = async () => {
    if (signingOut) return;
    const generation = ++bootstrapGeneration.current,
      epoch = sessionGeneration.current;
    try {
      const current = await api<{ session: { id: string } }>("/api/session", {
        method: "POST",
        body: JSON.stringify({ accessCode }),
      });
      if (
        generation !== bootstrapGeneration.current ||
        epoch !== sessionGeneration.current
      )
        return;
      setAccessCode("");
      const url = readLocationQuery(health?.snapshotId);
      setQuery(url.query);
      setQueryUrlError(url.error);
      beginSession(current.session.id);
    } catch (error) {
      if (
        generation === bootstrapGeneration.current &&
        epoch === sessionGeneration.current
      )
        setBootError((error as Error).message);
    }
  };
  const signOut = async () => {
    endSession();
    setSigningOut(true);
    try {
      await api("/api/session", { method: "DELETE" });
    } catch {
      /* Local state remains closed even when revocation cannot be confirmed. */
    } finally {
      setSigningOut(false);
    }
  };
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selected) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    detailRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [selected?.id]);
  const refreshLeads = async () => {
    const sessionId = activeSessionId.current;
    if (!activeSession.current || !sessionId) return;
    const epoch = sessionGeneration.current,
      current = ++leadGeneration.current;
    const input = await api<unknown>(
      "/api/leads?sessionId=" + encodeURIComponent(sessionId),
    );
    if (sameSession(epoch) && current === leadGeneration.current) {
      const incoming = parsedLeadRows(input, sessionId);
      leadsRef.current = mergeLeadRows(leadsRef.current, incoming, sessionId);
      setLeads(leadsRef.current);
    }
  };
  const applyConfirmedLead = (lead: Lead, sessionId: string) => {
    // Invalidate reads begun before this confirmed write; later reads still merge monotonically.
    leadGeneration.current++;
    leadsRef.current = mergeLeadRows(leadsRef.current, [lead], sessionId);
    setLeads(leadsRef.current);
  };
  useEffect(() => {
    if (!ready) return;
    const epoch = sessionGeneration.current;
    void refreshLeads().catch(() => {
      if (sameSession(epoch))
        setStatus("Lead service unavailable. Start the local CRM API.");
    });
  }, [ready, sid]);
  useEffect(() => {
    if (!ready) return;
    const current = ++seq.current,
      epoch = sessionGeneration.current;
    setResult(null);
    closeDetail();
    setAnswer(null);
    setRejectedIntent(null);
    if (
      appliedIntent &&
      JSON.stringify(appliedIntent.query) !== JSON.stringify(query)
    )
      setAppliedIntent(null);
    setAgentError("");
    setLoading(true);
    setError("");
    if (queryUrlError) {
      setLoading(false);
      return;
    }
    history.replaceState(null, "", queryToUrl(query));
    const timer = setTimeout(() => {
      void api<unknown>("/api/search", {
        method: "POST",
        body: JSON.stringify(query),
      })
        .then((data) => {
          if (!sameSession(epoch) || current !== seq.current) return;
          const parsed = SearchResponseSchema.parse(data);
          setResult(parsed);
        })
        .catch((e) => {
          if (sameSession(epoch) && current === seq.current)
            setError((e as Error).message);
        })
        .finally(() => {
          if (sameSession(epoch) && current === seq.current) setLoading(false);
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [query, ready, queryUrlError]);
  const clearInvalidUrlFilters = () => {
    if (!activeSession.current) return;
    seq.current++;
    closeDetail();
    setQueryUrlError("");
    setQuery(queryFromUrl("", health?.snapshotId));
  };
  const update = (fields: Partial<QueryInput>) => {
    if (!activeSession.current) return;
    seq.current++;
    closeDetail();
    setQuery((q) => updateQueryContext(q, fields));
  };
  const choosePlace = (placeId: string) => {
    if (!activeSession.current) return;
    seq.current++;
    closeDetail();
    setQuery((previous) => queryForPlace(previous, placeId));
    setPlacing(false);
    setGps("Search center uses the selected official municipality.");
  };
  const applyPermitSection = (sectionQuery: QueryInput) => {
    if (!activeSession.current) return;
    seq.current++;
    closeDetail();
    setAppliedIntent(null);
    setQuery(sectionQuery);
  };
  const choose = (
    p: Property,
    snapshotId = query.snapshotId,
    detailQuery: QueryInput = query,
  ) => {
    if (!activeSession.current) return;
    detailGeneration.current++;
    setSelectedSnapshot(snapshotId);
    setSelected(p);
    setSelectedQuery(detailQuery);
    setStatus("");
    changeNote("");
  };
  const pin = (lat: number, lng: number) => {
    update({ lat, lng });
    setPlacing(false);
    setGps("Search center updated from map pin.");
  };
  const useGps = () => {
    const epoch = sessionGeneration.current;
    setGps("Requesting location…");
    if (!navigator.geolocation) {
      setGps("Location unavailable. Place a pin instead.");
      setPlacing(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!sameSession(epoch)) return;
        pin(p.coords.latitude, p.coords.longitude);
        setGps("Search centered on your location.");
      },
      () => {
        if (!sameSession(epoch)) return;
        setGps("Location denied or unavailable. Place a pin instead.");
        setPlacing(true);
      },
      { timeout: 8000, maximumAge: 0 },
    );
  };
  const createLead = async (p: Property) => {
    const epoch = sessionGeneration.current,
      detail = detailGeneration.current,
      sessionId = activeSessionId.current;
    if (!sameSession(epoch) || !sessionId) return;
    const ticket = leadMutationGate.current.start();
    if (!ticket) return;
    setLeadMutationBusy(true);
    setStatus("Saving lead…");
    const snapshotId = selectedSnapshot || query.snapshotId;
    try {
      const input = await api<unknown>("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          propertyId: p.id,
          snapshotId,
          idempotencyKey: `${p.id}:${snapshotId}`,
        }),
      });
      if (!sameSession(epoch)) return;
      const lead = confirmedLead(input, {
        sessionId,
        propertyId: p.id,
        snapshotId,
      });
      applyConfirmedLead(lead, sessionId);
      if (detail === detailGeneration.current)
        setStatus("Lead saved. It will remain after refresh.");
    } catch (e) {
      if (!sameSession(epoch)) return;
      if (detail === detailGeneration.current) setStatus((e as Error).message);
      void refreshLeads().catch(() => undefined);
    } finally {
      if (leadMutationGate.current.finish(ticket) && sameSession(epoch))
        setLeadMutationBusy(false);
    }
  };
  const updateLead = async (
    renderedLead: Lead,
    change: { status?: Lead["status"]; note?: string },
  ) => {
    const epoch = sessionGeneration.current,
      detail = detailGeneration.current,
      sessionId = activeSessionId.current;
    if (!sameSession(epoch) || !sessionId) return;
    const ticket = leadMutationGate.current.start();
    if (!ticket) return;
    setLeadMutationBusy(true);
    setStatus("Saving lead…");
    const submittedDraft = { ...noteDraft.current };
    try {
      const lead =
        leadsRef.current.find((row) => row.id === renderedLead.id) ??
        renderedLead;
      if (
        lead.sessionId !== sessionId ||
        lead.propertyId !== renderedLead.propertyId ||
        lead.snapshotId !== renderedLead.snapshotId
      )
        throw new Error(
          "This lead does not match the current review session and selection.",
        );
      const input = await api<unknown>(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          sessionId,
          id: lead.id,
          expectedVersion: lead.version,
          ...change,
        }),
      });
      if (!sameSession(epoch)) return;
      const confirmed = confirmedLead(input, {
        sessionId,
        propertyId: lead.propertyId,
        snapshotId: lead.snapshotId,
        id: lead.id,
        previousVersion: lead.version,
        previousEventCount: lead.events.length,
        change,
      });
      applyConfirmedLead(confirmed, sessionId);
      if (detail === detailGeneration.current) {
        if (
          change.note !== undefined &&
          submittedDraft.value === change.note &&
          unchangedSubmittedDraft(submittedDraft, noteDraft.current)
        )
          changeNote("");
        setStatus("Lead updated.");
      }
    } catch (e) {
      if (!sameSession(epoch)) return;
      if (detail === detailGeneration.current) setStatus((e as Error).message);
      // A conflict or unknown network outcome triggers a read, never a mutation retry.
      void refreshLeads().catch(() => undefined);
    } finally {
      if (leadMutationGate.current.finish(ticket) && sameSession(epoch))
        setLeadMutationBusy(false);
    }
  };
  const ask = async () => {
    const epoch = sessionGeneration.current;
    if (!sameSession(epoch) || queryUrlError || loading || !result || agentBusy)
      return;
    const generation = seq.current,
      current = ++agentGeneration.current;
    setAgentBusy(true);
    setAnswer(null);
    setRejectedIntent(null);
    setAgentError("");
    try {
      const next = await api<AgentAnswer>("/api/agent", {
        method: "POST",
        signal: AbortSignal.timeout(28000),
        body: JSON.stringify({ prompt, query }),
      });
      if (
        sameSession(epoch) &&
        generation === seq.current &&
        current === agentGeneration.current
      )
        setAnswer({
          ...next,
          ...(next.intent
            ? { intent: IntentPlanSchema.parse(next.intent) }
            : {}),
        });
    } catch (e) {
      if (
        sameSession(epoch) &&
        generation === seq.current &&
        current === agentGeneration.current
      ) {
        setAgentError((e as Error).message);
        setRejectedIntent(
          (e as Error & { intent?: IntentPlan }).intent ?? null,
        );
      }
    } finally {
      if (sameSession(epoch) && current === agentGeneration.current)
        setAgentBusy(false);
    }
  };
  const reviewLead = async (lead: Lead) => {
    const epoch = sessionGeneration.current,
      current = ++detailGeneration.current,
      queryGeneration = seq.current;
    if (!sameSession(epoch)) return;
    setSelected(null);
    try {
      const property = PropertySchema.parse(
        await api<unknown>(
          `/api/properties/${encodeURIComponent(lead.propertyId)}?snapshotId=${encodeURIComponent(lead.snapshotId)}`,
        ),
      );
      if (
        !sameSession(epoch) ||
        current !== detailGeneration.current ||
        queryGeneration !== seq.current
      )
        return;
      if (property.id !== lead.propertyId)
        throw new Error(
          "Property detail identity does not match the saved lead",
        );
      choose(property, lead.snapshotId, queryFromUrl("", lead.snapshotId));
    } catch (error) {
      if (
        sameSession(epoch) &&
        current === detailGeneration.current &&
        queryGeneration === seq.current
      )
        setStatus((error as Error).message);
    }
  };
  useEffect(() => {
    if (!ready) return;
    const epoch = sessionGeneration.current;
    void api<{ kind: string }>("/api/map-config")
      .then((value) => {
        if (!sameSession(epoch)) return;
        setMapProvider(
          value.kind === "amazon-location"
            ? amazonLocationProvider(value, location.origin)
            : value.kind === "raster"
              ? openStreetMapProvider(value, location.origin)
              : OFFLINE_BASEMAP,
        );
      })
      .catch(() => {
        if (sameSession(epoch)) setMapProvider(OFFLINE_BASEMAP);
      });
  }, [ready, sid]);
  const selectedLead = leads.find(
    (x) => x.propertyId === selected?.id && x.snapshotId === selectedSnapshot,
  );

  return {
    query,
    setQuery,
    queryUrlError,
    clearInvalidUrlFilters,
    health,
    setHealth,
    ready,
    setReady,
    accessCode,
    setAccessCode,
    needsAccess,
    setNeedsAccess,
    bootError,
    setBootError,
    result,
    setResult,
    loading,
    setLoading,
    error,
    setError,
    selectedSnapshot,
    setSelectedSnapshot,
    selectedQuery,
    selected,
    setSelected,
    placing,
    setPlacing,
    gps,
    setGps,
    mapProvider,
    setMapProvider,
    basemap,
    setBasemap,
    view,
    setView,
    leads,
    setLeads,
    status,
    setStatus,
    note,
    setNote,
    leadMutationBusy,
    setLeadMutationBusy,
    leadMutationGate,
    leadsRef,
    activeSessionId,
    noteDraft,
    changeNote,
    prompt,
    setPrompt,
    answer,
    setAnswer,
    agentBusy,
    setAgentBusy,
    agentError,
    setAgentError,
    rejectedIntent,
    setRejectedIntent,
    appliedIntent,
    setAppliedIntent,
    sid,
    setSid,
    seq,
    sessionGeneration,
    activeSession,
    bootstrapGeneration,
    detailGeneration,
    leadGeneration,
    agentGeneration,
    signingOut,
    setSigningOut,
    sameSession,
    closeDetail,
    endSession,
    beginSession,
    synthetic,
    connect,
    unlock,
    signOut,
    detailRef,
    refreshLeads,
    applyConfirmedLead,
    update,
    choosePlace,
    applyPermitSection,
    choose,
    pin,
    useGps,
    createLead,
    updateLead,
    ask,
    reviewLead,
    selectedLead,
    age,
    basis,
    knownOpenPermits,
  };
}
export type CrmController = ReturnType<typeof useCrmController>;

export { declaredSynthetic };
