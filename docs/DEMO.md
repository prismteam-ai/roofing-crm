# Demo script

Follows the README demo transcript. Every step works in a browser without WebGL or location
permission (the map is replaced by a notice and the center is set by city or coordinates).
`e2e/demo.spec.ts` runs these steps in both kinds of browser.

Data: Oracle run 2 (`bafkreiaw4jf6xzwtgpcfadnu7vbwpwpshbv7qz2hflapksf5m4rzl4dsby`, as of 2026-11-27).
The banner at the top names the run; if the Oracle is down or serves another run, it turns red
and names both CIDs, search pauses, and the Leads page keeps working.

1. **Open the CRM on Broward County.** The map opens on the county center at zoom 10. Each new
   browser gets its own demo workspace (cookie, 7 days) with three seeded leads: Fort Lauderdale
   properties with roofing permits open 8 years.
2. **Set the center and radius.** Click **Use my location** (allow it), or type
   `Fort Lauderdale` and **Go**, or click the map to drop a pin. Set the radius to **5** miles.
   - Denied location: a message explains it and the county center stays.
   - A pin in the ocean (`26.1`, `-79.8` → **Set center**): "Outside Broward coverage".
3. **Aged roofs.** Untick **Open roofing permits**: the list shows roofs at or above the
   threshold (15 years by default), colored on the map by age. Raise **Roof age ≥** to 90 to
   narrow it. Within 5 miles of Fort Lauderdale more than 2,000 roofs qualify; the page says only
   the first 2,000 (oldest first) are shown.
4. **Open roofing permits.** Tick it again and untick **Aged roofs**. Long-open permits (5+ years)
   are larger with a dark ring and a **Long-open** badge, and sort first. Fort Lauderdale's
   permit layer ends in January 2021, so every open permit there is at least 5 years old; set
   **Permit open ≥** 7 to see the oldest.
5. **Review a property.** Click an address: roof age and its basis, permits with status, issue
   date, open duration, contractor and license, BBB rating or "No BBB data", and links to the
   appraiser record, the permit source and the Elephant record.
6. **Convert to leads.** Tick two candidates → **Convert 2 to leads**. Converting one again
   reports "1 already existed" (one active lead per property). **Open Leads** shows them.
7. **Ask the agent.** In **Ask the lead assistant**: "open roofing permits older than five years
   within five miles of Fort Lauderdale". The answer lists matches with parcel ids, states its
   assumptions and missing data, and **Retrieved evidence** shows each tool call with its row
   count. **Show N results on map** plots them. Follow up: "which of those near that area have a
   roof older than 50 years?" — it reuses the previous area and says so. Ask about "Springfield":
   it says that is not a Broward place and uses the map center instead of guessing.
8. **Filter leads.** On **Leads**: Roof age ≥, Permit open ≥, permit status, lead status, text
   search, and **Within N mi of the map center**. Open a lead: only allowed status changes are
   offered, notes go on the timeline, **Contact** is disabled ("Outreach coming soon"), **Show on
   map** centers the map on it, and **Check against current data run** flags leads whose property
   changed or disappeared as stale (never deleted).
9. **Future sections.** Campaigns, Estimates & Quotes, Jobs & Scheduling, Invoicing, Storm
   Tracking and Team & Territories are visible in the sidebar, locked and not clickable.
