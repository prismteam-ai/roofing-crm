/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom/vitest" />

// The Vite build-time variables this app reads (set by the Amplify build,
// infra/lib/crm-web-stack.ts). Optional: src/auth/config.ts validates them at runtime.
interface ImportMetaEnv {
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_USER_POOL_CLIENT_ID?: string;
}
