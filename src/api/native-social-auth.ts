import { API_ACCEPT, API_ORIGIN } from './client.ts';
import { addressFormats, type AddressFormats } from './account-operations.ts';
import { ApiContractError, normalizeAuthData } from './normalize.ts';
import type { LiveAuthSession } from './contracts.ts';
import { isLanguage, type Language } from '../i18n/core.ts';

export type SocialProvider = 'apple' | 'google';
export type SocialPlatform = 'ios' | 'android';
export type SocialCapabilities = { version: 1; providers: Record<SocialProvider, { enabled: boolean; clientId: string | null }> };
export type SocialChallenge = { flowId: string; provider: SocialProvider; nonce: string; state: string; expiresAt: string };
export type SocialProfileField = 'firstName' | 'lastName' | 'phone' | 'phoneCode' | 'countryId';
export type SocialProfile = Record<SocialProfileField, string> & { email: string };
export type SocialPending = { status: 'completion_required'; pendingToken: string; expiresAt: string; isNew: boolean; profile: SocialProfile; editableFields: SocialProfileField[]; requiredFields: SocialProfileField[]; termsRequired: boolean; formats: AddressFormats };
export type SocialAuthData = { status: 'authenticated'; session: LiveAuthSession } | SocialPending;
export type SocialIdentityProof = { idToken: string; firstName?: string; lastName?: string };
export type SocialResult<T> = { outcome: 'success'; data: T } | { outcome: 'rejected' | 'unknown'; errorCode: string };
const fields: SocialProfileField[] = ['firstName', 'lastName', 'phone', 'phoneCode', 'countryId'];
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError('autentificarea socială'); return value as Record<string, unknown>; };
const text = (value: unknown): string => { if (typeof value !== 'string') throw new ApiContractError('autentificarea socială'); return value; };
const opaque = (value: unknown): string => { const result = text(value); if (!/^[a-f0-9]{64}$/.test(result)) throw new ApiContractError('autentificarea socială'); return result; };
const timestamp = (value: unknown): string => { const result = text(value); if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) throw new ApiContractError('autentificarea socială'); return result; };
function scope(value: unknown): SocialProfileField[] { if (!Array.isArray(value) || value.some(item => !fields.includes(item)) || new Set(value).size !== value.length) throw new ApiContractError('autentificarea socială'); return value; }
export function socialCapabilities(raw: unknown): SocialCapabilities {
  const row = object(raw); const providers = object(row.providers);
  if (row.version !== 1) throw new ApiContractError('autentificarea socială');
  const parsed = Object.fromEntries(['apple', 'google'].map(key => { const provider = object(providers[key]); if (typeof provider.enabled !== 'boolean' || provider.clientId !== null && typeof provider.clientId !== 'string' || provider.enabled && !provider.clientId) throw new ApiContractError('autentificarea socială'); return [key, { enabled: provider.enabled, clientId: provider.clientId }]; }));
  return { version: 1, providers: parsed as SocialCapabilities['providers'] };
}
export function socialChallenge(raw: unknown): SocialChallenge {
  const row = object(raw); if (row.provider !== 'apple' && row.provider !== 'google') throw new ApiContractError('autentificarea socială');
  return { provider: row.provider, flowId: opaque(row.flowId), nonce: opaque(row.nonce), state: opaque(row.state), expiresAt: timestamp(row.expiresAt) };
}
export function socialAuthData(raw: unknown): SocialAuthData {
  const row = object(raw);
  if (row.status === 'authenticated') return { status: 'authenticated', session: normalizeAuthData(row.session) };
  if (row.status !== 'completion_required' || typeof row.isNew !== 'boolean' || typeof row.termsRequired !== 'boolean') throw new ApiContractError('autentificarea socială');
  const editableFields = scope(row.editableFields); const requiredFields = scope(row.requiredFields);
  if (!requiredFields.length || requiredFields.some(field => !editableFields.includes(field)) || row.isNew && (!row.termsRequired || fields.some(field => !requiredFields.includes(field)))) throw new ApiContractError('autentificarea socială');
  const profileRaw = object(row.profile); const profile = Object.fromEntries([...fields, 'email'].map(field => [field, text(profileRaw[field])])) as SocialProfile;
  if (!profile.email || !row.isNew && editableFields.some(field => profile[field].trim() !== '')) throw new ApiContractError('autentificarea socială');
  const metadata = object(row.metadata);
  return { status: 'completion_required', pendingToken: opaque(row.pendingToken), expiresAt: timestamp(row.expiresAt), isNew: row.isNew, profile, editableFields, requiredFields, termsRequired: row.termsRequired, formats: addressFormats({ countries: metadata.countries, maskFormatsList: metadata.phoneFormats, regionsList: [], citiesList: [] }) };
}
export function socialCompletionFields(pending: SocialPending, profile: SocialProfile, acceptedTerms: boolean): Partial<Record<SocialProfileField, string>> {
  if (pending.termsRequired && !acceptedTerms) throw new Error('terms_required');
  return Object.fromEntries(pending.editableFields.map(field => [field, profile[field].trim()]));
}
const serverErrors = new Set(['provider_unavailable', 'invalid_identity', 'flow_expired', 'account_link_required', 'provider_email_required', 'account_unavailable', 'terms_required', 'invalid_profile', 'locked_profile_field', 'incomplete_profile', 'invalid_country', 'invalid_phone', 'account_changed', 'try_again', 'rate_limited', 'temporarily_unavailable']);
/** Public ephemeral flow: no bearer/cookies/logs/storage or automatic retries. */
export function createNativeSocialAuth(fetcher: typeof fetch, platform: SocialPlatform, timeoutMs = 20000) {
  let pendingRequest = false; let blocked = false;
  async function request<T>(operation: string | null, input: Record<string, unknown>, normalize: (value: unknown) => T, language: Language, signal?: AbortSignal): Promise<SocialResult<T>> {
    if (pendingRequest) return { outcome: 'rejected', errorCode: 'request_pending' };
    if (blocked && operation) return { outcome: 'unknown', errorCode: 'request_unknown' };
    if (signal?.aborted) return { outcome: 'rejected', errorCode: 'cancelled' };
    pendingRequest = true;
    const aborter = new AbortController(); const cancel = () => aborter.abort(); signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs); let dispatched = false;
    try {
      const form = new URLSearchParams();
      if (operation) form.set('operation', operation);
      for (const [key, value] of Object.entries(input)) if (key === 'profile') for (const [field, item] of Object.entries(value as Record<string, string>)) form.set(`profile[${field}]`, item); else if (value !== undefined) form.set(key, String(value));
      dispatched = true;
      const response = await fetcher(`${API_ORIGIN}/api/native-auth${operation ? '' : `?platform=${platform}`}`, {
        method: operation ? 'POST' : 'GET', headers: { Accept: `${API_ACCEPT}; platform=${platform}`, 'Accept-Language': isLanguage(language) ? language : 'ro', 'Cache-Control': 'no-store', ...(operation ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' } : {}) },
        ...(operation ? { body: form.toString() } : {}), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: aborter.signal,
      });
      if (aborter.signal.aborted || response.url && new URL(response.url).origin !== API_ORIGIN) throw new Error('Unconfirmed response');
      if (response.status === 404) return { outcome: 'rejected', errorCode: 'provider_unavailable' };
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (mime !== 'application/json' && mime !== 'application/vnd.mf+json') throw new Error('Invalid response');
      const envelope = object(await response.json());
      if (aborter.signal.aborted) throw new Error('Cancelled');
      if (!response.ok || envelope.error !== false || envelope.code !== 200 || envelope.message !== 'Ok') {
        const errorCode = typeof envelope.errorCode === 'string' && serverErrors.has(envelope.errorCode) ? envelope.errorCode : 'request_rejected';
        if (response.status >= 500 && operation === 'complete') { blocked = true; return { outcome: 'unknown', errorCode: 'request_unknown' }; }
        return { outcome: 'rejected', errorCode };
      }
      return { outcome: 'success', data: normalize(envelope.data) };
    } catch {
      if (operation && dispatched) { blocked = true; return { outcome: 'unknown', errorCode: 'request_unknown' }; }
      return { outcome: 'rejected', errorCode: signal?.aborted ? 'cancelled' : 'request_failed' };
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); pendingRequest = false; }
  }
  return {
    capabilities: (language: Language, signal?: AbortSignal) => request(null, {}, socialCapabilities, language, signal),
    challenge: (provider: SocialProvider, language: Language, signal?: AbortSignal) => request('challenge', { provider, platform }, socialChallenge, language, signal),
    verify: (challenge: SocialChallenge, proof: SocialIdentityProof, language: Language, signal?: AbortSignal) => request('verify', { flowId: challenge.flowId, idToken: proof.idToken, firstName: proof.firstName, lastName: proof.lastName }, socialAuthData, language, signal),
    complete: async (pending: SocialPending, profile: SocialProfile, acceptedTerms: boolean, language: Language, signal?: AbortSignal): Promise<SocialResult<SocialAuthData>> => {
      if (pending.termsRequired && !acceptedTerms) return { outcome: 'rejected', errorCode: 'terms_required' };
      return request('complete', { pendingToken: pending.pendingToken, acceptedTerms: acceptedTerms ? '1' : '0', profile: socialCompletionFields(pending, profile, acceptedTerms) }, socialAuthData, language, signal);
    },
  };
}
