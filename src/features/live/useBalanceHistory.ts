import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import type { LiveBalance } from '@/api/contracts';
import type { BalanceHistoryPeriod } from '@/api/operations-contracts';
import { useI18n } from '@/i18n/context';
import { usePageLoad } from '@/navigation/PageLoading';
import type { LiveResource } from './shared';

const emptyResource = (): LiveResource<LiveBalance> => ({ data: null, loading: false, error: null, updatedAt: null });

/** Financial history is fetched only while its screen is focused. Current
 * balances remain an independent resource, including when history fails. */
export function useBalanceHistory(period: BalanceHistoryPeriod) {
  const { authenticated, accountId, accountRevision, readView } = useLiveAccount();
  const { language } = useI18n();
  const isFocused = useIsFocused();
  const scope = JSON.stringify([authenticated, accountId, accountRevision, language, period]);
  const focused = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [stored, setStored] = useState<{ scope: string; resource: LiveResource<LiveBalance> } | null>(null);

  const invalidate = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const refresh = useCallback(async () => {
    if (!authenticated || !focused.current) return;
    invalidate();
    const current = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setStored(previous => ({ scope, resource: { ...(previous?.scope === scope ? previous.resource : emptyResource()), loading: true, error: null } }));
    try {
      const data = await readView({ kind: 'balance.history', period }, { signal: abort.signal });
      if (current !== generation.current || abort.signal.aborted || !focused.current) return;
      setStored({ scope, resource: { data, loading: false, error: null, updatedAt: Date.now() } });
    } catch (error) {
      if (current !== generation.current || abort.signal.aborted || !focused.current) return;
      setStored(previous => ({ scope, resource: { ...(previous?.scope === scope ? previous.resource : emptyResource()), loading: false, error: errorMessage(error) } }));
    }
  }, [authenticated, invalidate, period, readView, scope]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void refresh();
    return () => { focused.current = false; invalidate(); };
  }, [invalidate, refresh]));

  // Never expose a previous account, locale or period while its next effect starts.
  const resource = stored?.scope === scope ? stored.resource : { ...emptyResource(), loading: authenticated };
  const pending = isFocused && authenticated && (resource.loading || (resource.data === null && resource.error === null && resource.updatedAt === null));
  usePageLoad(pending, pending && resource.data === null);
  return { resource, refresh, scope };
}
