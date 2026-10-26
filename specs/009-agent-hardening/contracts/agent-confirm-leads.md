# tRPC contract: `agent.confirmLeads`

Ask-in-map (AI mode): the "Create leads for all n" action confirms several proposals from one
conversation in one call. It is a plain, non-model-invoked mutation, the batch twin of
`agent.confirmLead` (see `agent-api.md`), behind the same Cognito JWT authorizer.

## Input

```ts
{
  threadId: string;       // the thread the proposals were made in
  tcadIds: string[];      // 1..25, repeated ids are collapsed
}
```

## Output (never throws for a per-item problem)

```ts
{
  created: { tcadId: string; leadKey: string; leadId: string }[];
  alreadyLeads: string[];                       // tcadIds that were already leads (not an error)
  failed: { tcadId: string; code: ConfirmFailureCode }[];
}
// ConfirmFailureCode =
//   "NOT_PROPOSED"    not proposed to this rep in this thread (or the thread is another user's)
//   "NOT_FOUND"       no property row for that tcadId in the current index
//   "NO_COORDINATES"  the row has no published coordinates; no lead is written, nothing invented
//   "INDEX_NOT_READY" the index is not available
//   "CREATE_FAILED"   the lead write failed for another reason (logged server-side)
```

Each id appears in exactly one of the three lists. Results keep the order of `tcadIds`.

## Behavior

1. One `confirm` rate-limit check per batch (same 5 per minute per user limit as `confirmLead`, its
   own window). Over the limit the whole call throws `TOO_MANY_REQUESTS` with `appCode: "RATE_LIMITED"`
   and nothing is looked up or written.
2. One consistent read of the thread record answers "was this proposed to this rep in this thread"
   for every id. Another user's thread, or an unknown thread, yields `NOT_PROPOSED` for every id.
3. Per item, with at most 3 in flight: look the property up in the index, refuse
   `NO_COORDINATES` if it has none, then call `LeadService.create` (the same call `leads.create`
   and `confirmLead` use) with a lead built server-side from the index row only (`address` is
   `TCAD {id}`, `sourceManifestCid` is the row's own manifest, `createdFrom: "agent"`). Nothing
   comes from the client but the ids.
4. A duplicate lead (`LeadAlreadyExistsError`) goes to `alreadyLeads`.

Undo is the existing `leads.undoCreate({ leadKey, leadId })`, called per created item with the
`leadKey` and `leadId` returned here.

## Related fix

`agent.confirmLead` now maps an existing lead to `CONFLICT` with `appCode: "ALREADY_EXISTS"` (as
`leads.create` does) instead of letting the raw error surface as a 500.

## Infra

No change: the Lambda already has `crm-agent-usage` `GetItem` and `UpdateItem` (thread record,
rate limit) and the `crm-leads` writes `LeadService.create` needs.
