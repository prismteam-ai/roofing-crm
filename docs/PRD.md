# PRD: Roofing lead identification CRM

**Audience:** UX/UI redesign (Steve). This is the product contract for _what must exist on screen and in what order_ — not a visual spec. Layout, type, and states come next in `UX-SPECS`.

**Job (from [mission.md](mission.md)):** When I’m working a territory, show me nearby aging roofs and long-open permits so I can build today’s list and convert the doors worth outreach.

**Mode:** Operate. One workspace. A first-time rep should not have to think about “which app this is.” They should see _where they are_, _how far they’re looking_, and _which doors to consider_.

---

## Success (when the redesign is right)

A rep opens the hosted URL, understands the served place in one glance, drops a pin or uses GPS, sets a radius, sees matching properties on the map **and** in a list, opens one, reads enough facts to judge the door, converts it to a lead, and finds that lead again.

If they hesitate, it should be because they’re choosing a door — not because they can’t find the next control.

---

## Features (by job beat)

Build and redesign against these beats. Later CRM work stays visible as legend, not as competing workspaces.

| Beat          | Feature                              | Why it exists                                                                                                                                                                                           | README AC                                            |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **1. Orient** | Territory default + coverage honesty | Reps will not hire a map they don’t believe. Default is Chester County, PA when published; never label another county as Chester.                                                                       | Default map/search to Chester; explore selected area |
| **1. Orient** | Future CRM sections (disabled)       | Shows this is a CRM that starts at lead ID — without fake screens that look broken.                                                                                                                     | Disabled sections beyond lead ID                     |
| **2. Search** | Center on GPS                        | “Work from where I am” — walking/driving.                                                                                                                                                               | GPS center                                           |
| **2. Search** | Drop a pin                           | “Work this block” — planning from a desk or a parked truck. Equal to GPS, not hidden.                                                                                                                   | Pin drop                                             |
| **2. Search** | Search radius                        | Makes “nearby” a number the rep chose, not a mystery.                                                                                                                                                   | Configurable radius                                  |
| **3. Filter** | Aging-roof candidates                | Primary lead signal. Threshold configurable; default suggestion 15 years. Label proxies honestly (structure year ≠ inspected roof).                                                                     | Roofs older than threshold                           |
| **3. Filter** | Open / long-open roofing permits     | Second signal. Long-open permits get visual priority over “just open.”                                                                                                                                  | Open permits; emphasize long-open                    |
| **4. Scan**   | Candidate list (twin of the map)     | Map is for place; list is for scanning and keyboard/AT. Selecting a row and a marker is the same act.                                                                                                   | Browsable matching candidates                        |
| **5. Judge**  | Property / permit detail             | Enough to decide: address, roof-age facts, permit status and open duration, contractor, BBB when present. Missing data looks missing, not invented.                                                     | Property + permit details, contractor, BBB           |
| **6. Act**    | Convert to lead + today’s list       | The job is done when a door is on a list that survives a refresh. Convert is deliberate (confirm). Archive is how you undo.                                                                             | Create and manage CRM leads                          |
| **7. Ask**    | Natural-language agent               | Power path for the same facts (“open roofing permits older than five years within five miles of West Chester”). Must not outrank the map path. Citations must be parcels the filters could also return. | RAG agent                                            |

**Out of scope (do not design as working UI):** data ingest, live BBB API, outbound messages to owners. Mock or omit.

---

## Visual hierarchy (must-have components)

One screen. Attention order is the product. If a component fights the layer above it, it loses.

```
P0  WHERE + HOW FAR          territory heading, coverage chip, map, pin/GPS, radius
P1  WHICH DOORS              aging + permit filters, candidate list, selected marker/row
P2  THIS DOOR                property drawer (facts → convert)
P3  TODAY’S LIST             saved leads panel
P4  ASK / LATER              agent panel; disabled Campaigns / Inbox / Reports
```

### P0 — Must dominate (don’t make me think)

These are the primary visual system. Everything else is secondary chrome.

| Component                  | Role                             | Hierarchy notes                                                                                                                       |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Territory heading**      | Names the served place           | Largest type in the chrome. The place name is the product title.                                                                      |
| **Coverage chip / banner** | Honest geography in one sentence | Adjacent to the heading, not a toast they can miss. If Lee is served while Chester is unpublished, say so here.                       |
| **Map canvas**             | The territory                    | Majority of the viewport. Pin, radius circle, and property markers live here. Map is the primary object, not a widget in a dashboard. |
| **Pin control**            | Choose search center             | Obvious, map-native. Dropping a pin is the default “I’m working here.”                                                                |
| **GPS control**            | Center on me                     | Equal prominence to pin. Denied permission needs a plain recovery, not a dead button.                                                 |
| **Radius control**         | How far                          | Live miles label. Changing it should feel like changing the walk, not submitting a form.                                              |

**Operator lede** (“Walk the radius. Convert a door.”) sits under the heading as orientation copy, not as a hero. Keep it one line.

### P1 — Must be present (scan without leaving the map)

| Component             | Role                     | Hierarchy notes                                                                                                                                                                |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Aging-roof filter** | Turn the age signal on   | Control + live count. Default on with a sensible threshold. Copy: structure-year proxy, not “we inspected the shingles.”                                                       |
| **Permit filter**     | Turn the stall signal on | Control + emphasis on long-open. Off by default until the layer has real data (empty glowing layer raises anxiety).                                                            |
| **Candidate list**    | Scan doors               | Persistent sibling of the map (sidebar or sheet). Rows show address, distance, and the signal that qualified them (age and/or long-open chip). Selected row = selected marker. |
| **Map markers**       | Place the same doors     | Two marker treatments max (age vs permit, or combined). Selected state must be louder than filter state.                                                                       |

List and map are one object with two views. Do not design two unrelated search results.

### P2 — Must appear on select (judge, then act)

| Component                   | Role                                   | Hierarchy notes                                                                                                    |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Property drawer / sheet** | Facts for this door                    | Overlay on the map, not a new route. Address first. Then roof-age facts, then permit block, then contractor / BBB. |
| **Permit detail block**     | Status, open duration, contractor, BBB | Nested in the drawer. BBB is a displayed score when present; never a fake “unrated = bad.”                         |
| **Convert to lead**         | Primary action in the drawer           | One button. Confirm names the address. Disabled/replaced when already converted.                                   |
| **Convert confirm**         | Anxiety brake                          | Dialog, not a silent click.                                                                                        |

No convert in the list row. Convert is a judgment after facts.

### P3 — Must persist (the job’s receipt)

| Component               | Role                          | Hierarchy notes                                                                                                                                 |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today’s leads panel** | Saved doors                   | Below or beside the candidate list — quieter than candidates until a convert happens, then it should narrate “this address is on today’s list.” |
| **Lead row**            | Address + way back to the map | Selecting a lead re-selects the property. Archive with confirm.                                                                                 |
| **Convert success**     | What changed / what now       | Toast or inline recap, then the new row in the panel.                                                                                           |

### P4 — Must exist, must not compete

| Component              | Role                      | Hierarchy notes                                                                                                                                          |
| ---------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disabled CRM nav**   | Campaigns, Inbox, Reports | Legend: visible, inert, labeled as not in this map. Never look like broken tabs. Visually quieter than P0–P3.                                            |
| **Agent panel**        | Natural-language ask      | Collapsed or docked secondary. Open on demand. Answers cite parcels; empty/error points back to map filters. Do not lead the first-run layout with chat. |
| **API / debug footer** | Hosted ops                | Hidden behind a disclosure. Not part of the operator hierarchy.                                                                                          |

---

## States that are first-class (not afterthoughts)

These are redesign requirements. A pretty idle map that fails silently will lose to paper lists.

| State                     | User must understand       | Next action on screen                                                  |
| ------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| First open                | Where this map is          | Pin or GPS already obvious                                             |
| Searching                 | Results are loading        | Keep controls usable                                                   |
| Zero candidates           | Why empty                  | Widen radius or move pin                                               |
| GPS denied                | Location isn’t available   | Drop a pin instead                                                     |
| Missing roof age / BBB    | Data is absent             | Still open the door; don’t hide the row if another signal qualifies it |
| Convert success           | That address is a lead     | See it in today’s list                                                 |
| Agent not ready / no hits | Ask didn’t replace the map | Use filters                                                            |

---

## What the redesign must not do

- Turn this into a multi-page CRM. Lead ID is the product; other sections are a legend.
- Put the agent, reports, or campaigns above the map path.
- Decorate before trust: coverage honesty, proxy labels, and empty/error copy outrank visual polish.
- Invent roof age, BBB, or county coverage.
- Make convert accidental or leads feel disposable.

---

## Handoff to UX-SPECS

Next pass should lock, in this order:

1. Single-page layout (map majority, list sibling, drawer overlay, leads receipt, agent docked).
2. Type and spacing so P0 heading + map beat P4 nav + agent.
3. Marker/list pairing and two-signal visual language (age vs long-open).
4. Empty, loading, error, and convert-success copy.
5. Narrow viewport: map still primary; list and drawer as sheets, not a second app.
