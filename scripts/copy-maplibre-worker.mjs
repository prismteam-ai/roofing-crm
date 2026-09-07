/**
 * Copy MapLibre's web-worker bundle (and the shared chunk it imports) into `public/` so
 * the map can load it from a plain URL via `setWorkerUrl`. Under webpack the library's
 * `import.meta.url`-based worker lookup fails and GeoJSON layers never render.
 * Runs on `postinstall`.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "maplibre-gl", "dist");
const publicDir = join(root, "public");
mkdirSync(publicDir, { recursive: true });
const files = readdirSync(dist).filter((f) => /^maplibre-gl-(worker|shared)\.mjs$/.test(f));
for (const f of files) {
  copyFileSync(join(dist, f), join(publicDir, f));
  console.log(`copied ${f} -> public/`);
}
