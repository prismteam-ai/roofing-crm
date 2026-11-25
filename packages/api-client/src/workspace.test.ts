import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceId, resetWorkspaceIdCache } from './workspace.js';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetWorkspaceIdCache();
});

describe('getWorkspaceId', () => {
  it('creates an id once and reuses it from storage', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    const first = getWorkspaceId();
    expect(first).toMatch(/^ws_[0-9a-f]{32}$/);
    resetWorkspaceIdCache();
    expect(getWorkspaceId()).toBe(first);
  });

  it('falls back to memory when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const id = getWorkspaceId();
    expect(id).toMatch(/^ws_/);
    expect(getWorkspaceId()).toBe(id);
  });

  it('ignores a malformed stored value', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'roofing-crm.workspace-id': 'x y' }));
    expect(getWorkspaceId()).toMatch(/^ws_[0-9a-f]{32}$/);
  });
});
