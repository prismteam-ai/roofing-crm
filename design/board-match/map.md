# Board match: group "map"

Date: 2026-10-25. Started from commit 6d0c9e8; second pass after the overview commit. Method: board
and live side by side at the board's width, the live app built from the working tree and served with
every API call and the browser's geolocation stubbed (no AWS, no sign-in). Side-by-side PNGs are in
the coordinator's scratchpad under `board-match/map/sbs/`.

Status is only claimed for boards that were actually compared. A board marked "Not mine" belongs to
another owner's files; "Not built" is a feature the CRM does not have yet.

## What changed

First pass:

- **County overview**: below zoom 11 the map shows the whole county as hexagons from
  `search.countyOverview` (review-log rows 10 and 69), with the legend saying what is covered, what
  is left out and why, and the run.
- **A dropped pin or GPS fix shows markers**, never the county hexagons, at any zoom.
- Index-down notice with the board's copy and a Retry; radius card as one row; legend scrolls inside
  its card.

Second pass:

- **First-visit "What can I ask?" card** (HANDOFF section 4.10): `components/Onboarding/**`. One
  dismissible, non-modal dialog over the map. One line on what the data is (Task A's published
  Travis County run: roof age, permits, contractors where published; addresses and BBB ratings are
  not published). Three example questions, verbatim from the golden queries G1, G3 and G4
  (`tests/agent/golden.json`); each opens `/?mode=ai&q=...` (the map's AI mode) with the question prefilled, never run.
  Close, Got it and Escape dismiss; focus moves into the card; dismissal is kept in localStorage
  under `crm.whatCanIAsk.v1` (every access in try/catch; the page works without storage);
  `?first=1` forces it open; `openWhatCanIAsk()` and the window event `crm:open-what-can-i-ask`
  reopen it. Mounted in `routes/Map/Map.tsx`.
- **GPS states** are cards at the top of the map with the board's words and actions: locating
  (spinner), located with accuracy ("You are here (±12 m). The 5 mi ring centres on you."), low
  accuracy (over 500 m, with Drop pin), denied (Drop pin), unavailable or timed out (Drop pin, Try
  again), outside the county (Go to Travis County). The accuracy circle is drawn on the map and the
  radius caption follows the source ("Your location (GPS)", "Your location (approximate)").
- **Pin mode**: a Drop pin control in the map controls; the board's card ("Click the map where you
  want the search centre. You can drag the pin afterwards." from 840 px; a fixed crosshair and
  "Place pin here" below it). The pin is draggable; dragging it re-centres the search.
- **Pin outside the county** is a card on the map with Go to Travis County (the pin and ring stay).
- **Tile failure** is a banner ("Map unavailable, results below. ...") with Retry, so the radius,
  filters and results stay usable.

Third pass (candidates and triage mounted):

- **Candidate list** (`view=list`): mounted in `Map.tsx` in the map's place, under the toolbar below
  840 px and across the centre and results panes from 840 px (board CrmCandidates1440 / 768 / 390).
  It gets the map's own filters (centre, radius, roof age, permit status, permit open years); an
  outside-county pin is never a centre, as for the map's search. Show on map returns to the map with
  that property open in one URL update. Its empty-state actions change the map's radius and roof
  filters.
- **Field triage** (`triage=1`): mounted in place of the results sheet, docked at the bottom at a
  fixed share of the page so a strip of the map stays above it and the card scrolls inside (Skip,
  Create lead and Open details stay on screen). The current card's roof marker is ringed on the map
  (`is-tri`). A filled "Triage n" button sits in the phone results sheet header (not from 840 px).
- **Toolbar**: the "Map + cards | List" toggle (board CrmMap1440 and CrmMap390): in the toolbar row on
  phones as two icons (the words stay in the accessible name), in a bar above the map from 840 px;
  and the Filters chip on phones is the sliders icon plus the match count, as drawn. The phone toolbar
  is one row, as the board's.

Fourth pass (Ask inside the map, AI mode; contract: ask-in-map CONTRACT.md section 4):

- **URL**: `mode=ai&q=...` (also `mode=filters`, which opens the phone Filters sheet) beside the
  centre, radius, filters, `view` and `triage` keys (`routes/Map/mapMode.ts`). `q` only prefills the
  question; it never runs it. Leaving AI mode drops `q`.
- **Chips**: Map | AI (`aria-pressed`, accessible names "Map mode" and "AI mode") next to the
  Map + cards | List toggle; Filters is the toolbar's existing Filters button, now controlled by
  `mode=filters`, so the name `Filters` is not repeated and existing selectors keep working.
- **Panel**: AI replaces the results pane (from 840 px) or the results sheet (phones) with
  `AskPanel` (built in `routes/Ask/AskPanel.tsx`; layout "pane" or "sheet"). The map stays.
- **Answer pins**: the answer's cited properties with coordinates (`answerPins` from `@crm/shared`)
  are numbered buttons on the map (same number as the citation, "Source n", 48 px hit area, selected
  state, Atlas tokens), drawn above the roof markers. Click a pin to focus its citation; focusing a
  citation selects its pin and pans to it if off screen. Show on map fits the pins and the search ring.
- **Thread**: kept in sessionStorage (`crm.askThread.v1`, in try/catch); a new thread starts when the
  answer is cleared ("New question").
- The first-visit card's example questions now open `/?mode=ai&q=...`.
- Not visually compared yet: `AskPanel` was still being written, so the CrmAsk boards are covered by
  route tests with the panel stubbed. Capture and compare once it lands.

Fifth pass (PO review: three-pane panes, one toolbar, phone fixes):

- **Decisions that differ from the boards.** The boards put the AI pane on the right; the PO chose the
  left, so from 1280 px the left pane is a switch "Filters | Ask AI" (one at a time; `mode=map` and
  `mode=filters` show Filters, `mode=ai` shows Ask AI) and the right pane always lists results: the
  search results in Map mode, the answer's matched properties (numbered like the pins, with Open on
  map and Create lead) in AI mode. The boards draw no minimise handles (only `CrmCandidatesHide1440`
  hides something); the PO asked for them on both panes, so each pane has a 48 px chevron handle on
  its inner edge (names "Hide filters panel" and so on, `aria-expanded`, `aria-controls`, 3 px focus
  ring), a 48 px rail with a vertical label when collapsed, state kept for the session. The answer's
  Matches rows render into the results pane through `matchesHost` on `AskPanel`; below 1280 px the
  single sheet keeps both tabs. Once AI is opened its panel stays mounted under the Filters tab, so
  the answer is never lost by switching.
- **One control above the map at every width**: Map + cards | List | Ask AI (icons only on phones;
  words from 600 px). The phone toolbar is one row under the search box: Use my location (icon-only
  under 430 px, name kept), Filters with the match count, and that control. The Travis County chip is
  dropped on phones.
- **Legend** (superseded by the ninth pass: open by default from 600 px, switch inside Layers): a 48 px button (collapsed by default below 1280 px); open it is a card, at most 60% of
  the map's width, with Close, Escape and tap outside; the choice is kept for the session. Root cause
  of "open on a phone": the default came from a one-off media check at first render (and, before
  that, a 600 px breakpoint), so a viewport that became narrow afterwards (device emulation, rotating)
  kept an open legend. It now follows the live viewport until a choice is made.
- **Radius card**: one row; the "From ... all query modes" line is its tooltip and screen reader text
  below 600 px (ninth pass; was 1280 px), and a second line from there.
- **Results sheet**: a sheet that only holds a notice (index unavailable, nothing found, loading)
  peeks at about a quarter of the page (measured visible map 48 to 71% of the viewport at 360 to 768
  px); with results it keeps the 40% peek. In short landscape (844 by 390) the peek is the handle and
  header row only (map about 26%).
- **Data chip**: a run id with a date reads "24 Oct" on phones and "Run 24 Oct 2026" wider; the full
  id stays in the tooltip, the name and the panel.
- Token audit (`atlasTokenAudit`) clean at 1280, 1440 and 1920 px in every pane state and mode (27
  combinations) and at 360, 390, 430, 600 and 768 px plus landscape in the main states (33); no
  horizontal scroll in any. Phone before and after screenshots: scratchpad `board-match/map/phone`.

Sixth pass (follow-up fixes):

- **Permits from the server**: the map, the Candidate list and Field triage build the `search.permits`
  input in one place (`permitQueryInput`: `statusClass`, `openDaysMin`), so they share one cache entry
  and the server filters. When the server clips (500 longest open) every view says so ("Showing the
  500 longest-open of {total} permits in range; narrow the radius or filters"); Matches and the
  filter chip count come from the server's total, and a clipped property page says "Showing the
  nearest N of M properties".
- **Citation pills** are atomic inline boxes (`inline-flex`, `nowrap`), so a line wraps between
  pills, never through one; the 48 px hit area stays on the pseudo-element.
- **One AskPanel instance** per page, drawn into a host element that moves between the left pane and
  the results sheet, so crossing 1280 px (resize, rotate, devtools) never drops the answer, the
  question or the thread.
- **Undo window**: an inline "Created n leads" row with Undo (candidate list and AI panel) stays for
  `UNDO_WINDOW_MS` (15 minutes, in `@crm/shared`, checked against the API's constant by a test),
  counted from the create time, until dismissed or undone; the snackbar is short (message and Open
  Leads). After an undo the row shows the same honest kept-reasons as before.
- **Phone Filters sheet (600 to 1279 px) audit.** Checked against the handoff Filters list and the
  boards' sheet pattern: the sheet is a modal dialog, so focus now moves in and returns to the
  Filters button on every close path (Close, backdrop, Escape, Show results); a filled "Show n
  results" button (the match count, singular for one) closes it; the card is full width on phones and
  a centred card up to 40 rem on tablets (it used to span the rail); bottom padding clears the safe
  area; the sheet sits above the results sheet peek and the legend card (z order checked). The Filters
  button's count chip and the single View control were rechecked. Token audit clean at 360, 390, 600,
  768, 1280 and 1440 px in the changed states; no horizontal scroll.
- The result snackbar's action wrapper and close button used an auto margin and the default button
  padding, which the token audit flagged in every state that shows it; both use tokens now.

Seventh pass (PO: toggle, hexagon click, selection centres the map):

- **Toggle**: Ask AI is removed from the toggle above the map; it is a pure view switch (Map + cards |
  List, exactly one pressed, 48 px) at every width. This reverses the earlier PO decision (review-log
  rows 75 and 77) that AI appears in it. In AI mode the toggle still shows the view and the answer
  and mode are kept when it changes. Ways in: the left pane's Filters | Ask AI switch (from 1280 px),
  the rail's Map > AI, the phone bottom bar's Ask tab, the first-visit questions, `/ask`. Ways out:
  the left pane's Filters tab, the Filters button on phones (it also opens the filters), the bottom
  bar's Map tab and the rail's Map entry. On a phone, the List view hides the AI sheet (the answer
  returns with Map + cards).
- **Hexagon click**: a click, tap or keyboard activation on a cell drops the search pin at its centre
  (the cell centre the API computes), keeps the rep's radius unless it would not cover the cell
  (circumradius rounded up to 0.5 mi, at most 25 mi), and opens the normal radius results; lat, lng,
  r are in the URL, Escape or Back returns to the overview (the camera zooms back out to the county).
  Each cell has a keyboard and screen-reader twin ("Hexagon, median roof age 21 years, 120 properties,
  open here"), one tab stop with arrow keys, and the focused cell is outlined 3 px on the map.
  Pointer cursor on cells; permit clusters still zoom in; tapping outside a cell still places a pin.
  Chip and legend: "Click a hexagon to search there".
- **Selecting a property** flies the map to it at zoom 16 or closer (a jump with reduced motion),
  centred in what stays visible: from 1280 px the part of the 440 px drawer that reaches past the
  results pane (measured), below it the strip the results sheet leaves (the drawer is a full-height
  sheet there); a ring marks the property; closing the drawer keeps the view; the search pin and the
  radius are not touched. A property with no coordinates is not centred and the drawer says "Not shown
  on the map · {reason}". Measured on the build: zoom 16, marker 300 px into a 600 px visible strip at
  1440 px; at 390 px the marker is centred above the sheet as it was when the camera moved.
- First visible click after a fresh load of the county view at 1440 px was swallowed once in my Playwright
  run (later clicks searched); I could not tie it to a cause and the unit tests cover the handler.

Eighth pass (latency regression and the sheet scroll):

- **Sheet scroll** (600 to 1279 px and phones): the sheet body scrolls inside the sheet at 360, 390, 600,
  768, 1032 and 1280 px in the empty, working, answer, matches and error states (Playwright wheel
  scroll on the build), and still scrolls when the percentage cap is removed (the sheet's own dvh cap
  holds). The Filters sheet is fixed to the viewport (vh), and the candidate list pane is now a flex
  column with its own scroll body; its pager no longer uses an auto margin (token audit).
- **Deep-link camera**: a `?sel=` link or reload moves the camera only after the drawer has been on
  screen for 2 s, jumps instead of flying, and is cancelled by the first press on the drawer or the
  map, so it cannot compete with Create lead.

Ninth pass (tablet alignment, boards CrmMap768 and CrmCandidates768; PO scope, 2026-10-25;
review-log row 83):

- **Docked split from 600 to 1279 px** (A1): the map takes about 45 percent of the height under the
  toolbar and the results panel is docked below it, always visible, with its own scroll; header
  (Matches, info, collapse all, expand all, Triage) and pager stay in view while the rows scroll.
  Below 600 px the phone keeps the peeking bottom sheet (board CrmMapPin390 shows one). Field triage
  and the Ask AI panel take the same docked area (one AskPanel instance, same portal; only the
  slot's place changed). With no centre the docked area holds the explanation instead of a blank
  gap. From 1280 px the three panes are unchanged.
- **Radius card** bottom-right of the map from 600 px with the caption "From the pin · all query
  modes" (or "your location (GPS)" / "(approximate)"); with no centre its corner holds the Whole
  county card (the board's place for it). Phones keep it at the top (the sheet covers the bottom).
- **Legend** open by default from 600 px (collapsible by its own Close button; the session choice is
  kept); collapsed on phones. **One Layers button** (icon and word) replaces the layers icon and the
  separate Legend button; the Legend switch is a row inside its popover.
- **Fit control**: the existing Recentre control (fits the ring, or the county with no pin) now has
  the fit icon, as on the board; it was drawn with the locate icon before. Locate stays the
  toolbar's Use my location, not moved.
- **Collapsed rows** (C1): address (or "TCAD id · Address not published in this run"), distance and
  compass direction from the search centre ("2.8 mi NW", `distanceFromCentre`), chips (roof age and
  confidence, or the honest "No roof date found"; the first permit with its open duration and
  "+n more"; property type), Open details and an expand chevron. The detail card (CID, basis,
  confidence, coordinates, source and provenance) is drawn only when expanded; every row starts
  collapsed, state is per row, and the header has collapse all and expand all (600 px and up).
- **Pager** (C6): ten rows a page over the rows the search loaded (at most 100, nearest first),
  numbered pages "1 2 ... 10", "Showing 1-10 of the nearest 100" when the server clipped the set,
  and the existing line "Showing the nearest 100 of N properties" stays. Only a page's rows are
  drawn.
- **Triage** (C5): the filled "Triage n" button is the phone's; from 768 px it is an icon button
  (same name, the word stays for screen readers) in the panel header. Not shown from 1280 px (as
  before: the board has none there either; reachable by `triage=1`).
- **Candidate list at 768 px** (D1): the table fits the 656 px pane. The "#" column waits for 840 px,
  Lat, lon for 1032 px (below it the coordinates ride on the address line, so nothing is dropped),
  the address note and the permit text wrap. Board 768 shows Lat, lon; we trade that column for a
  list that does not scroll sideways.

Stays out (recorded): Area menu, Sort menu, Close tab, coverage hatching and the "no permit data"
chip, place picker, the in-ring count chip, the lead-status chip on map rows (the map's rows carry no
lead marks by design), and the board's search box inside the app bar.

## Matrix

| Board                                                                                                                                           | Route + state                | Status                                           | Side-by-side                           | Notes                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome1440 / 768 / 390                                                                                                                         | `/?first=1`                  | Matched, data differs                            | Welcome1440, Welcome768, Welcome390    | Card position (16 px in from the map's left at 1440, x 96 at 768, full width at 390), header, intro line, three rows, Got it. The boards are the CountyLens shell; only the card is compared. Intro line and questions differ on purpose: the CRM's data and the golden queries. |
| CrmMap1440                                                                                                                                      | `/`, county view             | Deviation: Area, Sort not built                  | CrmMap1440                             | Whole-county hexagons, chip, legend, controls and the Map + cards / List toggle match. Area and Sort menus, Matches and Close tabs with no centre: not built. Hexagon size can look up to 2x the board's (drawn at the whole-number zoom). County outline: review-log row 9.     |
| CrmMap768 | `/`, county view; pin, 5 mi ring | Matched, data differs (ninth pass) | CrmMap768 | Docked split (map about 45 percent, results panel below, always visible), Layers button, open legend, Radius card bottom-right with its caption, fit control, collapsed rows with distance and direction, numbered pager. Not built: Area and Sort menus, Close tab, hatching and the no-permit chip, the in-ring count chip, the search box in the app bar. |
| CrmMap390                                                                                                                                       | `/`, county view             | Deviation: Area, Sort not built                  | CrmMap390                              | Phone toolbar: Use my location, Filters chip with count, Map/List toggle (board: filter count chip, toggle, locate chip, Area, Sort).                                                                                                                                            |
| CrmMapPin1440                                                                                                                                   | pin, 5 mi ring               | Matched, data differs                            | CrmMapPin1440                          | Result cards use the honest published-data layout (review-log row 1).                                                                                                                                                                                                            |
| CrmMapPin390 | pin, 5 mi ring | Deviation: radius card position, explainer toast | CrmMapPin390 | Toolbar, results sheet header with Matches, coverage info and the filled Triage n match; rows are collapsed with distance and direction. Radius card at the top, not the bottom (the results sheet covers the bottom on phones). Pin explainer toast not built. |
| CrmMapPinMode1440                                                                                                                               | pin mode                     | Matched                                          | CrmMapPinMode1440                      | Card, Cancel, pressed control.                                                                                                                                                                                                                                                   |
| CrmMapPinMode390                                                                                                                                | pin mode                     | Matched, one deviation                           | CrmMapPinMode390                       | Crosshair, Place pin here, Cancel. The board also says a long-press drops the pin: not built, so the card does not claim it.                                                                                                                                                     |
| CrmMapPinMove1440                                                                                                                               | drag the pin                 | Matched in behaviour                             | none (a drag, not a state)             | The pin is draggable and re-centres the search. Not captured as an image.                                                                                                                                                                                                        |
| CrmMapPinOutside390                                                                                                                             | pin outside the county       | Deviation: pin does not snap back                | CrmMapPinOutside390                    | Card and Go to Travis County match. The board returns the pin to its last spot inside the county; live keeps the pin where it was dropped and runs no search (the sheet says so).                                                                                                |
| CrmMapGps390                                                                                                                                    | GPS fix                      | Matched                                          | CrmMapGps390                           | Card, copy, close, accuracy and caption.                                                                                                                                                                                                                                         |
| CrmMapGps768, CrmMapGps1440                                                                                                                     | GPS fix                      | Matched                                          | CrmMapGps768, CrmMapGps1440            | Same card.                                                                                                                                                                                                                                                                       |
| CrmMapGpsLow390                                                                                                                                 | low accuracy                 | Matched                                          | CrmMapGpsLow390                        | Copy, Drop pin, close, "Your location (approximate)".                                                                                                                                                                                                                            |
| CrmMapGpsDenied390                                                                                                                              | denied                       | Matched                                          | CrmMapGpsDenied390                     |                                                                                                                                                                                                                                                                                  |
| CrmMapGpsUnavailable390                                                                                                                         | unavailable or timed out     | Matched                                          | CrmMapGpsUnavailable390                | Drop pin and Try again.                                                                                                                                                                                                                                                          |
| CrmMapGpsOutside390                                                                                                                             | fix outside the county       | Matched                                          | CrmMapGpsOutside390                    | Go to Travis County shows the county and leaves the pin.                                                                                                                                                                                                                         |
| CrmMapLocating390                                                                                                                               | locating                     | Matched                                          | CrmMapLocating390                      | Spinner card (reduced motion stops the spin).                                                                                                                                                                                                                                    |
| CrmMapGpsExplain390                                                                                                                             | explain first                | Deferred: would break e2e                        | none                                   | A card before the browser prompt (Continue, Not now). It adds a step the B-03 e2e (AC-2 denied and outside flows) does not expect and `tests/e2e/**` is not mine to change. Proposal: add it, with the e2e clicking Continue, when the e2e owner agrees.                         |
| CrmGpsStates                                                                                                                                    | overview of the above        | Matched                                          | none                                   | Every card on it is built except Explain first.                                                                                                                                                                                                                                  |
| CrmMapNoResults390                                                                                                                              | zero results                 | Matched, copy differs                            | CrmMapNoResults390                     | Widen action present; board also offers "Roof >= 13 yrs".                                                                                                                                                                                                                        |
| CrmMapIndexDown390                                                                                                                              | search fails                 | Matched, placement differs                       | CrmMapIndexDown390                     | Copy and Retry match; it sits in the results sheet where the board draws a banner.                                                                                                                                                                                               |
| CrmMapTiles390                                                                                                                                  | tiles loading                | Not compared                                     | tiles-390 capture only                 | Loading state of tiles is MapLibre's own.                                                                                                                                                                                                                                        |
| CrmMapFailed390                                                                                                                                 | tile failure                 | Matched, one deviation                           | CrmMapFailed390                        | Banner, copy, Retry. The board shows the results as a list below (List view, not built); live keeps the map and the sheet.                                                                                                                                                       |
| CrmMapPartial390                                                                                                                                | permit coverage gap          | Deferred: no data                                | none                                   | The board says which jurisdictions have permits. Task A publishes no coverage areas (review-log row 70), so the CRM cannot say it. The hatched "no permit data" areas and the ring chip are the same gap.                                                                        |
| CrmMapNoAddress390                                                                                                                              | no address in a result       | Not mine                                         | none                                   | Result rows and the drawer carry this (`ResultRow`, drawer owners). Live shows the missing-address reason.                                                                                                                                                                       |
| CrmMapStates                                                                                                                                    | overview                     | Matched                                          | none                                   | Loading, empty, error, rate-limited and GPS cards: the first four exist (`CrmMapLoading390`, no results, index down, tiles failed); the rate-limited gateway note is not built.                                                                                                  |
| CrmProperty1440 / 768 / 390                                                                                                                     | `sel` drawer                 | Not mine                                         | CrmProperty1440, 768, 390 (first pass) | The drawer is `routes/Map/PropertyDetail/**`. Structure matches; the address differs for the honest reason (review-log rows 1 and 67); the lead pill is shown where lead presence is read (list and triage).                                                                     |
| CrmPropertyFailed1440 / 390, CrmPropertyNoAddress1440 / 390, CrmPropertyNoContractor390, CrmPropertyPartial390, PropertyDetail, ContractorBadge | drawer states and components | Not mine                                         | CrmPropertyFailed images only          | Drawer owner.                                                                                                                                                                                                                                                                    |
| CrmPropertyCreated390, Creating390, Dup390                                                                                                      | lead creation states         | Not mine                                         | none                                   | `LeadCreateAction` and the lead snackbar belong to the leads group.                                                                                                                                                                                                              |

| CrmCandidates1440 / 768 / 390 | `view=list` | Matched, data differs | CrmCandidates1440, 768, 390 | The component is the candidates group's (their record: design/board-match/candidates-triage.md); here it is the mounting: toggle, filters, placement, Show on map. The board's Area and Sort menus and Close tab are not built. |
| CrmTriage390 | `triage=1` | Matched, data differs | CrmTriage390 | Dock, card, Skip, Create lead, Open details, ringed marker. Contractor and BBB lines show the published reason. |

| CrmAsk1440 / 768 / 390, CrmAskConfirm, CrmAskCreated | `/?mode=ai&q=` | Mounted, not yet compared | none | The map side is built and tested (chips, panel slot, numbered pins, Show on map, thread). The panel's content (Answer and Matches tabs, Create leads for all n, confirmation, Undo) is the Ask builder's; record the final status after a side-by-side. Editable Read as chips, Cancel while working, Sort menu and the Close tab stay deferred (need a plan-edit input, no close-matches API). |

## Gaps

- Area and Sort menus (the list's Sort is the list's own default: roof age, or permit open with a
  permit filter), the Close tab (no close-matches API).
- Pin explainer toast, in-ring chips, hatched no-permit areas (no coverage data), pin snap-back,
  long-press to drop a pin, GPS Explain first (see above), rate-limited gateway note.
- County outline and outside shading: review-log row 9.
- Lead marks (the Lead pill) exist on the Candidate list and Field triage, read from `leads.presence`
  for every assignee (the map's own result rows carry none). When the ring has over 1,000 properties
  or the read fails, those two views say so (`CrmCandidatesLeadsUnavailable`). The `/?mode=ai&q=`
  link prefills the AI panel's box and never runs it.
