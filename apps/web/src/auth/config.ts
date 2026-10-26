// Web-side analog of @crm/config's fail-fast pattern: Vite build-time env vars (set by the
// Amplify build, infra/lib/crm-web-stack.ts), validated once, never read ad hoc elsewhere in the
// app. @crm/config itself is Node-only (CDK_DEFAULT_REGION) and isn't bundled into the browser.
import { z } from "zod";

/** The two Vite variables, parsed straight from the env object (typed in src/vite-env.d.ts). */
const CognitoWebEnv = z.object({
  VITE_COGNITO_USER_POOL_ID: z.string().min(1),
  VITE_COGNITO_USER_POOL_CLIENT_ID: z.string().min(1),
});

export interface CognitoWebConfig {
  readonly userPoolId: string;
  readonly userPoolClientId: string;
}

/** The variables this loader reads; `import.meta.env` (Vite's `ImportMetaEnv`) satisfies it. */
export type CognitoWebEnvInput = Readonly<
  Partial<Record<keyof z.infer<typeof CognitoWebEnv>, string>>
>;

export function loadCognitoWebConfig(env: CognitoWebEnvInput = import.meta.env): CognitoWebConfig {
  const parsed = CognitoWebEnv.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      "Cognito web config missing: set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_USER_POOL_CLIENT_ID.",
    );
  }
  return {
    userPoolId: parsed.data.VITE_COGNITO_USER_POOL_ID,
    userPoolClientId: parsed.data.VITE_COGNITO_USER_POOL_CLIENT_ID,
  };
}
