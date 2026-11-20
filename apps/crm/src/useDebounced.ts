import { useEffect, useState } from "react";
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, set] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => set(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
