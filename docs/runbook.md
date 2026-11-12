# Runbook: build, deploy, test and tear down (CRM repository)

This repository holds the Roofing CRM: the web app (`apps/crm`, stack RoofingCrmWeb), its Amazon Location map
key (RoofingCrmMapKey) and the leads API with its table (`apps/leads-api`, RoofingCrmLeads). The CRM reads
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
  can set `AWS_PROFILE` instead. The region is fixed in code to eu-north-1 (`apps/crm/cdk/bin/app.ts:19`).
- The CDK app reads the account from `CDK_DEFAULT_ACCOUNT`, which the CDK CLI sets, and fails if it is unset
  (`apps/crm/cdk/bin/app.ts:14-18`). The account must be bootstrapped once (see the pipeline runbook).
- The CDK app reads `.secrets/crm.json` on every synth, for every stack (`apps/crm/cdk/bin/app.ts:12`).
- Telemetry off, in every shell that runs these tools:

  ```
  export CDK_DISABLE_CLI_TELEMETRY=true TURBO_TELEMETRY_DISABLED=1
  ```

- The data API must be deployed first (pipeline runbook, steps 1-3).

Deploys keep CDK's default approval: run `pnpm exec cdk diff <stack> --profile <your profile>` first, read
its security-changes table, and answer the prompt `cdk deploy` shows when permissions change.

## 2. Secrets (gitignored `.secrets/crm.json`, never committed or printed)

| Value                    | Comes from                                                     | Used by                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basicUser`, `basicPass` | `node scripts/secrets.ts` (once; it never overwrites the file) | RoofingCrmWeb's basic auth (`apps/crm/cdk/bin/app.ts:23-28`); the hosted suite's `CRM_USER` and `CRM_PASS`                                                                    |
| `apiToken`               | `node scripts/secrets.ts`                                      | `config.json`, through `scripts/write-config.ts:55`                                                                                                                           |
| `apiTokenSha256`         | `node scripts/secrets.ts`                                      | Copied by hand into the pipeline repository's `.secrets/api-clients.json` as `{ "crm": { "tokenSha256": "…" } }`. OracleLaDataApi stores it in SSM for the shared authorizer. |
| `mapKey`                 | Added by hand after RoofingCrmMapKey is deployed (below)       | `config.json`, through `scripts/write-config.ts:56`                                                                                                                           |

`scripts/secrets.ts` does not create `mapKey`. After step 5 below, read the key's value from Amazon Location
and add it to the file without printing it:

```
KEY=$(aws location describe-key --key-name <MapKeyName output of RoofingCrmMapKey> --query Key --output text \
  --region eu-north-1 --profile <your profile>) \
node -e 'const fs=require("fs"),f=".secrets/crm.json",s=JSON.parse(fs.readFileSync(f));s.mapKey=process.env.KEY;fs.writeFileSync(f,JSON.stringify(s,null,2))'
```

`scripts/write-config.ts` reads the stack outputs with the AWS CLI, using the profile named in the script
(`scripts/write-config.ts:24-25`). That profile must exist, or you change it to yours.

## 3. Deploy order across both repositories

| #   | Step                                                                                                                        | Repo     | Needs (and where that comes from)                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-3 | OracleLaGuards, OracleLaDataApi, run upload                                                                                 | pipeline | See the pipeline runbook.                                                                                                                                                                                                                                                                                                                                                                                           |
| 4   | `pnpm build`, then from `apps/crm`: `pnpm exec cdk deploy RoofingCrmWeb --profile <your profile>`                           | CRM      | `apps/crm/dist` from the build (the `siteDir` default, `apps/crm/cdk/bin/app.ts:21`) and the basic-auth values. Outputs `Origin` (`apps/crm/cdk/lib/crm-web-stack.ts:30-33`).                                                                                                                                                                                                                                       |
| 5   | `pnpm exec cdk deploy RoofingCrmMapKey -c alertTopicParam=/oracle-la/alerts/topic-arn --profile <your profile>`             | CRM      | RoofingCrmWeb's origin (a cross-stack reference, `apps/crm/cdk/bin/app.ts:29-36`) for the key's Referer restriction. The alert topic from OracleLaGuards, read from that SSM parameter for the tile-count alarm. Pass the `-c alertTopicParam=…` context on every later diff or deploy of this stack too; without it the alarm is removed. Then add `mapKey` to `.secrets/crm.json` (section 2).                    |
| 6   | Set the `crm` origin in the pipeline's `apps/api/cdk/clients.json` to the `Origin` output, and deploy OracleLaDataApi again | pipeline | Only when the origin changed: the data API's CORS allows that origin.                                                                                                                                                                                                                                                                                                                                               |
| 7   | `pnpm exec cdk deploy RoofingCrmLeads --profile <your profile>`                                                             | CRM      | Two values read from SSM (`apps/crm/cdk/lib/crm-leads-stack.ts:26-28`): the shared authorizer's ARN (`/oracle-la/api/authorizer-arn`, written by OracleLaDataApi) and the alert topic (`/oracle-la/alerts/topic-arn`, written by OracleLaGuards). RoofingCrmWeb's origin for CORS (`crm-leads-stack.ts:177`). It creates its own permission to invoke the shared authorizer. Outputs `LeadsApiUrl` and `TableName`. |
| 8   | From the repository root: `node scripts/write-config.ts apps/crm/dist`                                                      | CRM      | The OracleLaDataApi `ApiUrl` output and the RoofingCrmLeads `LeadsApiUrl` output (`scripts/write-config.ts:37-41`), plus `apiToken` and `mapKey` from `.secrets/crm.json`. Writes `apps/crm/dist/config.json`.                                                                                                                                                                                                      |
| 9   | `pnpm exec cdk deploy RoofingCrmWeb --profile <your profile>`                                                               | CRM      | The site with its `config.json`.                                                                                                                                                                                                                                                                                                                                                                                    |

A rebuild (`pnpm build`) empties `apps/crm/dist`, so rerun step 8 before every RoofingCrmWeb deploy.

Code-only changes need only the stack that holds them: RoofingCrmLeads for `apps/leads-api`, or steps 8-9 for
`apps/crm`. A new API client from the pipeline comes as a new vendored tarball (`vendor/`, with
`UPSTREAM.json` naming the pipeline commit it was built from).

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

## 5. Teardown (reverse order, across both repositories)

1. Note the RoofingCrmLeads `TableName` output, then `pnpm exec cdk destroy RoofingCrmLeads --profile <your profile>`.
   It goes first because it imports RoofingCrmWeb's origin and holds the permission on the pipeline's
   authorizer.
2. `pnpm exec cdk destroy RoofingCrmMapKey -c alertTopicParam=/oracle-la/alerts/topic-arn --profile <your profile>`.
   It also imports RoofingCrmWeb's origin.
3. `pnpm exec cdk destroy RoofingCrmWeb --profile <your profile>`.
4. OracleLaDataApi, then OracleLaGuards: see the pipeline runbook.

The leads table is not deleted by step 1. It is RETAIN with deletion protection
(`apps/crm/cdk/lib/crm-leads-stack.ts:118-119`), because leads cannot be recreated. Delete it separately and
on purpose, with the name noted in step 1:

```
aws dynamodb update-table --table-name <TableName> --no-deletion-protection-enabled --region eu-north-1 --profile <your profile>
aws dynamodb delete-table --table-name <TableName> --region eu-north-1 --profile <your profile>
```

The stack RoofingCrmLeadsDestroyCheck exists only with `-c destroyCheck=true`. It is a proof that the table
policy does not block `cdk destroy`, deployed and destroyed in one session.
