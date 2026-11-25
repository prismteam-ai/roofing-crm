# Roofing Lead CRM: web app

Vite + React + TypeScript single-page app. Map: MapLibre GL JS on the free OpenFreeMap basemap
(no API key; falls back to OpenStreetMap raster tiles if the style cannot be fetched).

## Run locally

```bash
pnpm install                                   # once, at the repo root
pnpm --filter @roofing-crm/api dev             # API on http://localhost:8787
pnpm --filter web dev                          # app on http://localhost:5173
```

Without `ORACLE_MCP_URL` the dev API serves a labelled synthetic fixture (see
`apps/api/src/dev/fixtureOracle.ts`), in-memory leads, and no language model, so the agent
panel shows its "not configured" reply. Set `ORACLE_MCP_URL` (and a model key) before starting
the API to use real data.

`VITE_API_URL` selects the API. `vite dev` falls back to `http://localhost:8787`; a production
build without it shows a configuration message instead of guessing.

## Layout

| Path                                | What it is                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `src/App.tsx`                       | Shell: navigation, URL state, search query, wiring between map, list and drawer |
| `src/components/MapView.tsx`        | MapLibre map: pin, radius circle, candidate / agent / selection layers, legend  |
| `src/components/SearchControls.tsx` | Location (GPS, jump-to, lat/lon), radius and filters                            |
| `src/components/CandidateList.tsx`  | Paged candidate list, multi-select, convert to leads                            |
| `src/components/PropertyDrawer.tsx` | Property, ownership, permits, contractor, BBB, provenance                       |
| `src/components/LeadsView.tsx`      | Lead table: filters, inline edit, delete with confirm, CSV export               |
| `src/components/AgentPanel.tsx`     | Natural-language questions with assumptions, evidence and rows                  |
| `src/components/DataView.tsx`       | Dataset counts, sources, manifest links                                         |
| `src/lib/urlState.ts`               | Query-string state, so a link reproduces a search                               |
| `src/lib/useLeadBook.ts`            | Lead mutations (optimistic edit and delete with rollback)                       |

The tRPC client and React Query bindings come from `@roofing-crm/api-client`; this app never
builds its own client.

## Driving it from a test or an agent

Every control has a visible label and a stable `data-testid` (`jump-la-jolla`, `radius-input`,
`signal-open_permit`, `candidate-row`, `candidate-add-lead`, `convert-selected`,
`property-drawer`, `nav-leads`, `agent-example-0`, ...). The map element is
`[data-testid="map"]` and sets `data-map-ready="true"` once it can be clicked. Nothing needs a
drag, hover or keyboard shortcut: the pin can be placed by map click, "Jump to" or the
latitude / longitude boxes.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # from the repo root
```
