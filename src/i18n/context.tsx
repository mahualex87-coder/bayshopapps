import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { LANGUAGE_STORAGE_KEY, LanguagePreferenceStore, normalizeLanguage, countt, formatDate, formatNumber, formatTime, formatUpdatedAt, translate, type TranslationParams } from './core';

const I18nContext = createContext<LanguagePreferenceStore | null>(null);
export function I18nProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => {
    let deviceLanguage; try { deviceLanguage = getLocales().map(locale => normalizeLanguage(locale.languageCode)).find(Boolean); } catch { /* Use the built-in fallback if native locale data is unavailable. */ }
    return new LanguagePreferenceStore({ read: () => AsyncStorage.getItem(LANGUAGE_STORAGE_KEY), write: language => AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language) }, deviceLanguage || 'ro');
  });
  useEffect(() => { void store.start(); }, [store]);
  return <I18nContext.Provider value={store}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const store = useContext(I18nContext);
  if (!store) throw new Error('useI18n must be used within I18nProvider.');
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => ({
    ...snapshot,
    setLanguage: store.setLanguage,
    registerLanguageChange: store.registerLanguageChange,
    registerLanguageGuard: store.registerLanguageGuard,
    t: (key: string, params?: TranslationParams) => translate(snapshot.language, key, params),
    countt: (key: string, count: number, params?: TranslationParams) => countt(snapshot.language, key, count, params),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(snapshot.language, value, options),
    formatDate: (value: string | null) => formatDate(snapshot.language, value),
    formatTime: (value: number | Date | string | null) => formatTime(snapshot.language, value),
    formatUpdatedAt: (value: number | null) => formatUpdatedAt(snapshot.language, value),
  }), [snapshot, store]);
}
