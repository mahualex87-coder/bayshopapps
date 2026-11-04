import type { AddressFormats } from './account-operations.ts';
import { recipientBasicFields, recipientCompanyFields, recipientIdentityFields, recipientScanFields, type RecipientField, type RecipientInput } from './recipient-fields.ts';

export type RecipientCountryRule = { labels: Partial<Record<RecipientField, string>>; zipMask: string | null; addressAlphabet: 'latin' | 'cyrillic' | null; postalCodeRequired: boolean; regionRequired: boolean };

/** Match the web form's disabled-field behavior. An explicit empty server list
 * means no identity fields; absent metadata retains the legacy editable fields. */
export function visibleRecipientFields(input: RecipientInput, formats: AddressFormats): Set<RecipientField> {
  const legal = input.isLegal === '1';
  const visible = new Set<RecipientField>(recipientBasicFields.filter(key => legal ? !['shipping_first_name','shipping_last_name'].includes(key) : key !== 'shipping_company_name'));
  if (!input.countryId) return visible;
  const required = formats.requiredFields?.[input.countryId]?.[legal ? 'company' : 'person'];
  for (const key of legal ? recipientCompanyFields : recipientIdentityFields) {
    if (key !== 'shipping_middle_name' && (!required || required.includes(key))) visible.add(key);
  }
  if (!legal && (!required || required.includes('scans'))) recipientScanFields.forEach(key => visible.add(key));
  if (!legal && required) for (const key of recipientScanFields) if (required.includes(key)) visible.add(key);
  return visible;
}

export function changeRecipientScope(input: RecipientInput, formats: AddressFormats, change: { countryId: string } | { isLegal: '0' | '1' }): RecipientInput {
  const next = { ...input, ...change };
  if ('countryId' in change && change.countryId !== input.countryId) {
    next.regionId = ''; next.cityId = ''; next.shipping_city = ''; next.shipping_zip = '';
    next.shipping_phone_code = formats.phoneCodes.find(phone => phone.countryId === change.countryId)?.code || '';
  }
  const visible = visibleRecipientFields(next, formats);
  for (const key of [...recipientIdentityFields, ...recipientCompanyFields, ...recipientScanFields]) if (!visible.has(key)) next[key] = '';
  return next;
}

export function recipientFieldLabel(formats: AddressFormats, countryId: string, key: RecipientField): string | null {
  return formats.countryRules?.[countryId]?.labels[key] || null;
}

export function recipientRegions(formats: AddressFormats, countryId: string) {
  const options = formats.regions.filter(region => region.countryId === countryId);
  const required = !!formats.countryRules?.[countryId]?.regionRequired;
  return { options, required, unavailable: required && options.length === 0 };
}

export function changeRecipientRegion(input: RecipientInput, regionId: string): RecipientInput {
  return regionId === input.regionId ? input : { ...input, regionId, cityId: '', shipping_city: '', shipping_zip: '' };
}

export function changeRecipientCity(input: RecipientInput, city: { id: string; title: string }): RecipientInput {
  return city.id === input.cityId && city.title === input.shipping_city ? input : { ...input, cityId: city.id, shipping_city: city.title, shipping_zip: '' };
}
