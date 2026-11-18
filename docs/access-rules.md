# Access rules and known limits

How access to the CRM and the APIs behind it works, and where it stops. This note covers both repositories.
The pipeline repository's `docs/access-rules.md` repeats the data API's part. Each limit is known and
accepted for this assignment, with the code that causes it. Paths without a repository name are in this
repository.

## How access works

- **The site** (RoofingCrmWeb, Amplify Hosting) asks for HTTP basic auth on every path, including
  `config.json`. Its credentials are set on the `main` branch; the pipeline's Explorer, on the same app's
  `explorer` branch, has its own.
- **The token.** The browser loads `config.json`, which holds the API URLs (the data API, the leads API and
  the agent API), one API token and the map key (`scripts/write-config.ts` (the `config.json` it writes)). The
  app sends that token as `Authorization: Bearer …` to all three APIs (`apps/crm/src/App.tsx` (`App`, the
  `loadConfig` effect)).
- **Permits and contractors in the CRM.** The parcel details list the parcel's City of Los Angeles permits
  (from LADBS, the City's Department of Building and Safety) with their status, open duration and roofing
  flags, and each permit's contractor rows as LADBS publishes them, one line each: business name, license
  number, license class (with the type as printed on the permit when it differs), owner-builder, city, the
  number of name spellings on the license when there is more than one, and the license expiration date
  recorded with the permit (`apps/crm/src/ParcelPermits.tsx` (`Contractor`)). The contractor identity key stays
  in the page's markup (`data-identity-key`) and is not shown. One identity is one license number, not verified
  against CSLB (the Contractors State License Board); a row without a business name reads "business name not
  published", never a guessed name. The parcel details also show the land base year, and
  the search can apply the ownership filter with its basis; each basis is shown with its text and weakness, as
  proxies from the County roll, not sales records. BBB ratings are shown as not available. No owner names, mailing addresses
  or contact fields exist in the data, so none are shown.
- **The shared authorizer.** All three APIs use one token authorizer, owned by the pipeline's data API. It compares
  the token's sha256 with the hashes stored in SSM. The leads API also requires the authorizer to name the
  client `crm`: a missing name is refused as UNAUTHORIZED, any other as FORBIDDEN
  (`apps/leads-api/src/trpc.ts` (`procedure`, `LEADS_CLIENT`)).
- **Lead writes.** They go only through the leads API. The table's resource policy denies the data-plane
  write actions to every principal except the leads Lambda's role (`apps/crm/cdk/lib/crm-leads-stack.ts` (`DENIED_WRITE_ACTIONS`; `LeadsData`, statement
  `WritesOnlyThroughTheLeadsApi`)).
- **Notes.** They are checked on the server and in the app by one shared rule (`apps/leads-api/src/schema.ts`).
- **Lead addresses.** The leads list shows each lead's parcel address, read with the data API's `parcels.detail`
  only while the list is open: once per distinct parcel shown, kept in memory for the page's life and never
  stored with the lead or sent to the leads API. A closed list makes no address call
  (`apps/crm/src/leadAddresses.ts` (`useLeadAddresses`)).
- **Lead permit statuses.** While a status is chosen in the list's "Permit status" filter, the list reads the
  status class of each kept lead's own permit with the data API's `permits.forParcel`, also while the list is
  closed, because the count shows: once per lead, kept in memory for the page's life, never stored with the lead
  or sent to the leads API or the agent. With no other filter on, that is one read for every loaded lead with a
  permit, up to the 2,000 leads the list loads. A read that fails is not tried again until the page is
  reloaded; the lead then shows "status not available" and stays listed under every status choice. Reads already
  queued are still sent when the choice goes back to "all permit statuses". Address and permit reads share one
  limit of 4 in flight (`apps/crm/src/leadPermits.ts` (`useLeadPermits`);
  `apps/crm/src/leadAddresses.ts` (`newLeadReadPacer`, `ADDRESS_MAX_IN_FLIGHT`)).
- **Building-level permits.** A building-level permit counts on each of its units, so the parcels marked with a
  long-open permit can outnumber the permits listed; the map legend says so (`apps/crm/src/App.tsx`).

## Known limits

1. **One shared, long-lived token sits in the browser.** The `crm` token is in `config.json`
   (`scripts/write-config.ts` (`apiToken` in `config.json`)), behind the site's basic auth only.
   - Anyone with the basic-auth credentials can read it, and then read the data API and create, update or
     delete any lead, until the token is rotated.
   - Rotating it takes a new token in `.secrets/crm.json`, its hash in the pipeline's
     `.secrets/api-clients.json`, an OracleLaDataApi deploy, `write-config` and a RoofingCrmWeb deploy.
     `scripts/secrets.ts` never overwrites `.secrets/crm.json`, so the new token and its sha256 are written into
     it by hand.
   - There is no per-user sign-in.
2. **Leads record no user.** A lead holds the parcel ID, status, notes and timestamps, and the permit number when it was created from a
   permit row (`source_permit`) (`apps/leads-api/src/schema.ts` (file header, `lead`)). There is no "created by" or "updated by", so changes cannot be
   traced to a person.
3. **The basic-auth password is in the template.** It goes in through `SecretValue.unsafePlainText`
   (`apps/crm/cdk/lib/crm-web-stack.ts` (`CrmWebStack`, `basicAuth`)), so it sits in the synthesized CloudFormation template and in
   `cdk.out`. This avoids a Secrets Manager standing cost. The pipeline's Explorer stack does
   the same (pipeline `apps/explorer/cdk/lib/explorer-web-stack.ts` (`ExplorerWebStack`, `basicAuth`)).
4. **The table policy holds only while the leads role and code are protected.**
   - The resource policy denies writes to any principal other than the leads role, matched by
     `aws:PrincipalArn` (`apps/crm/cdk/lib/crm-leads-stack.ts` (`LeadsData`, statement `WritesOnlyThroughTheLeadsApi`)).
   - The role trusts `lambda.amazonaws.com` (`crm-leads-stack.ts` (`LeadsData`, role `FunctionRole`)). Anyone allowed to pass that role to a
     function (`iam:PassRole`), or to change the leads Lambda's code (`lambda:UpdateFunctionCode`), can
     write as that role.
   - The boundary is only as strong as those two permissions in the account.
5. **CORS is not access control.** The leads API allows browser calls only from the CRM's origin
   (`apps/crm/cdk/lib/crm-leads-stack.ts` (`CrmLeadsStack`, `HttpApi` `corsPreflight`)). The data API and the
   agent API allow the CRM's and the Explorer's origins (pipeline `apps/api/cdk/lib/data-api-stack.ts` (`DataApiStack`,
   `HttpApi` `corsPreflight`), from pipeline `apps/api/cdk/clients.json`). A request without an `Origin`
   header, from curl or a script, is served whenever the token is valid.
6. **The authorizer caches its answer for 300 seconds** (`apps/crm/cdk/lib/crm-leads-stack.ts` (`CrmLeadsStack`, `TokenAuthorizer` `resultsCacheTtl`); pipeline
   `apps/api/cdk/lib/data-api-stack.ts` (`DataApiStack`, `TokenAuthorizer` `resultsCacheTtl`)). A rotated or removed token can keep working for up to about 10 minutes: the pipeline's authorizer also keeps the token hashes for 5 minutes (pipeline `apps/api/src/authorizer.ts` (`CACHE_MS`)).
7. **Any valid client may call every data API route.** The data API ignores the client name the authorizer
   passes (pipeline `apps/api/src/authorizer.ts` (`handler`, which passes `context.client`)). The leads API (only
   `crm`) and the agent API (only `crm` and `explorer`) restrict by client.
8. **The map key is public by design.** It sits in `config.json` and is restricted only to map tiles
   (`geo-maps:GetTile`) and by Referer to the CRM's origin (`apps/crm/cdk/lib/crm-map-key-stack.ts` (`CrmMapKeyStack`, `MapKey` `restrictions`)).
   A Referer can be set outside a browser. The daily tile-count alarm (more than 5,000 tiles, about
   $0.20 a day) is what catches misuse.
9. **The notes rule is a guard, not a filter for all personal data.** It refuses email addresses, phone
   numbers with an area code and 7 or more digits in a row (`apps/leads-api/src/schema.ts`). It does not
   detect names or street addresses.
   - The notes filter allows phone numbers without an area code (e.g. 555-1234).
10. **The CRM and the pipeline's Explorer share one Amplify app.** The Explorer is the `explorer` branch of
    this repository's app `roofing-crm`; the account allows one Amplify app.
    - Each branch has its own basic-auth credentials, so neither site's password opens the other.
    - The app-level settings belong to RoofingCrmWeb and apply to both sites: the single-page rewrite rule,
      basic auth (off at app level), the service role, and deleting the app, which deletes both branches
      (`apps/crm/cdk/lib/crm-web-stack.ts` (`CrmWebStack`); `apps/crm/test/web-stack.test.ts`).
    - Anyone who can deploy either stack can deploy a site to either branch: the Amplify asset-deployment
      provider in each stack may call `amplify:StartDeployment` on any app.
    - The Explorer's token is refused by the leads API, which accepts only the client `crm`
      (`apps/leads-api/src/trpc.ts` (`procedure`, `LEADS_CLIENT`)). The Explorer's origin is in neither the
      leads API's CORS nor the map key's Referer list, and the Explorer's `config.json` has no leads API URL
      and no map key.
11. **The license expiration date is shown as recorded with the permit** ("expiry recorded on the permit …"). It is the date
    LADBS recorded with that permit, not the license's status today, and nothing is verified against CSLB. The
    agent does not receive it, because a hosted answer once read it as "had expired" (pipeline
    `packages/agent/src/tools.ts` (`CONTRACTOR_FIELDS`)).
12. **The leads API does not check a lead's permit.** `leads.create` stores any permit number of the shape
    99999-99999-99999 (`apps/leads-api/src/schema.ts` (`permitNumber`, `createInput`)); it does not check that the
    permit exists, is on that parcel or is open. Only the app limits it to a row of the long-open list.

## The "Ask the agent" section

The aside's "Ask the agent" section sends a question to the pipeline's hosted agent (OracleLaAgentApi) with the
CRM's token. The agent's access rules, every per-answer cap and its known limits are in the pipeline's
`docs/access-rules.md` ("The hosted agent"); what the CRM adds is below.

- **What leaves AWS for Anthropic.** The notice under the question box: "Your questions in this conversation,
  the map center, the radius, the roof age threshold and the data the agent reads are sent to Anthropic to
  answer them." (`apps/crm/src/AskAgent.tsx` (`NOTICE`)). The center is the pin, labeled by how it was placed
  ("map pin" or "my location"); the radius and the last valid roof-age threshold of the screen go with every
  question and are shown under the box. Contractor business names go to the model as LADBS publishes them; some
  may be a person's own name used as a business name.
- **Client-held conversation.** The history, the session and the server's signature are kept in the page's
  state while it is open: they are gone on reload, and nothing is written to browser storage. The server
  refuses an unsigned or altered history.
- **The warm-up.** When the section opens, it sends `GET /agent/warm` and two data API requests at once
  (`apps/crm/src/warmup.ts`). Each data request takes about 0.8 s when warm, so the two are in flight together
  and the agent's function and two data API instances (Lambda execution environments) are warmed (two cold ones took 5.4 and 6.2 s at the function on 14 Nov 2026). It is best effort and holds at most 2 of the data API's 5 concurrent slots while it runs. A question
  asked before it has answered is held, shown as "waking up", until it has answered or 20 seconds have passed.
  Send is disabled while a question is pending, a held one included (`apps/crm/src/AskAgent.tsx`). When the warm-up's
  own last data API response is more than 4 minutes old, the warm-up runs again before the question.
- **Sources.** Parcel IDs in an answer's Sources open the parcel's details and pan the map to it.
- **Per-answer caps** (pipeline `docs/access-rules.md`): 2,000 characters in; 2,048 output tokens per model call;
  80,000 tokens per answer; five tool rounds; 25 s per answer (Lambda timeout 29 s, HTTP API 30 s); 2 answers at
  a time; request body 200 KB (it carries the history); data calls one at a time, 5 s per attempt (the answer's first call 10 s), one
  retry. A first call cut twice uses 10 + 0.5 + 10 = 20.5 s, which leaves about 3 s of the 25 s after the
  agent's 1.5 s reserve, so the model call that follows has about 3 s, and the answer stops with an error if it
  does not finish. A later call can land on a cold data API instance and be cut at 5 s; on 15 Nov one attempt was cut at 4.95 s and its retry answered in 154 ms.

Known limits of the section:

1. **Anyone with the CRM's basic-auth password can use the agent** with the `crm` token, until the token is
   rotated; there is no per-user sign-in or quota.
2. **The people guard is a pattern:** it refuses questions about owners, residents, tenants and contact details
   before any data call, so its refusal reads no data and lists no contractor window (2013-01-02 to 2023-05-19);
   a bare personal name with no such word passes it, and no owner data exists to be read.
3. **The spend limits come late:** the agent's two spend alarms ($2 in a UTC day, $1 within 5 minutes) fire up
   to about 24 hours and about 10 minutes after the spend; the Anthropic workspace's $20 monthly limit may lag,
   and the final stop is the credit balance (no payment method is attached).
4. **"RAG-backed" means retrieval by tool calls** over the data API, with the records cited; there are no
   embeddings and no vector index (no free-text corpus is served, and Bedrock is not available in the account).
   The deviation is in [kit-deviations.md](kit-deviations.md).
