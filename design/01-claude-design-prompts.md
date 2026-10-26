# Roofing CRM: Claude Design prompt script

Oct 21, 2026 · HebaGaber · Step P5 of [PLAYBOOK-B](../../assessment-guide/PLAYBOOK-B-roofing-crm.md#p5-design-in-claude-design). This is the Task B design pass. It continues the **existing CountyLens canvas**: it doesn't start a new project.

Paste these 10 prompts into the CountyLens project in Claude Design, in order. Check each result against its "Check" line before you paste the next one. Expect about 3–4 hours.

---

## How this avoids breaking the CountyLens design

The canvas already holds 109 boards, 9 review rounds and the decisions AD-01 to AD-16. Every prompt below follows four rules, and Step 0 states them once:

| Rule | What it means in practice |
| --- | --- |
| **1. New CRM screens are new boards** | Every new board is named `Crm…` (for example `CrmLeads1440`). Existing boards keep their names. |
| **2. Shared boards change only behind the switch** | The property drawer, result card, search box, shell and Explore boards may get CRM additions **only when the ProtoBar switch "Map view (CRM preview)" is on**. With the switch off, every CountyLens board must look and behave exactly as it does now. |
| **3. Earlier decisions still hold** | The contractor badge's five states (AD-05), the BBB states Rated / Not found / Blocked / Not checked (AD-07), "source says {word}" on permits (AD-08), and "Working…" then the full answer (AD-09) apply to the CRM too, because it reuses the same components. |
| **4. No sample numbers in the prompts** | Review decision #123 still holds: counts, CIDs and sample rows are placeholders. The prompts never ask for specific figures, so reviews have nothing to compare. |

Two existing texts **do** change on purpose, because the Task B README requires leads:
- the Hub's Roofing CRM card and HANDOFF § 4.0.1 ("leads, visits and notes come later");
- HANDOFF § 4.1.4 ("The rest of the CRM comes later").

Both become: **"Map, Filters and AI search, plus leads; Campaigns and the rest are coming soon."** Visits stay later.

Five decisions are made for you here, so the design doesn't have to guess. Change any of them before you start if you disagree:

| Decision | Choice | Why |
| --- | --- | --- |
| CRM sign-in | **Email + password**, one shared test user, no sign-up, no "forgot password" flow | The evaluator must be able to log in (credentials gate). The CountyLens admin email code can't reach an evaluator's inbox. |
| Radius in the CRM | **0.5–25 mi** (CountyLens stays 0.5–10 mi) | Story note B-03 |
| AI question limit in the CRM | No per-session counter (users are signed in); the daily budget "AI is paused" state stays | The 10-per-session rule was made for anonymous CountyLens visitors |
| Agent creating leads | The agent **proposes**, and the user **confirms** every lead it creates | A model never writes records by itself |
| Permit coverage | Open-permit results cover only the jurisdictions Task A publishes, and the map says so (coverage-gap layer) | PO answer, intent § 12 Q2 |

---

## Before you start (in Claude Code, Oracle repo)

Make a save point, so Git can show exactly what the CRM pass changed in the shared canvas. Paste this in Claude Code, opened in `oracle-property-intelligence-platform-pipeline-travis-tx`:

```text
Commit design/ on feature/oracle-pipeline with the message
"design: save point before the Task B (CRM) design pass". Do not push.
```

## Requirement coverage

Every README line is covered by at least one prompt:

| README line | Eval point | Prompt | New boards |
| --- | --- | --- | --- |
| AC-1, D-1 County default, selected area | B1 | 1, 2 | `CrmSignIn*`, `CrmShell*`, `CrmMap*` |
| AC-2, D-2 GPS or pin drop | B1 | 2 | `CrmMap*`, `CrmGpsStates` |
| AC-3 Configurable radius | B1 | 2 | `CrmMap*` |
| AC-4, D-3 Roof age ≥ threshold (15 → 25) | B2 | 2, 3 | `CrmMap*`, `CrmCandidates*` |
| AC-5, D-4 Open permits, long-open first | B3 | 2, 3 | `CrmMap*`, `CrmCandidates*` |
| AC-6, D-5 Permit, contractor, BBB detail | B3 | 3 | `CrmProperty*` |
| AC-7 Browsable candidate list | B6 | 3 | `CrmCandidates*` |
| AC-8, D-6 Create and manage leads | B4 | 3, 4, 5, 6 | `CrmTriage390`, `CrmLeads*`, `CrmLead*` |
| D-8 Filter leads by roof age, permit, radius | B6 | 5 | `CrmLeads*` |
| AC-9, D-7 RAG agent, results, create lead | B5 | 7 | `CrmAsk*` |
| AC-10 Consume published data only | access boundary | 1 | data-source chip in `CrmShell*` |
| AC-11, D-9 Disabled future sections | B6 | 1 | `CrmShell*`, `CrmComingSoon*` |
| OOS-3 No real outbound messages | B6 | 6 | disabled "Send message" in `CrmLead*` |
| FEAT-B11 Responsive, accessible | all | 8, 9 | every `Crm*` board at 390, 768, 1440 |

---

## Step 0: Set the CRM rules (Claude Design)

Open the **existing CountyLens project**, keep the **Atlas** design system selected, and attach these files from the `roofing-crm` repo: `README.md` and `docs/01-intent.md`. Then paste:

```text
We are now designing the second app in this canvas: "Roofing CRM", a map-based roofing lead CRM for a sales rep at a roofing company in Travis County, TX. It reads only the data CountyLens publishes and adds a map with GPS and pin-drop radius search, CRM leads and an agent that can create leads. The attached README.md is the assignment (acceptance criteria and demo transcript); 01-intent.md is the product intent. The CRM already exists in this canvas as the ProtoBar switch "Map view (CRM preview)" and the board ExploreQ-crmmap; build on that.

Rules for this pass. They protect the CountyLens design, which is finished and reviewed:
1. Every new CRM screen is a NEW board whose name starts with "Crm" (for example CrmLeads1440, CrmSignIn390). Each Crm board opens with the Map view (CRM preview) switch forced on, the way ExploreQ-crmmap does.
2. Shared boards (Shell, SearchBox, Explore, result cards, Property and PropertyDetail, ContractorBadge, Pager, Hub, ProtoBar) may get CRM additions ONLY when the switch is on. With the switch off, every existing board must look and behave exactly as it does now. Never rename, delete or restyle an existing board, state or component.
3. Earlier decisions still apply wherever the CRM reuses a component: the contractor badge's five states and "as printed on permit" (AD-05), BBB states Rated / Not found / Blocked / Not checked (AD-07), permit class plus "source says {word}" (AD-08), and the agent's "Working…" state followed by the full answer at once, with "Took too long" at 25 s (AD-09).
4. Use only Atlas tokens and components. Log every new or extended piece in the Extensions log as E-49 onwards, each tagged "CRM · not Task A".
5. Sample data stays a placeholder (review decision #123). Keep the existing sample rows and places; don't add new totals.
6. Mobile first: the rep uses this on a phone in the field, so the main flow is GPS → radius → triage → lead. Design 390 first, then 768 and 1440.
7. Every Crm screen has loading, empty, error and partial-data states, plus rate-limited where it calls the agent.

Before drawing anything, reply with: (a) the CRM site map (screens, URLs, which existing boards each one reuses), (b) the main flows: field flow (GPS → radius → triage → lead), desk flow (map → filters → candidate list → drawer → lead), agent flow (question → answer → map → create lead) and lead follow-up (leads list → filter → lead detail → status and note), (c) the list of shared boards you expect to touch and what each gets behind the switch.
```

**Check:** the site map has Sign in, Map (home, with List / Map), Leads, Lead detail, Ask (AI mode) and five disabled sections. The list of shared boards to touch is short (drawer, result card, shell, Hub, ProtoBar). If it proposes changing a CountyLens board with the switch off, answer "No, rule 2" before continuing.

---

## Step 1: CRM sign-in, shell, navigation and disabled sections

```text
Design the CRM sign-in and shell.

Sign-in (new boards CrmSignIn1440, CrmSignIn768, CrmSignIn390). This is NOT the CountyLens admin email code; the CRM uses email + password for one shared test user. Fields: email, password with show/hide, "Sign in" filled button. No sign-up link. Plain text, not a link: "No account? Access is shared privately with reviewers." No forgot-password flow. States on a state bar: signing in, wrong email or password, too many attempts (try again later), session expired (signed out, shows "Signed out. Sign in to continue where you left off"), signed out by the user. After sign-in the user returns to the URL they asked for, so a shared Leads link opens its filters. Signed in stays signed in after a reload.

Shell (new boards CrmShell1440, CrmShell390, plus the switch-on behaviour of Shell1440). Top bar: "Roofing CRM", the existing location switcher (Travis County, TX live; other counties Coming soon, unchanged), the universal search box with modes Map · Filters · AI, an Apps button that opens the Hub, and an account menu (test user name, role "Admin", Sign out). A data-source chip: "Data: CountyLens Run {n}" that opens a small panel: "The lead index is built from the CountyLens manifest {CID} on {date}. The CRM reads only published CountyLens data." with the CID copyable and a link to CountyLens Data. Chip states: index up to date, newer run available ("Index updating to Run {n}"), index unavailable.

Navigation at 768 and 1440 (rail): Map (home; Filters and AI nested under it, as today), Leads, then a "Coming soon" group: Campaigns, Estimates, Jobs, Invoices, Outreach. At 390 (bottom bar): Map, Leads, Ask, More; More holds the five Coming-soon sections, Apps and Sign out. Each Coming-soon item is visible, aria-disabled, muted with a "Soon" pill (the CountyLens Coming-soon rule, not low opacity), and has a tooltip with one line on what it will do (Campaigns: plan outreach to groups of leads; Estimates: price a roof from the lead; Jobs: schedule and track roofing work; Invoices: bill completed jobs; Outreach: email and SMS to owners). Opening a disabled section's URL shows a Coming-soon page (new boards CrmComingSoon1440, CrmComingSoon390) that reuses the CountyLens Coming-soon card and offers "Back to Map".

Scope fix in two existing places (text only): on Hub1440 (768 and 390 inherit it) the Roofing CRM card's scope line becomes "Map, Filters and AI search, plus leads; Campaigns and the rest are coming soon." When the Hub's CRM is live, the card's Open button goes to CrmSignIn. Keep the "Coming soon · Not deployed yet" state for when it is not live. Change nothing else on the Hub.
```

**Check:** CrmSignIn has the five states and no sign-up. The rail shows the five sections disabled with tooltips. Hub1440 shows the new scope line. With the switch off, `Shell1440` is unchanged.

---

## Step 2: Map home: GPS, pin drop, radius, layers, filters

```text
Design the CRM home map (new boards CrmMap1440, CrmMap768, CrmMap390, built on the existing Explore with Map view on, as in ExploreQ-crmmap). Reuse what exists: roof-age markers, stalled diamonds, radius ring with handle and count chip, radius card, Layers popover, legend, keyboard model A-4. Add only:

1. Opens on Travis County (whole-county view) when no area is chosen; the location switcher and Area picker work as today.
2. "Use my location" button (map control, and a chip in the 390 sticky header). New board CrmGpsStates with: explain before the browser asks ("Allow location to center the search on where you are"), locating (spinner), located (blue dot with an accuracy circle; the ring centres on it), low accuracy (over 500 m: "Location is approximate"), denied ("Location is off. Drop a pin or search a place instead." with a Drop pin button), unavailable or timed out, and outside Travis County ("You are outside Travis County. The CRM covers Travis County only." with "Go to Travis County").
3. "Drop pin" control. Desktop: click the map, or drag the pin. 390: tap Drop pin, then a fixed crosshair at the map centre with "Place pin here" (no precise tap needed in the field); long-press also works. The pin label shows its lat, lon and the nearest gazetteer place ("near Pflugerville"). A pin outside the county shows the same outside message.
4. Radius in the CRM: 0.5–25 mi (slider, number field and ring handle in sync). CountyLens stays 0.5–10 mi.
5. Filters (CRM set, the existing filter chips): Roof age ≥ N years (default 15, any number; 15 → 25 must visibly change the count), Permit status (Open · Stalled · Any), Permit open ≥ N yrs (any, 1, 3, 5, 10). The results header sentence updates as today.
6. Layers in the CRM: Aged roofs (roof-age hexagons when zoomed out, markers when zoomed in: the hexagons are live in the CRM, no "Soon"), Open and stalled permits (count clusters when zoomed out; coloured by open duration; an "Open > 5 yrs" badge on the marker and card), My leads (markers outlined as leads, with their status), and Permit coverage gaps (the existing coverage-gap hatch, now live). When the ring overlaps an area without permit data, show a note on the ring and in the results: "Permits are shown only where CountyLens publishes them. Part of this area has no permit data." with a link to CountyLens Coverage.
7. Sort: Roof age (oldest), Permit open (longest), Nearest. When the permit filter is on, the default sort is Permit open (longest).

States: map tiles loading, map failed (the list still works, "Map unavailable, results below"), no results in the ring (suggest a bigger radius or a lower roof age), partial (permit coverage gap), index unavailable.
```

**Check:** you can go GPS → denied → Drop pin on CrmGpsStates. At 390, the crosshair "Place pin here" flow exists. Changing the roof age from 15 to 25 changes the count chip and the header. With the switch off, `Explore1440` is unchanged.

---

## Step 3: Candidate list and property drawer with "Create lead"

```text
Design the candidate list and the CRM version of the property drawer.

Candidate list (new boards CrmCandidates1440, CrmCandidates768, CrmCandidates390): the List view of the CRM map, showing the same matches as the map with the same filters, paged with the existing Pager. Reuse the result cards and table. Add, in CRM mode only: a checkbox per row and a selection bar "Create {n} leads"; a "Lead · {status}" pill on rows that are already leads; a "Hide existing leads" toggle; the existing "Why is this a match?" chips relabelled "Why is this a lead?" in the CRM (roof age + basis + confidence, permit class + open years + "source says {word}").

"Create {n} leads" opens a confirmation sheet: the addresses, each with its main signal; rows that are already leads are marked "Already a lead · {status}" and skipped. Result: "{n} leads created · {m} already leads" snackbar with Undo and Open Leads.

Property drawer, CRM mode (new boards CrmProperty1440, CrmProperty390, built on Property1440 / PropertyDetail with the switch on). Order for a sales rep: address and lead status on top; Roof (age, basis, confidence); Permits (status class, source word, issue date, open duration, contractor "as printed on permit" with the ContractorBadge, BBB in one of the four states, source link per permit); Owner (as today). Actions: "Create lead" (filled button) at the top, and "Create lead from this permit" on each open or stalled permit row (the lead then records that permit as its main signal). If the property is already a lead, the button area shows "Already a lead · {status} · {assignee}" with "Open lead" instead. Replace "Open in CRM" with "View lineage in Explorer" (opens the CountyLens property page in a new tab, signature moment #8). In the CRM, collapse Metadata and "Merged from" under that lineage link so the drawer stays short; leave them unchanged in CountyLens.

Creating a lead: one tap, no form. Defaults: status New, assignee = me, created from Map, List or Agent. Snackbar "Lead created" with Undo and Open lead; an optional "Add a note" field in the snackbar's expanded state.

States: creating, created, already a lead (the duplicate is refused, never created twice), create failed (with Try again; at 390 also "You're offline. The lead was not saved."), and partial data (roof age unknown, or no permit: a lead can still be created, and the missing signal shows its reason).
```

**Check:** CrmProperty shows "Create lead", the duplicate state and "View lineage in Explorer". `Property1440` with the switch off still shows "Open in CRM · Soon" and all its sections.

---

## Step 4: Mobile triage cards (390)

```text
Design the field triage flow at 390 (new board CrmTriage390): signature moment #3. From the CRM map's bottom sheet, a "Triage {n}" button turns the results into a stack of cards, one property per card: address, distance and bearing from the pin, roof age with basis and confidence, main permit signal with "Open > 5 yrs" badge, contractor with badge, BBB state, and "Why is this a lead?" chips. The map above shows the current card's marker highlighted.

Swipe right = create lead; swipe left = skip. Every swipe shows a snackbar with Undo. Buttons do the same (Skip, Create lead, and Open details), so the flow works without swiping, by keyboard and with a screen reader. A card that is already a lead says "Already a lead · {status}" and offers only Skip and Open lead. End of stack: "{n} leads created, {m} skipped" with "Open Leads" and "Back to map".

States: loading the next card, empty (no candidates in the ring), create failed (the card returns with Try again), offline. Reduced motion: cards change without the fling animation.
```

**Check:** both swipe and buttons exist, and Undo is shown after each action.

---

## Step 5: Leads list with combined filters in the URL

```text
Design the Leads list (new boards CrmLeads1440, CrmLeads768, CrmLeads390, and CrmLeadsStates). It shows the CRM's own lead records, not the candidate list.

1440 and 768: a paged table (the existing Pager): address, status pill, assignee, roof age (+ basis), main permit (class, open years, source word), contractor, distance from the area centre (only when a radius filter is on), created from (Map, List or Agent), last activity, created. Row click opens Lead detail. 390: paged lead cards with the same fields stacked; a sticky header with the count and active filter chips.

Filters, combinable, the same chip style as the map: Status (New, Contacted, Qualified, Won, Lost; multi-select), Assignee (Me, All reps, or a name; "All reps" is the sales-manager view), Roof age ≥ N years, Permit status (Open, Stalled, Any), Permit open ≥ N yrs, and Within r mi of {Area} (the existing Area picker and radius control). A plain-English sentence above the table: "{n} leads · New or Contacted · roof ≥ 15 yrs · open or stalled permit open ≥ 5 yrs · within 5 mi of {place}". Sort by last activity, roof age, permit open, nearest.

Every filter, the sort and the page are kept in the URL (show the URL in a board note, for example /leads?status=new,contacted&roof=15&permit=open,stalled&openYrs=5&place={id}&r=5&page=2). A "Copy link" button. Opening a shared link while signed out goes to sign-in, then back to this filtered list. "Show on map" puts the filtered leads on the CRM map.

States (CrmLeadsStates): loading, no leads yet ("Create your first lead from the map" with Go to map), no leads match these filters (with Clear filters), error, partial (a lead whose property is missing from the newer run: "Property not in Run {n}; the lead keeps its snapshot").
```

**Check:** combining roof age + permit status/open years + radius changes the sentence and the URL note. The empty, no-match and partial states exist.

---

## Step 6: Lead detail: status, assignee, notes, history

```text
Design Lead detail (new boards CrmLead1440, CrmLead768, CrmLead390, CrmLeadStates). 1440: a page beside the Leads list (list on the left, detail on the right); 768 and 390: a full page with Back to Leads.

Header: address, status (a menu: New, Contacted, Qualified, Won, Lost; each status has a label and icon, not colour alone), assignee (menu: Me or a team member), created from and date, "Show on map", "View property" (opens the CRM drawer), "View lineage in Explorer".

Signals snapshot: the signals saved when the lead was created (roof age + basis + confidence, main permit with class, source word and open years, contractor with badge, BBB state) with "From CountyLens Run {n} · manifest {CID}". If a newer run changed a signal, show "Now" next to "At creation" (for example the permit was finalled since), else "No change since this lead was created". The lead references the property and permit; owner details are read from the property, never copied into the lead.

Notes: an add-note box (Save) and the notes list, newest first, with author and time. History: a timeline of every change (created, status changed from → to, assignee changed, note added), with who and when.

Disabled actions that point to the future sections: "Send message" (Outreach · Soon) and "Create estimate" (Estimates · Soon), each with its tooltip. No real messages are sent.

States (CrmLeadStates): loading, saving (status, assignee or note), saved, save failed (the change is undone, with Try again), lead not found or deleted, the lead's property not in the newer run (snapshot kept), and changed elsewhere ("This lead was updated by {name}. Reload to see the latest.").
```

**Check:** a status change and a new note both appear in History. "Send message" is disabled and labelled Outreach · Soon. A reload keeps the changes (state bar).

---

## Step 7: Ask the agent: answer, map, create lead

```text
Design the CRM agent (new boards CrmAsk1440, CrmAsk768, CrmAsk390), built on the existing AI mode (ExploreQ-ai, ExploreQ-aicontractor, ExploreQ-aiooa with the switch on). Reuse: Working… with elapsed timer and Cancel, the full answer at once, "How I read this", numbered citations that match numbered map pins, editable assumption chips that re-run the query, the missing-data note, Took too long, AI paused (daily budget) and throttled states. In the CRM, hide the "n of 10 AI questions left this session" counter (CRM users are signed in); keep the paused and throttled states.

Worked example on the board: "show me open roofing permits older than five years within five miles of {demo city}" (use the demo city of the CountyLens AI boards). The answer lists permits with status class, source word, open years, contractor badge and BBB state; each claim has a citation. Permit-text matches show the matched snippet ("Matched on permit text: …") as the retrieval evidence. When the area has no permit data, the answer says so and links the coverage note.

CRM additions: each result row has "Create lead" (or "Already a lead · {status}"); the answer has "Create leads for all {n}"; "Show on map" moves the results to the CRM map as numbered pins. The user can also ask in words ("make leads of the top 3"): the agent never creates leads by itself; it replies with a confirmation card listing the properties ("Create 3 leads? 1 is already a lead and will be skipped." with Create and Cancel). After Create: "2 leads created · 1 already a lead" with Open Leads. Leads made here show "created from Agent".

States: no results ("I found no properties that match. Try a bigger radius or a lower roof age." with chips that do that), low confidence ("I'm not confident in these matches: {reason}"), place not found or outside Travis County, create failed from chat, rate-limited, paused.
```

**Check:** the README question has an answer with citations, map pins and "Create lead" per row, and the confirmation card appears before any lead is created.

---

## Step 8: States pass

```text
For every Crm board, check that it has loading, empty, error and partial-data states (and rate-limited where it calls the agent). Add any that are missing, as state bars or a states board per screen (CrmMapStates, CrmCandidatesStates, CrmAskStates if needed). Use the CountyLens state patterns (skeletons, one-line empty hints with a suggested action, "what failed and how to retry"). Then list every Crm board with its states, as a table.
```

**Check:** the table has no blank cells for loading, empty, error and partial.

---

## Step 9: Responsive and accessibility pass

```text
Check every Crm board at 390, 768 and 1440, in light and dark: text contrast at least 4.5:1, map shapes and lead markers at least 3:1, touch targets at least 48 px (the CountyLens rule), visible keyboard focus, the map keyboard model (A-4) in the CRM, the triage cards usable without swiping, the drawer and confirmation sheets trapping focus and closing with Escape, status pills that don't rely on colour, the GPS and pin controls reachable by keyboard, and reduced-motion versions of the triage fling, ring and hexagons. At 390 the bottom sheet never hides the primary action (Create lead, Triage). List every fix you made. Then confirm, board by board, that every CountyLens board looks unchanged with the Map view (CRM preview) switch off.
```

**Check:** the reply ends with the "unchanged with the switch off" confirmation for CountyLens boards.

---

## Step 10: Make it clickable and hand off

```text
Make these CRM interactions clickable: sign in → map; Use my location (with the denied → Drop pin path); Drop pin and the 390 crosshair; radius ring handle and slider up to 25 mi; roof age 15 → 25 changing the count; permit filter and longest-open sort; drawer → Create lead → Already a lead; select 3 candidates → Create 3 leads; triage swipe and buttons with Undo; Leads filters updating the URL note; lead status change and Add note appearing in History; agent answer → Show on map → Create lead with confirmation; every Coming-soon section's tooltip and page; Apps → Hub.

Then produce two handoff documents:
1. A NEW "CRM handoff" document covering only the Roofing CRM: site map, flows, every Crm board and its states, the shared components the CRM uses and what each adds behind the switch, URL state for the map and the Leads list, the lead fields shown on screen (status, assignee, notes, history, signals snapshot, created from, source manifest CID), the Extensions log entries E-49 onwards, and a table mapping each README demo line (D-1 to D-9) to its screen and state.
2. In the existing CountyLens handoff, change only: § 4.0.1 and § 4.1.4 scope text to "Map, Filters and AI search, plus leads; Campaigns and the rest are coming soon" (visits stay later); and add a list of every new Crm board, each marked "CRM · not Task A". Change nothing else in it.
```

**Check:** the CRM handoff's demo-line table has a screen for each of D-1 to D-9.

---

## After Claude Design (in Claude Code)

**1. Export.** Use **Handoff to Claude Code** (or download the zip) into the Oracle repo's `design/` folder, as before. Save the new CRM handoff document as `roofing-crm/design/HANDOFF.md`.

**2. Check that CountyLens wasn't broken.** In Claude Code, opened in the Oracle repo, paste:

```text
Compare design/ with the last commit ("design: save point before the Task B (CRM) design pass").
List every changed file that does not start with "Crm". For each one, say what changed and
whether it shows only with the Map view (CRM preview) switch on. Anything that changes CountyLens
with the switch off is a defect: list it as Blocking in design/design-review-log.md. Expected
exceptions: Hub1440 (CRM card scope line), HANDOFF.md § 4.0.1 and § 4.1.4, the CRM board list,
and the Extensions log. Then search design/ for "leads, visits and notes come later" and
"The rest of the CRM comes later" and list every hit outside the review log.
```

Fix any Blocking item with a narrow prompt in Claude Design, then commit: `design: Task B CRM boards (CRM · not Task A)`.

**3. Copy into the CRM repo.** In Claude Code, opened in `roofing-crm`:

```text
Run ../assessment-guide/scripts/copy-from-oracle.sh design/prototype and show me the
docs/reuse-log.md line it wrote.
```

**4. Review.** Still in `roofing-crm`, paste the P5 review prompt from the playbook, with this addition:

```text
/developmentsupport-prototype-review
Then use the soofi-xyz-team-kit:metagross subagent as a read-only reviewer: review the Crm boards
in design/prototype and design/HANDOFF.md against docs/01-intent.md, docs/feature-list.md and the
README demo transcript. Which screens need which tRPC procedures and data (search, leads, agent)?
What is missing for any demo line D-1 to D-9 or acceptance criterion AC-1 to AC-11? Check the
access boundary is visible (data-source chip with the manifest CID). Review only Crm boards and
the CRM handoff; CountyLens boards are Task A's and already reviewed. Do not review sample data
(Oracle log #123). Do not write code. Write the findings to design/design-review-log.md (same
columns as the Oracle log) and write docs/02-design.md as a table: demo line -> screen -> state.
```

## Done when

- Every demo line D-1 to D-9 maps to a Crm screen and state in `docs/02-design.md`.
- `roofing-crm/design/design-review-log.md` has no open **Blocking** item.
- The Oracle check in step 2 found no CountyLens change with the switch off, other than the expected exceptions.
- The traceability "Design CP" row in `docs/traceability.md` is filled in with the date.

Then go on to P6 (architecture, Gate G3).
