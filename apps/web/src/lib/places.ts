import type { Point } from '@roofing-crm/shared';

export interface Place extends Point {
  id: string;
  name: string;
}

/** Well-known spots in the default county, so a search can be started with one click. */
/** Where the first search runs when a link carries no pin. */
export const DEFAULT_PIN: Place = {
  id: 'downtown',
  name: 'Downtown San Diego',
  lat: 32.7157,
  lon: -117.1611,
};

export const PLACES: readonly Place[] = [
  DEFAULT_PIN,
  { id: 'la-jolla', name: 'La Jolla', lat: 32.8328, lon: -117.2713 },
  { id: 'chula-vista', name: 'Chula Vista', lat: 32.6401, lon: -117.0842 },
  { id: 'oceanside', name: 'Oceanside', lat: 33.1959, lon: -117.3795 },
  { id: 'escondido', name: 'Escondido', lat: 33.1192, lon: -117.0864 },
  { id: 'el-cajon', name: 'El Cajon', lat: 32.7948, lon: -116.9625 },
  { id: 'carlsbad', name: 'Carlsbad', lat: 33.1581, lon: -117.3506 },
  { id: 'encinitas', name: 'Encinitas', lat: 33.037, lon: -117.292 },
];
