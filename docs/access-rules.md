# Access rules and known limits

How access to the CRM and the APIs behind it works, and where it stops. This note covers both repositories.
The pipeline repository's `docs/access-rules.md` repeats the data API's part. Each limit is known and
accepted for this assignment, with the code that causes it. Paths without a repository name are in this
repository.

## How access works

- **The site** (RoofingCrmWeb, Amplify Hosting) asks for HTTP basic auth on every path, including
  `config.json`.
- **The token.** The browser loads `config.json`, which holds the API URLs, one API token and the map key
  (`scripts/write-config.ts:50-57`). The app sends that token as `Authorization: Bearer …` to both APIs
  (`apps/crm/src/App.tsx:138-149`).
- **The shared authorizer.** Both APIs use one token authorizer, owned by the pipeline's data API. It compares
  the token's sha256 with the hashes stored in SSM. The leads API also requires the authorizer to name the
  client `crm`: a missing name is refused as UNAUTHORIZED, any other as FORBIDDEN
  (`apps/leads-api/src/trpc.ts:30-40`).
- **Lead writes.** They go only through the leads API. The table's resource policy denies the data-plane
  write actions to every principal except the leads Lambda's role (`apps/crm/cdk/lib/crm-leads-stack.ts:31-41`,
  `:82-95`).
- **Notes.** They are checked on the server and in the app by one shared rule (`apps/leads-api/src/schema.ts`).

## Known limits

1. **One shared, long-lived token sits in the browser.** The `crm` token is in `config.json`
   (`scripts/write-config.ts:55`), behind the site's basic auth only.
   - Anyone with the basic-auth credentials can read it, and then read the data API and create, update or
     delete any lead, until the token is rotated.
   - Rotating it takes a new token in `.secrets/crm.json`, its hash in the pipeline's
     `.secrets/api-clients.json`, an OracleLaDataApi deploy, `write-config` and a RoofingCrmWeb deploy.
   - There is no per-user sign-in.
2. **Leads record no user.** A lead holds the parcel ID, status, notes and timestamps only
   (`apps/leads-api/src/schema.ts:2-4`, `:58-63`). There is no "created by" or "updated by", so changes cannot be
   traced to a person.
3. **The basic-auth password is in the template.** It goes in through `SecretValue.unsafePlainText`
   (`apps/crm/cdk/lib/crm-web-stack.ts:24-28`), so it sits in the synthesized CloudFormation template and in
   `cdk.out`. This avoids a Secrets Manager standing cost (decision D3). The pipeline's Explorer stack does
   the same (pipeline `apps/explorer/cdk/lib/explorer-web-stack.ts:26`).
4. **The table policy holds only while the leads role and code are protected.**
   - The resource policy denies writes to any principal other than the leads role, matched by
     `aws:PrincipalArn` (`apps/crm/cdk/lib/crm-leads-stack.ts:82-95`).
   - The role trusts `lambda.amazonaws.com` (`crm-leads-stack.ts:63`). Anyone allowed to pass that role to a
     function (`iam:PassRole`), or to change the leads Lambda's code (`lambda:UpdateFunctionCode`), can
     write as that role.
   - The boundary is only as strong as those two permissions in the account.
5. **CORS is not access control.** The leads API and the data API allow browser calls only from the CRM's
   origin (`apps/crm/cdk/lib/crm-leads-stack.ts:176-177`; pipeline
   `apps/api/cdk/lib/data-api-stack.ts:161`). A request without an `Origin` header, from curl or a script,
   is served whenever the token is valid.
6. **The authorizer caches its answer for 300 seconds** (`apps/crm/cdk/lib/crm-leads-stack.ts:169`; pipeline
   `apps/api/cdk/lib/data-api-stack.ts:155`). A rotated or removed token keeps working for up to 5 minutes.
7. **Any valid client may call every data API route.** The data API ignores the client name the authorizer
   passes (pipeline `apps/api/src/authorizer.ts:4-5`). Only the leads API restricts by client.
8. **The map key is public by design.** It sits in `config.json` and is restricted only to map tiles
   (`geo-maps:GetTile`) and by Referer to the CRM's origin (`apps/crm/cdk/lib/crm-map-key-stack.ts:27-33`).
   A Referer can be set outside a browser. The daily tile-count alarm (more than 5,000 tiles, about
   $0.20 a day) is what catches misuse.
9. **The notes rule is a guard, not a filter for all personal data.** It refuses email addresses, phone
   numbers with an area code and 7 or more digits in a row (`apps/leads-api/src/schema.ts`). It does not
   detect names, street addresses or a 7-digit local number with a separator ("555-1234").
