import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import type { NotificationPermissionsStatus } from 'expo-notifications';

export type PushPermission = 'granted' | 'denied' | 'undetermined';
export type NativePushMessage = { data?: unknown; notification?: { title?: unknown; body?: unknown } | null };
const projectId = 'baymd-148208';
const channelId = 'bayshop-updates';
// Config-less Expo clients must be able to evaluate the application's entry.
/* eslint-disable @typescript-eslint/no-require-imports -- these optional native modules must be lazily resolved in Expo Go */
const firebase = () => require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
const push = () => require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging');
const notifications = () => require('expo-notifications') as typeof import('expo-notifications');
/* eslint-enable @typescript-eslint/no-require-imports */
export function nativePushAvailable(): boolean {
  const config = Constants.expoConfig?.extra?.push;
  if (config?.projectId !== projectId || !(Platform.OS === 'ios' ? config.ios === true : Platform.OS === 'android' && config.android === true)) return false;
  try { return firebase().getApp().options.projectId === projectId; } catch { return false; }
}
function messaging() {
  if (!nativePushAvailable()) throw new Error('push.unavailable');
  return push().getMessaging(firebase().getApp());
}
function permission(result: NotificationPermissionsStatus): PushPermission {
  const ios = notifications().IosAuthorizationStatus;
  if (result.granted || result.ios?.status === ios.PROVISIONAL || result.ios?.status === ios.EPHEMERAL) return 'granted';
  if (result.ios?.status === ios.DENIED) return 'denied';
  return result.canAskAgain ? 'undetermined' : 'denied';
}
export async function getPushPermission(): Promise<PushPermission> {
  if (!nativePushAvailable()) return 'denied';
  const api = notifications();
  if (Platform.OS === 'android' && (await api.getNotificationChannelAsync(channelId))?.importance === api.AndroidImportance.NONE) return 'denied';
  return permission(await api.getPermissionsAsync());
}
async function createChannel() {
  if (Platform.OS !== 'android') return;
  const api = notifications();
  await api.setNotificationChannelAsync(channelId, { name: 'BayShop', importance: api.AndroidImportance.DEFAULT, vibrationPattern: [0, 180], lightColor: '#E44448' });
}
export async function requestPushPermission(): Promise<PushPermission> {
  if (!nativePushAvailable()) return 'denied';
  await createChannel();
  return permission(await notifications().requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }));
}
export async function getNativePushToken(): Promise<string> {
  const instance = messaging();
  const api = push();
  await createChannel();
  await api.setAutoInitEnabled(instance, true);
  if (Platform.OS === 'ios' && !instance.isDeviceRegisteredForRemoteMessages) await api.registerDeviceForRemoteMessages(instance);
  return api.getToken(instance);
}
export async function clearNativePushToken(): Promise<void> {
  if (!nativePushAvailable()) return;
  const instance = messaging();
  const api = push();
  let failed = false;
  try { await api.setAutoInitEnabled(instance, false); } catch { failed = true; }
  try { await api.deleteToken(instance); } catch { failed = true; }
  if (Platform.OS === 'ios' && instance.isDeviceRegisteredForRemoteMessages) {
    try { await api.unregisterDeviceForRemoteMessages(instance); } catch { failed = true; }
  }
  await notifications().dismissAllNotificationsAsync();
  if (failed) throw new Error('push.failed');
}
export function listenNativePush(callbacks: { message(message: NativePushMessage): void; opened(message: NativePushMessage): void; token(token: string): void }): () => void {
  if (!nativePushAvailable()) return () => {};
  const instance = messaging();
  const api = push();
  const unsubscribers = [api.onMessage(instance, callbacks.message), api.onNotificationOpenedApp(instance, callbacks.opened), api.onTokenRefresh(instance, callbacks.token)];
  return () => { unsubscribers.forEach(unsubscribe => unsubscribe()); };
}
export async function initialNativePush(): Promise<NativePushMessage | null> {
  if (!nativePushAvailable()) return null;
  const api = push();
  const instance = messaging();
  const first = await api.getInitialNotification(instance);
  if (first || Platform.OS !== 'android') return first;
  // RNFirebase resolves null when Android has not attached the launch Activity
  // yet. Read its intent once more after the foreground Activity has a frame.
  await new Promise<void>(resolve => {
    let scheduled = false;
    const ready = () => {
      if (scheduled) return;
      scheduled = true;
      subscription.remove();
      requestAnimationFrame(() => resolve());
    };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') ready(); });
    if (AppState.currentState === 'active') ready();
  });
  return api.getInitialNotification(instance);
}
let installed = false;
export function installBackgroundPushHandler(): void {
  if (installed || !nativePushAvailable()) return;
  try {
    push().setBackgroundMessageHandler(messaging(), async () => {
      // The OS presents the remote notification. Background receipt does not
      // navigate, persist account data, issue writes or show a second alert.
    });
    installed = true;
  } catch { /* An unconfigured preview must remain launchable. */ }
}
