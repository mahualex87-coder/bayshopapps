import { serverOptions, type ServerOption } from './account-operations.ts';
import { ApiContractError } from './normalize.ts';
import { MutationInputError, validatePickedFile, type PickedFile } from './mutations.ts';
import { normalizeLanguage, type Language } from '../i18n/core.ts';

export const settingCapabilities = ['passwordLogRedacted', 'birthdaySave', 'billingSave', 'identityDocumentsSave', 'accountLanguageSave', 'accountRegionSave', 'autoPackingPolicyPreserved'] as const;
export type SettingsCapability = typeof settingCapabilities[number];
export const billingFields = ['first_name', 'last_name', 'company_name', 'address1', 'city', 'state', 'email', 'phone', 'zip', 'country'] as const;
export type BillingInput = Record<typeof billingFields[number], string>;
export type AccountRegion = { countryId: string; languageId: string | null; countries: (ServerOption & { languages: ServerOption[] })[] };
export type AccountSettings = {
  capabilities: Record<SettingsCapability, boolean>;
  birthday: { value: string | null; editable: boolean };
  language: { id: string | null; options: ServerOption[] };
  region?: AccountRegion | null;
  billing: { fields: BillingInput; countries: ServerOption[] };
  identity: { revision: string; files: { id: string; url: string | null }[]; maxFiles: number; maxBytes: number; allowedMimeTypes: string[] };
};
export type PasswordChangeInput = { oldPassword: string; newPassword: string };
export type SettingsMutationCommand =
  | { kind: 'password.change'; input: PasswordChangeInput }
  | { kind: 'settings.birthday.save'; birthday: string }
  | { kind: 'settings.language.save'; languageId: string }
  | { kind: 'settings.region.save'; countryId: string; languageId: string }
  | { kind: 'settings.billing.save'; input: BillingInput }
  | { kind: 'settings.identity.save'; revision: string; retainedIds: string[]; files: PickedFile[] };

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError('setările contului');
  return value as Record<string, unknown>;
};
const flag = (value: unknown): boolean => {
  if (![true, false, 0, 1, '0', '1'].includes(value as never)) throw new ApiContractError('permisiunile setărilor');
  return value === true || value === 1 || value === '1';
};
const string = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw new ApiContractError('setările contului');
  return String(value);
};
const positiveInteger = (value: unknown): number => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw new ApiContractError('limitele documentelor');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new ApiContractError('limitele documentelor');
  return result;
};
export function validBirthday(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function normalizeAccountRegion(raw: unknown): AccountRegion {
  const row = object(raw);
  const countryId = string(row.countryId); const languageId = row.languageId == null || row.languageId === '' ? null : string(row.languageId);
  if (!/^[1-9]\d*$/.test(countryId) || languageId !== null && !/^[1-9]\d*$/.test(languageId) || !Array.isArray(row.countries)) throw new ApiContractError('țara și limba contului');
  const countries = row.countries.map(entry => {
    const country = object(entry); const option = serverOptions([country])[0];
    if (!option.title || !Array.isArray(country.languages)) throw new ApiContractError('opțiunile țării');
    return { ...option, languages: serverOptions(country.languages) };
  });
  return { countryId, languageId, countries };
}
/** The deployed legacy read is useful even before the paired-save capability
 * exists. Its languages belong only to the current country; do not invent
 * availability for another country. No legacy push token is fabricated. */
export function accountRegionFromPersonalData(raw: unknown): AccountRegion {
  const row = object(raw); const countryId = string(row.countryId);
  return normalizeAccountRegion({ countryId, languageId: row.languageId, countries: serverOptions(row.countries).map(country => ({ ...country, languages: country.id === countryId ? serverOptions(row.languages) : [] })) });
}
export function accountRegionLanguage(region: AccountRegion, countryId: string, previous: string): string {
  const available = region.countries.find(country => country.id === countryId)?.languages || [];
  return available.some(language => language.id === previous) ? previous : '';
}
/** Resolve only the code of the confirmed, country-scoped server option.
 * Numeric IDs and translated labels are not locale codes. */
export function accountRegionInterfaceLanguage(region: AccountRegion): Language | null {
  const language = region.countries.find(country => country.id === region.countryId)?.languages.find(option => option.id === region.languageId);
  return normalizeLanguage(language?.code);
}
export function normalizeAccountSettings(raw: unknown): AccountSettings {
  const row = object(raw); const capabilities = object(row.capabilities);
  const birthday = object(row.birthday); const language = object(row.language);
  const billing = object(row.billing); const fields = object(billing.fields); const identity = object(row.identity);
  if (typeof identity.revision !== 'string' || !/^[a-f0-9]{64}$/.test(identity.revision)) throw new ApiContractError('revizia documentelor');
  const value = birthday.value == null || birthday.value === '' ? null : birthday.value;
  if (value !== null && !validBirthday(value)) throw new ApiContractError('data nașterii');
  if (!Array.isArray(identity.files) || !Array.isArray(identity.allowedMimeTypes)) throw new ApiContractError('documentele contului');
  const files = identity.files.map(entry => {
    const file = object(entry); const id = string(file.id); const url = file.url === null ? null : string(file.url);
    if (!/^scan[1-3]$/.test(id)) throw new ApiContractError('documentul contului');
    // The API retains legacy document slots without exposing unsafe paths.
    // A null preview URL must not discard the whole account settings response.
    if (url === null) return { id, url };
    let parsed: URL; try { parsed = new URL(url); } catch { throw new ApiContractError('documentul contului'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || /[\x00-\x20\\]/.test(url)) throw new ApiContractError('documentul contului');
    return { id, url };
  });
  if (new Set(files.map(file => file.id)).size !== files.length) throw new ApiContractError('documentele contului');
  const allowedMimeTypes = identity.allowedMimeTypes.map(value => {
    if (typeof value !== 'string' || !['image/jpeg', 'image/png', 'application/pdf'].includes(value)) throw new ApiContractError('tipul documentului');
    return value;
  });
  return {
    capabilities: Object.fromEntries(settingCapabilities.map(key => [key, capabilities[key] === undefined ? false : flag(capabilities[key])])) as AccountSettings['capabilities'],
    birthday: { value, editable: flag(birthday.editable) && value === null },
    language: { id: language.id == null || language.id === '' ? null : string(language.id), options: serverOptions(language.options) },
    region: row.region == null ? null : normalizeAccountRegion(row.region),
    billing: { fields: Object.fromEntries(billingFields.map(key => [key, string(fields[key])])) as BillingInput, countries: serverOptions(billing.countries) },
    identity: { revision: identity.revision, files, maxFiles: positiveInteger(identity.maxFiles), maxBytes: positiveInteger(identity.maxBytes), allowedMimeTypes },
  };
}
export function passwordChangeFields(input: PasswordChangeInput): { old: string; new: string } {
  if (!input || Object.keys(input).some(key => !['oldPassword', 'newPassword'].includes(key))) throw new MutationInputError('errors.validation');
  for (const field of ['oldPassword', 'newPassword'] as const) {
    // PHP empty() rejects literal "0". No server minimum length is documented;
    // preserve exact bytes, including spaces, rather than silently trimming.
    if (typeof input[field] !== 'string' || input[field] === '' || input[field] === '0') throw new MutationInputError('errors.validation', { [field]: 'errors.fieldRequired' });
  }
  return { old: input.oldPassword, new: input.newPassword };
}
export function billingInputFields(input: BillingInput): BillingInput {
  if (!input || Object.keys(input).some(key => !(billingFields as readonly string[]).includes(key))) throw new MutationInputError('errors.validation');
  const fields = {} as BillingInput;
  for (const key of billingFields) {
    if (typeof input[key] !== 'string' || /[\x00\r\n]/.test(input[key])) throw new MutationInputError('errors.validation', { [key]: 'errors.invalidField' });
    fields[key] = input[key];
  }
  for (const key of ['first_name', 'last_name'] as const) if (fields[key].trim().length < 2 || fields[key].trim().length > 40) throw new MutationInputError('errors.validation', { [key]: 'errors.invalidField' });
  if (!/^[1-9]\d*$/.test(fields.country)) throw new MutationInputError('errors.validation', { country: 'accountOps.selectCountry' });
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new MutationInputError('errors.validation', { email: 'errors.invalidField' });
  if (fields.phone && fields.phone.length < 5) throw new MutationInputError('errors.validation', { phone: 'errors.invalidField' });
  return fields;
}
export function settingsCapabilityFor(command: SettingsMutationCommand): SettingsCapability {
  return ({ 'password.change': 'passwordLogRedacted', 'settings.birthday.save': 'birthdaySave', 'settings.language.save': 'accountLanguageSave', 'settings.region.save': 'accountRegionSave', 'settings.billing.save': 'billingSave', 'settings.identity.save': 'identityDocumentsSave' } as const)[command.kind];
}
export function validateSettingsMutation(command: SettingsMutationCommand, settings: AccountSettings): void {
  if (!settings.capabilities[settingsCapabilityFor(command)]) throw new MutationInputError('accountSettings.serverUpdateRequired');
  if (command.kind === 'settings.birthday.save' && (!settings.birthday.editable || !validBirthday(command.birthday))) throw new MutationInputError('accountSettings.birthdayLocked');
  if (command.kind === 'settings.language.save' && !settings.language.options.some(option => option.id === command.languageId)) throw new MutationInputError('errors.validation', { languageId: 'errors.invalidField' });
  if (command.kind === 'settings.region.save') {
    const country = settings.region?.countries.find(option => option.id === command.countryId);
    if (!country) throw new MutationInputError('errors.validation', { countryId: 'accountOps.selectCountry' });
    if (!country.languages.some(option => option.id === command.languageId)) throw new MutationInputError('errors.validation', { languageId: 'errors.invalidField' });
  }
  if (command.kind === 'settings.billing.save' && !settings.billing.countries.some(option => option.id === command.input.country)) throw new MutationInputError('errors.validation', { country: 'accountOps.selectCountry' });
  if (command.kind === 'settings.identity.save') {
    if (command.revision !== settings.identity.revision) throw new MutationInputError('accountSettings.documentsChanged');
    if (!Array.isArray(command.retainedIds) || new Set(command.retainedIds).size !== command.retainedIds.length || command.retainedIds.some(id => !settings.identity.files.some(file => file.id === id)) || !Array.isArray(command.files) || command.retainedIds.length + command.files.length > settings.identity.maxFiles) throw new MutationInputError('errors.fileInvalid');
    for (const file of command.files) {
      validatePickedFile(file);
      if (!file.mimeType || !settings.identity.allowedMimeTypes.includes(file.mimeType) || file.size === undefined || file.size > settings.identity.maxBytes) throw new MutationInputError('errors.fileInvalid');
    }
  }
}
