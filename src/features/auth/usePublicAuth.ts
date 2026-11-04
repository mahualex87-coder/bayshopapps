import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, usePreventRemove } from 'expo-router';
import { BackHandler, Platform } from 'react-native';
import { fetch } from 'expo/fetch';
import { createPublicAuth, type PublicAuthResult } from '@/api/public-auth';

export function usePublicAuth() {
  const [client] = useState(() => createPublicAuth(fetch, Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublicAuthResult | null>(null);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  // Keep the outcome visible: abandoning a dispatched registration/recovery
  // cannot tell us whether BayShop accepted it. The request has a 20s timeout.
  usePreventRemove(busy);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => active.current !== null);
    return () => subscription.remove();
  }, []));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); }; }, []);
  const run = async (action: (signal: AbortSignal) => Promise<PublicAuthResult>) => {
    if (active.current || result?.outcome === 'accepted' || result?.outcome === 'unknown') return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setResult(null);
    try { const next = await action(controller.signal); if (mounted.current) setResult(next); }
    catch { if (mounted.current) setResult({ outcome: 'unknown', errorKey: 'auth.requestUnknown' }); }
    finally { active.current = null; if (mounted.current) setBusy(false); }
  };
  return { client, busy, result, run, finished: result?.outcome === 'accepted' || result?.outcome === 'unknown' };
}
