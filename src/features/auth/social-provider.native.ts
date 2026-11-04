import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { AuthRequest, ResponseType, exchangeCodeAsync } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { SocialCapabilities, SocialChallenge, SocialIdentityProof, SocialProvider } from '@/api/native-social-auth';
import { androidGoogleAvailable, getAndroidGoogleIdentity } from './android-google-auth';

export type SocialProviderResult = { status: 'success'; proof: SocialIdentityProof } | { status: 'cancelled' } | { status: 'error'; errorCode: string };
const googleDiscovery = { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth', tokenEndpoint: 'https://oauth2.googleapis.com/token' };
const googleClientId = (): string | null => {
  const value: unknown = Constants.expoConfig?.extra?.nativeSocial?.googleIosClientId;
  return typeof value === 'string' && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value) ? value : null;
};
export async function availableSocialProviders(capabilities: SocialCapabilities): Promise<SocialProvider[]> {
  if (Platform.OS === 'android') return androidGoogleAvailable(capabilities) ? ['google'] : [];
  if (Platform.OS !== 'ios') return [];
  const available: SocialProvider[] = [];
  if (capabilities.providers.apple.enabled && capabilities.providers.apple.clientId === Constants.expoConfig?.ios?.bundleIdentifier && Constants.expoConfig?.ios?.usesAppleSignIn && await AppleAuthentication.isAvailableAsync().catch(() => false)) available.push('apple');
  const googleId = googleClientId();
  if (googleId && capabilities.providers.google.enabled && capabilities.providers.google.clientId === googleId) available.push('google');
  return available;
}
/** Called only by a deliberate user gesture; all provider credentials stay in memory. */
export async function getSocialIdentity(provider: SocialProvider, challenge: SocialChallenge, capabilities: SocialCapabilities, signal?: AbortSignal): Promise<SocialProviderResult> {
  if (signal?.aborted) return { status: 'cancelled' };
  if (Platform.OS === 'android') return provider === 'google' ? getAndroidGoogleIdentity(challenge, capabilities, signal) : { status: 'error', errorCode: 'provider_unavailable' };
  if (challenge.provider !== provider || Date.parse(challenge.expiresAt) <= Date.now() || !(await availableSocialProviders(capabilities)).includes(provider)) return { status: 'error', errorCode: 'provider_unavailable' };
  if (signal?.aborted) return { status: 'cancelled' };
  try {
    if (provider === 'apple') {
      const result = await AppleAuthentication.signInAsync({ nonce: challenge.nonce, state: challenge.state, requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] });
      if (signal?.aborted) return { status: 'cancelled' };
      if (result.state !== challenge.state || !result.identityToken) return { status: 'error', errorCode: 'invalid_identity' };
      return { status: 'success', proof: { idToken: result.identityToken, ...(result.fullName?.givenName ? { firstName: result.fullName.givenName } : {}), ...(result.fullName?.familyName ? { lastName: result.fullName.familyName } : {}) } };
    }
    const clientId = googleClientId();
    if (!clientId) return { status: 'error', errorCode: 'provider_unavailable' };
    const redirectUri = `${clientId.split('.').reverse().join('.')}:/oauthredirect`;
    const request = new AuthRequest({ clientId, redirectUri, responseType: ResponseType.Code, scopes: ['openid', 'email', 'profile'], usePKCE: true, state: challenge.state, extraParams: { nonce: challenge.nonce, prompt: 'select_account' } });
    const cancel = () => { try { WebBrowser.dismissAuthSession(); } catch {} };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await request.promptAsync(googleDiscovery);
      if (signal?.aborted || result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' };
      if (result.type !== 'success' || result.params.state !== challenge.state || !result.params.code || !request.codeVerifier) return { status: 'error', errorCode: 'invalid_identity' };
      // No offline access, client secret, access-token fallback, or automatic retry.
      const tokens = await exchangeCodeAsync({ clientId, redirectUri, code: result.params.code, extraParams: { code_verifier: request.codeVerifier } }, googleDiscovery);
      if (signal?.aborted) return { status: 'cancelled' };
      return tokens.idToken ? { status: 'success', proof: { idToken: tokens.idToken } } : { status: 'error', errorCode: 'invalid_identity' };
    } finally { signal?.removeEventListener('abort', cancel); }
  } catch (error) {
    if (signal?.aborted || error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
    return { status: 'error', errorCode: 'provider_failed' };
  }
}
