# CountyLens + Roofing CRM: implementation handoff

You are implementing two products from a finished, clickable design prototype.

- **CountyLens (Task A):** a list-first explorer for public property, permit, owner and contractor data in Travis County, TX. Spec: `docs/HANDOFF.md`.
- **Roofing CRM (Task B):** map, filters, AI search and leads, built on the same data. Spec: `docs/CRM-HANDOFF.md`. Every CRM item is tagged **CRM · not Task A** and must not leak into CountyLens.

## Read in this order
1. `docs/HANDOFF.md` §1 Ground rules, §2 Architecture, §13 Architecture decisions (AD-01 to AD-16), §12 Build order and acceptance check.
2. The section for the screen you are building (§4.x), its states (§6) and its extensions (§8).
3. For CRM work: `docs/CRM-HANDOFF.md` (site map, flows, screens, lead fields, URL state, shared components, states, a11y).
4. `docs/design-review-log.md` only when a decision's reason matters (cited as `#n`).
5. `docs/BOARDS.md` to find the prototype board for a screen.

## The prototype is the reference, not the code
- Serve it: `python3 -m http.server 8765 --directory prototype`, then open `http://localhost:8765/Main.dc.html` (CountyLens site map) or `CrmFlows.dc.html` (CRM).
- Each board is one `.dc.html` file: an `<x-dc>` template with `{{holes}}`, `sc-for`, `sc-if`, and logic in a `DCLogic` class, run by `support.js`. Read it for layout, copy, behaviour and states. **Do not port it**; rebuild in the app's own stack.
- Port the logic, not the numbers: records, counts and run data are fixtures labelled Sample.
- The round prototype menu (ProtoBar), state bars and the **Map view (CRM preview)** switch are prototype-only. Never ship them or a feature flag in their place. CountyLens = switch off; CRM = switch on.

## Hard rules
- **Design system:** Atlas (Material 3) tokens only. Tokens come from the Atlas design system's own `tokens.css` (`../../assessment-guide/design-system/tokens.css`, from this folder), including the `--md-sys-typescale-*` roles; `prototype/ds/atlas/tokens.css` is a reference copy only (it lacks the typescale and adds prototype-only `--font-*` and `--breakpoint-*`). Components follow `components/bundle.css`. No new colours, sizes or radii; anything Atlas lacks is built from tokens and is already listed in the Extensions log (HANDOFF §8, CRM-HANDOFF §8). Radii: `--md-sys-shape-corner-*` only.
- **Responsive:** mobile first, 390 → 768 → 1440. No panel scrolls in Explore at any of them.
- **States:** every screen has loading, empty, error and partial; agent screens also rate-limited.
- **Accessibility:** text 4.5:1 and shapes 3:1 in light and dark, 48 px targets, visible focus, dialogs trap focus and close with Escape, status never by colour alone, `prefers-reduced-motion` honoured (HANDOFF §10, CRM-HANDOFF §10).
- **Architecture:** no query database; data is CID-addressed Parquet read through `query-core` views. Free-form SQL runs only in the browser (DuckDB-WASM). The agent returns one response, no streaming (AD-09). No IPNS, no Parquet serving, no contractor licence line.
- **CountyLens has no map:** List view only, no view switcher, `view=map` falls back to List. The map, ring, hexagons and layers belong to the CRM.
- **URL is state:** Explore, the CRM map and the Leads list keep their filters in the URL (HANDOFF §2 Shareable URLs, CRM-HANDOFF §6).
- Every value traces source → run → CID. Sample values stay labelled until real data replaces them.
- Coming-soon items show a "Soon" marker, are hoverable with a tooltip, and open their coming-soon page.

## Definition of done for a screen
1. Matches its boards at 390, 768 and 1440, including every state board listed for it.
2. The matching flows in `acceptance/` pass against your build (`BASE=<your url> node <flow>.js`); see `acceptance/README.md`.
3. Its demo line in HANDOFF §9 (D-1 to D-12) or CRM-HANDOFF §3 (D-1 to D-9) can be shown end to end.
4. CountyLens screens show nothing tagged CRM.

## Slash commands
- `/build-screen <board or section>`: plan and build one screen from its spec and boards.
- `/verify-screen <board>`: check a built screen against its boards, states, flows and the hard rules.
