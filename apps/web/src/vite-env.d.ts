/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Public tRPC HTTP base URL (API Gateway execute-api, no custom domain).
   * Set as an Amplify branch environment variable so builds never hardcode the host.
   */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
