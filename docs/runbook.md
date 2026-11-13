# Runbook: build, deploy, test and tear down (CRM repository)

This repository holds the Roofing CRM: the web app (`apps/crm`, stack RoofingCrmWeb), its Amazon Location map
key (RoofingCrmMapKey) and the leads API with its table (`apps/leads-api`, RoofingCrmLeads). RoofingCrmWeb's
Amplify app also hosts the pipeline repository's Explorer, as a second branch (`explorer`) that the pipeline's
OracleLaExplorerWeb stack creates ([kit-deviations.md](kit-deviations.md), row 16). The CRM reads
property data from the hosted data API in the pipeline repository
(oracle-property-intelligence-platform-pipeline-los-angeles-ca). Its `docs/runbook.md` covers the pipeline
stacks, the data build and the run upload. The two runbooks describe one deploy order, written from the
code: every step names the file that makes it necessary.

Related: [kit-deviations.md](kit-deviations.md), [access-rules.md](access-rules.md),
[glossary.md](glossary.md).

## 1. Prerequisites

- Node.js 22.18 or later and pnpm 12.16.1 (`package.json` `engines` and `packageManager`):
  `corepack enable pnpm`, then `pnpm install --frozen-lockfile`.
- The AWS CDK CLI comes from the workspace (`aws-cdk` 2.1146.1 in `apps/crm/package.json`); run it as
  `pnpm exec cdk` from `apps/crm`.
- The AWS CLI v2 with a profile for the target account. Commands below take `--profile <your profile>`; you
  can set `AWS_PROFILE` instead. Set `AWS_PROFILE` in any case (`export AWS_PROFILE=<your profile>`): `scripts/write-config.ts` requires it. The region is fixed in code to eu-north-1 (`apps/crm/cdk/bin/app.ts` (`env`)).
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
table first.

## 2. Secrets (gitignored `.secrets/crm.json`, never committed or printed)

| Value                    | Comes from                                                     | Used by                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basicUser`, `basicPass` | `node scripts/secrets.ts` (once; it never overwrites the file) | RoofingCrmWeb's basic auth (`apps/crm/cdk/bin/app.ts` (`RoofingCrmWeb`, `CrmWebStack` props)); the hosted suite's `CRM_USER` and `CRM_PASS`                                   |
| `apiToken`               | `node scripts/secrets.ts`                                      | `config.json`, through `scripts/write-config.ts` (`apiToken` in `config.json`)                                                                                                |
| `apiTokenSha256`         | `node scripts/secrets.ts`                                      | Copied by hand into the pipeline repository's `.secrets/api-clients.json` as `{ "crm": { "tokenSha256": "…" } }`. OracleLaDataApi stores it in SSM for the shared authorizer. |
| `mapKey`                 | Added by hand after RoofingCrmMapKey is deployed (below)       | `config.json`, through `scripts/write-config.ts` (`mapKey` in `config.json`)                                                                                                  |

`scripts/secrets.ts` does not create `mapKey`. After step 5 below, read the key's value from Amazon Location
and add it to the file without printing it:

```
KEY=$(aws location describe-key --key-name <MapKeyName output of RoofingCrmMapKey> --query Key --output text \
  --region eu-north-1 --profile <your profile>) \
node -e 'const fs=require("fs"),f=".secrets/crm.json",s=JSON.parse(fs.readFileSync(f));s.mapKey=process.env.KEY;fs.writeFileSync(f,JSON.stringify(s,null,2))'
```

`scripts/write-config.ts` reads the stack outputs with the AWS CLI, using the profile named in `AWS_PROFILE`.
It stops with a message if `AWS_PROFILE` is unset.

## 3. Deploy order across both repositories

| #    | Step                                                                                                                                    | Repo     | Needs (and where that comes from)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | OracleLaGuards                                                                                                                          | pipeline | See the pipeline runbook.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2    | `pnpm build`, then from `apps/crm`: `pnpm exec cdk deploy RoofingCrmWeb --profile <your profile>` (first deploy, without `config.json`) | CRM      | `apps/crm/dist` from the build (the `siteDir` default, `apps/crm/cdk/bin/app.ts` (`siteDir`)) and the basic-auth values. Creates the Amplify app and its `main` branch, and publishes the app ID as the SSM parameter `/roofing-crm/web/app-id` (`apps/crm/cdk/lib/crm-web-stack.ts` (`APP_ID_PARAM`)), which the pipeline's OracleLaDataApi and OracleLaExplorerWeb read at deploy time. Outputs `Origin` (`crm-web-stack.ts` (`CrmWebStack`, output `Origin`)). Until step 8 the site loads but shows a `config.json` error. Not exercised: this first deploy without `config.json` has not been run. RoofingCrmWeb synthesizes from a site without `config.json` (checked 13 Nov 2026); it has not been deployed this way. |
| 3-4  | OracleLaDataApi, run upload                                                                                                             | pipeline | See the pipeline runbook. The data API's CORS origins for the CRM (`main`) and the Explorer (`explorer`) are built from `/roofing-crm/web/app-id`; no file in either repository holds the app ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5    | `pnpm exec cdk deploy RoofingCrmMapKey -c alertTopicParam=/oracle-la/alerts/topic-arn --profile <your profile>`                         | CRM      | RoofingCrmWeb's origin (a cross-stack reference, `apps/crm/cdk/bin/app.ts` (`RoofingCrmMapKey`, `CrmMapKeyStack` props)) for the key's Referer restriction. The alert topic from OracleLaGuards, read from that SSM parameter for the tile-count alarm. Pass the `-c alertTopicParam=…` context on every later diff or deploy of this stack too; without it the alarm is removed. Then add `mapKey` to `.secrets/crm.json` (section 2).                                                                                                                                                                                                                                                                                       |
| 6    | `pnpm exec cdk deploy RoofingCrmLeads --profile <your profile>`                                                                         | CRM      | Two values read from SSM (`apps/crm/cdk/lib/crm-leads-stack.ts` (`AUTHORIZER_ARN_PARAM`, `ALERT_TOPIC_PARAM`)): the shared authorizer's ARN (`/oracle-la/api/authorizer-arn`, written by OracleLaDataApi) and the alert topic (`/oracle-la/alerts/topic-arn`, written by OracleLaGuards). RoofingCrmWeb's origin for CORS (`crm-leads-stack.ts` (`CrmLeadsStack`, `HttpApi` `corsPreflight`)). It creates its own permission to invoke the shared authorizer. Outputs `LeadsApiUrl` and `TableName`.                                                                                                                                                                                                                          |
| 7    | From the repository root: `AWS_PROFILE=<your profile> node scripts/write-config.ts apps/crm/dist`                                       | CRM      | The OracleLaDataApi `ApiUrl` output and the RoofingCrmLeads `LeadsApiUrl` output (`scripts/write-config.ts` (`apiUrl`, `leadsApiUrl`)), plus `apiToken` and `mapKey` from `.secrets/crm.json`. Writes `apps/crm/dist/config.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8    | `pnpm exec cdk deploy RoofingCrmWeb --profile <your profile>`                                                                           | CRM      | The site with its `config.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 9-10 | The Explorer's `config.json`, then OracleLaExplorerWeb                                                                                  | pipeline | See the pipeline runbook. It creates the `explorer` branch on this repository's Amplify app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11   | Both hosted suites (section 4)                                                                                                          | both     | The two sites share the Amplify app's settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

A rebuild (`pnpm build`) empties `apps/crm/dist`, so rerun step 7 before every RoofingCrmWeb deploy.

Code-only changes need only the stack that holds them: RoofingCrmLeads for `apps/leads-api`, or steps 7-8 for
`apps/crm`. A new API client from the pipeline comes as a new vendored tarball (`vendor/`, with
`UPSTREAM.json` naming the pipeline commit it was built from).

After any RoofingCrmWeb change, run both hosted suites: this suite and the pipeline's Explorer suite. The
app-level settings this stack owns (the single-page rewrite rule, basic auth off at app level, the service
role) apply to the Explorer branch too. RoofingCrmWeb creates only the `main` branch, and a template test
keeps the app-level settings as the Explorer expects (`apps/crm/test/web-stack.test.ts`).

A new Amplify app (a new app ID) needs no tracked-file change: RoofingCrmWeb updates `/roofing-crm/web/app-id`,
then the pipeline's OracleLaDataApi and OracleLaExplorerWeb are deployed again, in that order.

Not exercised: the app ID has not changed since the Explorer branch was added, so this path, including CloudFormation recreating the branch on the new app, has not been run.

## 4. Tests

- Unit and component tests (Vitest), formatting, lint and types:

  ```
  pnpm test
  pnpm run typecheck && pnpm run lint && pnpm run format
  ```

- The hosted suite (Playwright, `apps/crm/e2e/crm.spec.ts`) runs against the deployed site. Its only inputs are
  environment variables (`apps/crm/e2e/env.ts`): `CRM_URL` (the RoofingCrmWeb `Origin` output), `CRM_USER` and
  `CRM_PASS` (the basic-auth values). It never reads `.secrets/`. The API token and map key come from the
  hosted `config.json`. From `apps/crm`:

  ```
  pnpm exec playwright install chromium     # once: downloads the browser
  CRM_URL=<Origin output> CRM_USER=<basic-auth user> CRM_PASS=<basic-auth password> pnpm exec playwright test
  ```

  - Tests run in order and stop at the first failure; `PW_SERIAL=0` runs them independently.
  - Traces and screenshots are kept for failed tests.
  - Test 17 creates one lead on a parcel that has none, and always deletes it, also on failure.

- The pipeline's Explorer suite runs from the pipeline repository (`EXPLORER_URL`, `EXPLORER_USER`,
  `EXPLORER_PASS`); see its runbook. Run it with this suite after any RoofingCrmWeb change.

## 5. Teardown (reverse order, across both repositories)

1. OracleLaExplorerWeb, from the pipeline repository: see its runbook. It goes first because destroying
   RoofingCrmWeb deletes the Amplify app with every branch on it, the Explorer's included. Not exercised: destroying OracleLaExplorerWeb after its Amplify app is gone has not been run. CloudFormation is expected to find the branch already deleted and finish, but this is untested.
2. Note the RoofingCrmLeads `TableName` output, then `pnpm exec cdk destroy RoofingCrmLeads --profile <your profile>`.
   It imports RoofingCrmWeb's origin and holds the permission on the pipeline's authorizer.
3. `pnpm exec cdk destroy RoofingCrmMapKey -c alertTopicParam=/oracle-la/alerts/topic-arn --profile <your profile>`.
   It also imports RoofingCrmWeb's origin.
4. `pnpm exec cdk destroy RoofingCrmWeb --profile <your profile>`. It also deletes `/roofing-crm/web/app-id`;
   after that, the pipeline's next OracleLaDataApi deploy fails before changing anything until the app ID is
   published again (see the pipeline runbook).
5. OracleLaDataApi, then OracleLaGuards: see the pipeline runbook.

The leads table is not deleted by step 2. It is RETAIN with deletion protection
(`apps/crm/cdk/lib/crm-leads-stack.ts` (`CrmLeadsStack`, `LeadsData` `Leads`)), because leads cannot be recreated. Delete it separately and
on purpose, with the name noted in step 2:

```
aws dynamodb update-table --table-name <TableName> --no-deletion-protection-enabled --region eu-north-1 --profile <your profile>
aws dynamodb delete-table --table-name <TableName> --region eu-north-1 --profile <your profile>
```

The stack RoofingCrmLeadsDestroyCheck exists only with `-c destroyCheck=true`. It is a proof that the table
policy does not block `cdk destroy`, deployed and destroyed in one session.
