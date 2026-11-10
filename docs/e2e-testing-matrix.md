# Hosted E2E execution matrix

This suite runs against the public deployment, with real pipeline MCP data, isolated browser workspaces, and start/end build-SHA guards. It does not start a fixture server. **The final release gate remains incomplete.** A passing family below is not a claim that every control/state or acceptance criterion has passed.

## Run

```sh
EXPECTED_SHA=<reviewed-deployed-sha> HOSTED_RUN=<unique-evidence-id> node scripts/run-hosted-e2e.mjs
```

Nine configured projects: Chromium, Firefox and WebKit at widths390,768,1440. The runner is serial to avoid turning a walkthrough into a load test. Reports, per-case source/build/network evidence, screenshots and failure traces are under `apps/web/test-results/hosted/<run>/` and `apps/web/playwright-report/hosted/<run>/`. Each invocation gets its own directory; retain failed/interrupted results and append retests.

On the assessment workstation, Chromium is at `/home/vladsterian/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`; override `CHROMIUM_PATH` elsewhere. Firefox installed through Playwright. WebKit required Ubuntu libraries absent from the workstation; these were downloaded without sudo and unpacked to `/tmp/prism-webkit-libs`, and `WEBKIT_PATH=/tmp/prism-webkit-2287.sh` selects its wrapper with the private library/TLS-module path. This is an environment prerequisite, not a product change or a waived browser variant.

## Executable case families and concrete controls

| Family              | Criteria        | Controls and assertions                                                                                                                                                                                                                                  |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default/inventory   | C01,C13,S01–S06 | Cook County/Evanston default; live MCP source, run/CID/counts; map canvas; default age/radius; map/leads navigation, back/forward/reload; limitations disclosure; each of five disabled sections, title and disabled semantics; responsive page overflow |
| Places/filters      | C02–C04,C06     | Place dropdown options, ZIP input + Enter, manual lat/lon + Set pin, radius slider, roof threshold, confidence low/medium/high, open permit and long-open toggles, duration input; server rows satisfy roof/open predicate                               |
| GPS                 | C02             | Real browser-context permission granted, coordinates update; denied state and manual recovery; separately unsupported geolocation and invalid manual latitude                                                                                            |
| Map/drawer          | C02,C05,C06     | Zoom in/out, map pin drop, candidate selection and matching PIN; roof basis/confidence; parcel URL; close drawer; mobile controls→map→results order                                                                                                      |
| Lead CRUD           | C05,C07–C10,X01 | Real open permit contractor/BBB/source, Add with permit; every lead status; notes blur/save + reload; roof/status/open/duration/radius lead filters; second-context isolation; delete cancel/confirm + reload; only this test workspace cleaned          |
| Controlled failures | S07,C12         | Browser-local search and agent503 injection, explicit visible errors; unroute and real-search recovery; input usable after agent error; injected failures remain separately labelled                                                                     |
| Real RAG            | C11,C12,CV07    | Exact README example chip, real LLM mode, recorded answer and citations/no-match evidence; empty-send disabled; example controls inventoried                                                                                                             |
| Canonical journey   | CV01–CV09       | Ordered journey below, with real lead creation/RAG/filtering and cleanup                                                                                                                                                                                 |

Rendered inventories are attached as `control-inventory-*` JSON. They include tag, stable test ID, role, label, type, href and disabled state. These inventories must be reconciled with actual exercised actions before claiming full control coverage; inventory alone is not passing interaction coverage.

## Frozen canonical video/test inputs

The `CV01-CV09` test executes the canonical order: county default → manual pin42.0451,-87.6877 and radius5mi → roof age15 → open permits and duration≥3years → PIN`13032280210000`,4055 W GLENLAKE AVE, contractor/BBB/source → Add with permit → exact query `Show me open roofing permits older than five years within five miles of Evanston` → lead status`contacted`, minimum roof15 and radius5 → each disabled future section. It then deletes only its own lead. The final video must use these same actions/inputs/record; any changed record/prompt reopens this test.

## Recorded baseline evidence

- Build`45af5d1`, Chromium1440: four hosted families passed: default/navigation/disabled inventory; place/ZIP/all filters; map/drawer; complete lead CRUD/filter/persistence/isolation/delete flow. JSON/report retained in `/tmp/prism-hosted-evidence/crm-baseline-first/hosted/`.
- Build`45af5d1`, WebKit1440: default/navigation/provenance/inventory passed after resolving private TLS dependencies (`webkit-probe3`).
- A broad baseline attempt was deliberately interrupted when the parent began deployment; it is not final-build evidence. It recorded one passing Chromium390 default case; subsequent interrupted/not-run cases remain incomplete.

## Remaining blockers and coverage gaps

- Full nine-project final run and exact per-case result ledger are pending the final deployed SHAs. Old-build passes cannot satisfy final review.
- Every example chip, all repeated record/source/BBB-link variants, actual marker-button click, compass/touch/keyboard map actions and focus-return/Escape behavior are not yet fully exercised. Not counted as covered merely because they appear in the inventory.
- Empty/invalid/boundary roof/radius inputs, rapid-change races, provider timeout/rate-limit recovery and all link destinations need complete variant coverage.
- A current BBB rating is not fabricated. The tested drawer shows an explicit missing/stale state; a real archived-rated contractor path still needs a demonstrable known record.
- Browser-local injected errors prove error rendering, not successful integration. Live success cases use the deployed pipeline/MCP/LLM.
- Criterion and control coverage must be counted separately from test-family totals. No final signoff, video recording or Ready transition is justified by this partial baseline.
