type Handler = (event: unknown) => void;

/** Stand-in for a MapLibre source: remembers the last GeoJSON it was given. */
export class FakeSource {
  data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  setData(data: GeoJSON.FeatureCollection): void {
    this.data = data;
  }
}

/** Stand-in for `maplibregl.Map`. Records what the app draws and lets tests fire map events. */
export class FakeMap {
  static instances: FakeMap[] = [];

  readonly sources = new Map<string, FakeSource>();
  readonly layers: string[] = [];
  readonly fitCalls: unknown[] = [];
  private readonly handlers = new Map<string, Handler[]>();
  private readonly canvas = document.createElement('canvas');

  constructor() {
    FakeMap.instances.push(this);
    // The real map fires "load" asynchronously after the style arrives.
    queueMicrotask(() => {
      this.fire('load', {});
    });
  }

  on(type: string, layerOrHandler: string | Handler, maybeHandler?: Handler): this {
    const handler = typeof layerOrHandler === 'function' ? layerOrHandler : maybeHandler;
    const key = typeof layerOrHandler === 'string' ? `${type}:${layerOrHandler}` : type;
    if (handler) this.handlers.set(key, [...(this.handlers.get(key) ?? []), handler]);
    return this;
  }

  fire(type: string, event: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }

  /** What a user click at these coordinates produces when no marker is under the cursor. */
  click(lat: number, lon: number): void {
    this.fire('click', {
      point: { x: 100, y: 100 },
      lngLat: { lat, lng: lon },
      originalEvent: { target: this.canvas },
    });
  }

  addControl(): this {
    return this;
  }
  addSource(id: string): this {
    this.sources.set(id, new FakeSource());
    return this;
  }
  getSource(id: string): FakeSource | undefined {
    return this.sources.get(id);
  }
  addLayer(layer: { id: string }): this {
    this.layers.push(layer.id);
    return this;
  }
  queryRenderedFeatures(): unknown[] {
    return [];
  }
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
  fitBounds(bounds: unknown): this {
    this.fitCalls.push(bounds);
    return this;
  }
  easeTo(): this {
    return this;
  }
  resize(): this {
    return this;
  }
  getBounds(): { contains: () => boolean } {
    return { contains: () => true };
  }
  remove(): void {
    this.handlers.clear();
  }
}

export class FakeMarker {
  private readonly element = document.createElement('div');
  position: [number, number] | null = null;

  getElement(): HTMLElement {
    return this.element;
  }
  on(): this {
    return this;
  }
  setLngLat(position: [number, number]): this {
    this.position = position;
    return this;
  }
  addTo(): this {
    return this;
  }
  getLngLat(): { lat: number; lng: number } {
    return { lat: this.position?.[1] ?? 0, lng: this.position?.[0] ?? 0 };
  }
  remove(): void {
    this.position = null;
  }
}

export class FakeControl {
  onAdd(): HTMLElement {
    return document.createElement('div');
  }
}
