import type { CalculatorOptions } from '../api/account-operations.ts';

/** Match the profile's country by its server ID and the selected warehouse's
 * allowed destinations. A missing/unsupported account country stays unselected. */
export function calculatorDefaultDestination(options: CalculatorOptions, storageId: string, accountCountryId?: string | null): string {
  if (!accountCountryId) return '';
  const storage = options.storages.find(value => value.id === storageId);
  return storage?.activeCountries.includes(accountCountryId) && options.countries.some(country => country.id === accountCountryId) ? accountCountryId : '';
}

/** Select a real US warehouse by its server code, never a hardcoded warehouse
 * number, translated label, locale, IP address or first country in a list. */
export function calculatorDefaults(options: CalculatorOptions, accountCountryId?: string | null): { storageId: string; countryId: string } {
  const knownCountries = new Set(options.countries.map(country => country.id));
  const available = options.storages.filter(storage => storage.activeCountries.some(country => knownCountries.has(country)));
  const storage = available.find(value => ['US', 'USA'].includes(value.code?.toUpperCase() || ''))
    ?? available.find(value => !!calculatorDefaultDestination(options, value.id, accountCountryId))
    ?? available[0];
  const storageId = storage?.id || '';
  return { storageId, countryId: calculatorDefaultDestination(options, storageId, accountCountryId) };
}
