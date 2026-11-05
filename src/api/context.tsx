import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { createApiTransport } from './client';
import { LiveAccountService } from './service';
import { sessionStorage } from './session-storage';
import { LIVE_API_ENABLED } from './config';
import { useI18n } from '@/i18n/context';

const LiveContext = createContext<LiveAccountService | null>(null);
export function LiveAccountProvider({ children }: PropsWithChildren) {
  const { language, ready: languageReady, registerLanguageChange } = useI18n();
  const [service] = useState(() => new LiveAccountService(createApiTransport(fetch, 20000, Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined, picked => new File(picked.uri)), LIVE_API_ENABLED ? sessionStorage : { read: async () => null, write: async () => {}, clear: async () => {} }, Date.now, language));
  useEffect(() => registerLanguageChange(service.setLanguage), [registerLanguageChange, service]);
  useEffect(() => {
    if (!languageReady) return;
    service.setLanguage(language);
    void service.start();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void service.refresh(); });
    return () => subscription.remove();
  }, [language, languageReady, service]);
  return <LiveContext.Provider value={service}>{children}</LiveContext.Provider>;
}
export function useLiveAccount() {
  const service = useContext(LiveContext);
  if (!service) throw new Error('LiveAccountProvider is missing.');
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  const canLogin = LIVE_API_ENABLED && Platform.OS !== 'web';
  return { ...snapshot, mutationPending: snapshot.mutation.pending, mutationOperation: snapshot.mutation.operation, login: canLogin ? service.login : async () => ({ ok: false, error: Platform.OS === 'web' ? 'errors.nativeLoginOnly' : 'errors.loginPreparing' }), adoptSocialSession: canLogin ? service.adoptSocialSession : async () => ({ ok: false, error: Platform.OS === 'web' ? 'errors.nativeLoginOnly' : 'errors.loginPreparing' }), logout: service.logout, bindPushDevice: service.bindPushDevice, refresh: service.refresh, readView: service.readView, getOrderPaymentContext: service.getOrderPaymentContext, mutate: service.mutate, setParcelQuery: service.setParcelQuery, loadParcelPage: service.loadParcelPage, canMutate: canLogin && snapshot.authenticated && !snapshot.signingIn && !snapshot.mutation.pending, canLogin, canSwitchLanguage: !snapshot.signingIn && !snapshot.mutation.pending };
}
