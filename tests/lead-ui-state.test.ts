import { it, expect } from "vitest";
import {
  LeadMutationGate,
  confirmedLead,
  mergeLeadRows,
  parsedLeadRows,
  unchangedSubmittedDraft,
} from "../apps/crm-web/src/lead-state";
const lead = {
  id: "lead-synthetic",
  sessionId: "synthetic-session",
  propertyId: "synthetic-property",
  snapshotId: "synthetic-snapshot",
  status: "new" as const,
  version: 1,
  events: [{ kind: "created", at: "2026-10-28T00:00:00Z" }],
};
it("serializes synchronous events and an old session ticket cannot release a new session mutation", () => {
  const gate = new LeadMutationGate(),
    a = gate.start()!;
  expect(gate.start()).toBeNull();
  gate.reset();
  const b = gate.start()!;
  expect(gate.finish(a)).toBe(false);
  expect(gate.start()).toBeNull();
  expect(gate.finish(b)).toBe(true);
  expect(gate.start()).not.toBeNull();
});
it("only complete schema-valid identity-bound next-version replies can confirm an update", () => {
  const expected = { ...lead, previousVersion: 1 };
  const next = { ...lead, status: "qualified", version: 2 };
  expect(confirmedLead(next, expected).version).toBe(2);
  for (const patch of [
    { id: "other" },
    { sessionId: "other" },
    { propertyId: "other" },
    { snapshotId: "other" },
    { version: 1 },
    { version: 3 },
    { events: undefined },
  ])
    expect(() => confirmedLead({ ...next, ...patch }, expected)).toThrow();
  expect(
    confirmedLead(
      { ...next, version: 5 },
      {
        sessionId: lead.sessionId,
        propertyId: lead.propertyId,
        snapshotId: lead.snapshotId,
      },
    ).version,
  ).toBe(5); // idempotent create may already exist
});
it("old or missing list snapshots cannot regress a confirmed lead, including equal-version contradictory data", () => {
  const v2 = { ...lead, status: "qualified" as const, version: 2 };
  expect(mergeLeadRows([v2], [lead], lead.sessionId)).toEqual([v2]);
  expect(mergeLeadRows([v2], [], lead.sessionId)).toEqual([v2]);
  expect(
    mergeLeadRows([v2], [{ ...v2, status: "new" }], lead.sessionId),
  ).toEqual([v2]);
  const v3 = { ...v2, status: "archived" as const, version: 3 };
  expect(mergeLeadRows([v2], [v3], lead.sessionId)).toEqual([v3]);
  expect(() =>
    parsedLeadRows([{ ...lead, sessionId: "foreign" }], lead.sessionId),
  ).toThrow();
  expect(() =>
    mergeLeadRows([v2], [{ ...v2, propertyId: "other" }], lead.sessionId),
  ).toThrow();
});
it("only the exact submitted draft revision may be cleared; editing away and back retains it", () => {
  const draft = { value: "Synthetic note", revision: 2 };
  expect(unchangedSubmittedDraft(draft, { ...draft })).toBe(true);
  expect(unchangedSubmittedDraft(draft, { ...draft, revision: 4 })).toBe(false);
  expect(unchangedSubmittedDraft(draft, { value: "Edited", revision: 2 })).toBe(
    false,
  );
});
it("a successful status/note reply must confirm that exact change and one appended history event", () => {
  const note = {
    ...lead,
    version: 2,
    events: [
      ...lead.events,
      { kind: "note", at: "2026-10-28T00:00:01Z", note: "Synthetic note" },
    ],
  };
  const binding = {
    ...lead,
    previousVersion: 1,
    previousEventCount: 1,
    change: { note: " Synthetic note " },
  };
  expect(confirmedLead(note, binding).events.at(-1)?.note).toBe(
    "Synthetic note",
  );
  for (const bad of [
    { ...note, events: lead.events },
    {
      ...note,
      events: [...lead.events, { ...note.events[1], note: "Different" }],
    },
    {
      ...note,
      events: [...lead.events, { ...note.events[1], kind: "status:qualified" }],
    },
  ])
    expect(() => confirmedLead(bad, binding)).toThrow();
  const status = {
    ...lead,
    status: "qualified",
    version: 2,
    events: [
      ...lead.events,
      { kind: "status:qualified", at: "2026-10-28T00:00:01Z" },
    ],
  };
  expect(
    confirmedLead(status, { ...binding, change: { status: "qualified" } })
      .status,
  ).toBe("qualified");
  expect(() =>
    confirmedLead(
      { ...status, status: "new" },
      { ...binding, change: { status: "qualified" } },
    ),
  ).toThrow();
});
