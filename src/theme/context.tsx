import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { THEME_STORAGE_KEY, ThemePreferenceStore, resolveTheme } from './core';
import { darkColors, lightColors, type ThemeColors } from './palette';

const ThemeContext = createContext<ReturnType<typeof useThemeValue> | null>(null);
function useThemeValue() {
  const [store] = useState(() => new ThemePreferenceStore({ read: () => AsyncStorage.getItem(THEME_STORAGE_KEY), write: mode => AsyncStorage.setItem(THEME_STORAGE_KEY, mode) }));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const system = useColorScheme();
  const scheme = resolveTheme(snapshot.mode, system);
  const colors = scheme === 'dark' ? darkColors : lightColors;
  useEffect(() => { void store.start(); }, [store]);
  useEffect(() => {
    // App-level native appearance only; never changes the phone's system setting.
    if (Platform.OS !== 'web') Appearance.setColorScheme(snapshot.mode === 'system' ? 'auto' : snapshot.mode);
  }, [snapshot.mode]);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.style.colorScheme = scheme;
  }, [scheme, colors.background]);
  return useMemo(() => ({ ...snapshot, colors, scheme, isDark: scheme === 'dark', setMode: store.setMode }), [snapshot, colors, scheme, store]);
}
export function AppThemeProvider({ children }: PropsWithChildren) {
  const value = useThemeValue();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within AppThemeProvider.');
  return value;
}
export function useThemeStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}
