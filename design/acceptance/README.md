# Acceptance flows

Playwright scripts that drive the prototype and print `PASS` / `FAIL` per check. They are the behaviour contract: point them at your build (same routes, same accessible names) and every line should still pass.

```
npm i && npx playwright install chromium
npm run serve            # terminal 1: serves ../prototype on :8765
npm run all              # terminal 2: every flow
BASE=http://localhost:3000/ node mapflow.js   # against your build
```

| Script | Checks |
|---|---|
| clickflow | The CRM demo walk: sign in → map, GPS and denied → Drop pin, crosshair, ring handle and 25 mi slider, agent → Show on map → Create lead with confirmation, Coming-soon tooltips and pages, Apps → Hub |
| mapflow | CRM map: centre, radius, roof age, permit filter, sort, URL state, markers |
| candflow | Candidate list, drawer, Create lead, Already a lead, bulk Create n leads |
| triflow | Field triage at 390: swipe, buttons, Undo |
| shellflow | CRM shell: rail, bottom nav, More, account, data chip |
| leadsflow | Leads list filters and the URL |
| leadflow | Lead: status, assignee, notes, History, reload persistence |
| askflow | Ask the agent: answer, citations, map pins, confirmation before create |
| statesflow | Loading, empty, error, partial, rate-limited |
| pagedflow | Leads list paging with combined filters in the URL (team sample), team leads kept out of the shared store |
| ovflow | One overlay at a time: menus, panels and sheets close each other; at 390 the map chips step aside |
| v1flow | App switcher menu (menu button, Roofing CRM current, Escape and focus return, in the 390 More sheet), partial-data states (address and contractor not published on every screen), derived status, no BBB score, 48 px data-panel Close |
| a11yflow | Map keyboard, focus traps, Escape, 48 px, reduced motion, 390 primary actions |
| crmaudit | Contrast (light and dark), target size, pill text, marker labels on every Crm board → `audit.json` |

## Results (prototype, round CRM-R2, 2026-10-22)

| Flow | Pass | Fail |
|---|---|---|
| clickflow | 20 | 0 |
| mapflow | 47 | 0 |
| candflow | 26 | 0 |
| triflow | 45 | 0 |
| shellflow | 26 | 0 |
| leadsflow | 29 | 0 |
| leadflow | 29 | 0 |
| askflow | 33 | 0 |
| statesflow | 10 | 0 |
| a11yflow | 35 | 0 |
| pagedflow | 10 | 0 |
| ovflow | 24 | 0 |
| v1flow | 30 | 0 |

Total: every CRM flow passes against the canvas prototype; `crmaudit` (contrast, targets, pill text, marker labels on every Crm board, light and dark) reports 0 failures. `v1flow` covers the NoAddress and NoContractor boards, the Apps menu (check on Roofing CRM, Escape, focus return) and the Hub line.

Sample counts in assertions (e.g. "Create 2 leads") come from prototype fixtures; with real data, keep the check and change the expected number.
