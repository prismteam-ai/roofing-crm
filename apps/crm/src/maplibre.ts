/** MapLibre GL JS 6 setup: the worker file must be emitted by the bundler and registered explicitly. */
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);
export * from "maplibre-gl";
