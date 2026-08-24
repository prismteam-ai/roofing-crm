# PR evidence map — Chester real vs demo

Paste into the PR body when ready for Slowking. Replace URLs with the deployed runtime.

## Live runtime

- **Web:** `<Amplify URL>`
- **API:** `<API Gateway URL>`
- **Credentials:** none (public HTTPS)

## Dataset counts (published 2026-08-25)

| Dataset             | Properties | Permits                                    |
| ------------------- | ---------- | ------------------------------------------ |
| Chester (real)      | 87,274     | 2,630 (0 roofing-classified)               |
| Chester (demo data) | 87,274     | 3,130 (2,630 real + 500 synthetic roofing) |

## Where each acceptance criterion is demonstrated

| Criterion                        | Where                      | What you should see                                                                                       |
| -------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Map defaults to Chester          | Territory picker           | Default **Chester (demo data)**; also **Chester (real)** listed                                           |
| GPS or pin-drop                  | Prospect map               | West Chester pin; locate control uses browser GPS                                                         |
| Configurable radius              | Prospect → Radius          | Live re-query                                                                                             |
| Roofs older than threshold       | Prospect → Roof older than | Works on **demo**; real Chester has no published roof ages                                                |
| Open roofing permits / long-open | Prospect → Permit filters  | Demo: labeled synthetic roofing + roster BBB; Real: UCC vs GIS classes, no contractor/BBB                 |
| Permit detail + contractor + BBB | Prospect → row click       | Demo badge: “Synthetic demo signal — clearly labeled for evaluation.”                                     |
| Ranked candidate list            | Prospect → candidates      | Sorted by shared `scoreLead` (age + open years, synthetic demoted); score ties fall back to nearest-first |
| CRM leads                        | Pipeline                   | Idempotent convert; `provenanceTier` + `leadScore` stamped server-side from recomputed permit signals     |
| RAG agent                        | Ask                        | Corpus `county: chester-demo`; citations match map                                                        |
| Ingestion out of scope           | Dataset / provenance       | Consumes Elephant publish; collects nothing                                                               |
| Disabled expansions              | Top nav                    | Estimates / Jobs / etc. disabled                                                                          |

## Honesty

- Demo tables never served under unsuffixed `chester`
- Coverage: 42 of 73 municipalities — never full-county
- Real Chester: no invented roof ages or roofing UCC claims
