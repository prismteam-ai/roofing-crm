import { buildIdentity } from "./scripts/build-identity.ts";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    {
      name: "prism-release-identity",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "release-identity.json",
          source: JSON.stringify(buildIdentity()) + "\n",
        });
      },
    },
  ],
  define: { __PRISM_BUILD__: JSON.stringify(buildIdentity()) },
  root: "apps/crm-web",
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:4311" } },
});
