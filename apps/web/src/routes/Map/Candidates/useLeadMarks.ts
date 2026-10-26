// Lead marks for the properties in a ring: the one place `leads.presence` is read for them. The
// Candidate list ("Lead · {status}") and the map's "My leads" ring both call it with the same
// identifiers, so React Query shares the cache entries and costs no extra call. Chunks of 100
// identifiers, at most LEAD_PRESENCE_MAX_CALLS calls; a bigger ring leaves the rest unmarked and
// says so (`reason`), and a failed read says so too: never silence mistaken for "no leads".
import { useTRPC } from "@crm/api-client/react";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { TRAVIS_FIPS } from "../../Leads/LeadCreateAction.js";
import { leadsByRequestIdentifier, type CandidateLead, type LeadsReason } from "./candidates.js";

/** `leads.presence` identifier cap per call (the router's PRESENCE_MAX). */
export const LEAD_PRESENCE_LIMIT = 100;
/** Calls per ring; a bigger ring leaves the rest unmarked and says so (`reason: "tooMany"`). */
export const LEAD_PRESENCE_MAX_CALLS = 10;

export interface LeadMarks {
  /** TCAD request identifier -> the lead already created for it (whoever owns it). */
  readonly marks: ReadonlyMap<string, CandidateLead>;
  /** Marks may be missing: the read failed or the ring was too large to mark in full. */
  readonly unavailable: boolean;
  /** Why (null when the marks are all there). */
  readonly reason: LeadsReason | null;
}

export function useLeadMarks(
  properties: readonly { readonly requestIdentifier: string }[],
  enabled = true,
): LeadMarks {
  const trpc = useTRPC();
  const ids = useMemo(
    () => (enabled ? [...new Set(properties.map((p) => p.requestIdentifier))] : []),
    [properties, enabled],
  );
  const chunks = useMemo(() => {
    const out: string[][] = [];
    for (
      let at = 0;
      at < ids.length && out.length < LEAD_PRESENCE_MAX_CALLS;
      at += LEAD_PRESENCE_LIMIT
    )
      out.push(ids.slice(at, at + LEAD_PRESENCE_LIMIT));
    return out;
  }, [ids]);
  const presence = useQueries({
    queries: chunks.map((requestIdentifiers) =>
      trpc.leads.presence.queryOptions({ requestIdentifiers, fips: TRAVIS_FIPS }),
    ),
    // `combine` results are structurally shared, so `rows` keeps its identity between renders.
    combine: (results) => ({
      rows: results.flatMap((q) => q.data ?? []),
      failed: results.some((q) => q.isError),
    }),
  });
  const rows = presence.rows;
  const marks = useMemo(() => leadsByRequestIdentifier(rows), [rows]);
  const tooMany = ids.length > LEAD_PRESENCE_LIMIT * LEAD_PRESENCE_MAX_CALLS;
  return {
    marks,
    unavailable: presence.failed || tooMany,
    reason: tooMany ? "tooMany" : presence.failed ? "failed" : null,
  };
}
