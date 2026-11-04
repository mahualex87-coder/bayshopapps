import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import type { SocialCapabilities, SocialChallenge } from '@/api/native-social-auth';
import type { SocialProviderResult } from './social-provider';

type NativeResult = { status: 'success'; idToken: string } | { status: 'cancelled' } | { status: 'error'; errorCode: string };
type GoogleModule = {
  protocolVersion: number;
  signInAsync(requestId: string, audience: string, nonce: string): Promise<NativeResult>;
  cancelAsync(requestId: string): Promise<void>;
  clearSessionAsync(force: boolean): Promise<boolean>;
};
// No native lookup/init on iOS or web. Missing bridge fails closed in old builds/Expo Go.
let native: GoogleModule | null | undefined;
let active: string | null = null;
let used = false;
let generation = 0;
function module(): GoogleModule | null {
  if (Platform.OS !== 'android') return null;
  if (native === undefined) {
    try { native = requireOptionalNativeModule<GoogleModule>('BayShopGoogleAuth'); } catch { native = null; }
  }
  return native?.protocolVersion === 1 ? native : null;
}
function audience(): string | null {
  const value: unknown = Constants.expoConfig?.extra?.nativeSocial?.googleAndroidWebClientId;
  return typeof value === 'string' && value.length <= 255 && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value) ? value : null;
}
export function androidGoogleAvailable(capabilities: SocialCapabilities): boolean {
  const id = audience();
  return Platform.OS === 'android' && !!id && capabilities.providers.google.enabled && capabilities.providers.google.clientId === id && module() !== null;
}
export async function getAndroidGoogleIdentity(challenge: SocialChallenge, capabilities: SocialCapabilities, signal?: AbortSignal): Promise<SocialProviderResult> {
  if (signal?.aborted) return { status: 'cancelled' };
  const bridge = module(); const id = audience(); const expiry = Date.parse(challenge.expiresAt);
  if (!bridge || !id || !androidGoogleAvailable(capabilities)) return { status: 'error', errorCode: 'provider_unavailable' };
  if (challenge.provider !== 'google' || !/^[a-f0-9]{64}$/.test(challenge.flowId) || !/^[a-f0-9]{64}$/.test(challenge.nonce) || !Number.isFinite(expiry) || expiry <= Date.now()) return { status: 'error', errorCode: 'invalid_identity' };
  if (active !== null) return { status: 'error', errorCode: 'request_pending' };
  const lease = ++generation; active = challenge.flowId; used = true;
  const cancel = () => { void bridge.cancelAsync(challenge.flowId).catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) return { status: 'cancelled' };
    const result = await bridge.signInAsync(challenge.flowId, id, challenge.nonce);
    if (signal?.aborted || lease !== generation) return { status: 'cancelled' };
    if (Date.now() >= expiry) return { status: 'error', errorCode: 'invalid_identity' };
    if (result.status === 'cancelled') return { status: 'cancelled' };
    if (result.status === 'success' && typeof result.idToken === 'string' && result.idToken.trim() && result.idToken.length <= 16384) return { status: 'success', proof: { idToken: result.idToken } };
    const allowed = ['provider_unavailable', 'request_pending', 'invalid_identity'];
    return { status: 'error', errorCode: result.status === 'error' && allowed.includes(result.errorCode) ? result.errorCode : 'provider_failed' };
  } catch { return signal?.aborted || lease !== generation ? { status: 'cancelled' } : { status: 'error', errorCode: 'provider_failed' }; }
  finally { signal?.removeEventListener('abort', cancel); if (active === challenge.flowId) active = null; }
}

/** Force cleanup only on a real authenticated logout/account change, including a restored session.
 * Default cleanup never initializes the bridge; neither path opens provider UI. */
export async function clearAndroidGoogleCredentialState(force = false): Promise<void> {
  const lease = ++generation;
  const bridge = force ? module() : native;
  if (!bridge || !force && !used) return;
  used = true;
  const requestId = active;
  if (requestId) await bridge.cancelAsync(requestId).catch(() => undefined);
  // Keep used=true on failure so a subsequent logout/account boundary can retry cleanup.
  if (await bridge.clearSessionAsync(force).catch(() => false) && lease === generation) used = false;
}
