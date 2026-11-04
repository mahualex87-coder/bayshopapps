import { API_ORIGIN } from './client.ts';

export const recipientBasicFields = ['shipping_first_name', 'shipping_last_name', 'shipping_company_name', 'shipping_address', 'shipping_city', 'shipping_zip', 'shipping_phone_code', 'shipping_phone', 'countryId', 'regionId', 'cityId', 'isLegal'] as const;
export const recipientIdentityFields = ['shipping_middle_name', 'passportSeries', 'passportNumber', 'passportIdnp', 'passportBirthDate', 'passportIssued', 'passportIssuedBy', 'passportIssuedCountryId'] as const;
export const recipientCompanyFields = ['companyAdministrator', 'companyCif', 'companyTva', 'companyBank', 'companyBankCode'] as const;
export const recipientScanFields = ['scan1', 'scan2'] as const;
export const recipientFields = [...recipientBasicFields, ...recipientIdentityFields, ...recipientCompanyFields, ...recipientScanFields] as const;
export type RecipientField = typeof recipientFields[number];
export type RecipientInput = Record<RecipientField, string>;
export type RecipientScan = typeof recipientScanFields[number];
export const recipientMaxScanBytes = 26214400; // App_Tools::MAX_UPLOAD_SIZE, same limit as web.
export const emptyRecipient = (): RecipientInput => Object.fromEntries(recipientFields.map(key => [key, key === 'isLegal' ? '0' : ''])) as RecipientInput;
export function validRecipientDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
// Retained paths are sent as paths, never as URLs: Rows_MemberAddress.saveScans
// downloads absolute URLs. Only user-picked files may become new attachments.
export function recipientScanPath(value: string): string | null {
  if (!value) return '';
  try {
    const parsed = new URL(value, API_ORIGIN);
    if (parsed.origin !== API_ORIGIN || parsed.search || parsed.hash || !/^\/upload\/address-scans\/[A-Za-z0-9_.-]+$/.test(parsed.pathname)) return null;
    return parsed.pathname;
  } catch { return null; }
}
export function recipientScanUrl(value: string): string | null { const path = recipientScanPath(value); return path ? new URL(path, API_ORIGIN).href : null; }
