import type { LeadCandidate } from "@crm/shared";
import { useState } from "react";
import { basisLabel, isLongOpen, openFor } from "../../lib/format.ts";
import { maxOpenDays } from "../map/layers.ts";
import { reportText, useConvert } from "./useConvert.ts";

const PAGE = 100;

export const targetOf = (c: LeadCandidate) => {
  const longest = [...c.openRoofPermits].sort((a, b) => (b.openDays ?? -1) - (a.openDays ?? -1))[0];
  return { propertyId: c.propertyId, permitId: longest?.permitId };
};

/** Matching candidates, best first, with multi-select and "Convert to leads". */
export function CandidateList({
  candidates,
  selectedId,
  onOpen,
  busy = false,
}: {
  candidates: LeadCandidate[];
  selectedId?: string | null;
  onOpen(id: string): void;
  /** A search is in flight (the list may still show the previous result). */
  busy?: boolean;
}) {
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { convert, pending, report, clear } = useConvert();
  const visible = candidates.slice(0, shown);
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShownPicked = visible.length > 0 && visible.every((c) => picked.has(c.propertyId));

  function convertPicked() {
    const targets = candidates.filter((c) => picked.has(c.propertyId)).map(targetOf);
    clear();
    convert(targets, { onSuccess: () => setPicked(new Set()) });
  }

  return (
    <section className="candidates" aria-label="Lead candidates" aria-busy={busy}>
      <div className="list-toolbar">
        <strong data-testid="candidate-count">
          {candidates.length.toLocaleString()} candidate{candidates.length === 1 ? "" : "s"}
        </strong>
        {candidates.length > shown ? (
          <span className="muted"> · showing the top {shown.toLocaleString()}</span>
        ) : null}
        <label className="select-all">
          <input
            type="checkbox"
            checked={allShownPicked}
            onChange={() =>
              setPicked((s) => {
                const n = new Set(s);
                for (const c of visible) {
                  if (allShownPicked) n.delete(c.propertyId);
                  else n.add(c.propertyId);
                }
                return n;
              })
            }
          />{" "}
          Select shown
        </label>
        <button type="button" className="primary" disabled={!picked.size || pending} onClick={convertPicked}>
          {pending ? "Converting…" : `Convert ${picked.size || ""} to leads`.replace("  ", " ")}
        </button>
      </div>
      {report ? (
        <p className="notice ok" role="status">
          {reportText(report)} <a href="#/leads">Open Leads</a>
        </p>
      ) : null}
      <ol className="candidate-list">
        {visible.map((c) => {
          const open = maxOpenDays(c);
          return (
            <li
              key={c.propertyId}
              className={c.propertyId === selectedId ? "selected" : undefined}
              data-testid={`candidate-${c.propertyId}`}
            >
              <input
                type="checkbox"
                aria-label={`Select ${c.address ?? c.propertyId}`}
                checked={picked.has(c.propertyId)}
                onChange={() => toggle(c.propertyId)}
              />
              <button type="button" className="link" onClick={() => onOpen(c.propertyId)}>
                <span className="addr">{c.address ?? `Parcel ${c.propertyId}`}</span>
                <span className="muted">
                  {c.city ?? ""} · score {c.score}
                </span>
              </button>
              <span className="facts">
                {c.roofAgeYears !== null ? (
                  <span className="chip">
                    roof {c.roofAgeYears} y <span className="muted">({basisLabel(c.roofAgeBasis)})</span>
                  </span>
                ) : (
                  <span className="chip muted">roof age unknown</span>
                )}
                {c.openRoofPermits.length ? (
                  <span className={`chip permit${isLongOpen(open) ? " long-open" : ""}`}>
                    {c.openRoofPermits.length > 1 ? `${c.openRoofPermits.length} permits, ` : "permit "}
                    {openFor(open)}
                    {isLongOpen(open) ? <strong> · Long-open</strong> : null}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      {candidates.length > shown ? (
        <button type="button" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, candidates.length - shown)} more
        </button>
      ) : null}
    </section>
  );
}
