import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Brightness from 'expo-brightness';
import { createQrBrightnessController } from '@/domain/qr-brightness';

const brightness = createQrBrightnessController({
  available: () => Platform.OS === 'web' ? Promise.resolve(false) : Brightness.isAvailableAsync(),
  get: Brightness.getBrightnessAsync,
  set: Brightness.setBrightnessAsync,
  ...(Platform.OS === 'android' ? { usingSystem: Brightness.isUsingSystemBrightnessAsync, restoreSystem: Brightness.restoreSystemBrightnessAsync } : {}),
});

export function useQrBrightness(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const lease = brightness.acquire(AppState.currentState === 'active' || AppState.currentState === null);
    // A brightness capability failure must not hide the pickup code.
    void lease.ready.catch(() => {});
    const subscription = AppState.addEventListener('change', state => { void lease.setActive(state === 'active').catch(() => {}); });
    return () => {
      subscription.remove();
      // Retry one transient native restore failure; never change system mode.
      void lease.release().catch(() => lease.release()).catch(() => {});
    };
  }, [enabled]);
}
