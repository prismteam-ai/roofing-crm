# Page override · Lead map (CRM)

Overrides `MASTER.md` for `apps/web/public/index.html`.

MASTER came back as generic SaaS CRM (navy + `#0369A1`, Fira Code headings, marketing "Lead Magnet + Form"). That is the wrong job. This page is a roofing estimator's field tablet over Chester County parcels.

## Job

Find aged roofs and long-open county permits around a pin, then save leads. Map is the hero. Filters stay on a clipboard. Matches, parcel detail, saved leads, and the agent sit on a permit-paper rail.

## Subject remap (do not use MASTER navy/sky or Fira Code as display)

| Token | Hex | Why |
| --- | --- | --- |
| `--ink` | `#1A2430` | Survey ink / construction slate |
| `--paper` | `#F3F5F6` | Cool mylar, not cream `#F4F1EA`, not SaaS `#F8FAFC` |
| `--mylar` | `#D7DEE4` | Plat-sheet ground |
| `--surface` | `#FBFCFC` | Permit paper |
| `--muted` | `#5B6772` | Secondary labels |
| `--line` | `#C5CED6` | Hairline rules |
| `--tray` | `#1E2A33` | Slate clipboard (not OLED black, not forest green) |
| `--tray-ink` | `#E8EEF1` | Clipboard type |
| `--copper` | `#A85B2A` | Weathered flashing. CTA, pin, Add lead |
| `--plat` | `#2C5874` | Survey grid / radius / location |
| `--stamp` | `#8B2E2E` | Open-permit stamp |
| `--caution` | `#8A6A12` | Known roof-age proxy |

Type: **Barlow Condensed** (wordmark, municipal highway) + **IBM Plex Sans** (UI) + **IBM Plex Mono** (UPI, coords). Not Inter. Not Fira Code for headings.

Radius: 2–4px (county form). Density 8: 8px grid, 44px hit targets. Motion: 160–220ms opacity/transform only. No GSAP.

## Signature

Three materials in one viewport: slate tray, light map, paper rail. Copper survey pin. UPI set in mono like a parcel index. A 6px plat-tick edge on the tray only.

## Stack

Static HTML + CSS variables. No Tailwind build, no React, no emoji icons. Inline 20px outline SVGs.

## Do not break

Existing e2e IDs and heading text: `h1` contains `Roofing CRM`; `#status`, `#map`, `#hits`, `#detail`, `#leads`, `#ask`, `#agent`, `#usePin`, `#gps`, `#radius`, `#age`, `#open`, `#leadAge`, `#leadOpen`, `#filterLeads`, `button[data-lead]`, `.hit`.
