import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Missing #root mount element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
