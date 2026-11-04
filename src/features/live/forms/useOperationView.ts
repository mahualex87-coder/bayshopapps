import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveAccountService } from '@/api/service';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import type { ReadCommand, ReadResult } from '@/api/operations-contracts';
import { useI18n } from '@/i18n/context';
import { usePageLoad } from '@/navigation/PageLoading';
import type { LiveResource } from '../shared';

export function useOperationView<Q extends ReadCommand>(query: Q | null, options: { pageLoad?: boolean; reader?: LiveAccountService['readView'] } = {}) {
  const { readView: liveRead, authenticated, accountId, accountRevision, authRevision } = useLiveAccount();
  const readView = options.reader ?? liveRead;
  const { language } = useI18n();
  const key = JSON.stringify({ query, accountId, accountRevision, authRevision, authenticated, language });
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [stored, setStored] = useState<{ scope: string; resource: LiveResource<ReadResult<Q>> }>({ scope: key, resource: { data: null, loading: false, error: null, updatedAt: null } });
  const invalidate = useCallback(() => { request.current++; controller.current?.abort(); }, []);
  const refresh = useCallback(async () => {
    const { query: command, authenticated: signedIn } = JSON.parse(key) as { query: Q | null; authenticated: boolean };
    if (command === null || !signedIn) return;
    const current = ++request.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setStored(previous => ({ scope: key, resource: { ...(previous.scope === key ? previous.resource : { data: null, updatedAt: null }), loading: true, error: null } }));
    try {
      const data = await readView(command, { signal: abort.signal });
      if (current === request.current && !abort.signal.aborted) setStored({ scope: key, resource: { data, loading: false, error: null, updatedAt: Date.now() } });
    } catch (error) {
      if (current === request.current && !abort.signal.aborted) setStored(previous => ({ scope: key, resource: { ...(previous.scope === key ? previous.resource : { data: null, updatedAt: null }), loading: false, error: errorMessage(error) } }));
    }
  }, [key, readView]);
  useEffect(() => {
    setStored({ scope: key, resource: { data: null, loading: false, error: null, updatedAt: null } });
    void refresh();
    return invalidate;
  }, [key, refresh, invalidate]);
  // Mask stale data synchronously, before effects run after an account or locale switch.
  const resource = stored.scope === key ? stored.resource : { data: null, loading: false, error: null, updatedAt: null };
  const pending = options.pageLoad !== false && query !== null && authenticated && (resource.loading || (resource.data === null && resource.error === null && resource.updatedAt === null));
  usePageLoad(pending, pending && resource.data === null);
  return { resource, refresh };
}
