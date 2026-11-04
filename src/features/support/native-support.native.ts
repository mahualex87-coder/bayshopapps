import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Intercom, { ProactiveContentType } from '@intercom/intercom-react-native';
import type { IntercomIdentity } from '@/api/intercom-identity';
import { createSupportSessionController, type SupportConfig, type SupportOpenOptions } from './session-controller';
export type { SupportError, SupportOpenOptions, SupportOpenResult } from './session-controller';
function configuration(): SupportConfig | null {
  const data = Constants.expoConfig?.extra?.intercom;
  if (!data || Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  const key: unknown = Platform.OS === 'ios' ? data.iosApiKey : data.androidApiKey;
  if (typeof data.appId !== 'string' || !/^[a-z0-9]+$/i.test(data.appId) || !['US', 'EU', 'AU'].includes(data.region)) return null;
  if (typeof key !== 'string' || !key.startsWith(Platform.OS === 'ios' ? 'ios_sdk-' : 'android_sdk-') || key.length < (Platform.OS === 'ios' ? 48 : 52)) return null;
  return { appId: data.appId, apiKey: key, region: data.region };
}
const session = createSupportSessionController({
  ...Intercom,
  // Present only the chat composer, without sending a message automatically.
  present: () => Intercom.presentMessageComposer(),
  // SDK10.9.0's iOS wrapper ignores the level and calls enableLogging even
  // for DISABLED. Leave iOS logging at its default; disable it on Android.
  setLogLevel: level => Platform.OS === 'ios' ? Promise.resolve(true) : Intercom.setLogLevel(level),
  suppressProactiveContent: types => Intercom.suppressProactiveContent(types.map(type => type === 'CAROUSEL' ? ProactiveContentType.Carousel : ProactiveContentType.Survey)),
}, configuration);
export function nativeSupportAvailable(): boolean { return configuration() !== null; }
export const openNativeSupport = (identity: IntercomIdentity, options: SupportOpenOptions) => session.open(identity, options);
export const clearNativeSupport = () => session.clear();
