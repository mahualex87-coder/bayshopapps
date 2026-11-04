import type { RegistrationRegion } from './public-onboarding.ts';
import { API_ACCEPT, API_ORIGIN } from './client.ts';
import { literalHtmlText } from '../domain/server-text.ts';
import { isLanguage, type Language } from '../i18n/core.ts';

export type RegistrationInput = { firstName: string; lastName: string; email: string; password: string; confirmation: string; accepted: boolean; region?: RegistrationRegion };
export type PublicAuthResult = { outcome: 'accepted' | 'rejected' | 'unknown'; errorKey?: string; message?: string };
export const validAuthEmail = (value: string) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export function registrationError(input: RegistrationInput): string | null {
  if (!input || typeof input.firstName !== 'string' || typeof input.lastName !== 'string' || !input.firstName.trim() || !input.lastName.trim()) return 'auth.registrationNamesRequired';
  if (!validAuthEmail(input.email)) return 'auth.invalidEmail';
  if (typeof input.password !== 'string' || !input.password) return 'auth.passwordRequired';
  if (input.password !== input.confirmation) return 'auth.passwordMismatch';
  if (input.accepted !== true) return 'auth.acceptTermsRequired';
  if (input.region && (!/^[1-9]\d{0,9}$/.test(input.region.countryId) || !/^[1-9]\d{0,9}$/.test(input.region.languageId) || !isLanguage(input.region.language))) return 'onboarding.required';
  return null;
}

/** Public account actions never use or persist the signed-in member token. */
export function createPublicAuth(fetcher: typeof fetch, platform?: 'ios' | 'android', timeoutMs = 20000) {
  let pending = false;
  let terminalResult: PublicAuthResult | null = null;
  // An accepted or uncertain action is never replayed by a second tap, even
  // before the form's React state has rendered its terminal result.
  const settle = (result: PublicAuthResult): PublicAuthResult => { if (result.outcome !== 'rejected') terminalResult = result; return result; };
  const request = async (kind: 'register' | 'restore', fields: Record<string, string>, language: Language, signal?: AbortSignal): Promise<PublicAuthResult> => {
    if (pending) return { outcome: 'rejected', errorKey: 'auth.requestPending' };
    if (terminalResult) return terminalResult;
    if (signal?.aborted) return { outcome: 'rejected', errorKey: 'errors.cancelled' };
    pending = true;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    let dispatched = false;
    let responseStatus: number | null = null;
    try {
      dispatched = true;
      const response = await fetcher(`${API_ORIGIN}/api/auth/${kind}`, {
        method: 'POST', headers: { Accept: `${API_ACCEPT}${platform ? `; platform=${platform}` : ''}`, 'Accept-Language': isLanguage(language) ? language : 'ro', 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', 'Cache-Control': 'no-store' },
        body: new URLSearchParams(fields).toString(), signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
      });
      responseStatus = response.status;
      if (controller.signal.aborted) return settle({ outcome: 'unknown', errorKey: 'auth.requestUnknown' });
      if (response.url && new URL(response.url).origin !== API_ORIGIN) return settle({ outcome: 'unknown', errorKey: 'auth.requestUnknown' });
      if (response.status === 429) return { outcome: 'rejected', errorKey: 'errors.rateLimit' };
      if (response.status >= 500) return settle({ outcome: 'unknown', errorKey: 'auth.requestUnknown' });
      const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (mediaType !== 'application/json' && mediaType !== 'application/vnd.mf+json') return settle({ outcome: response.ok ? 'unknown' : 'rejected', errorKey: response.ok ? 'auth.requestUnknown' : 'auth.requestRejected' });
      const body: unknown = await response.json();
      if (controller.signal.aborted) return settle({ outcome: 'unknown', errorKey: 'auth.requestUnknown' });
      if (!body || typeof body !== 'object' || Array.isArray(body)) return settle({ outcome: 'unknown', errorKey: 'auth.requestUnknown' });
      const envelope = body as Record<string, unknown>;
      const code = typeof envelope.code === 'number' && Number.isSafeInteger(envelope.code) || typeof envelope.code === 'string' && /^\d{3}$/.test(envelope.code) ? Number(envelope.code) : null;
      const flag = envelope.error;
      const rejected = !response.ok || (flag !== undefined && flag !== false && flag !== 0 && flag !== '0') || code !== null && code >= 400 || envelope.success === false || envelope.success === 0 || envelope.success === '0' || typeof envelope.message === 'string' && /^error$/i.test(envelope.message.trim());
      const rawMessage = typeof envelope.data === 'string' ? envelope.data : typeof envelope.message === 'string' ? envelope.message : '';
      // Decode once so an encoded password containing angle brackets remains
      // intact until the second redaction, rather than becoming parsed markup.
      const plainMessage = literalHtmlText(fields.password ? rawMessage.split(fields.password).join('••••') : rawMessage);
      const message = (fields.password ? plainMessage.split(fields.password).join('••••') : plainMessage).slice(0, 600);
      const meaningfulMessage = message && !/^(?:ok|error|success)$/i.test(message.trim()) ? message : undefined;
      if (code !== null && code >= 500) return settle({ outcome: 'unknown', errorKey: 'auth.requestUnknown' });
      if (rejected) return { outcome: 'rejected', errorKey: meaningfulMessage ? undefined : 'auth.requestRejected', message: meaningfulMessage };
      // An HTTP 200 without an explicit successful envelope is not proof of creation.
      if (code !== 200 || flag !== false && flag !== 0 && flag !== '0' || typeof envelope.message !== 'string' || !/^ok$/i.test(envelope.message.trim()) || envelope.data !== undefined && typeof envelope.data !== 'string') return settle({ outcome: 'unknown', errorKey: 'auth.requestUnknown' });
      return settle({ outcome: 'accepted', message: meaningfulMessage });
    } catch {
      const knownRejected = responseStatus !== null && responseStatus >= 400 && responseStatus < 500;
      return settle({ outcome: dispatched && !knownRejected ? 'unknown' : 'rejected', errorKey: knownRejected ? 'auth.requestRejected' : dispatched ? 'auth.requestUnknown' : 'errors.network' });
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); pending = false; }
  };
  return {
    register: (input: RegistrationInput, language: Language, signal?: AbortSignal): Promise<PublicAuthResult> => {
      const errorKey = registrationError(input);
      if (errorKey) return Promise.resolve({ outcome: 'rejected', errorKey });
      if (input.region && input.region.language !== language) return Promise.resolve({ outcome: 'rejected', errorKey: 'onboarding.required' });
      return request('register', { first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email.trim(), password: input.password, ...(input.region ? { countryId: input.region.countryId, languageId: input.region.languageId } : {}) }, language, signal);
    },
    restore: (email: string, language: Language, signal?: AbortSignal): Promise<PublicAuthResult> => validAuthEmail(email) ? request('restore', { email: email.trim() }, language, signal) : Promise.resolve({ outcome: 'rejected', errorKey: 'auth.invalidEmail' }),
  };
}
