import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Busca dados de um endpoint e refaz a busca quando o path muda. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const res = await api<T>(path);
      if (id === seq.current) { setData(res); setError(null); }
    } catch (e) {
      if (id === seq.current) setError((e as Error).message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => { reload(); }, [reload]);

  return { data, error, loading, reload, setData };
}
