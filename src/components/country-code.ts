import { countryCodes, countryNames } from './country-flags/names.ts';

const codes = new Set(countryCodes);
const aliases: Readonly<Record<string, string>> = { UK: 'GB', USA: 'US' };
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim();

/** Presentation only: never translates server text, changes IDs, or guesses from substrings. */
export function resolveCountryCode(code?: string | null, name?: string | null): string | null {
  const explicit = code?.trim().toUpperCase();
  if (explicit && codes.has(aliases[explicit] || explicit)) return aliases[explicit] || explicit;
  const text = name?.trim();
  if (!text) return null;
  const nameCode = aliases[text.toUpperCase()] || text.toUpperCase();
  return codes.has(nameCode) ? nameCode : countryNames[normalized(text)] || null;
}
