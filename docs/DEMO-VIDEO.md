# Roofing CRM: demo video script (about 6 minutes)

Follows the README **Demo Transcript** in order. Spoken lines are in quotes; actions are in bold.
Site: https://main.dvy80s6giizfb.amplifyapp.com

## Before you record

- Use a **fresh browser profile or private window**, so you get a clean demo workspace: 3 seeded
  leads and nothing converted yet.
- Window at about 1400×900, browser zoom 100%. Close other tabs and turn notifications off.
- Do a dry run of the agent question once, so the Lambdas are warm. It costs a few cents.
- Decide GPS or not. If you click **Use my location**, the center becomes your real location; type
  "Fort Lauderdale" instead to keep your location off the video.
- Have the repository open in a second tab, on the README, for the closing shot.

## 0. Opening (15 s)

"This is the Roofing CRM for Broward County, Florida. It finds roofing leads from aged roofs and
long-open roofing permits, using real county data from my Oracle pipeline, and turns them into CRM
leads. Everything you'll see is the hosted version on AWS."

## 1. Open on the county (20 s)

**Load the page. Point at the banner at the top.**

"It opens centered on Broward County. The banner names the exact data run the CRM reads, by its
IPFS manifest CID: 766,044 properties. It also states this run's limits up front: there are no BBB
grades, because BBB blocked automated access, and Fort Lauderdale's permit statuses are as of
January 2021."

## 2. Set the center and radius (30 s)

**Type `Fort Lauderdale` → Go. Set the radius to 5.**

"I can use GPS, click the map to drop a pin, or search a city. I'll center on Fort Lauderdale with
a 5-mile radius."

Optional, 10 s: **Latitude 26.1, Longitude -79.8 → Set center**, show "Outside Broward coverage",
then search Fort Lauderdale again. "A pin outside the county is refused rather than showing empty
results."

## 3. Aged roofs above a threshold (45 s)

**Untick Open roofing permits. Point at the map, then the capped notice.**

"These are roofs at least 15 years old within 5 miles, colored by age. About 105,000 qualify. The
list shows 2,000 spread across the whole circle, the oldest in each part of it, and it tells me the
total."

**Change Roof age ≥ to 60, then 90.**

"Raising the threshold narrows it to the oldest roofs. Each row says whether the roof age comes
from a roofing permit or falls back to the year built."

**Set Roof age back to 15.**

## 4. Long-open roofing permits (40 s)

**Tick Open roofing permits, untick Aged roofs. Set Permit open ≥ 7.**

"Now open roofing permits. Long-open permits, five years or more, are larger with a dark ring and
a Long-open badge, and they sort first. With open at least 7 years, only the oldest remain. Every
permit row also shows that property's roof age."

**Set Permit open back to 0 and tick Aged roofs again.**

## 5. Property and permit detail (40 s)

**Click a permit candidate with a named contractor** (for example one showing R N PALMER ROOFING).

"The detail shows roof age and its basis, then each permit: status, issue date, how long it's been
open, the contractor and their state license. The BBB field says 'No BBB data', which is honest
for this run. Each fact links back to its source: the appraiser record, the permit source and the
IPFS record."

## 6. Convert to leads (30 s)

**Close the detail. Tick two candidates → Convert 2 to leads.**

"I'll convert two matches into leads." **Point at "Created 2 leads".**

**Tick one of the same two again → Convert.**

"Converting the same property again doesn't duplicate it: one active lead per property."

## 7. Ask the agent (75 s)

**In Ask the lead assistant, type and send:**
`Which roofing permits within 5 miles of Fort Lauderdale have been open more than 5 years on a roof older than 50 years?`

"The assistant answers in plain language using the same Oracle tools." **Wait for the answer.**

"It gives the full count, lists the longest-open with parcel ids, contractors and roof ages, and
states its assumptions and what data is missing." **Expand Retrieved evidence.** "Here's every
tool call it made, with the rows it got back." **Click Show N results on map.** "And it can plot
the results."

Optional follow-up: `Which of those have a named contractor?` It reuses the same area and says so.

## 8. Filter leads (50 s)

**Click Leads in the sidebar.**

"The Leads page has the seeded leads plus the two I just created."

**Set Roof age ≥ 60, then clear it. Set Permit open ≥ 8, then clear it. Tick Within, set 1 mile.**

"I can filter by roof age, by permit open duration and status, and by distance from the map
center."

**Open one lead.** "A lead has an allowed status flow, notes on a timeline, and a check against the
current data run that flags it as stale if the property changed. Contact is disabled: outreach
comes later."

## 9. Future sections (15 s)

**Point at the locked sidebar items.**

"Campaigns, Estimates and Quotes, Jobs, Invoicing, Storm Tracking and Team and Territories are
placeholders for future CRM work. They're visible but disabled."

## 10. Close (20 s)

**Switch to the repository tab.**

"The code is in this repository: a React web app on Amplify, a tRPC API on Lambda, DynamoDB, and
an AI SDK agent, all deployed with CDK. The same demo runs as an end-to-end test against the hosted
site, in a normal browser and in one without GPS or WebGL. Thanks for watching."

## If something goes wrong

- The agent says the daily budget is used up: skip step 7 and say the agent has a daily token cap
  to control cost. Mention the e2e test covers it.
- The map is a grey box (no WebGL): the lists still show everything. Keep going.
- The red banner appears: the Oracle is down or serves another run. Search pauses, leads still
  work. Reload after a minute.
