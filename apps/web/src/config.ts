/** Brevard County, FL — the county this CRM defaults to. */
export const BREVARD = {
  name: 'Brevard County, FL',
  fips: '12009',
  center: { lat: 28.3, lon: -80.72 },
  bounds: { minLat: 27.79, maxLat: 28.81, minLon: -81.21, maxLon: -80.43 },
  defaultZoom: 9,
} as const;

/** Default roof-age threshold from the assignment brief. */
export const DEFAULT_ROOF_AGE_THRESHOLD = 15;
export const DEFAULT_RADIUS_MILES = 5;

/**
 * Where the dataset comes from. The pipeline publishes to GitHub Pages and to
 * IPFS; the bundled mirror is the fallback that keeps this site working if
 * neither is reachable.
 */
/**
 * Gemini is reached through a Cloudflare Worker that holds the API key, so no
 * credential ships in this bundle. When unset, the agent runs its deterministic
 * no-key mode instead of failing.
 */
export const AGENT_PROXY_URL = import.meta.env['VITE_AGENT_PROXY_URL'] as string | undefined;

export const DATA_SOURCES = {
  pipelinePagesUrl: import.meta.env['VITE_PIPELINE_PAGES_URL'] as string | undefined,
  ipfsGateway: 'https://ipfs.filebase.io/ipfs',
  localMirrorUrl: `${import.meta.env.BASE_URL}data`,
} as const;
