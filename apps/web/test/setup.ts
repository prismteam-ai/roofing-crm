import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// MapLibre needs WebGL and Blob URLs at import; every test uses the recording stand-in.
vi.mock("maplibre-gl", async () => (await import("./fake-maplibre.ts")).maplibreMock());
