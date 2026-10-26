# B-07 known gaps (input for a follow-up story)

Recorded while proving B-07 on the hosted preview (`007-leads`, sample manifest
`bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`: 14 properties, 35 permits).
Each row says what is missing, why, and what closes it. Decision 2026-10-24 (PO): the A-11
dependency moves out of B-07 into a later story.

## 1. Needs the full-county data (A-11 Run 1) — step S, the data switch

| # | Gap | Why it is open | What closes it |
| --- | --- | --- | --- |
| 1.1 | AC-4 at scale: "50 or more leads", filters, list and map agree | The sample holds 14 properties, so at most 14 leads can exist | Switch to the full-county manifest, then create 50+ leads and re-run TC-011 at scale |
| 1.2 | TC-NF-03: list and map load p95 < 3 s with 50+ leads | Same | Same, then measure |
| 1.3 | Sync at full scale never proven | The sync has only run on 35 permits (6 s). Full county is about 442k parcels and 15,025 roofing permits (Task A Run 2); Lambda memory, timeouts and the 3 s cold-load budget are untested | Run `crm-sync` on the full manifest; check counts match the manifest |
| 1.4 | The full-county manifest is not verified | Update 2026-10-24: Run 1 failed Task A's identity gate and is replaced by Run 2 (`travis-full-run2-20261024`, manifest `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`, 15,025 roofing permits), still uploading. Originally: Run 1 was `travis-full-run1-20261023`, manifest `bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu`, on Task A branch `011-publish-and-runs`. The manifest file on disk says "DRAFT… not uploaded"; A-11 is not merged; Atlas registration is pending. The CID has not been checked with `verify-manifest` | `verify-manifest`, then PO confirms the CID (the sample-first guide requires this), then re-sync |
| 1.5 | Test data tied to the sample | The three test properties (P_5_52, P_AGE48, P_5_89), their roof ages and distances are sample values | Re-derive them against the full county before re-running the suite |

## 2. AC-5 "not in Run {n}"

| # | Gap | Detail | What closes it |
| --- | --- | --- | --- |
| 2.1 | No run *number* | The index carries only a manifest CID and a `runId` string. The UI shows the real `runId` and never invents "Run 4" | Decide what "Run {n}" means (position in `runs/index.json`?) and expose it, or change the AC wording to the run ID |
| 2.2 | Not proven against a real second run | TC-014/015 use a deliberately stale fixture lead (`48453:tcad:B07STALE`, manifest of the full-county run, property absent from the current index) | Re-prove when two runs exist and one drops a property |

## 3. Data and contract limits (Task A)

| # | Gap | Detail |
| --- | --- | --- |
| 3.1 | Contractor never in the snapshot | Every permit in the sample has `contractorResolution = unresolved`, so no name exists to store. The UI shows "Contractor not published" |
| 3.2 | No street address | The contract publishes none (FU-A-01); leads are labelled "TCAD {id}" |
| 3.3 | FIPS is a constant | `48453` (Travis) is hard-coded in the create action because the contract has no fips field |
| 3.4 | BBB rating | Always "not available" in the sample |

## 4. Product and design gaps found while testing

| # | Gap | Detail |
| --- | --- | --- |
| 4.1 | `leads.create` trusts the client | The server accepts any request identifier, `sourceManifestCid` and `fips` from the caller without checking that the property exists in the current index. The stale-lead fixture relied on this. Constitution: no invented data |
| 4.2 | `leads.list` paging | Capped at 1000 leads per query and paged with an offset cursor held in memory, not a DynamoDB cursor |
| 4.3 | Stale notes if a note is added within ~40 ms of a status change | Two refetches race in the browser. Server data is correct. Partly mitigated: "Add note" is disabled while a status save is pending |
| 4.4 | No lead delete in the product | The e2e cleanup deletes rows directly from DynamoDB (allow-listed keys only). A rep cannot remove a lead by mistake |
| 4.5 | List status/assignee queries | Lead lists are newest first; no secondary ordering or other sort options |

## 5. Environment

| # | Gap | Detail |
| --- | --- | --- |
| 5.1 | Lambda concurrent executions = 10 | New Free-plan account; raising it needs a paid plan, so it was not requested. The 20-concurrent-create test retries throttled calls and still proves 1 winner, 19 "Already a lead", 1 row. Not a cause of the earlier note flake (that was a test defect, now fixed) |
| 5.2 | B-02 T042 | Re-run on the sample succeeded 2026-10-24 (6 s, pointer set, 14 / 35). The full-county re-run belongs with 1.3 |

## 6. Process notes

| # | Note |
| --- | --- |
| 6.1 | Several fixes were written in one pass with their tests, not shown failing first (the API tests for the snapshot and AC-5 work). The web tests were seen failing first |
| 6.2 | The approved test-case document (`testplans/B-07-test-cases.md`) predates the route fix (`/` not `/map`), TC-002's per-permit button, TC-015b, and the saved-notes-list assertion; it needs a version bump |
| 6.3 | Defects found only by running on the live stack (all fixed, each with a unit test): missing tRPC error formatter, wrong `META#index` key on a pk+sk table, first-ever Promote, TransactionConflict surfacing as HTTP 500, oldest-first lead list, note shown with its storage wrapper, un-tokened Status select, permit missing from the snapshot, AC-5 flagging on manifest change alone |

## 7. Found by the review round (2026-10-24; not fixed in B-07)

| # | Source | Finding | Severity |
| --- | --- | --- | --- |
| 7.1 | metagross, code-review | Ownership and roles: `get`, `updateStatus` and `addNote` accept any `leadKey` with no ownership or role check; an explicit `assignee` on `list` can read another user's leads. The product rule (private leads, or a shared team view) is undecided | Medium |
| 7.2 | metagross | Create is not idempotent across an ambiguous failure: no `ClientRequestToken`, so a retry after an ambiguous create failure could report "Already a lead" for the caller's own write; `TransactionInProgress` and provisioned-throughput throttling are not retried (the pure `TransactionConflict` retry exists since `7eb800d`) | Medium |
| 7.3 | code-review | The web client never sends `expectedSequence`, so two open sessions on one lead overwrite each other's status or note without a `STALE_SEQUENCE` error | Medium |
| 7.4 | code-review | `append` maps any `ConditionalCheckFailed` to "changed since you loaded it", which hides a deleted lead or an existing event item | Low |
| 7.5 | code-review | `notInRunKeys` and `currentManifest` swallow index errors with no log, so an index outage makes stale leads look current | Medium |
| 7.6 | code-review | Lead filters now ask the index for up to 1,000,000 rows (fixed the 100-row truncation); untested at full-county size (about 442k parcels) in the Lambda. Filtering should move into the index query | Medium |
| 7.7 | metagross | `withAppCode` copies any string `cause.code` (including AWS SDK error codes) to the wire; unexpected errors are logged by code only, with no error name | Low |
| 7.8 | metagross | `crm-leads` table name is hard-coded in the CDK stack, which blocks several environments | Low |
| 7.9 | audino | No per-datum provenance on assignee and created-at in the list card and detail; filter groups use a `<span>` label; the Status field's `<dt>` is not associated with the select; status shown lower-case in the detail but capitalised in the list; no inline validation on the numeric filter inputs; focus is not moved to the error banner after a failed create | Low to Medium |
| 7.10 | audino | TC-016 accepts either "No leads yet" or a count and skips when the user already has leads, so it proves the empty state only on a fresh list; the token audit covers a fixed property list on two pages and not the create, empty and error states | Medium |
| 7.11 | metagross | The vitals spec `A-13-vitals.spec.ts` (Oracle) was deleted to unblock CI; it could not run in this repo | Info |
| 7.12 | metagross (re-score) | `presentRequestIdentifiers` calls `indexInfo()` again, so in a narrow window it can read a different manifest than the `current` value the caller used | Low |
| 7.13 | metagross (re-score) | A lead key with no `:tcad:` marker gives an empty identifier, so that lead is always flagged absent | Low |
| 7.14 | metagross (re-score) | The NOT_FOUND message echoes the lead key | Low |
