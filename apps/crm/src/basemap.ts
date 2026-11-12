/** Amazon Location Maps v2 basemap (MapLibre style descriptor). Tiles are loaded live only, never stored (Service Terms 82.4a). */
export const LOCATION_REGION = "eu-north-1";
export const mapStyleUrl = (
  apiKey: string,
  style = "Standard",
  colorScheme = "Light",
): string =>
  `https://maps.geo.${LOCATION_REGION}.amazonaws.com/v2/styles/${style}/descriptor?key=${encodeURIComponent(apiKey)}&color-scheme=${colorScheme}`;
/** LA County bounds used to open the map (south-west, north-east). */
export const LA_COUNTY_BOUNDS: [[number, number], [number, number]] = [
  [-118.95, 33.7],
  [-117.65, 34.82],
];
