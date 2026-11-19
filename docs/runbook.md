# Runbook: build, deploy, test and tear down (CRM repository)

This repository holds the Roofing CRM: the web app (`apps/crm`, stack RoofingCrmWeb), its Amazon Location map
key (RoofingCrmMapKey) and the leads API with its table (`apps/leads-api`, RoofingCrmLeads). RoofingCrmWeb's
Amplify app also hosts the pipeline repository's Explorer, as a second branch (`explorer`) that the pipeline's
OracleLaExplorerWeb stack creates ([kit-deviations.md](kit-deviations.md), row 16). The CRM reads
property data from the hosted data API in the pipeline repository
(oracle-property-intelligence-platform-pipeline-los-angeles-ca), and its "Ask the agent" section asks the
hosted agent there (stack OracleLaAgentApi). The pipeline's `docs/runbook.md` covers the pipeline stacks, the
agent's two secrets, the data build and the run upload. The two runbooks describe one deploy order, written from the
code: every step names the file that makes it necessary.

Related: [kit-deviations.md](kit-deviations.md), [access-rules.md](access-rules.md),
[glossary.md](glossary.md).

## 1. Prerequisites

- Node.js 22.18 or later and pnpm 12.16.1 (`package.json` `engines` and `packageManager`):
  `corepack enable pnpm`, then `pnpm install --frozen-lockfile`.
- The AWS CDK CLI comes from the workspace (`aws-cdk` 2.1146.1 in `apps/crm/package.json`); run it as
  `pnpm exec cdk` from `apps/crm`.
- The AWS CLI v2 with a profile for the target account. Commands below take `--profile <your profile>`; you
  can set `AWS_PROFILE` instead. Set `AWS_PROFILE` in any case (`export AWS_PROFILE=<your profile>`): `scripts/write-config.ts` requires it. The region is set in code, in `apps/crm/cdk/bin/app.ts` (`env`), and `<region>` below stands for it (kit-deviations.md, row 1).
- The CDK app reads the account from `CDK_DEFAULT_ACCOUNT`, which the CDK CLI sets, and fails if it is unset
  (`apps/crm/cdk/bin/app.ts` (`account`)). The account must be bootstrapped once (see the pipeline runbook).
- The CDK app reads `.secrets/crm.json` on every synth, for every stack (`apps/crm/cdk/bin/app.ts` (`secrets`)).
- Telemetry off, in every shell that runs these tools:

  ```
  export CDK_DISABLE_CLI_TELEMETRY=true TURBO_TELEMETRY_DISABLED=1
  ```

- RoofingCrmWeb's first deploy comes before the data API: it creates the Amplify app and publishes the app ID
  that the data API and the Explorer read. The other CRM stacks need the data API (section 3).

Deploys keep CDK's default approval: run `pnpm exec cdk diff <stack> --profile <your profile>` first, read
its security-changes table, and answer the prompt `cdk deploy` shows when permissions change. The prompt
covers only the top-level stack: the IAM changes of OracleLaExplorerWeb and RoofingCrmWeb are all in their
nested Amplify asset-deployment provider stack, so `cdk deploy` creates them without asking. Read the diff's
table first. Never pass `--require-approval never`. For a site-only change, expect RoofingCrmWeb's diff to change the
site asset only; a security-changes table there, nested stack included, is reviewed before deploying.

## 2. Secrets (gitignored `.secrets/crm.json`, never committed or printed)

| Value                    | Comes from                                                     | Used by                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basicUser`, `basicPass` | `node scripts/secrets.ts` (once; it never overwrites the file) | RoofingCrmWeb's basic auth (`apps/crm/cdk/bin/app.ts` (`RoofingCrmWeb`, `CrmWebStack` props)); the hosted suite's `CRM_USER` and `CRM_PASS`                                   |
| `apiToken`               | `node scripts/secrets.ts`                                      | `config.json`, through `scripts/write-config.ts` (`apiToken` in `config.json`)                                                                                                |
| `apiTokenSha256`         | `node scripts/secrets.ts`                                      | Copied by hand into the pipeline repository's `.secrets/api-clients.json` as `{ "crm": { "tokenSha256": "…" } }`. OracleLaDataApi stores it in SSM for the shared authorizer. |
| `mapKey`                 | Added by hand after RoofingCrmMapKey is deployed (below)       | `config.json`, through `scripts/write-config.ts` (`mapKey` in `config.json`)                                                                                                  |

`scripts/secrets.ts` does not create `mapKey`. After step 7 below, from the repository root, read the key's value
from Amazon Location and add it to the file without printing it:

```
KEY=$(aws location describe-key --key-name <MapKeyName output of RoofingCrmMapKey> --query Key --output text \
  --region <region> --profile <your profile>) \
node -e 'const fs=require("fs"),f=".secrets/crm.json",s=JSON.parse(fs.readFileSync(f));s.mapKey=process.env.KEY;fs.writeFileSync(f,JSON.stringify(s,null,2))'
```

`scripts/write-config.ts` reads the stack outputs with the AWS CLI, using the profile named in `AWS_PROFILE`.
It stops with a message if `AWS_PROFILE` is unset.

## 3. Deploy order across both repositories

| #     | Step                                                                                                                                    | Repo     | Needs (and where that comes from)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | OracleLaGuards                                                                                                                          | pipeline | See the pipeline runbook.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2     | `pnpm build`, then from `apps/crm`: `pnpm exec cdk deploy RoofingCrmWeb --profile <your profile>` (first deploy, without `config.json`) | CRM      | `apps/crm/dist` from the build (the `siteDir` default, `apps/crm/cdk/bin/app.ts` (`siteDir`)) and the basic-auth values. Creates the Amplify app and its `main` branch, and publishes the app ID as the SSM parameter `/roofing-crm/web/app-id` (`apps/crm/cdk/lib/crm-web-stack.ts` (`APP_ID_PARAM`)), which the pipeline's OracleLaDataApi and OracleLaExplorerWeb read at deploy time. Outputs `Origin` (`crm-web-stack.ts` (`CrmWebStack`, output `Origin`)). Until step 10 the site loads but shows a `config.json` error. Not exercised: this first deploy without `config.json` has not been run. RoofingCrmWeb synthesizes from a site without `config.json` (checked 13 Nov 2026); it has not been deployed this way.                                             |
| 3-4   | OracleLaDataApi, run upload                                                                                                             | pipeline | See the pipeline runbook. The data API's CORS origins for the CRM (`main`) and the Explorer (`explorer`) are built from `/roofing-crm/web/app-id`; no file in either repository holds the app ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5-6   | The agent's two SecureStrings (by hand), then OracleLaAgentApi                                                                          | pipeline | See the pipeline runbook. The agent API's CORS allows the same two branches, from `/roofing-crm/web/app-id`, and it serves the clients `crm` and `explorer` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7     | `pnpm exec cdk deploy RoofingCrmMapKey --exclusively -c alertTopicParam=/oracle-la/alerts/topic-arn --profile <your profile>`           | CRM      | RoofingCrmWeb's origin (a cross-stack reference, `apps/crm/cdk/bin/app.ts` (`RoofingCrmMapKey`, `CrmMapKeyStack` props)) for the key's Referer restriction. The alert topic from OracleLaGuards, read from that SSM parameter for the tile-count alarm. Pass the `-c alertTopicParam=…` context on every later diff or deploy of this stack too; without it the alarm is removed. Then add `mapKey` to `.secrets/crm.json` (section 2).                                                                                                                                                                                                                                                                                                                                    |
| 8     | `pnpm exec cdk deploy RoofingCrmLeads --exclusively --profile <your profile>`                                                           | CRM      | Two values read from SSM (`apps/crm/cdk/lib/crm-leads-stack.ts` (`AUTHORIZER_ARN_PARAM`, `ALERT_TOPIC_PARAM`)): the shared authorizer's ARN (`/oracle-la/api/authorizer-arn`, written by OracleLaDataApi) and the alert topic (`/oracle-la/alerts/topic-arn`, written by OracleLaGuards). RoofingCrmWeb's origin for CORS (`crm-leads-stack.ts` (`CrmLeadsStack`, `HttpApi` `corsPreflight`)). It creates its own permission to invoke the shared authorizer. Outputs `LeadsApiUrl` and `TableName`.                                                                                                                                                                                                                                                                       |
| 9     | From the repository root: `AWS_PROFILE=<your profile> node scripts/write-config.ts apps/crm/dist`                                       | CRM      | The OracleLaDataApi `ApiUrl` output, the RoofingCrmLeads `LeadsApiUrl` output and the OracleLaAgentApi `AgentApiUrl` output (`scripts/write-config.ts`), plus `apiToken` and `mapKey` from `.secrets/crm.json`. Writes `apps/crm/dist/config.json`. Without the RoofingCrmLeads stack, `config.json` has no leads API URL and the leads UI is hidden; without the OracleLaAgentApi stack, it has no `agentApiUrl` and the "Ask the agent" section is hidden. Any other failure to read the OracleLaDataApi or OracleLaAgentApi output stops the script. Any failure to read the RoofingCrmLeads output is treated as "not deployed" (the script prints "RoofingCrmLeads not deployed: leadsApiUrl omitted (leads UI hidden)"), so read the script's output before step 10. |
| 10    | `pnpm exec cdk deploy RoofingCrmWeb --profile <your profile>`                                                                           | CRM      | The site with its `config.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 11-12 | The Explorer's `config.json`, then OracleLaExplorerWeb                                                                                  | pipeline | See the pipeline runbook. It creates the `explorer` branch on this repository's Amplify app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 13    | Both hosted suites (section 4)                                                                                                          | both     | The two sites share the Amplify app's settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

A rebuild (`pnpm build`) empties `apps/crm/dist`, so rerun step 9 before every RoofingCrmWeb deploy.

Code-only changes need only the stack that holds them:
`pnpm exec cdk deploy RoofingCrmLeads --exclusively --profile <your profile>` for `apps/leads-api`, or steps 9-10
for `apps/crm`. Without `--exclusively`, CDK also deploys RoofingCrmWeb, which RoofingCrmLeads and RoofingCrmMapKey
depend on (`apps/crm/cdk/bin/app.ts` (`origin: web.origin`)), from whatever is in `apps/crm/dist`; steps 7 and 8
pass it for the same reason. A page already open keeps the bundle it loaded until it is reloaded. A new API client from the
pipeline comes as a new vendored tarball (`vendor/`, with
`UPSTREAM.json` naming the pipeline commit it was built from): pack it twice in a clean pipeline checkout and
commit it only when both tarballs have the same sha256. Its lockfile change is the tarball's integrity line only; any other lockfile change, or a
runtime difference in the client, is reviewed before it is committed.

After any RoofingCrmWeb change, run both hosted suites: this suite and the pipeline's Explorer suite. The
app-level settings this stack owns (the single-page rewrite rule, basic auth off at app level, the service
role) apply to the Explorer branch too. RoofingCrmWeb creates only the `main` branch, and a template test
keeps the app-level settings as the Explorer expects (`apps/crm/test/web-stack.test.ts`).

A new Amplify app (a new app ID) needs no tracked-file change: RoofingCrmWeb updates `/roofing-crm/web/app-id`,
then the pipeline's OracleLaDataApi (CORS), OracleLaAgentApi (CORS) and OracleLaExplorerWeb (CloudFormation
recreates the branch on the new app) are deployed again, in that order.

Not exercised: the app ID has not changed since the Explorer branch was added, so this path, including CloudFormation recreating the branch on the new app, has not been run.

## 4. Tests

- Unit and component tests (Vitest), formatting, lint and types:

  ```
  pnpm test
  pnpm run typecheck && pnpm run lint && pnpm run format
  ```

  On 18 Nov 2026, at commit b5f7b14: 173 tests in 13 files, all passed.

- The local browser lane (Playwright, `apps/crm/e2e/local/`) runs the built app on 127.0.0.1 with `config.json`,
  the three APIs and the basemap answered by page routes, so nothing leaves the machine and no AWS account is
  needed (`apps/crm/e2e/local/playwright.local.config.ts`). Its tests are `*.local.ts`, which the hosted suite
  does not run. From the repository root:

  ```
  pnpm build
  pnpm --dir apps/crm exec playwright install chromium     # once: downloads the browser
  pnpm --dir apps/crm exec playwright test -c e2e/local/playwright.local.config.ts
  ```

  It needs port 47961 free (`CRM_LOCAL_PORT` picks another). On 18 Nov 2026, with the code of commit b27e4dc (the
  same app as b5f7b14), it passed 5 of 5: test 42 at four widths and the lead-delete check.

- The hosted suite (Playwright, `apps/crm/e2e/crm.spec.ts`) runs against the deployed site. Its only inputs are
  environment variables (`apps/crm/e2e/env.ts`): `CRM_URL` (the RoofingCrmWeb `Origin` output), `CRM_USER` and
  `CRM_PASS` (the basic-auth values). It never reads `.secrets/`. The API token and map key come from the
  hosted `config.json`. The hosted site's address and basic-auth values are not in the repository. From
  `apps/crm`:

  ```
  pnpm exec playwright install chromium     # once: downloads the browser
  CRM_URL=<Origin output> CRM_USER=<basic-auth user> CRM_PASS=<basic-auth password> pnpm exec playwright test
  ```

  - Tests run in order and stop at the first failure; `PW_SERIAL=0` runs them independently. The order is the
    file's, not the numbers': tests 26 to 33, 37, 38 and 42 come after test 43.
  - Traces and screenshots are kept for failed tests.
  - The suite has 51 tests: test 37 runs at four widths (`apps/crm/e2e/crm.spec.ts` (`SOURCES_BREAKPOINTS`)) and
    test 42 at the same four (`apps/crm/e2e/layout-checks.ts` (`LAYOUT_BREAKPOINTS`)), every other numbered test
    once.
  - On 18 Nov 2026 (15:12-15:17 UTC) it passed 51 of 51 against the site deployed from b5f7b14 (RoofingCrmWeb;
    the leads API's code is from 284cfba, unchanged since), with the pipeline's data API (code 5647bde) serving
    `2026-11-17T00-55-12-521Z-b1f1fbb377948` and its agent API from ebdcf61. That was the suite's third run
    that day, started right after the warm-up below. The pipeline's Explorer suite passed 24 of 24 the same day
    on its second run (the first stopped at its test 11 while the page was still waking the data API).
  - Warm the data API before either hosted suite. Send three requests at once to the data API's
    `explorer.sources` query (the request the page's own warm-up sends), at the `apiUrl` of the hosted
    `config.json` and with its `apiToken` as the bearer token, and repeat the three until all answer in about
    1 s, so that three instances are warm. No tracked script does this. The green run was started right after
    such a warm-up (the first round took 6.6-6.9 s per request, cold; the second about 1 s).
  - Known limit, not changed: tests that wait 5 s for a mocked agent answer are shorter than the page's hold of
    a question, which lasts until its warm-up has answered, up to 20 s by design (`apps/crm/src/warmup.ts`
    (`HOLD_MAX_MS`)), and a data API instance starting cold took 6.6-6.9 s per request, a warm one about 1 s
    (measured 18 Nov 2026). On 18 Nov the suite's first two runs stopped before the green one: the first at test
    37 at tablet width (44 passed, 6 not run; no cold start was seen), the second at test 28 (36 passed, 14 not
    run; a new data API instance was starting cold during its wait). The cause of either stop is not proven.
  - Tests 17, 24, 41 and 43 create their own leads and delete them when they end, also after a failed check.
  - No test sends a request to `/agent/answer`: that would be a model call. The "Ask the agent" tests mock it
    with recorded-shape answers, and a catch-all aborts and fails any request to it that no mock answered
    (`apps/crm/e2e/crm.spec.ts`). The panel may call the real `GET /agent/warm` and the data API.
  - Nothing caps the page's simultaneous data API requests as a whole: the leads list's address and permit reads
    are held to 4, its `parcels.match` checks to 2, and the search, an open parcel panel and the warm-up are
    outside both. The data API's reserved concurrency is 5.
  - Counts to compare with, on the run the data API serves since 17 Nov 2026,
    `2026-11-17T00-55-12-521Z-b1f1fbb377948` (a rebuild of that day's run `2026-11-17T00-55-12-521Z-bcb7d21c21fe7`),
    counted on the run's Parquet files, at the Van Nuys test center (34.199, -118.487), 1 mile, roofs older than
    15 years: 4,181 parcels, 164 of them marked with a long-open roofing permit (the map's mark; the lead toggle
    keeps leads on those parcels). At 34.20008, -118.48111, 1 mile, the same rule marks 144 of 3,946 parcels. On
    the pipeline's 12 Nov rebuild run `2026-11-12T14-00-51-383Z-bc7f18f2e9cf2`, which is no longer served, the
    same counts were 4,183 and 164, and 144 of 3,948 (the map legend's figures in a browser check of 15 Nov
    2026). The served run's counts at the agent's center are in the pipeline runbook.

- A question to the hosted agent is a model call and spends money: the live checks are run by hand from the
  "Ask the agent" section. How to stop the agent at once is in the pipeline runbook.

- The pipeline's Explorer suite runs from the pipeline repository (`EXPLORER_URL`, `EXPLORER_USER`,
  `EXPLORER_PASS`); see its runbook. Run it with this suite after any RoofingCrmWeb change.

## 5. Teardown (reverse order, across both repositories)

1. OracleLaExplorerWeb, from the pipeline repository: see its runbook. It goes first because destroying
   RoofingCrmWeb deletes the Amplify app with every branch on it, the Explorer's included. Not exercised: destroying OracleLaExplorerWeb after its Amplify app is gone has not been run. CloudFormation is expected to find the branch already deleted and finish, but this is untested.
2. OracleLaAgentApi, from the pipeline repository, then its two SecureStrings: see its runbook. It goes before
   OracleLaDataApi; the CRM hides its "Ask the agent" section only after write-config and a RoofingCrmWeb
   deploy without the stack.
3. Note the RoofingCrmLeads `TableName` output, then `pnpm exec cdk destroy RoofingCrmLeads --profile <your profile>`.
   It imports RoofingCrmWeb's origin and holds the permission on the pipeline's authorizer.
4. `pnpm exec cdk destroy RoofingCrmMapKey -c alertTopicParam=/oracle-la/alerts/topic-arn --profile <your profile>`.
   It also imports RoofingCrmWeb's origin.
5. `pnpm exec cdk destroy RoofingCrmWeb --profile <your profile>`. It also deletes `/roofing-crm/web/app-id`;
   after that, the pipeline's next OracleLaDataApi deploy fails before changing anything until the app ID is
   published again (see the pipeline runbook).
6. OracleLaDataApi, then OracleLaGuards: see the pipeline runbook.

The leads table is not deleted by step 3. It is RETAIN with deletion protection
(`apps/crm/cdk/lib/crm-leads-stack.ts` (`CrmLeadsStack`, `LeadsData` `Leads`)), because leads cannot be recreated. Delete it separately and
on purpose, with the name noted in step 3:

```
aws dynamodb update-table --table-name <TableName> --no-deletion-protection-enabled --region <region> --profile <your profile>
aws dynamodb delete-table --table-name <TableName> --region <region> --profile <your profile>
```

The stack RoofingCrmLeadsDestroyCheck exists only with `-c destroyCheck=true`. It is a proof that the table
policy does not block `cdk destroy`, deployed and destroyed in one session.
