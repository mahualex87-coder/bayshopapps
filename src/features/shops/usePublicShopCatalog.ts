import { useCallback, useEffect, useState } from 'react';
import {
  readPublicShopCatalog, readPublicShopDetail,
  type PublicShopCatalogPage, type PublicShopCatalogQuery, type PublicShopDetail, type PublicShopDetailQuery,
} from '@/api/public-shop-catalog';

type Cached<T> = { expires: number; data: T };
type ReadState<T> = { key: string; attempt: number; data: T | null; error: boolean };
const catalogPages = new Map<string, Cached<PublicShopCatalogPage>>();
const detailPages = new Map<string, Cached<PublicShopDetail>>();
// Only public data is retained. Each key includes origin country, destination and language.
function usePublicPage<Q, T>(query: Q | null, read: (fetcher: typeof fetch, q: Q, signal: AbortSignal) => Promise<T>, cache: Map<string, Cached<T>>) {
  const key = JSON.stringify(query);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReadState<T> | null>(null);
  const retry = useCallback(() => { cache.delete(key); setAttempt(v => v + 1); }, [key, cache]);
  useEffect(() => {
    if (key === 'null') return;
    let current = true;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10000);
    const existing = cache.get(key);
    const result = existing && existing.expires > Date.now() ? Promise.resolve(existing.data)
      : read(fetch, JSON.parse(key), abort.signal).then(data => {
        if (current && !abort.signal.aborted) {
          if (cache.size >= 32) cache.delete(cache.keys().next().value!);
          cache.set(key, { expires: Date.now() + 3 * 60_000, data });
        }
        return data;
      });
    result.then(data => {
      if (current) setState({ key, attempt, data, error: false });
    }).catch(() => { if (current) setState({ key, attempt, data: null, error: true }); })
      .finally(() => clearTimeout(timer));
    return () => { current = false; clearTimeout(timer); abort.abort(); };
  }, [key, attempt, cache, read]);
  const value = query && state?.key === key && state.attempt === attempt ? state : null;
  return { data: value?.data ?? null, loading: query !== null && !value?.data && !value?.error, error: value?.error ?? false, retry };
}

export function usePublicShopCatalog(query: PublicShopCatalogQuery | null) {
  return usePublicPage(query, readPublicShopCatalog, catalogPages);
}
export function usePublicShopDetail(query: PublicShopDetailQuery | null) {
  return usePublicPage(query, readPublicShopDetail, detailPages);
}
