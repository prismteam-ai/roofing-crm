import { useCallback, useEffect, useState } from 'react';

/**
 * Returns `value` after it has stayed the same for `delayMs`, plus a `flush` that applies the
 * current value at once. Values are compared by their JSON form, so an equal object built on a
 * later render does not restart the timer.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): [T, () => void] {
  const key = JSON.stringify(value);
  const [settled, setSettled] = useState<{ key: string; value: T }>({ key, value });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled({ key, value });
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
    // `key` stands in for `value`: same JSON, same value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs]);

  const flush = useCallback(() => {
    setSettled({ key, value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [settled.value, flush];
}
