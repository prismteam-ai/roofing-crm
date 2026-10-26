# Roofing CRM: design review round CRM-R1 (prompt for Claude Design)

Oct 21, 2026 · HebaGaber · Step P5 of [PLAYBOOK-B](../../assessment-guide/PLAYBOOK-B-roofing-crm.md). Source: [design-review-log.md](design-review-log.md) (`#n` = log row). Paste the prompt below into the **CountyLens project** in Claude Design. Then export the handoff again into `design/`, and rerun `/developmentsupport-prototype-review` to close the rows.

Rows that are built in code, or decided at G3, are **not** in this round: #9–#11, #13–#19, #21 (except its CLAUDE.md line), #23–#25.

---

## Prompt

```text
CRM review round CRM-R1. Same rules as before: CRM changes go on Crm… boards, or on shared
boards only behind the "Map view (CRM preview)" switch; with the switch off every CountyLens
board stays exactly as it is. AD-05, AD-07, AD-08, AD-09 still hold. No sample numbers (#123):
counts and rows stay placeholders. Log every new extension in CRM-HANDOFF §8 from E-93.

The data contract the CRM reads (Task A contract/v1) does not publish some fields the boards
show. Design for what is published, and say why the rest is missing.

1. Address not published (Blocking). contract/v1 has no street address, city or ZIP.
   Add a partial-data state where the property title is the TCAD account id plus
   "near {place}" and lat/lon, with the line "Address not published in Run {n}". Show it on a
   card, a candidate row, the drawer header, a triage card, an agent answer row, a Leads row and
   the Lead header (one board per screen, 390 first, e.g. CrmPropertyNoAddress390). Copy, Open
   lead and snackbars use the same title. Keep the address layout as the normal state: the
   address arrives in a later contract version.

2. Contractor name not published (Blocking). contract/v1 has no "contractor as printed on
   permit". Add the state "Contractor not published" with its reason (one line, the reason
   from the record) wherever the contractor line appears: drawer permits, triage card, agent
   rows, Lead signals, Leads column. Keep "as printed on permit" as the normal state for later.

3. App switcher (Blocking, design-system § 15). The Apps button must open a menu, not go to
   the Hub page: Atlas menu with CountyLens, Roofing CRM (current, with a check) and the
   landing page. At 390 it sits in the More sheet as the same three rows. Draw it on
   CrmShell1440 and CrmShell390 and add it to the a11y pass (Escape closes, focus returns).
   Use the same menu in CountyLens only if it does not change any CountyLens board with the
   switch off; otherwise note it for a CountyLens round.

4. BBB. The contract publishes only the BBB state (Rated / Not found / Blocked / Not
   checked) and a reason, never a score. Check every CRM board: no numeric BBB score
   or letter grade anywhere; "Not checked" shows its reason.

5. Contractor badge. Per permit the contract has two identity states, resolved and
   unresolved. In the CRM, show only those two badge variants; the other three AD-05
   variants stay CountyLens-only.

6. "source says {word}". The raw status word is not published. "Expired" is derived
   (an empty status means stalled). On CRM boards change it to "Stalled · derived: no status in
   source" (no quote marks, no "source says"), and keep the AD-08 layout.

7. Agent worked example. Real data near Pflugerville has no open roofing permits, only a
   few stalled ones. Redraw CrmAsk1440 / 390 so the Pflugerville answer is the honest version:
   "No open permits match; {n} stalled permits do", with the stalled rows labelled and a chip to
   widen the radius. Keep the current answer layout.

8. "Matched on permit text". The contract carries no permit description. Show this
   evidence line only when a matched field exists (permit type, action or number) and name the
   field ("Matched on permit type: Reroof"); omit it otherwise.

9. Property type. Residential / Commercial comes from the published property type. Add
   "Type not published" for a null value on the card and the drawer header.

10. Token extension. --lead-qualified-container and --on-lead-qualified-container are not in
    the Atlas tokens and not in the Extensions log. Either log them as E-93 with their contrast
    in light and dark, or use --md-sys-color-tertiary-container / on-tertiary-container.

11. Handoff CLAUDE.md. Change the design-system rule to: tokens come from the Atlas
    design system's own tokens.css (assessment-guide/design-system/tokens.css), including the
    --md-sys-typescale-* roles. prototype/ds/atlas/tokens.css is a reference copy only.

12. Touch target. The data-source panel's Close icon button (CrmDataChip) is 40 × 40;
    make it the Atlas 48 px icon button.

Then update CRM-HANDOFF §3 (demo lines), §8 (extensions) and §9.1 (boards and states) for the
new boards, and rerun the CRM acceptance flows.
```

**Check:** new boards exist for #1 (seven screens) and #2. `CrmShell1440` and `CrmShell390` open an Apps menu with a check on Roofing CRM. No BBB score and no "source says Expired" remain on any Crm board. §8 has E-93 or the token swap. `design/CLAUDE.md` names the guide's `tokens.css`. The CRM flows in `acceptance/` still pass, and the CountyLens boards are unchanged with the switch off.

---

# Round CRM-R2: residuals after the 2026-10-22 re-export

Written for: Claude Design, in the same CountyLens project. Checked against the new export: items 1–12 of CRM-R1 are done except #11 (`design/CLAUDE.md`), which was fixed locally. What is left is documentation and one text change.

## Prompt

```text
CRM review round CRM-R2 (small). Same rules as CRM-R1: CRM changes only on Crm… boards or
behind the "Map view (CRM preview)" switch; CountyLens boards unchanged with the switch off. Log
new extensions from E-95.

1. Board list. CRM-HANDOFF says "152 Crm boards" but the export has 153 Crm… boards. Fix the
   count, and add the 18 boards from round CRM-R1 to docs/BOARDS.md (CrmAppsMenu,
   CrmShellApps1440/768, and the NoAddress / NoContractor boards of the map, candidates,
   property, triage, agent, Leads and Lead screens), each with its screen and state.

2. Which state ships first. The real Travis County data has no street address and no contractor
   name until Task A publishes them (contract v1.1, a later Task A story). Today the normal
   boards (CrmProperty1440, CrmLeads1440, ...) still show sample addresses and "as printed on
   permit". In CRM-HANDOFF §3 (demo lines D-2 to D-8) and §9.1, name the NoAddress and
   NoContractor boards as the state the first build ships, and the address and "as printed"
   boards as the state shown once the fields appear in the manifest (the field-present state).
   Say so in one short note at the top of §4. Keep the prototype `?v1=` switch marked as
   prototype-only.

3. Open items (§11). Item 3 (property type) is now handled by "Type not published", so update it.
   Add three items: (a) address and contractor name arrive with contract v1.1; (b) the "Stalled
   · derived" label is used until a raw status word is published; (c) the county outline for the
   "outside Travis County" check and the shaded outside area is not in the data and is decided
   at architecture review (G3).

4. Hub card text. The Roofing CRM card on Hub1440, Hub768 and Hub390 still lists "Lead tools
   (visits, notes): coming soon", but leads and notes are live. Change that point to "Leads and
   notes", keep the scope line as it is, and log it as E-95 (the Hub changes only in this one
   line; the CountyLens boards are otherwise unchanged).

5. Acceptance flows. Add one flow in acceptance/ (for example v1flow.js) that checks, on the
   NoAddress and NoContractor boards: the title is the TCAD id + "near {place}", the line
   "Address not published in Run {n}" and "Contractor not published" show with a reason, no BBB
   score, no "source says", and that the Apps menu opens, shows the check on Roofing CRM, closes
   with Escape and returns focus. Run all CRM flows and state the results in
   acceptance/README.md.
```

**Check:** the count and `BOARDS.md` match the 153 boards. §3 and §9.1 say which state ships first. §11 item 3 is updated and the three new items are there. The Hub line reads "Leads and notes" on all three Hub boards. `v1flow.js` exists and every CRM flow passes.

---

# Round CRM-R3: last two residuals (2026-10-22 re-export)

Checked: CRM-R2 items 2, 3 and 4 are done, and the board count now reads 153. Two items are not in the export.

## Prompt

```text
CRM review round CRM-R3 (two items, nothing else). Same rules as before.

1. docs/BOARDS.md still lists 135 Crm boards. Add the 18 boards from round CRM-R1 (CrmAppsMenu,
   CrmShellApps1440/768, and the NoAddress / NoContractor boards of the map, candidates,
   property, triage, agent, Leads and Lead screens), each with its screen and state, and make
   the total 153 to match CRM-HANDOFF.

2. The acceptance/ folder in the export has no new flow. Add acceptance/v1flow.js that checks,
   on the NoAddress and NoContractor boards: the title is the TCAD account id + "near {place}",
   the line "Address not published in Run {n}" and "Contractor not published" with a reason are
   shown, there is no BBB score and no "source says", and the Apps menu opens, marks Roofing CRM
   as current, closes with Escape and returns focus to the Apps button. Run every CRM flow and
   write the pass/fail result per flow in acceptance/README.md. Make sure acceptance/ and
   docs/BOARDS.md are part of the handoff export.
```

**Check:** `docs/BOARDS.md` has 153 Crm boards; `acceptance/v1flow.js` exists and `acceptance/README.md` shows every flow passing.
