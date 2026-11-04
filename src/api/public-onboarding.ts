import { API_ACCEPT, API_ORIGIN } from './client.ts';
import { isLanguage, type Language } from '../i18n/core.ts';
import { literalHtmlText } from '../domain/server-text.ts';

export type OnboardingLanguage = { id: string; title: string; code: string };
export type OnboardingCountry = { id: string; title: string; code: string; defaultLanguageId: string; languages: OnboardingLanguage[] };
export type OnboardingCatalog = { version: 1; registrationRegion: true; countries: OnboardingCountry[] };
export type RegistrationRegion = { countryId: string; languageId: string; language: Language };
export type DeviceLocale = { regionCode: string | null; languageCode: string | null };
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('onboarding.unavailable'); return value as Record<string, unknown>; };
const id = (value: unknown) => { if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) throw new Error('onboarding.unavailable'); return value; };
const title = (value: unknown) => { if (typeof value !== 'string' || value.length > 250) throw new Error('onboarding.unavailable'); const text = literalHtmlText(value).trim(); if (!text) throw new Error('onboarding.unavailable'); return text; };
export function onboardingCatalog(value: unknown): OnboardingCatalog {
  const row = object(value);
  if (row.version !== 1 || row.registrationRegion !== true || !Array.isArray(row.countries) || !row.countries.length || row.countries.length > 250) throw new Error('onboarding.unavailable');
  const countries = row.countries.map(value => {
    const country = object(value);
    if (typeof country.code !== 'string' || !/^[A-Z]{2}$/.test(country.code) || !Array.isArray(country.languages) || !country.languages.length || country.languages.length > 100) throw new Error('onboarding.unavailable');
    const languages = country.languages.map(value => { const language = object(value); if (typeof language.code !== 'string' || !/^[a-z]{2,3}$/.test(language.code)) throw new Error('onboarding.unavailable'); return { id: id(language.id), title: title(language.title), code: language.code }; });
    const defaultLanguageId = id(country.defaultLanguageId);
    if (new Set(languages.map(language => language.id)).size !== languages.length || new Set(languages.map(language => language.code)).size !== languages.length || !languages.some(language => language.id === defaultLanguageId)) throw new Error('onboarding.unavailable');
    return { id: id(country.id), title: title(country.title), code: country.code, defaultLanguageId, languages };
  });
  if (new Set(countries.map(country => country.id)).size !== countries.length || new Set(countries.map(country => country.code)).size !== countries.length) throw new Error('onboarding.unavailable');
  return { version: 1, registrationRegion: true, countries };
}
/** Region guesses are an editable OS preference, never GPS or IP evidence. An
 * unsupported device country stays unselected instead of inventing a market. */
export function initialOnboardingSelection(catalog: OnboardingCatalog, locales: DeviceLocale[], interfaceLanguage: Language, previous?: { countryId: string; languageId: string } | null): { countryId: string; languageId: string } {
  const country = catalog.countries.find(country => country.id === previous?.countryId) || locales.map(locale => catalog.countries.find(country => country.code === locale.regionCode?.toUpperCase())).find(Boolean);
  if (!country) return { countryId: '', languageId: '' };
  const language = country.languages.find(language => language.id === previous?.languageId) || locales.map(locale => country.languages.find(language => language.code === locale.languageCode?.trim().toLowerCase().split(/[-_]/)[0])).find(Boolean) || country.languages.find(language => language.code === interfaceLanguage) || country.languages.find(language => language.id === country.defaultLanguageId)!;
  return { countryId: country.id, languageId: language.id };
}
export function confirmedRegistrationRegion(catalog: OnboardingCatalog | null, countryId: string, languageId: string): RegistrationRegion | null {
  const selected = catalog?.countries.find(country => country.id === countryId)?.languages.find(language => language.id === languageId);
  return selected && isLanguage(selected.code) ? { countryId, languageId, language: selected.code } : null;
}
export async function readPublicOnboarding(fetcher: typeof fetch, language: Language, signal?: AbortSignal): Promise<OnboardingCatalog> {
  const controller = new AbortController(); const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    if (signal?.aborted) throw new Error('onboarding.unavailable');
    const response = await fetcher(`${API_ORIGIN}/api/onboarding`, { method: 'GET', headers: { Accept: API_ACCEPT, 'Accept-Language': language, 'Cache-Control': 'no-store' }, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal });
    if (controller.signal.aborted || !response.ok || response.url && response.url !== `${API_ORIGIN}/api/onboarding` || !/^application\/(?:json|vnd\.mf\+json)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('onboarding.unavailable');
    const row = object(await response.json());
    if (controller.signal.aborted || row.error !== false || row.code !== 200 || row.message !== 'Ok') throw new Error('onboarding.unavailable');
    return onboardingCatalog(row.data);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
