import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { FakeControl, FakeMap, FakeMarker } from './fakeMapLibre.js';

// MapLibre needs WebGL, which jsdom does not have. Tests use a recording fake instead.
vi.mock('maplibre-gl', () => ({
  default: {
    Map: FakeMap,
    Marker: FakeMarker,
    NavigationControl: FakeControl,
  },
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

Element.prototype.scrollIntoView = () => undefined;

// The map picks its basemap with a fetch; answer "not reachable" so it takes the offline path.
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
);

afterEach(() => {
  cleanup();
  FakeMap.instances.length = 0;
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
});
