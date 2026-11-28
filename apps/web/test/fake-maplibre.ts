import { vi } from "vitest";

type Handler = (...a: any[]) => void;

/** Minimal MapLibre stand-in: records the options, sources and handlers so tests can drive it. */
export class FakeMap {
  static instances: FakeMap[] = [];
  handlers = new Map<string, Handler[]>();
  sources = new Map<string, { data: any; setData(d: any): void }>();
  layers: any[] = [];
  fitBounds = vi.fn();
  hits: any[] = [];
  constructor(readonly opts: any) {
    FakeMap.instances.push(this);
  }
  on(ev: string, a: Handler | string, b?: Handler) {
    const key = typeof a === "string" ? `${ev}:${a}` : ev;
    const h = (typeof a === "string" ? b : a) as Handler;
    this.handlers.set(key, [...(this.handlers.get(key) ?? []), h]);
    return this;
  }
  emit(ev: string, ...args: any[]) {
    for (const h of this.handlers.get(ev) ?? []) h(...args);
  }
  addControl() {
    return this;
  }
  addSource(id: string, s: any) {
    const src = { data: s.data, setData: (d: any) => (src.data = d) };
    this.sources.set(id, src);
  }
  addLayer(l: any) {
    this.layers.push(l);
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  getCanvas() {
    return { style: {} as Record<string, string> };
  }
  queryRenderedFeatures() {
    return this.hits;
  }
  remove() {}
}

export class FakeMarker {
  lngLat: [number, number] | null = null;
  setLngLat(ll: [number, number]) {
    this.lngLat = ll;
    return this;
  }
  addTo() {
    return this;
  }
}

export const maplibreMock = () => ({
  default: { Map: FakeMap, Marker: FakeMarker, NavigationControl: class {} },
});
