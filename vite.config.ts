import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/crm-web",
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:4311" } },
});
