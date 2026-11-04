import { resolveCountryCode } from '../components/country-code.ts';
import { countryDisplayName } from './presentation-labels.ts';
import type { Language } from '../i18n/core.ts';

export const COUNTRY_ORDER = ['US', 'RO', 'GB', 'IT', 'DE', 'PL'] as const;
export const CURRENCY_ORDER = ['USD', 'EUR', 'RON', 'GBP'] as const;
type CountryIdentity = { code?: string | null; name?: string | null; id?: string | null; placeholder?: boolean };
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const rank = (code: string, priority: readonly string[]) => { const found = priority.indexOf(code); return found < 0 ? priority.length : found; };

/** Presentation copies only: exact IDs, labels, amounts and eligible options
 * survive unchanged. ISO ordering does not depend on the selected language. */
export function sortCountries<T>(items: readonly T[], identify: (item: T) => CountryIdentity): T[] {
  return items.map((item, index) => {
    const identity = identify(item);
    return { item, index, identity, code: resolveCountryCode(identity.code, identity.name) };
  }).sort((a, b) => Number(!!b.identity.placeholder) - Number(!!a.identity.placeholder)
    || rank(a.code || '~', COUNTRY_ORDER) - rank(b.code || '~', COUNTRY_ORDER)
    || compare(a.code || '~', b.code || '~')
    || compare(a.identity.id || '', b.identity.id || '')
    || a.index - b.index).map(value => value.item);
}

export function sortCountryOptions<T extends { id: string; title: string; code?: string | null; countryCode?: string | null }>(items: readonly T[]): T[] {
  return sortCountries(items, item => ({
    code: item.countryCode || item.code || (/^[A-Za-z]{2}$/.test(item.id) ? item.id : null),
    name: item.title, id: item.id, placeholder: item.id === 'all' || item.id === '',
  }));
}

export function localizeCountryOptions<T extends { id: string; title: string; code?: string | null; countryCode?: string | null }>(items: readonly T[], language: Language): T[] {
  return items.map(item => item.id === 'all' || item.id === '' ? item : ({ ...item, title: countryDisplayName(item.countryCode || item.code || (/^[A-Za-z]{2}$/.test(item.id) ? item.id : null), item.title, language) }));
}

/** Apply only to money summaries, selectors and legends, never transaction or
 * declaration row chronology. Unknown currencies remain after the four main ones. */
export function sortCurrencies<T>(items: readonly T[], currency: (item: T) => string | null | undefined): T[] {
  return items.map((item, index) => ({ item, index, code: currency(item)?.trim().toUpperCase() || '~' }))
    .sort((a, b) => rank(a.code, CURRENCY_ORDER) - rank(b.code, CURRENCY_ORDER) || compare(a.code, b.code) || a.index - b.index)
    .map(value => value.item);
}
