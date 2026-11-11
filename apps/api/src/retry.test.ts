import { describe, expect, it } from 'vitest';
import { withRetry } from './retry.js';

describe('withRetry', () => {
  it('retries until success', async () => {
    let n = 0;
    const v = await withRetry(
      async () => {
        if (++n < 3) throw new Error('x');
        return 'ok';
      },
      { baseMs: 1, maxMs: 2 },
    );
    expect(v).toBe('ok');
    expect(n).toBe(3);
  });
  it('gives up after retries', async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new Error('boom');
        },
        { retries: 2, baseMs: 1, maxMs: 2 },
      ),
    ).rejects.toThrow('boom');
    expect(n).toBe(3);
  });
});
