import { telegramBotLinks } from './telegram-link.ts';
import { recipientRegions, visibleRecipientFields, type RecipientCountryRule } from './recipient-rules.ts';
import { recipientFields, recipientBasicFields, recipientIdentityFields, recipientCompanyFields, recipientScanFields, recipientScanPath, validRecipientDate, type RecipientField, type RecipientInput, type RecipientScan } from './recipient-fields.ts';
import { parseDisplayDate } from '../i18n/core.ts';
import { API_ORIGIN } from './client.ts';
import { newsImages, type NewsImage } from '../domain/news-images.ts';
import { serverText } from '../domain/server-text.ts';
import { ApiContractError } from './normalize.ts';
import { normalizeCarrierLogo } from './carrier-assets.ts';
import type { OperationFields } from './operations-contracts.ts';

export { recipientFields, emptyRecipient, type RecipientField, type RecipientInput } from './recipient-fields.ts';

type Row = Record<string, unknown>;
export type ServerOption = { id: string; title: string; countryId?: string; regionId?: string; code?: string };
export const record = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError('detaliile contului');
  return value as Row;
};
export const stringValue = (value: unknown): string => value === null || value === undefined ? '' : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const array = (value: unknown): unknown[] => { if (!Array.isArray(value)) throw new ApiContractError('opțiunile contului'); return value; };
const id = (value: unknown): string => { const valueId = stringValue(value); if (!/^\d+$/.test(valueId)) throw new ApiContractError('identificator'); return valueId; };
function requiredDecimal(value: unknown, resource: string): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) throw new ApiContractError(resource);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ApiContractError(resource);
  return parsed;
}
export function serverOptions(value: unknown): ServerOption[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(entry => { const row = record(entry); return { id: id(row.id), title: stringValue(row.title ?? row.name), countryId: stringValue(row.countryId), regionId: stringValue(row.regionId), code: stringValue(row.code) }; });
  return Object.entries(record(value)).map(([key, entry]) => typeof entry === 'string' ? { id: id(key), title: entry } : { ...serverOptions([entry])[0] });
}
export const plainServerText = serverText;
export type ProfileFormData = { name: string; surname: string; phone: string; phoneCode: string; countryId: string; countries: ServerOption[] };
export function profileFormData(raw: unknown): ProfileFormData {
  const row = record(raw);
  return { name: stringValue(row.name), surname: stringValue(row.surname), phone: stringValue(row.phone), phoneCode: stringValue(row.phoneCode), countryId: id(row.countryId), countries: serverOptions(row.countries) };
}
export type AddressFormats = { countryRules?: Record<string, RecipientCountryRule> | null; countries: ServerOption[]; regions: ServerOption[]; cities: ServerOption[]; phoneCodes: ServerOption[]; passportCountries?: ServerOption[] | null; requiredFields?: Record<string, { person: string[]; company: string[] }> | null };
export function addressFormats(raw: unknown): AddressFormats {
  const row = record(raw);
  const regions = row.regionsList ? serverOptions(row.regionsList) : Object.entries(record(row.regions ?? {})).flatMap(([countryId, entries]) => serverOptions(entries).map(option => ({ ...option, countryId })));
  const phones = row.maskFormatsList ? serverOptions(row.maskFormatsList) : Object.values(record(row.maskFormatsAll ?? {})).flatMap(entries => serverOptions(entries));
  const requiredFields = row.recipientRequiredFields == null ? null : Object.fromEntries(Object.entries(record(row.recipientRequiredFields)).map(([countryId, value]) => {
    const group = record(value);
    for (const key of ['person', 'company']) if (!Array.isArray(group[key]) || (group[key] as unknown[]).some(field => typeof field !== 'string' || field !== 'scans' && !recipientFields.includes(field as RecipientField))) throw new ApiContractError('câmpurile destinatarului');
    return [countryId, group as { person: string[]; company: string[] }];
  }));
  const countryRules = row.recipientCountryRules == null ? null : Object.fromEntries(Object.entries(record(row.recipientCountryRules)).map(([countryId, value]) => {
    const rule = record(value);
    if (!/^\d+$/.test(countryId) || typeof rule.postalCodeRequired !== 'boolean' || typeof rule.regionRequired !== 'boolean' || ![null, 'latin', 'cyrillic'].includes(rule.addressAlphabet as never) || rule.zipMask !== null && (typeof rule.zipMask !== 'string' || rule.zipMask.length > 80)) throw new ApiContractError('regulile adresei');
    const labels: RecipientCountryRule['labels'] = {};
    for (const [key, value] of Object.entries(record(rule.labels))) {
      if (key === 'shipping_middle_name' || key !== 'scans' && !recipientFields.includes(key as RecipientField)) continue;
      if (typeof value !== 'string' || value.length > 500) throw new ApiContractError('denumirile adresei');
      const label = serverText(value).trim(); if (label) labels[key as RecipientField | 'scans'] = label;
    }
    return [countryId, { labels, zipMask: rule.zipMask === null ? null : serverText(rule.zipMask), addressAlphabet: rule.addressAlphabet as RecipientCountryRule['addressAlphabet'], postalCodeRequired: rule.postalCodeRequired, regionRequired: rule.regionRequired }];
  }));
  return { countryRules, countries: serverOptions(row.countries ?? row.countriesList), regions, cities: serverOptions(row.citiesList), phoneCodes: phones, passportCountries: row.passportCountries == null ? null : serverOptions(row.passportCountries), requiredFields };
}
// ShippingAddress marks email and patronymic optional. MemberAddress.update
// changes only supplied columns, so omitting hidden fields preserves them.
export function recipientDetail(raw: unknown): { fields: RecipientInput; formats: AddressFormats } {
  const data = record(raw); const address = record(data.address);
  return { fields: Object.fromEntries(recipientFields.map(key => [key, stringValue(address[key])])) as RecipientInput, formats: addressFormats(data) };
}
export function validateRecipient(input: RecipientInput, formats: AddressFormats, legalConfirmed: boolean, options: { initial?: RecipientInput; stagedScans?: Partial<Record<RecipientScan, boolean>> } = {}): { fields: OperationFields; errors: Partial<Record<RecipientField | 'agree', string>> } {
  const errors: Partial<Record<RecipientField | 'agree', string>> = {};
  const visible = visibleRecipientFields(input, formats);
  const fields: OperationFields = Object.fromEntries([...recipientBasicFields, ...recipientIdentityFields, ...recipientCompanyFields].filter(key => visible.has(key) && !['shipping_middle_name', 'passportBirthDate', 'passportIssued', 'passportIssuedCountryId'].includes(key)).map(key => [key, input[key]]));
  for (const key of ['passportBirthDate', 'passportIssued'] as const) {
    if (!visible.has(key)) continue;
    if (!input[key]) { if (options.initial?.[key]) errors[key] = 'recipientDetails.dateCannotClear'; }
    else if (validRecipientDate(input[key])) fields[key] = input[key];
    else if (input[key] !== options.initial?.[key]) errors[key] = 'recipientDetails.invalidDate';
  }
  if (visible.has('passportIssuedCountryId') && input.passportIssuedCountryId) {
    if (!/^\d+$/.test(input.passportIssuedCountryId)) errors.passportIssuedCountryId = 'accountOps.selectCountry';
    else if (formats.passportCountries && input.passportIssuedCountryId !== options.initial?.passportIssuedCountryId && !formats.passportCountries.some(country => country.id === input.passportIssuedCountryId)) errors.passportIssuedCountryId = 'accountOps.selectCountry';
    else fields.passportIssuedCountryId = input.passportIssuedCountryId;
  } else if (visible.has('passportIssuedCountryId') && options.initial?.passportIssuedCountryId) errors.passportIssuedCountryId = 'accountOps.selectCountry';
  for (const key of recipientScanFields) {
    if (!visible.has(key)) continue;
    const path = recipientScanPath(input[key]);
    if (path === null) errors[key] = 'recipientDetails.invalidRetainedScan';
    else if (path || options.initial?.[key]) fields[key] = path;
  }
  for (const key of formats.requiredFields?.[input.countryId]?.[input.isLegal === '1' ? 'company' : 'person'] || []) {
    if (key === 'scans') { if (!input.scan1 && !options.stagedScans?.scan1) errors.scan1 = 'recipientDetails.firstScanRequired'; }
    else if (key === 'scan1' || key === 'scan2') { if (!input[key] && !options.stagedScans?.[key]) errors[key] = 'accountOps.required'; }
    else if (key !== 'shipping_middle_name' && recipientFields.includes(key as RecipientField) && !input[key as RecipientField].trim()) errors[key as RecipientField] = 'accountOps.required';
  }
  const required: RecipientField[] = ['countryId', 'shipping_address', 'shipping_city', 'shipping_phone_code', 'shipping_phone'];
  if (formats.countryRules?.[input.countryId]?.postalCodeRequired) required.push('shipping_zip');
  required.push(...(input.isLegal === '1' ? ['shipping_company_name'] : ['shipping_first_name', 'shipping_last_name']) as RecipientField[]);
  for (const key of required) if (!input[key].trim()) errors[key] = 'accountOps.required';
  if (!formats.countries.some(country => country.id === input.countryId)) errors.countryId = 'accountOps.selectCountry';
  if (!input.regionId && formats.countryRules?.[input.countryId]?.regionRequired) errors.regionId = 'accountOps.selectRegion';
  if (input.regionId && !formats.regions.some(region => region.id === input.regionId && (!region.countryId || region.countryId === input.countryId))) errors.regionId = 'accountOps.selectRegion';
  if (recipientRegions(formats, input.countryId).unavailable) errors.regionId = 'recipientDetails.regionUnavailable';
  if (input.cityId && !formats.cities.some(city => city.id === input.cityId && (!city.countryId || city.countryId === input.countryId) && (!city.regionId || city.regionId === input.regionId))) errors.cityId = 'accountOps.selectCity';
  if (!/^\+?\d{1,5}$/.test(input.shipping_phone_code)) errors.shipping_phone_code = 'accountOps.invalidPhoneCode';
  if (!/^[\d ()-]+$/.test(input.shipping_phone) || input.shipping_phone.replace(/\D/g, '').length < 4) errors.shipping_phone = 'accountOps.invalidPhone';
  if (input.isLegal === '1') { if (!legalConfirmed) errors.agree = 'recipientDetails.confirmImportRules'; else fields.agree = '1'; }
  return { fields, errors };
}
export const preferenceKeys = ['alertOnSystem', 'obtainSms', 'obtainGcm', 'obtainMails', 'obtainViber', 'obtainTelegram'] as const;
export type Preferences = { values: Record<typeof preferenceKeys[number], boolean> & { obtainMass: boolean | null }; hasTelegram: boolean; telegramBotLink: string | null };
export function preferencesData(raw: unknown): Preferences {
  const row = record(raw);
  const flag = (key: string) => { if (![true, false, '0', '1', 0, 1].includes(row[key] as never)) throw new ApiContractError('preferințe'); return row[key] === true || row[key] === '1' || row[key] === 1; };
  return { values: { ...Object.fromEntries(preferenceKeys.map(key => [key, flag(key)])), obtainMass: row.obtainMass == null ? null : flag('obtainMass') } as Preferences['values'], hasTelegram: flag('hasTelegram'), telegramBotLink: telegramBotLinks(row.telegramBotLink)?.https ?? null };
}
export type CalculatorOptions = { storages: (ServerOption & { activeCountries: string[] })[]; countries: ServerOption[]; weights: ServerOption[]; sizes: ServerOption[] };
export function calculatorOptions(raw: unknown): CalculatorOptions {
  const row = record(raw); const units = record(row.units);
  const options = (input: unknown) => Object.entries(record(input)).map(([key, value]) => ({ id: key, title: stringValue(value) }));
  return { storages: array(row.storageList).map(value => { const entry = record(value); return { ...serverOptions([entry])[0], activeCountries: array(entry.activeCountries).map(id) }; }), countries: serverOptions(row.countriesList), weights: options(units.weight), sizes: options(units.size) };
}
export type CalculatorQuote = { id: string; title: string; logoUrl?: string | null; amount: number | null; exceeded: boolean; currency: string; duration: string; description: string };
function calculatorFlag(value: unknown): boolean {
  if (value == null || value === false || value === 0 || value === '0') return false;
  if (value === true || value === 1 || value === '1') return true;
  throw new ApiContractError('disponibilitatea transportului');
}
export function calculatorQuotes(raw: unknown): CalculatorQuote[] {
  return array(record(raw).shippers).flatMap(value => {
    const row = record(value);
    // The server already resolves personal visibility; the public calculator
    // skips isHidden=1. Active methods are selected by the server's SQL query.
    if (calculatorFlag(row.isHidden)) return [];
    // Rows_WpShipper intentionally returns null price for exceeded weight.
    // This is unavailable service, not free delivery or a broken whole response.
    const exceeded = calculatorFlag(row.isExceeded);
    const amount = exceeded ? null : requiredDecimal(row.price, 'tariful transportului');
    const code = stringValue(row.currency).toUpperCase();
    if (amount !== null && amount < 0 || !/^[A-Z]{3}$/.test(code)) throw new ApiContractError('tariful transportului');
    return [{ id: id(row.id ?? row.shipperId), title: stringValue(row.title), ...(row.flag === undefined ? {} : { logoUrl: normalizeCarrierLogo(row.flag) }), amount, exceeded, currency: code, duration: plainServerText(row.time), description: plainServerText(row.description) }];
  });
}
export type ServerNews = { id: string; title: string; body: string; date: string; important: boolean; images: NewsImage[] };
export function newsData(raw: unknown): ServerNews[] {
  return array(raw).map(value => { const row = record(value); return { id: id(row.id), title: plainServerText(row.title), body: plainServerText(row.body), date: stringValue(row.time), important: row.isImportant === '1' || row.isImportant === true, images: newsImages(row, API_ORIGIN) }; });
}
export type PaymentView = { invoices: { id:string; reference:string; currency:string; amount:number; description:string; date:string }[]; methods: { id:string; title:string; description:string; currencies:string[] }[] };
export function paymentView(raw:unknown):PaymentView {
  const data=record(raw);
  return { invoices:array(data.unpaidInvoices).flatMap(value=>{const group=record(value);const currency=stringValue(group.currency).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new ApiContractError('moneda facturii');return array(group.list).map(value=>{const row=record(value);const amount=requiredDecimal(row.summ,'valoarea facturii');return{id:id(row.id),reference:stringValue(row.trid),currency,amount,description:plainServerText(row.comment),date:stringValue(row.created??row.ceated)};});}),methods:Object.entries(record(data.paymentTypes)).map(([key,value])=>{const row=record(value);return{id:key,title:plainServerText(row.name),description:plainServerText(row.description),currencies:array(row.availableCurrency).map(value=>stringValue(value).toUpperCase())};}) };
}
export type LoyaltyValidity = { validityKind: 'remaining' | 'configured' | 'none' | 'unknown'; serverNow: string; expiresAt: string | null; remainingDays: number | null; configuredDurationDays: number | null };
export type LoyaltyTier = { id: string; shipperId: string; level: number | null; threshold: number | null; rate: number | null; durationDays: number | null; remainingPoints: number | null; discount: number | null; priceType: string | null };
export type LoyaltySpecialPrice = { validity?: LoyaltyValidity | null; shipperId: string; rate: number | null; durationDays: number | null; discount: number | null; selected: boolean | null; fixedTime: string | number | boolean | null; priceType: string | null };
export type LoyaltyProgram = { currentValidity?: LoyaltyValidity | null; id: string; title: string; countryCode: string; destination: string | null; iconUrl: string | null; currency: string | null; discount: number; points: number | null; currentLevel: number | null; levels: LoyaltyTier[] | null; specialPrice: LoyaltySpecialPrice | null };
function loyaltyNumber(value: unknown, integer = false, percentage = false): number | null {
  if (value == null) return null;
  const result = requiredDecimal(value, 'programul de fidelitate');
  if (result < 0 || integer && !Number.isSafeInteger(result) || percentage && result > 100) throw new ApiContractError('programul de fidelitate');
  return result;
}
function loyaltyText(value: unknown): string | null { if (value == null || value === '') return null; if (typeof value !== 'string') throw new ApiContractError('programul de fidelitate'); return value; }
/** Additive expiry metadata must never hide otherwise valid account benefits.
 * Legacy timeLimit remains a reported period, never an inferred expiry date. */
function loyaltyValidity(raw: unknown): LoyaltyValidity | null {
  if (raw == null) return null;
  try {
    const value = record(raw);
    if (!['remaining', 'configured', 'none', 'unknown'].includes(value.validityKind as string)) return null;
    const serverNow = loyaltyText(value.serverNow);
    const expiresAt = loyaltyText(value.expiresAt);
    const now = serverNow && parseDisplayDate(serverNow);
    const end = expiresAt && parseDisplayDate(expiresAt);
    if (!now || now.wallClock || expiresAt && (!end || end.wallClock)) return null;
    const remainingDays = loyaltyNumber(value.remainingDays, true);
    const configuredDurationDays = loyaltyNumber(value.configuredDurationDays, true);
    if (value.validityKind === 'remaining' && (!expiresAt || remainingDays === null)) return null;
    if (value.validityKind !== 'remaining' && (expiresAt !== null || remainingDays !== null)) return null;
    if (value.validityKind === 'configured' && configuredDurationDays === null) return null;
    return { validityKind: value.validityKind as LoyaltyValidity['validityKind'], serverNow: serverNow!, expiresAt, remainingDays, configuredDurationDays };
  } catch { return null; }
}
export function loyaltyData(raw: unknown): LoyaltyProgram[] {
  return array(raw).map(value => {
    const row = record(value); const discount = requiredDecimal(row.discountPercent, 'reducerea contului');
    if (discount < 0 || discount > 100) throw new ApiContractError('reducerea contului');
    const shipperId = id(row.shipperId);
    const levels = row.loyaltyLevels == null ? null : array(row.loyaltyLevels).map(value => {
      const tier = record(value); const tierShipper = id(tier.shipperId);
      if (tierShipper !== shipperId) throw new ApiContractError('nivelurile transportatorului');
      return { id: id(tier.id), shipperId: tierShipper, level: loyaltyNumber(tier.level, true), threshold: loyaltyNumber(tier.condition), rate: loyaltyNumber(tier.result), durationDays: loyaltyNumber(tier.timeLimit, true), remainingPoints: loyaltyNumber(tier.remainPoints), discount: loyaltyNumber(tier.discountPercent, false, true), priceType: loyaltyText(tier.loyaltyType) };
    });
    if (levels && new Set(levels.map(value => value.id)).size !== levels.length) throw new ApiContractError('nivelurile de fidelitate');
    let specialPrice: LoyaltySpecialPrice | null = null;
    if (row.specialPrice != null) {
      const special = record(row.specialPrice); const selected = special.selected;
      if (selected != null && ![true, false, 0, 1, '0', '1'].includes(selected as never)) throw new ApiContractError('prețul special');
      const fixedTime = special.fixedTime ?? null;
      if (fixedTime !== null && !['string', 'number', 'boolean'].includes(typeof fixedTime)) throw new ApiContractError('perioada prețului special');
      specialPrice = { ...(special.validity === undefined ? {} : { validity: loyaltyValidity(special.validity) }), shipperId: id(special.shipperId), rate: loyaltyNumber(special.result), durationDays: loyaltyNumber(special.timeLimit, true), discount: loyaltyNumber(special.discountPercent, false, true), selected: selected == null ? null : [true, 1, '1'].includes(selected as never), fixedTime: fixedTime as LoyaltySpecialPrice['fixedTime'], priceType: loyaltyText(special.priceType) };
      if (specialPrice.shipperId !== shipperId) throw new ApiContractError('prețul special al transportatorului');
    }
    const flagPath = loyaltyText(row.flag);
    let iconUrl: string | null = null;
    if (flagPath) { try { const url = new URL(flagPath.startsWith('/') && !flagPath.startsWith('//') ? `https://bayshop.com${flagPath}` : flagPath); if (url.protocol === 'https:' && !url.username && !url.password) iconUrl = url.href; } catch { /* An unavailable logo does not invalidate account rates. */ } }
    return { ...(row.currentValidity === undefined ? {} : { currentValidity: loyaltyValidity(row.currentValidity) }), id: shipperId, title: stringValue(row.title), countryCode: stringValue(row.countryCode), destination: loyaltyText(row.country), iconUrl, currency: loyaltyText(row.currencySign), discount, points: loyaltyNumber(row.loyaltyReceivedPoints), currentLevel: loyaltyNumber(row.currentLevel, true), levels, specialPrice };
  });
}
