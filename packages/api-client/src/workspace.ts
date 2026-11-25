const STORAGE_KEY = 'roofing-crm.workspace-id';

let memoryId: string | null = null;

function randomId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `ws_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * There is no login. Each browser makes one random workspace id and sends it with every call;
 * the API scopes leads to it. Storage can be blocked (private windows, embedded previews), so
 * every access is guarded and the id then lives in memory for the page's lifetime.
 */
export function getWorkspaceId(): string {
  if (memoryId) return memoryId;
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) {
      memoryId = stored;
      return stored;
    }
  } catch {
    // Storage unavailable: fall through to an in-memory id.
  }
  const fresh = randomId();
  memoryId = fresh;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // Not persisted; leads will last for this page load only.
  }
  return fresh;
}

/** Test hook: forget the cached id so the next call reads storage again. */
export function resetWorkspaceIdCache(): void {
  memoryId = null;
}
