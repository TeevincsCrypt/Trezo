// Copies MapLibre's ES-module web worker (and its shared chunk) into /public so
// the browser can load it at a stable URL regardless of bundler.
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("node_modules/maplibre-gl/dist");
const dst = path.resolve("public/maplibre");
fs.mkdirSync(dst, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log("maplibre worker copied to public/maplibre");
