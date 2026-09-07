"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OSCEOLA } from "@/lib/config/county";
import type { LatLng } from "@/lib/queries/geo";
import { PropertyDrawer } from "./PropertyDrawer";
import { ResultsPanel } from "./ResultsPanel";
import { SearchControls } from "./SearchControls";
import type { PropertyDetailResponse, SearchForm, SearchResponse } from "./types";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
      Loading map...
    </div>
  ),
});

const DEFAULT_FORM: SearchForm = {
  radiusMiles: OSCEOLA.thresholds.radiusMiles,
  roofAgeMin: OSCEOLA.thresholds.roofAgeYears,
  openPermitsOnly: false,
  agedRoofsOnly: false,
  longOpenEnabled: false,
  longOpenYears: OSCEOLA.thresholds.longOpenPermitYears,
  ownerOutOfState: false,
  noSaleEnabled: false,
  noSaleYears: OSCEOLA.thresholds.ownershipTenureYears,
  ratedContractorOnly: false,
  propertyType: "all",
};

function toQuery(center: LatLng, f: SearchForm): URLSearchParams {
  const q = new URLSearchParams({
    lat: center.lat.toFixed(6),
    lng: center.lng.toFixed(6),
    radiusMiles: String(f.radiusMiles),
    roofAgeMin: String(f.roofAgeMin),
    openPermitsOnly: String(f.openPermitsOnly),
    agedRoofsOnly: String(f.agedRoofsOnly),
    ownerOutOfState: String(f.ownerOutOfState),
    ratedContractorOnly: String(f.ratedContractorOnly),
    propertyType: f.propertyType,
    limit: "500",
  });
  if (f.longOpenEnabled) q.set("longOpenYears", String(f.longOpenYears));
  if (f.noSaleEnabled) q.set("noSaleYears", String(f.noSaleYears));
  return q;
}

/** Deep-link support: `/?parcel=ID&lat=..&lng=..` centres the search on a lead and opens it. */
function initialFromUrl(params: URLSearchParams): { center: LatLng | null; parcel: string | null } {
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const parcel = params.get("parcel");
  if (Number.isFinite(lat) && Number.isFinite(lng) && params.has("lat") && params.has("lng")) {
    return { center: { lat, lng }, parcel };
  }
  return { center: null, parcel: null };
}

/** Map CRM page: controls, map, results and the property drawer. */
export function MapCrm() {
  const urlParams = useSearchParams();
  const initial = useMemo(() => initialFromUrl(urlParams), [urlParams]);
  const [center, setCenter] = useState<LatLng | null>(initial.center);
  const [form, setForm] = useState<SearchForm>(DEFAULT_FORM);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeParcel, setActiveParcel] = useState<string | null>(initial.parcel);
  const [detail, setDetail] = useState<PropertyDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ text: string; leadIds: number[] } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  // Debounced, latest-wins search whenever the pin or filters change: any change while a
  // request is in flight aborts it and re-runs with the newest filters; a stale response
  // that still arrives is ignored via the sequence number.
  useEffect(() => {
    if (!center) return;
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const seq = ++seqRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?${toQuery(center, form)}`, { signal: ac.signal });
        const body = (await res.json()) as SearchResponse & { error?: string };
        if (seq !== seqRef.current) return; // superseded by a newer search
        if (!res.ok) throw new Error(body.error ?? `Search failed (${res.status})`);
        setResult(body);
      } catch (err) {
        if ((err as Error).name !== "AbortError" && seq === seqRef.current) {
          setError((err as Error).message);
        }
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(handle);
      abortRef.current?.abort();
    };
  }, [center, form]);

  // Property drawer fetch.
  useEffect(() => {
    if (!activeParcel) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    const q = new URLSearchParams({ roofAgeMin: String(form.roofAgeMin) });
    if (form.longOpenEnabled) q.set("longOpenYears", String(form.longOpenYears));
    fetch(`/api/properties/${encodeURIComponent(activeParcel)}?${q}`)
      .then(async (res) => {
        const body = (await res.json()) as PropertyDetailResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
        if (!cancelled) setDetail(body);
      })
      .catch((err: Error) => !cancelled && setDetailError(err.message))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeParcel, form.roofAgeMin, form.longOpenEnabled, form.longOpenYears]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const b = OSCEOLA.bbox;
        if (p.lat < b.minLat || p.lat > b.maxLat || p.lng < b.minLng || p.lng > b.maxLng) {
          setError(
            `Your location (${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}) is outside ${OSCEOLA.label}; centring on Kissimmee instead.`,
          );
          const k = OSCEOLA.places[0]!;
          setCenter({ lat: k.lat, lng: k.lng });
          return;
        }
        setCenter(p);
      },
      (err) => {
        setLocating(false);
        setError(`Could not get your location: ${err.message}`);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, []);

  const createLeads = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setCreating(true);
      setCreateMessage(null);
      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parcelIds: ids,
            roofAgeMin: form.roofAgeMin,
            ...(form.longOpenEnabled ? { longOpenYears: form.longOpenYears } : {}),
          }),
        });
        const body = (await res.json()) as {
          created: { id: number; parcelId: string }[];
          existing: { id: number; parcelId: string }[];
          unknown: string[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? `Create failed (${res.status})`);
        const leadIds = { ...(result?.leadIds ?? {}) };
        for (const l of [...body.created, ...body.existing]) leadIds[l.parcelId] = l.id;
        setResult((r) => (r ? { ...r, leadIds } : r));
        setSelected(new Set());
        setCreateMessage({
          text: `Created ${body.created.length} lead${body.created.length === 1 ? "" : "s"}${body.existing.length ? `, ${body.existing.length} already existed` : ""}${body.unknown.length ? `, ${body.unknown.length} not found` : ""}.`,
          leadIds: body.created.map((l) => l.id),
        });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setCreating(false);
      }
    },
    [result?.leadIds, form.roofAgeMin, form.longOpenEnabled, form.longOpenYears],
  );

  const selectedIds = useMemo(() => selected as ReadonlySet<string>, [selected]);

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-[600px] flex-col md:h-screen md:flex-row">
      <section
        className="w-full shrink-0 overflow-y-auto border-b border-[var(--line)] bg-[var(--panel)] p-3 md:w-72 md:border-b-0 md:border-r"
        aria-label="Search controls"
      >
        <h1 className="mb-3 text-base font-semibold">Find roofing leads</h1>
        <SearchControls
          form={form}
          center={center}
          locating={locating}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          onUseMyLocation={useMyLocation}
          onPickPlace={(p) => setCenter(p)}
          onClearPin={() => {
            setCenter(null);
            setResult(null);
            setSelected(new Set());
            setActiveParcel(null);
          }}
        />
      </section>
      <section className="relative min-h-[45vh] flex-1 md:min-h-0" aria-label="Map">
        <MapView
          center={center}
          radiusMiles={form.radiusMiles}
          rows={result?.rows ?? []}
          activeParcelId={activeParcel}
          selectedIds={selectedIds}
          onDropPin={(p) => setCenter(p)}
          onSelectParcel={(id) => setActiveParcel(id)}
        />
        <PropertyDrawer
          parcelId={activeParcel}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          leadId={activeParcel ? result?.leadIds[activeParcel] : undefined}
          onClose={() => setActiveParcel(null)}
          onCreateLead={(id) => void createLeads([id])}
          creating={creating}
        />
      </section>
      <section
        className="h-[45vh] w-full shrink-0 border-t border-[var(--line)] bg-[var(--panel)] md:h-auto md:w-[26rem] md:border-l md:border-t-0"
        aria-label="Results"
      >
        <ResultsPanel
          result={result}
          loading={loading}
          error={error}
          selectedIds={selectedIds}
          activeParcelId={activeParcel}
          creating={creating}
          createMessage={createMessage}
          onToggleSelect={(id) =>
            setSelected((s) => {
              const n = new Set(s);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onSelectAllVisible={(ids) => setSelected(new Set(ids))}
          onClearSelection={() => setSelected(new Set())}
          onOpen={(id) => setActiveParcel(id)}
          onCreateLeads={() => void createLeads([...selected])}
        />
      </section>
    </div>
  );
}
