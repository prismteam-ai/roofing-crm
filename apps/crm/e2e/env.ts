/** Suite inputs: base URL and basic-auth credentials from the environment only. */
export const BASE_URL = process.env.CRM_URL!;
const username = process.env.CRM_USER,
  password = process.env.CRM_PASS;
if (!BASE_URL || !username || !password)
  throw new Error("set CRM_URL, CRM_USER and CRM_PASS");
export const ORIGIN = new URL(BASE_URL).origin;
/** Basic-auth credentials, sent only to the Amplify origin (never to the API or the tile host). */
export const CREDS = { username, password, origin: ORIGIN };
