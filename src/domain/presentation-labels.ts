import { resolveCountryCode } from '../components/country-code.ts';
import { countryLabels } from '../components/country-flags/labels.ts';
import type { Language } from '../i18n/core.ts';

/** Presentation only. Server IDs, postal address values and API writes remain exact. */
export function countryDisplayName(code: string | null | undefined, fallback: string, language: Language): string {
  const iso = resolveCountryCode(code, fallback);
  return iso && countryLabels[iso]?.[language] || fallback;
}

/** Translate a standalone country label, never a complete postal address,
 * depot nickname, customer text or a sentence containing a country name. */
export function standaloneCountryLabel(label: string, language: Language, code?: string | null): string {
  const labelCode = resolveCountryCode(null, label);
  const expectedCode = resolveCountryCode(code, label);
  return labelCode && labelCode === expectedCode ? countryDisplayName(labelCode, label, language) : label;
}

export function currencyDisplayLabel(value: string | null | undefined): string {
  // The same field can contain a localized fallback before a depot is chosen.
  // Capitalize currency codes, never that explanatory sentence.
  return value && /^[a-z]{3}$/i.test(value.trim()) ? value.toUpperCase() : value || '';
}
