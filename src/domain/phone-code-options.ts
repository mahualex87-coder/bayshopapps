import type { AddressFormats } from '../api/account-operations.ts';
import type { Language } from '../i18n/core.ts';
import { resolveCountryCode } from '../components/country-code.ts';
import { countryDisplayName } from './presentation-labels.ts';
import { sortCountries } from './option-order.ts';

export type PhoneCodeOption = { id: string; countryId: string; countryCode: string | null; title: string; callingCode: string; searchText: string };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
export function phoneCodeOptions(formats: AddressFormats, language: Language): PhoneCodeOption[] {
  const seen = new Set<string>();
  const rows = formats.phoneCodes.flatMap(phone => {
    if (!phone.code || !/^\+?\d{1,5}$/.test(phone.code)) return [];
    const country = formats.countries.find(option => option.id === phone.countryId);
    const countryCode = resolveCountryCode(country?.code, country?.title || phone.title);
    const title = countryDisplayName(countryCode, country?.title || phone.title, language);
    const key = `${phone.countryId || countryCode || phone.id}:${phone.code}`;
    if (seen.has(key)) return []; seen.add(key);
    return [{ id: key, countryId: phone.countryId || '', countryCode, title, callingCode: phone.code, searchText: normalize([title, country?.title, phone.title, phone.code].join(' ')) }];
  });
  return sortCountries(rows, row => ({ code: row.countryCode, name: row.title, id: row.id }));
}
export function searchPhoneCodes(options: PhoneCodeOption[], search: string): PhoneCodeOption[] {
  const query = normalize(search);
  if (!query) return options;
  const digits = query.replace(/[+ ()-]/g, '');
  return options.filter(option => option.searchText.includes(query) || /^\d+$/.test(digits) && option.callingCode.replace(/\D/g, '').includes(digits));
}
