import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useVisualPreferences() {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [reduceTransparency, setReduceTransparency] = useState(Platform.OS === 'ios');
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    if (Platform.OS === 'ios') {
      AccessibilityInfo.isReduceTransparencyEnabled().then(value => { if (mounted) setReduceTransparency(value); }).catch(() => {});
    }
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const transparency = Platform.OS === 'ios' ? AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency) : null;
    return () => { mounted = false; motion.remove(); transparency?.remove(); };
  }, []);
  return { reduceMotion, reduceTransparency };
}
