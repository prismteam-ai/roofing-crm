# UX specs — County Plat

**Status:** locked. Shape stops here; no code until you say build.

**Sources:** [mission.md](mission.md), [PRD.md](PRD.md). Visual world locked: **County Plat** (comp-led). Decision comp: `.impeccable/mocks/decision/model-pick.webp`.

---

## 1. Job and audience

A roofing sales rep, desk-first on a wide map, same job on phone as sheets. They arrive mid-territory: _which streets do I work next?_

Mode: **Operate**. The plat should disappear into the walk.

## 2. Outcome and proof

Pin or GPS → radius → matching doors on the map **and** in a list → open one → honest facts → convert with confirm → find it on today’s list.

Proof this product can uniquely show: published parcels in the **served** county, aging-roof as structure-year proxy, long-open permits as hatch/stamp, geography that never calls Lee “Chester.”

## 3. Selected direction — County Plat

The assessor’s wall map, with today’s doors as pins on the plat.

- **World:** linen plat paper, india ink, parcel wash, title block, hatch for signals, brass-pin selection. Not teal SaaS. Not a consumer listing site.
- **First viewport (desk):** The plat is the screen. Thin title block: served county (largest type) + one-line coverage honesty. Map takes the rest. Pin, GPS, and live miles sit as a compact HUD on the map — not a toolbar. Age and long-open read as hatch on parcels, not as an always-open filter panel. A **floating icon bar on the map** is the only persistent chrome for P1–P4 (index, today’s list, chat — and any other sheet that would otherwise clutter).
- **Signature interaction:** Tap an icon on the floating bar → a plat-paper sheet slides over the map (same ink, same type). Chat is P4 and still one tap. Selecting a parcel opens the P2 card. Convert is a deliberate pull, isolated, confirmed. Nothing that is not P0 stays exposed all the time.
- **Honest risk:** This is the direction most map-CRM runs land on. If it grows a GIS toolbar, projection metadata, or “View parcel report,” it has become ArcGIS, not this product.
- **Comp is law for craft, not for facts.** Keep: map majority, index twin, selection sync, hatch legend. **Do not literalize:** Lee County, Iowa; Fort Madison; Pan/Layers/Measure/Export chrome; coordinate system / PLSS footer; “View Parcel Report” in place of Convert.

## 4. Scope and boundaries

- **Fidelity:** Production-ready hosted shell. Same job as [PRD.md](PRD.md).
- **Breadth:** One workspace. Rebuild the look; keep function, copy honesty, and data contracts.
- **Untouched:** Ingest, live BBB API, outbound messaging, Elephant writes.
- **Anti-goals:** Clutter that fights P0–P4. Agent or Campaigns/Inbox/Reports above the map. Fake Chester. Accidental convert.

## 5. States and ranges

| State              | User sees                                     | Next action              |
| ------------------ | --------------------------------------------- | ------------------------ |
| First open         | Served county named; pin/GPS obvious          | Drop pin or use GPS      |
| Searching          | Plat dimmed or hatch pending, controls usable | Wait                     |
| Zero doors         | Why empty                                     | Widen radius or move pin |
| GPS denied         | Location unavailable                          | Drop a pin               |
| Missing year / BBB | Absent, not invented                          | Still judge the door     |
| Convert success    | Address is on today’s list                    | Keep walking             |
| Agent quiet/empty  | Ask didn’t replace the plat                   | Use filters              |

Radius: default ~5 mi, live label. Aging threshold: default 15 years, labeled as structure-year proxy. Candidate list: tens typical, hundreds possible — scan, don’t paginate like a 93-page assessor index.

## 6. Interaction and layout

PRD hierarchy, with **always-on vs one-tap**:

| Priority | Always on the plat                               | One tap → slide-in sheet (same plat look)                                                                           |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Title block, map, compact pin / GPS / radius HUD | Extra search precision (radius slider detail, GPS recovery) expands from the HUD chip — not a GIS ribbon            |
| **P1**   | Hatch on the parcels (age wash, long-open stamp) | Parcel index (doors in radius). Filter threshold legend if it would clutter.                                        |
| **P2**   | —                                                | Selected-parcel card (facts → Convert). Opens from a marker tap.                                                    |
| **P3**   | —                                                | Today’s list                                                                                                        |
| **P4**   | Chat icon on the floating bar                    | Agent sheet: start or continue the thread. Campaigns / Inbox / Reports stay a title-block legend, not destinations. |

- Desk and phone share this topology. Phone is not a different app; the map stays full-bleed and sheets already are the pattern.
- List row = marker whenever the index is open. Convert only on the P2 card, with confirm. Archive is undo.
- Two signals max on the plat. Selected state louder than hatch.
- No always-visible: GIS tools, projection/PLSS, API footer, agent transcript, lead table, filter form.

## 7. Constraints and open decisions

- Platform: web. Hosted Amplify. WCAG AA. Familiar map affordances. Slide-ins are sheets/dialogs, not new routes.
- Voice follows the mission/PRD (doors, today’s list, walk the radius).
- Next when you say build: two more County Plat comps beside the locked one — a clean first viewport (P0 + floating bar, no sheet) **and** one sheet open from the bar (chat or index) — then rebuild the shell against that set.

**Open (do not invent in the build):** exact typeface. The floating bar’s corner (likely lower-right, thumb reach on phone, out of the radius HUD) is a comp-round composition choice, not a product fork.
