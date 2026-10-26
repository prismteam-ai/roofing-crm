# Design attribute audit: property rows, drawer, permit cards, owner, Why panel

Sources: `design/docs/CRM-HANDOFF.md` section 4.3, `design/prototype/PropertyDetail.dc.html`,
`Explore1440.dc.html` (Why view), boards CrmProperty*. Status is checked against `apps/web/src`
and `packages/oracle-contract/src/columns.ts`.

Status key: **Shown**; **Shown now** (added by this change); **Blocked on Run 3.1** (Task A must
publish it); **Not in published data** (contract reason named); **Design only** (needs a decision).

## Property row and card (collapsed and expanded)

| Design attribute                              | Status                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Street address                                | Shown (`unnormalized_address`; 21 properties carry `source_missing`)                     |
| City, ZIP of the situs                        | Not in published data (`source_missing`; not split from the address text)                |
| TCAD id (shown in place of the address)       | Shown                                                                                    |
| Distance and bearing from the pin             | Shown                                                                                    |
| Roof age, basis, confidence                   | Shown (pill pair on the collapsed row; cells when expanded)                              |
| Roof age missing, with its reason             | Shown                                                                                    |
| Year built on the basis line                  | Shown now (expanded card, drawer, Why rule; `structureBuiltYear`)          |
| Permit chip (class, open years, derived word) | Shown; a permit with a final date reads `Finaled {date} (status not in source)` with no open duration |
| Permit status filter: Open, Stalled, Any       | Shown; Open = open or stalled (a stalled permit is open and not progressing), Stalled = stalled only; a permit with a final date is finished and never matches either (952 of the 1,674 stalled permits and 7 of the 80 open ones carry one in Run 3.1, leaving 722 stalled and 73 open); applied by the server to every property in range before paging and counting |
| Source's own permit status word               | Not in published data (`status_raw`: `no_lexicon_carrier`; stalled is derived)           |
| Out-of-area owner pill                        | Shown (collapsed badge row, expanded card and the drawer's Owner section)                |
| Lead pill, checkbox, Hide existing leads      | Shown (Leads and Candidates)                                                             |
| Source record link                            | Shown now (expanded card provenance line, https only)                                    |

## Property drawer

| Design attribute                                          | Status                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Header: address as the title, then the TCAD id            | Shown (city and ZIP: not in published data, `source_missing`)              |
| Create lead, Open lead, lineage link, Ask about it        | Shown                                                                      |
| Roof: age, confidence, basis                              | Shown                                                                      |
| Roof basis "Year built 1995"                              | Shown now (when basis is built_year and the year exists)                   |
| Evidence chain (reroof permit, CID, copy)                 | Shown (Evidence line under Roof: basis, source, run, CID)                  |
| "Reroof permit not counted: never finaled" note           | Shown (worded "A roofing permit exists but was never finaled")             |
| Street View / imagery                                     | Shown as a disabled "Coming soon" row (no imagery in the contract)        |
| Owner name, kind                                          | Shown                                                                      |
| Owner mailing location (state, ZIP, Local / Out-of-area)  | Shown (city: not in published data)                                        |
| Owner area (in county, regional, out of area)             | Shown; unknown carries its reason                                          |
| Last sale                                                 | Shown now (the date; reason `no_dated_sale` when null)                     |
| Tenure "22 yrs"                                           | Shown now (reason `no_dated_sale` when null); tenure basis line kept       |
| Owner merged from N records                               | Shown as a disabled "Coming soon" row (no merge data in the contract)      |
| Location: coordinates, coordinate source                  | Shown                                                                      |
| Metadata: source, captured date, run, CID per field       | Shown (licence column is design only)                                      |
| "source record" link in provenance                        | Shown now (`sourceUrl`, https only; stated reason when absent)             |
| Similar properties                                        | Shown (collapsed section; rules read from `search.similar`)                |
| Show on map, Open field meanings in the catalog           | Design only                                                                |

## Permit cards

| Design attribute                              | Status                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Permit number, status class, work type        | Shown                                                                                    |
| Issue date, open duration                     | Shown                                                                                    |
| Source's own status word ("source says ...")  | Not in published data (`status_raw`: `no_lexicon_carrier`)                               |
| Expiry date                                   | Not in published data (`expiry_date`: `no_lexicon_carrier`)                              |
| Description, work class as printed            | Not in published data (`description`, `work_class_raw`: `no_lexicon_carrier`)            |
| Close date, final inspection date             | Not in published data (0 of 15,025 on Run 3, always `source_missing`)                    |
| Contractor as printed, with badge             | Shown (reason shown when unpublished)                                                    |
| BBB state                                     | Shown; rating Not in published data (`bbb_rating`: `bbb_blocked`)                        |
| BBB search link                               | Shown (https only)                                                                       |
| "Source: Austin permits {number}" link        | Shown now (`sourceUrl`, https only; stated reason when absent)                           |
| Create lead from this permit                  | Shown                                                                                    |

## Why panel

| Design attribute                                  | Status                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Rules with value, source, run, CID                | Shown                                                        |
| Roof rule: basis, year built, confidence          | Shown (year built is new)                                    |
| Permit rule with "source says {word}"             | Not in published data (`status_raw`); derived class is shown |
| Coordinates, bearing, OpenStreetMap link          | Shown                                                        |
| "source record" link on Coordinates               | Shown now (https only)                                       |
| Verify CID, Details, Back to results              | Shown                                                        |

## Other design-only items noted

Save search and lead-status outlines on markers need a product decision before any build. They
have no data behind them in the contract. Street View and Merged from are disabled "Coming soon"
rows in the drawer; Similar properties is built.

## Roof-age confidence audit

Confidence is shown beside every roof age in: collapsed and expanded result rows, the drawer Roof
section, the Why panel roof rule, the triage card, candidate rows, candidate summary text and the
leads table when the lead stored it. Two gaps remain and need changes outside this change's files:

- Lead detail shows "Confidence: not saved with the lead" (a stated reason). The lead snapshot
  (`LeadCreateAction.tsx`, `agent.ts` signals) does not store `roofAgeConfidence`.
- The Ask agent's row text (`askCopy.ts` `rowRoofText`) shows age and basis without confidence;
  the agent row type does not carry it.
