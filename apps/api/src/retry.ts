/** Retry with exponential backoff + full jitter. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number;
    baseMs?: number;
    maxMs?: number;
    onRetry?: (err: unknown, attempt: number) => void;
  } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseMs ?? 200;
  const max = opts.maxMs ?? 4000;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      attempt++;
      opts.onRetry?.(err, attempt);
      const delay = Math.random() * Math.min(max, base * 2 ** attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
