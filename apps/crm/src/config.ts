/** Runtime config served next to the app behind the Amplify password. Built from location.origin so the
 * https://user:pass@host/ URL form works (relative fetches fail in that form). */
export interface AppConfig {
  apiUrl?: string;
  /** Leads API (RoofingCrmLeads output); the leads UI is hidden when absent. */
  leadsApiUrl?: string;
  apiToken?: string;
  mapKey?: string;
  client?: string;
}
export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch(new URL("/config.json", location.origin), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`config.json: HTTP ${res.status}`);
  return (await res.json()) as AppConfig;
}
