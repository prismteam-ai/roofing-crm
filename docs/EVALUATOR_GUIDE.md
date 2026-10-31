# Evaluator guide

Open the [CRM workspace](https://d1rvqgm0k272e6.cloudfront.net) over HTTPS and enter the low-privilege evaluator capability from this PR's access section. No clone, installation, Docker, local server, initial private email exchange or AWS account is needed. The capability opens bounded source-backed evidence and isolated lead workflows; it grants no administration, source acquisition, publication or outreach.

## Five-minute walkthrough

1. Confirm the displayed data mode and snapshot. Choose a map center using GPS or a pin, then adjust the radius. If location permission is denied, use the pin controls; no permission change is required.
2. After sign-in, open the [City of Novi strict age example](https://d1rvqgm0k272e6.cloudfront.net/?lat=42.4810994939&lng=-83.4950218553&radius=8046.72&age=15&unknownRoof=0&limit=50&place=us-26-125-59440-city&placeDigest=7bcbfb5191d87f7f40d5364ec5d5058c107f2033ade5312fc5c9b98ac9a2a51f). This link sets the official city center `42.4810994939, -83.4950218553`, a five-mile radius, proxy age greater than 15 years and unknown ages excluded; the current health response supplies the loaded snapshot. Confirm **Search radius** is **5 miles**, **Filter by roof age** is checked and **Roof age** is **15**. The link explicitly sets `unknownRoof=0`; there is no separate unknown-age checkbox. Leave **Permit opportunity** at **No permit filter** to avoid adding a roofing-permit requirement. The CRM has pin/GPS controls rather than a city selector; the agent can also resolve an explicit city name. The accepted dated baseline returned 648 matches / 50 rows. Check the current receipt before treating those as current counts. Building year is labeled as a low-confidence roof-age proxy, not an installation date.
3. Inspect synchronized map/list results and open a property. Review source dates, confidence, coverage and citations. A bounded page is not the whole result set.
4. Save one assessment lead, change its status and note, refresh and inspect versioned history. No outreach is sent. Preserve a draft note if a version conflict requires reloading the current lead.
5. Ask the grounded agent the same age/radius question. Inspect its constraint ledger, retrieval trace and citations, then apply the result to the map/list. Accepted nonempty answers use one typed tool call and at most two bounded reads; empty/refused requests skip the model.
6. For permit follow-up, move the pin to source-covered City of Troy (`42.5790196146, -83.1483459216`), retain five miles and disable the separate roof-age filter. Compare **Confirmed open / active** using a five-year issue/status-age threshold with **Status verification needed**. Inspect a real candidate, its native status/date/age basis, unverified reported party and provenance. The agent keeps strict confirmed results separate from verification alternatives, with a separate apply action; those alternatives are not open permits. [Permit opportunities](PERMIT_OPPORTUNITIES.md) gives the exact controls and API fields; [known limitations](KNOWN_LIMITATIONS.md) retains the current-open/continuous-duration gap.
7. Inspect contractor/license or recorded-deed-gap evidence only at the claim strength supported by its source. A current-PIN deed-index gap does not prove uninterrupted legal ownership, and unavailable BBB information is not a zero rating.
8. Sign out and confirm the protected workspace closes. Future CRM modules remain disabled. The matching [Oracle workspace](https://dknck94i8grek.cloudfront.net) exposes run, coverage and artifact evidence.

No paid source is required, purchased or needed to reproduce this runtime. Original source-positive outcomes remain distinct from safe empty-result behavior.

## Release identity and availability

[Release status](RELEASE_STATUS.json) records dated accepted technical history and its evidence hash. The final access package supplies a source-independent promotion receipt binding the served frontend and API to final head/tree, package, contract and snapshot. A documentation revision or successful health response alone is not later-release acceptance. Earlier accepted browser/API/MCP/map/model/lead checks are complete evidence for their exact identities, not a permanently pending checklist.

The approved PR supplies the dated retained-through/dependency limits and remaining model headroom from the latest actual readback. Historical expiry dates are not a fresh fourteen-day promise. Runtime/map expiry, one-hour sessions and capability-until-rotation are separate. No perpetual availability is promised.

Official public identities and permitted source observations are visible. Inspect a real address, PIN/KEYPIN or native ID, canonical identity, coordinates, roof-age basis and provenance. Show the optional official parcel/postal observation only when actually admitted; null names and absent contacts remain unavailable. Re-enter the PR capability for a new one-hour session while valid; keep cookies and privileged secrets out of reports.

## Quotas and recovery

Hosted per-subject limits are 600 reads/hour, 100 writes/hour and 10 authentication attempts/minute. Agent endpoint admission is 40 requests/session-hour and 240/day globally. The shared durable validated-request budget is 200 total / 160 per UTC day / 40 per session-hour; Converse attempts are separately capped at 120 total / 80 per UTC day / 40 per session-hour. Failed attempts keep their reservations. Redeploy, sign-out and UTC rollover do not reset cumulative limits.

At the accepted 2026-10-29 snapshot, 77 Converse reservations left 43 cumulative and only 4 that UTC day; validated requests were 110 total / 108 that day. These are dated observations, not current remaining allowance. Rehearsal, evaluator and operator calls share the ledger. The final receipt must include a fresh headroom observation; do not repeatedly submit requests to test a limit.

- **Session expired or access denied:** re-enter the capability from the current PR once if it remains valid. Revoked/rotated access requires the updated PR access instructions; no AWS credentials are needed.
- **Quota response:** stop retries. Observe the response's reset information and the applicable UTC/session window. A cumulative cap requires an owner decision, not repeated sign-ins or a reset workaround.
- **Cold load or transient connection error:** allow the initial load to finish, then use the visible retry once. If DNS/TLS or service errors persist, record the time, route and sanitized status. Do not blindly repeat lead writes or model calls whose outcome is unknown; check lead history first.
- **Map unavailable:** continue with accessible points, pin controls and the list. Repeated provider failure is a release defect; fallback is not proof of a working live map.
- **Empty or refused evidence query:** inspect the applied constraints and source coverage. Do not weaken filters silently or infer missing evidence.

The current final first-use receipt must identify the actual fresh contexts and API/MCP clients exercised for that exact release. Prior context counts are historical evidence, not a current pass. Media recording may be prepared locally; upload, PR creation and official submission are separate unperformed external gates.
