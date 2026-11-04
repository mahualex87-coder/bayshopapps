import type { ReadCommand, ReadResult } from '../../api/operations-contracts.ts';
import type { LiveAccountService } from '../../api/service.ts';
import type { ShopDirectory } from '../../api/shop-directory.ts';

type Reader = LiveAccountService['readView'];
type Entry = { expires: number; result: Promise<unknown>; directory?: ShopDirectory };
const ttl = 3 * 60_000;
const sessions = new WeakMap<Reader, { scope: string; reader: Reader; abort: AbortController }>();

/** Display reads only. The order form still checks the URL and price with the
 * server when the customer verifies the link and when the order is submitted. */
export function shopBrowseReader(read: Reader, scope: string): Reader {
  const previous = sessions.get(read);
  if (previous?.scope === scope) return previous.reader;
  previous?.abort.abort();
  const abort = new AbortController();
  const entries = new Map<string, Entry>();
  const reader: Reader = async <Q extends ReadCommand>(query: Q, options?: { signal?: AbortSignal }) => {
    if (query.kind !== 'shops.list' && query.kind !== 'shops.detail' && query.kind !== 'warehouses.read') return read(query, options);
    const now = Date.now();
    for (const [key, entry] of entries) if (entry.expires <= now) entries.delete(key);
    const listKey = (country?: string) => 'list:' + (country || '');
    const country = 'countryCode' in query ? query.countryCode : undefined;
    const complete = entries.get(listKey())?.directory;
    if (query.kind === 'shops.list' && country && complete?.verified) {
      return { ...complete, shops: complete.shops.filter(shop => shop.countryCode === country) } as ReadResult<Q>;
    }
    if (query.kind === 'shops.detail') {
      const directory = complete?.verified ? complete : entries.get(listKey(country))?.directory;
      const found = (directory ?? complete)?.shops.find(shop => shop.id === query.id && (!country || shop.countryCode === country));
      if (found) return found as ReadResult<Q>;
    }
    const key = query.kind === 'shops.list' ? listKey(country) : query.kind === 'shops.detail' ? 'detail:' + (country || '') + ':' + query.id : 'warehouses';
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= 32) entries.delete(entries.keys().next().value!);
      // One subscriber navigating away must not cancel another screen's read.
      const result = read(query, { signal: abort.signal });
      entry = { result, expires: now + ttl };
      entries.set(key, entry);
      try {
        const value = await result;
        if (query.kind === 'shops.list') entry.directory = value as ShopDirectory;
        return value as ReadResult<Q>;
      } catch (error) {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      }
    }
    return entry.result as Promise<ReadResult<Q>>;
  };
  sessions.set(read, { scope, reader, abort });
  return reader;
}
