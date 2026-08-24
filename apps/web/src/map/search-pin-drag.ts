/**
 * HUD search-pin drag: move-only (no copy-plus), pin ghost, drop → lat/lng.
 */
import { SEARCH_PIN_DRAG_MIME_TYPE } from "./search-pin-welcome-copy";

const SEARCH_PIN_DRAG_PAYLOAD = "pin";

let searchPinDragActive = false;
let searchPinDragGhost: HTMLElement | null = null;

/**
 * Marks a HUD pin drag as a move and attaches a pin-only ghost image.
 */
export function beginSearchPinDrag(
  dataTransfer: DataTransfer,
  sourceHandle: HTMLElement,
): void {
  endSearchPinDrag();
  searchPinDragActive = true;
  dataTransfer.setData(SEARCH_PIN_DRAG_MIME_TYPE, SEARCH_PIN_DRAG_PAYLOAD);
  dataTransfer.setData("text/plain", SEARCH_PIN_DRAG_PAYLOAD);
  dataTransfer.effectAllowed = "move";
  const ghost = createSearchPinDragGhost(sourceHandle);
  searchPinDragGhost = ghost;
  const width = ghost.offsetWidth || 24;
  const height = ghost.offsetHeight || 24;
  dataTransfer.setDragImage(ghost, width / 2, height);
}

/**
 * Clears the in-flight pin drag and removes the ghost.
 */
export function endSearchPinDrag(): void {
  searchPinDragActive = false;
  searchPinDragGhost?.remove();
  searchPinDragGhost = null;
}

/**
 * Accepts pin dragover and forces a move cursor (no plus badge).
 *
 * Returns whether the caller should preventDefault so drop can fire.
 */
export function allowSearchPinDragOver(dataTransfer: DataTransfer): boolean {
  if (!isSearchPinDrag(dataTransfer)) {
    return false;
  }
  dataTransfer.dropEffect = "move";
  return true;
}

/**
 * True when the drop carries the HUD pin payload.
 */
export function isSearchPinDropPayload(dataTransfer: DataTransfer): boolean {
  if (dataTransfer.getData(SEARCH_PIN_DRAG_MIME_TYPE) === SEARCH_PIN_DRAG_PAYLOAD) {
    return true;
  }
  if (dataTransfer.getData("text/plain") === SEARCH_PIN_DRAG_PAYLOAD) {
    return true;
  }
  return searchPinDragActive;
}

/**
 * Converts a pointer position on the map container into a search center.
 */
export function mapPointerToSearchCenter(arguments_: {
  clientX: number;
  clientY: number;
  containerRect: { left: number; top: number };
  unproject: (point: [number, number]) => { lng: number; lat: number };
}): { latitude: number; longitude: number } {
  const x = arguments_.clientX - arguments_.containerRect.left;
  const y = arguments_.clientY - arguments_.containerRect.top;
  const lngLat = arguments_.unproject([x, y]);
  return { latitude: lngLat.lat, longitude: lngLat.lng };
}

function isSearchPinDrag(dataTransfer: DataTransfer): boolean {
  if (searchPinDragActive) {
    return true;
  }
  return Array.from(dataTransfer.types).includes(SEARCH_PIN_DRAG_MIME_TYPE);
}

function createSearchPinDragGhost(sourceHandle: HTMLElement): HTMLElement {
  const ghost = document.createElement("div");
  ghost.dataset.testid = "search-pin-drag-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.position = "absolute";
  ghost.style.top = "-1000px";
  ghost.style.left = "0";
  ghost.style.color = "#2c2a26";
  ghost.style.pointerEvents = "none";
  ghost.style.display = "flex";
  ghost.style.width = "24px";
  ghost.style.height = "24px";
  const icon = sourceHandle.querySelector("svg");
  if (icon !== null) {
    ghost.append(icon.cloneNode(true));
  }
  document.body.append(ghost);
  return ghost;
}
