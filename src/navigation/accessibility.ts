import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

type VisualPreferences = { reduceMotion: boolean; reduceTransparency: boolean };

/** One shared store for every glass surface, map and page transition. The
 * conservative defaults apply only until the system answers once; later mounts
 * read the known value synchronously, so cards do not flash from solid to
 * glass on each new screen, and the app keeps two native listeners in total. */
let snapshot: VisualPreferences = { reduceMotion: true, reduceTransparency: Platform.OS === 'ios' };
const listeners = new Set<() => void>();
let started = false;

function update(patch: Partial<VisualPreferences>) {
  const next = { ...snapshot, ...patch };
  if (next.reduceMotion === snapshot.reduceMotion && next.reduceTransparency === snapshot.reduceTransparency) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled().then(value => update({ reduceMotion: value })).catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', value => update({ reduceMotion: value }));
  if (Platform.OS === 'ios') {
    AccessibilityInfo.isReduceTransparencyEnabled().then(value => update({ reduceTransparency: value })).catch(() => {});
    AccessibilityInfo.addEventListener('reduceTransparencyChanged', value => update({ reduceTransparency: value }));
  }
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const getSnapshot = () => snapshot;

export function useVisualPreferences(): VisualPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
