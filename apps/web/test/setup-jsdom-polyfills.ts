/**
 * jsdom polyfills for Base UI pointer-driven controls (Slider, Checkbox).
 */
class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 1;
    this.pointerType = params.pointerType ?? "mouse";
    this.isPrimary = params.isPrimary ?? true;
  }
}

if (typeof globalThis.PointerEvent === "undefined") {
  // @ts-expect-error jsdom lacks PointerEvent; Base UI requires it.
  globalThis.PointerEvent = PointerEventPolyfill;
}

if (typeof window !== "undefined" && window.PointerEvent === undefined) {
  // @ts-expect-error jsdom lacks PointerEvent; Base UI requires it.
  window.PointerEvent = PointerEventPolyfill;
}

if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}

if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
