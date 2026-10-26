import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API reached only through the Amplify /api/* same-origin rewrite in production
// (infra/lib/crm-web-stack.ts, ARD-B §2.2/§8) — no cross-origin base-URL env var, so this file
// has no proxy target to configure for the hosted build. A local dev proxy can be added here
// later without changing that contract.
export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js (src/auth/signIn.ts) expects Node's `global`, which the browser
  // doesn't have; Vite doesn't polyfill it automatically outside of `vite dev`'s dep pre-bundling.
  define: {
    global: "globalThis",
  },
  build: {
    outDir: "dist",
  },
});
