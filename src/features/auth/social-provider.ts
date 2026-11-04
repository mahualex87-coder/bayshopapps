import type { SocialCapabilities, SocialChallenge, SocialIdentityProof, SocialProvider } from '@/api/native-social-auth';
export type SocialProviderResult = { status: 'success'; proof: SocialIdentityProof } | { status: 'cancelled' } | { status: 'error'; errorCode: string };
/** Web previews do not impersonate a native provider or expose dead controls. */
export async function availableSocialProviders(_capabilities: SocialCapabilities): Promise<SocialProvider[]> { return []; }
export async function getSocialIdentity(_provider: SocialProvider, _challenge: SocialChallenge, _capabilities: SocialCapabilities, _signal?: AbortSignal): Promise<SocialProviderResult> { return { status: 'error', errorCode: 'provider_unavailable' }; }
