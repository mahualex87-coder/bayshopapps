import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { Animated, AppState, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useLiveAccount } from '@/api/context';
import { useI18n } from '@/i18n/context';
import { useTheme } from '@/theme/context';
import { useVisualPreferences } from './accessibility';
import { initialAccountPending, PageLoadState } from './page-load-state';

type ActivePage = { id: string; scope: string; ready: boolean };
const AppLoading = createContext<{ scope: string; active: ActivePage | null; report: (page: ActivePage) => void; clear: (id: string, scope: string) => void } | null>(null);
const PageLoading = createContext<PageLoadState | null>(null);

export function PageLoadingProvider({ children }: PropsWithChildren) {
  const live = useLiveAccount();
  const scope = JSON.stringify([live.authenticated, live.authRevision, live.accountId, live.accountRevision, live.language]);
  const [active, setActive] = useState<ActivePage | null>(null);
  const report = useCallback((next: ActivePage) => setActive(previous => previous?.id === next.id && previous.scope === next.scope && previous.ready === next.ready ? previous : next), []);
  const clear = useCallback((id: string, scope: string) => setActive(previous => previous?.id === id && previous.scope === scope ? null : previous), []);
  const value = useMemo(() => ({ scope, active, report, clear }), [scope, active, report, clear]);
  return <AppLoading.Provider value={value}>{children}</AppLoading.Provider>;
}

export function useInitialPageReady() {
  const state = useContext(AppLoading);
  return !!state && state.active?.scope === state.scope && state.active.ready;
}

/** Registers actual resource state, not a timer or an invented percentage.
 * Retained data may refresh behind the progress bar without hiding the page. */
export function usePageLoad(pending: boolean, blocking = pending) {
  const state = useContext(PageLoading);
  const id = useId();
  useLayoutEffect(() => { state?.set(id, pending, blocking); }, [state, id, pending, blocking]);
  useLayoutEffect(() => () => state?.remove(id), [state, id]);
}

function ProgressBar({ label, active }: { label: string; active: boolean }) {
  const { colors } = useTheme();
  const { reduceMotion } = useVisualPreferences();
  const [progress] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(200);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => { const listener = AppState.addEventListener('change', state => setForeground(state === 'active')); return () => listener.remove(); }, []);
  useEffect(() => {
    progress.setValue(0);
    if (reduceMotion || !active || !foreground) return;
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => loop.stop();
  }, [active, foreground, progress, reduceMotion]);
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[styles.track, { backgroundColor: colors.soft }]}>
    <Animated.View style={[styles.fill, { backgroundColor: colors.accent, width: reduceMotion ? '100%' : '35%', opacity: reduceMotion ? 0.65 : 1, transform: [{ translateX: reduceMotion ? 0 : progress.interpolate({ inputRange: [0, .5, 1], outputRange: [0, width * .65, 0] }) }] }]} />
  </View>;
}

/** Children stay mounted to start and finish all dependent reads. The curtain
 * hides partial layouts but never covers the persistent navigation menus. */
export function PageLoadingBoundary({ children, routeId }: PropsWithChildren<{ routeId: string }>) {
  const app = useContext(AppLoading);
  const live = useLiveAccount();
  const focused = useIsFocused();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [state] = useState(() => new PageLoadState());
  const tasks = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);
  const [laidOut, setLaidOut] = useState(false);
  const scope = `${app?.scope || ''}:${routeId}`;
  const accountPending = initialAccountPending(live);
  const blocking = tasks.blocking > 0 || accountPending;
  const pending = tasks.pending > 0 || accountPending;
  const cycle = JSON.stringify([scope, focused, laidOut, blocking]);
  const [settled, setSettled] = useState<string | null>(null);
  const [previousCycle, setPreviousCycle] = useState(cycle);
  if (previousCycle !== cycle) { setPreviousCycle(cycle); setSettled(null); }
  const ready = focused && laidOut && !blocking && previousCycle === cycle && settled === cycle;
  useLayoutEffect(() => {
    // Re-arm on every navigation/focus, locale/account change or missing data.
    // A short quiet commit also catches children mounted by a parent response.
    if (!focused || !laidOut || blocking) return;
    const timer = setTimeout(() => setSettled(cycle), 100);
    return () => clearTimeout(timer);
  }, [blocking, focused, laidOut, cycle]);
  const report = app?.report;
  const clear = app?.clear;
  const accountScope = app?.scope || '';
  useLayoutEffect(() => { if (focused) report?.({ id: routeId, scope: accountScope, ready }); }, [focused, report, routeId, accountScope, ready]);
  useLayoutEffect(() => { if (focused) return () => clear?.(routeId, accountScope); }, [focused, clear, routeId, accountScope]);
  const hidden = !ready;
  return <PageLoading.Provider value={state}>
    <View style={styles.flex} onLayout={() => setLaidOut(true)}>
      <View {...(Platform.OS === 'web' ? { inert: hidden } : {})} style={[styles.flex, hidden && styles.hidden]} pointerEvents={hidden ? 'none' : 'auto'} aria-hidden={hidden} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>{children}</View>
      {hidden ? <View style={[StyleSheet.absoluteFill, styles.curtain, { backgroundColor: colors.background }]}>
        <View style={styles.loading}><ProgressBar active={focused} label={t('live.loading')} /><Text accessibilityLiveRegion="polite" style={[styles.label, { color: colors.muted }]}>{t('live.loading')}</Text></View>
      </View> : pending ? <View pointerEvents="none" style={styles.topProgress}><ProgressBar active={focused} label={t('live.loading')} /></View> : null}
    </View>
  </PageLoading.Provider>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, hidden: { opacity: 0 },
  curtain: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  loading: { width: '100%', maxWidth: 240, gap: 14 },
  label: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  track: { width: '100%', height: 4, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 3 },
  topProgress: { position: 'absolute', left: 16, right: 16, top: 0 },
});
