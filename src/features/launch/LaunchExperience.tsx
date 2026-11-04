import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useI18n } from '@/i18n/context';
import { LAUNCH_BACKGROUND, LaunchArtwork } from './LaunchArtwork';

const DURATION = 3500;
const EXIT_DURATION = 180;
const MAX_INTRO_DURATION = 3900;
const SKIP_DELAY = 600;

type VisualPreferences = { reduceMotion: boolean; reduceTransparency: boolean };
export type LaunchExperienceProps = { ready: boolean; onFinished: () => void; loadingMessage?: string };

/** The cinematic sequence ends within four seconds. A separate quiet loading
 * indicator keeps the cover in place until the initial screen is ready. */
export function LaunchExperience({ ready, onFinished, loadingMessage }: LaunchExperienceProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [mountedAt] = useState(() => Date.now());
  const [laidOut, setLaidOut] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [artworkSettled, setArtworkSettled] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [preferences, setPreferences] = useState<VisualPreferences | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(1));
  const [loadingProgress] = useState(() => new Animated.Value(0.5));
  const readyRef = useRef(ready);
  const onFinishedRef = useRef(onFinished);
  const preferenceRef = useRef(preferences);
  const mounted = useRef(true);
  const started = useRef(false);
  const animationDone = useRef(false);
  const finishing = useRef(false);
  const finished = useRef(false);
  const appState = useRef(AppState.currentState);
  const focused = useRef(true);
  const timeline = useRef<Animated.CompositeAnimation | null>(null);
  const exitAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useLayoutEffect(() => {
    readyRef.current = ready;
    onFinishedRef.current = onFinished;
    preferenceRef.current = preferences;
  }, [onFinished, preferences, ready]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  const schedule = useCallback((callback: () => void, delay: number) => {
    if (!mounted.current || finished.current) return;
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (mounted.current && !finished.current) callback();
    }, delay);
    timers.current.add(timer);
  }, []);
  const finish = useCallback(() => {
    if (!mounted.current || finished.current || !readyRef.current) return;
    finished.current = true;
    clearTimers();
    onFinishedRef.current();
  }, [clearTimers]);
  const finishWhenReady = useCallback(() => {
    if (!mounted.current || !readyRef.current || !animationDone.current || finishing.current || finished.current) return;
    finishing.current = true;
    clearTimers();
    if (Date.now() - mountedAt >= MAX_INTRO_DURATION || preferenceRef.current?.reduceMotion || preferenceRef.current?.reduceTransparency || appState.current !== 'active') {
      finish();
      return;
    }
    const remaining = Math.max(0, MAX_INTRO_DURATION - (Date.now() - mountedAt));
    exitAnimation.current = Animated.timing(opacity, { toValue: 0, duration: Math.min(EXIT_DURATION, remaining), easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false });
    // A canceled native animation still releases the ready app. The independent
    // watchdog also covers a missing completion callback during interruption.
    exitAnimation.current.start(() => finish());
    schedule(finish, Math.min(EXIT_DURATION + 100, remaining));
  }, [clearTimers, finish, mountedAt, opacity, schedule]);
  const settle = useCallback(() => {
    if (finishing.current) {
      exitAnimation.current?.stop();
      finish();
      return;
    }
    timeline.current?.stop();
    progress.setValue(1);
    animationDone.current = true;
    setArtworkSettled(true);
    setCanSkip(false);
    clearTimers();
    finishWhenReady();
  }, [clearTimers, finish, finishWhenReady, progress]);
  useLayoutEffect(() => {
    // Readiness can be invalidated while the exit animation is in flight.
    // Restore the opaque cover before paint and allow a later ready transition
    // to finish again; a canceled fade must not expose a half-loaded screen.
    if (!ready && finishing.current && !finished.current) {
      finishing.current = false;
      exitAnimation.current?.stop();
      exitAnimation.current = null;
      clearTimers();
      opacity.setValue(1);
    }
  }, [clearTimers, opacity, ready]);
  const haptic = useCallback((final: boolean) => {
    if (!mounted.current || finished.current || preferenceRef.current?.reduceMotion || appState.current !== 'active' || !focused.current || Platform.OS === 'web') return;
    if (Platform.OS === 'android') {
      void Haptics.performAndroidHapticsAsync(final ? Haptics.AndroidHaptics.Segment_Tick : Haptics.AndroidHaptics.Segment_Frequent_Tick).catch(() => {});
    } else if (Platform.OS === 'ios') {
      void (final ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft) : Haptics.selectionAsync()).catch(() => {});
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timeline.current?.stop();
      exitAnimation.current?.stop();
      clearTimers();
      started.current = false;
    };
  }, [clearTimers]);

  useEffect(() => {
    let canceled = false;
    let resolved = false;
    // Accessibility queries must resolve before choosing the motion path. A slow
    // or unavailable native API takes the static path instead of blocking launch.
    const timeout = setTimeout(() => {
      if (!canceled && !resolved) {
        resolved = true;
        setPreferences({ reduceMotion: true, reduceTransparency: true });
      }
    }, 400);
    Promise.all([
      AccessibilityInfo.isReduceMotionEnabled().catch(() => true),
      Platform.OS === 'ios' ? AccessibilityInfo.isReduceTransparencyEnabled().catch(() => true) : Promise.resolve(false),
    ]).then(([reduceMotion, reduceTransparency]) => {
      if (!canceled && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        setPreferences({ reduceMotion, reduceTransparency });
      }
    });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', reduceMotion => {
      setPreferences(previous => previous ? { ...previous, reduceMotion } : previous);
    });
    const transparency = Platform.OS === 'ios' ? AccessibilityInfo.addEventListener('reduceTransparencyChanged', reduceTransparency => {
      setPreferences(previous => previous ? { ...previous, reduceTransparency } : previous);
    }) : null;
    return () => { canceled = true; clearTimeout(timeout); motion.remove(); transparency?.remove(); };
  }, []);

  useEffect(() => {
    const state = AppState.addEventListener('change', next => {
      appState.current = next;
      setForeground(next === 'active' && focused.current);
      if (next !== 'active' && started.current) settle();
    });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => { focused.current = false; setForeground(false); }) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => { focused.current = true; setForeground(appState.current === 'active'); }) : null;
    return () => { state.remove(); blur?.remove(); focus?.remove(); };
  }, [settle]);

  useEffect(() => {
    if (!laidOut || !preferences || started.current) return;
    started.current = true;
    if (preferences.reduceMotion || appState.current !== 'active') {
      settle();
      return;
    }
    timeline.current = Animated.timing(progress, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true, isInteraction: false });
    timeline.current.start(({ finished: completed }) => {
      if (!completed || !mounted.current) return;
      animationDone.current = true;
      setArtworkSettled(true);
      setCanSkip(false);
      clearTimers();
      finishWhenReady();
    });
    schedule(() => setCanSkip(true), SKIP_DELAY);
    schedule(() => haptic(false), 360);
    schedule(() => haptic(true), 1680);
    // Bounded fallback if the animation completion callback is interrupted.
    schedule(settle, Math.max(0, MAX_INTRO_DURATION - (Date.now() - mountedAt)));
  }, [clearTimers, finishWhenReady, haptic, laidOut, mountedAt, preferences, progress, schedule, settle]);

  useEffect(() => {
    if (preferences?.reduceMotion && started.current && !finished.current) settle();
  }, [preferences?.reduceMotion, settle]);
  useEffect(() => { if (ready) finishWhenReady(); }, [finishWhenReady, ready]);
  useEffect(() => {
    if (finished.current || !artworkSettled || ready || !foreground || !preferences || preferences.reduceMotion || preferences.reduceTransparency) return;
    loadingProgress.setValue(0);
    // One native timeline with matching endpoint opacities loops without a JS
    // sequence callback and cannot delay the first screen's list rendering.
    const pulse = Animated.loop(Animated.timing(loadingProgress, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    // This phase never schedules haptics or replays the parcel/logo sequence.
    pulse.start();
    return () => { pulse.stop(); loadingProgress.setValue(0.5); };
  }, [artworkSettled, foreground, loadingProgress, preferences, ready]);

  const captionOpacity = progress.interpolate({ inputRange: [0, 0.5, 0.69, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  const captionY = progress.interpolate({ inputRange: [0, 0.5, 0.72, 1], outputRange: [10, 10, 0, 0], extrapolate: 'clamp' });
  const loadingOpacity = loadingProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' });

  return <Animated.View onLayout={() => setLaidOut(true)} style={[styles.overlay, { opacity }]} accessibilityViewIsModal>
    <StatusBar style="light" />
    <LaunchArtwork progress={progress} reduceTransparency={preferences?.reduceTransparency ?? true} />
    <Animated.View style={[styles.caption, { opacity: captionOpacity, transform: [{ translateY: captionY }] }]}>
      <Text accessibilityRole="header" style={styles.name}>BayShop<Text style={styles.domain}>.com</Text></Text>
      <Text accessibilityLiveRegion="polite" style={styles.tagline}>{ready ? t('auth.tagline') : loadingMessage || t('auth.opening')}</Text>
      {artworkSettled && !ready && <Animated.View accessible={false} pointerEvents="none" style={[styles.loadingPulse, { opacity: loadingOpacity }]} />}
    </Animated.View>
    {canSkip && <Pressable accessibilityRole="button" accessibilityLabel={t('launch.skip')} accessibilityHint={t('launch.skipHint')} onPress={settle} style={({ pressed }) => [styles.skip, { bottom: Math.max(insets.bottom, 18) + 12 }, pressed && styles.skipPressed]}><Text style={styles.skipText}>{t('launch.skip')}</Text></Pressable>}
  </Animated.View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: LAUNCH_BACKGROUND, zIndex: 1000, overflow: 'hidden' },
  caption: { position: 'absolute', top: '50%', marginTop: 62, left: 20, right: 20, alignItems: 'center', gap: 12 },
  name: { color: '#FFFFFF', fontSize: 34, lineHeight: 42, fontWeight: '700', letterSpacing: -1.2, textAlign: 'center' },
  domain: { color: '#F16B6D', fontWeight: '500' },
  tagline: { color: '#B9BAC4', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  loadingPulse: { width: 80, height: 3, borderRadius: 2, backgroundColor: '#F16B6D', marginTop: 2 },
  skip: { position: 'absolute', alignSelf: 'center', minHeight: 48, minWidth: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, borderRadius: 24, borderWidth: 1, borderColor: '#35353F', backgroundColor: LAUNCH_BACKGROUND },
  skipPressed: { opacity: 0.7 },
  skipText: { color: '#DADAE2', fontSize: 13, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
});
