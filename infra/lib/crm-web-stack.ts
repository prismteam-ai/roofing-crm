// T009: Amplify app + branch config for apps/web. The API is reached only through the Amplify
// `/api/*` same-origin rewrite (ARD-B §2.2/§8) — no cross-origin base-URL env var, so there is no
// CORS surface. Serves RUNTIME_URL (the Amplify default/preview domain) until CrmDomain cuts the
// custom domain over (Round 1 decision D-2).
import { CfnOutput, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import * as amplify from "aws-cdk-lib/aws-amplify";
import type { Construct } from "constructs";

export interface CrmWebStackProps extends StackProps {
  readonly githubRepository: string;
  readonly githubRef: string;
  readonly apiUrl: string;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  // B-02: additional story branches that get their own Amplify preview, alongside the primary
  // `githubRef` branch. Each gets its own CfnBranch under a distinct logical id (never touching
  // the primary `WebBranch` resource/logical-id) — `CfnBranch.branchName` is a CloudFormation
  // replacement property, so changing the primary branch's name in place would delete and
  // recreate it, destroying an earlier story's already-evidenced preview URL. Additive only.
  readonly additionalBranches?: readonly string[];
}

export class CrmWebStack extends Stack {
  public readonly app: amplify.CfnApp;
  public readonly branch: amplify.CfnBranch;
  public readonly additionalBranches: readonly amplify.CfnBranch[];

  constructor(scope: Construct, id: string, props: CrmWebStackProps) {
    super(scope, id, props);

    this.app = new amplify.CfnApp(this, "WebApp", {
      name: "roofing-crm-web",
      repository: `https://github.com/${props.githubRepository}`,
      // The GitHub OAuth token is read from Secrets Manager by the deploy operator, never
      // committed (CLAUDE.md "Never: secrets in git or logs").
      accessToken: SecretValue.secretsManager("roofing-crm/github-access-token").unsafeUnwrap(),
      platform: "WEB",
      environmentVariables: [
        { name: "AMPLIFY_MONOREPO_APP_ROOT", value: "apps/web" },
        // apps/web/src/auth/config.ts's loadCognitoWebConfig reads these at Vite build time —
        // missing, sign-in hung forever with no visible error (found deploying, AC-1).
        { name: "VITE_COGNITO_USER_POOL_ID", value: props.userPoolId },
        { name: "VITE_COGNITO_USER_POOL_CLIENT_ID", value: props.userPoolClientId },
      ],
      customRules: [
        {
          source: "/api/<*>",
          target: `${props.apiUrl}/<*>`,
          status: "200",
        },
        {
          // SPA fallback: any path with no file extension serves index.html so client-side
          // routing (react-router) handles it — otherwise a direct load of /sign-in or
          // /coming-soon/:section 404s instead of rendering the app (found deploying, AC-1/AC-5).
          source: "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|ttf|map|json)$)([^.]+$)/>",
          target: "/index.html",
          status: "200",
        },
      ],
      buildSpec: JSON.stringify({
        version: 1,
        applications: [
          {
            appRoot: "apps/web",
            frontend: {
              phases: {
                preBuild: { commands: ["corepack enable", "pnpm install --frozen-lockfile"] },
                // build.json names the commit this build serves, so CI's e2e-hosted job can wait
                // for its own commit instead of testing whatever build is live (AWS_COMMIT_ID is
                // set by Amplify for every build). `.json` is excluded from the SPA rewrite above.
                build: {
                  commands: [
                    "pnpm --filter web build",
                    "node -e \"require('fs').writeFileSync('dist/build.json', JSON.stringify({ commit: process.env.AWS_COMMIT_ID ?? null }))\"",
                  ],
                },
              },
              artifacts: { baseDirectory: "dist", files: ["**/*"] },
              cache: { paths: ["../../node_modules/**/*"] },
            },
          },
        ],
      }),
    });

    this.branch = new amplify.CfnBranch(this, "WebBranch", {
      appId: this.app.attrAppId,
      branchName: props.githubRef.replace(/^(refs\/heads\/)?/, ""),
      enableAutoBuild: true,
      stage: "DEVELOPMENT",
    });

    new CfnOutput(this, "AmplifyDefaultDomain", {
      value: `${this.branch.branchName}.${this.app.attrDefaultDomain}`,
      description: "RUNTIME_URL for this branch until CrmDomain cuts over (TZ02).",
    });

    this.additionalBranches = (props.additionalBranches ?? []).map((ref) => {
      const branchName = ref.replace(/^(refs\/heads\/)?/, "");
      // Logical id must be a stable, CloudFormation-safe identifier derived from the branch
      // name (CfnBranch's own branchName stays the real git ref, including its dashes/digits).
      const logicalIdSuffix = branchName.replace(/[^A-Za-z0-9]/g, "");
      return new amplify.CfnBranch(this, `WebBranch${logicalIdSuffix}`, {
        appId: this.app.attrAppId,
        branchName,
        enableAutoBuild: true,
        stage: "DEVELOPMENT",
      });
    });
  }
}
