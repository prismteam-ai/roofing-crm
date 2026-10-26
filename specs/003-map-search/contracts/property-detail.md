# Contract: `property.get` (new tRPC procedure) — the detail drawer

New procedure on the existing `appRouter`, calling the existing B-02 `LeadIndex.getProperty`
(unchanged) and adding the contractor/BBB and "lineage" fields the drawer needs.

**Input** (Zod): `{ propertyCid: string (CIDv1) }`

**Behavior**:
1. Call `leadIndex.getProperty(propertyCid)` — returns `(PropertyResult & { permits: PermitResult[] }) | null` (existing B-02 contract, unchanged). Return `property: null` immediately if this is `null` — never throw (constitution: typed "not in this run" state, not a 500).
2. For each permit, read `bbb_status`/`bbb_status_reason` from the vendored `v_contractor`/`v_roofing_permit` columns (`packages/oracle-contract`) — these are not yet projected fields on `CrmPermit`, so this procedure reads them directly from the vendored view binding, the same way the B-02 sync job does, never recomputing or guessing a rating.
3. Construct `lineageUrl`: a link back to Task A's published record for this `propertyCid` (new in the CRM; not part of B-02's contract). Exact URL shape is a builder decision (tasks.md), not fixed here — but it MUST resolve to a real, already-published Task A record, never a placeholder.
4. Return `{ property, permits, bbbStatus, bbbStatusReason, lineageUrl, manifestCid, traceId }`.

## The BBB-absent and no-contractor states (AC-7 and the edge case)

- `bbbStatus !== "rated"` → the drawer renders "BBB rating not available" + the literal
  `bbbStatusReason` text. In the sample data this story is tested against, `bbb_status` is always
  `"not_checked"` (vendored `BBB_SOURCE` constant) — this is the expected, common response shape,
  not a rare edge case.
- `contractorResolution` indicating no contractor was resolved on a permit → the drawer uses the
  copied `CrmPropertyNoContractor390` state (from A-13's `ORACLE-u` worktree) — never omits the
  field or shows a placeholder name.
- Neither state is ever a blank field (constitution XI, P0-4).

## Acceptance mapping

| AC | Covered by |
| --- | --- |
| AC-6 | Steps 1, 3 — status, open duration (`openDays`/`openDurationLabel`), contractor name, `lineageUrl` |
| AC-7 | Step 2 + "The BBB-absent … states" above |
