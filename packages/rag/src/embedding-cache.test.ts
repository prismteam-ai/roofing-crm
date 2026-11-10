import { describe, expect, it, vi } from 'vitest';
import { CachedEmbeddingService } from './embedding.js';

function provider() {
  return {
    model: 'model-a',
    embed: vi.fn(async (texts: string[]) => texts.map((t) => [t.length, 1])),
  };
}
describe('bounded embedding cache', () => {
  it('deduplicates batch texts and reuses vectors across independent retrieval calls', async () => {
    const backend = provider();
    const cache = new CachedEmbeddingService(backend);
    const first = await cache.embed(['roof', 'roof', 'permit']);
    expect(backend.embed).toHaveBeenCalledWith(['roof', 'permit']);
    first[0]![0] = 999;
    expect(await cache.embed(['permit', 'roof'])).toEqual([
      [6, 1],
      [4, 1],
    ]);
    expect(backend.embed).toHaveBeenCalledTimes(1);
  });
  it('embeds changed content and model instead of returning a stale document vector', async () => {
    const backend = provider();
    const cache = new CachedEmbeddingService(backend);
    await cache.embed(['old']);
    await cache.embed(['new content']);
    backend.model = 'model-b';
    await cache.embed(['old']);
    expect(backend.embed).toHaveBeenCalledTimes(3);
  });
  it('evicts the least recently used entry when bounded capacity is reached', async () => {
    const backend = provider();
    const cache = new CachedEmbeddingService(backend, 2);
    await cache.embed(['a', 'b']);
    await cache.embed(['a']);
    await cache.embed(['c']);
    await cache.embed(['b']);
    expect(backend.embed.mock.calls.map(([texts]) => texts)).toEqual([['a', 'b'], ['c'], ['b']]);
  });
  it('does not cache failed or incomplete provider responses', async () => {
    const backend = provider();
    backend.embed.mockRejectedValueOnce(new Error('provider offline'));
    const cache = new CachedEmbeddingService(backend);
    await expect(cache.embed(['roof'])).rejects.toThrow('offline');
    backend.embed.mockResolvedValueOnce([]);
    await expect(cache.embed(['roof'])).rejects.toThrow('incomplete');
    expect(await cache.embed(['roof'])).toEqual([[4, 1]]);
    expect(backend.embed).toHaveBeenCalledTimes(3);
  });
});
