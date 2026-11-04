import { useMemo } from 'react';
import { useLiveAccount } from '@/api/context';
import type { ShopDirectoryReadCommand } from '@/api/shop-directory';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { shopBrowseReader } from './shop-browse-cache';

type BrowseQuery = Exclude<ShopDirectoryReadCommand, { kind: 'shops.match' }> | { kind: 'warehouses.read' };
export function useShopBrowse<Q extends BrowseQuery>(query: Q | null, pageLoad = true) {
  const { readView, accountId, authRevision, accountRevision, language } = useLiveAccount();
  const reader = useMemo(() => shopBrowseReader(readView, JSON.stringify([authRevision, accountId, accountRevision, language])),
    [readView, authRevision, accountId, accountRevision, language]);
  return useOperationView(query, { reader, pageLoad });
}
