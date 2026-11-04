import { ApiContractError } from './normalize.ts';
import type { ProfileFormData } from './account-operations.ts';
import type { OperationFields } from './operations-contracts.ts';

/** MemberController::getAction('me') returns the account row. Select only
 * email, after matching the authenticated id; never retain the full row. */
export function normalizeMemberEmailData(raw: unknown, expectedId: string): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiContractError('emailul contului');
  const member = (raw as Record<string, unknown>).member;
  if (!member || typeof member !== 'object' || Array.isArray(member)) throw new ApiContractError('emailul contului');
  const row = member as Record<string, unknown>;
  if ((typeof row.id !== 'string' && typeof row.id !== 'number') || String(row.id) !== expectedId) throw new ApiContractError('emailul contului');
  if (row.email === null || row.email === '') return null;
  if (typeof row.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) throw new ApiContractError('emailul contului');
  return row.email;
}

export type ProfileDraft = Pick<ProfileFormData, 'phone' | 'phoneCode' | 'countryId'>;

/** Only fields the user changed are proposed. Identity never enters a write. */
export function profileDraftFields(current: ProfileFormData, draft: ProfileDraft): OperationFields {
  return {
    ...(draft.countryId !== current.countryId ? { country_id: draft.countryId } : {}),
    ...(draft.phoneCode !== current.phoneCode ? { phone_code: draft.phoneCode } : {}),
    ...(draft.phone !== current.phone ? { phone: draft.phone } : {}),
  };
}

/** Recheck against fresh personal-data immediately before dispatch. The
 * backend accepts a first phone, but discards existing name/phone changes. */
export function validateProfileUpdate(input: OperationFields, current: ProfileFormData): { fields: OperationFields; errors: Record<string, string> } {
  const fields: OperationFields = {};
  const errors: Record<string, string> = {};
  if (!current.name.trim() || !current.surname.trim()) errors.identity = 'profileIdentity.incomplete';
  for (const key of Object.keys(input)) {
    if (!['country_id', 'phone_code', 'phone'].includes(key)) errors[key] = 'profileIdentity.protected';
  }
  if (input.country_id !== undefined) {
    if (typeof input.country_id !== 'string' || !current.countries.some(country => country.id === input.country_id)) errors.country_id = 'accountOps.selectCountry';
    else fields.country_id = input.country_id;
  }
  for (const [field, previous] of [['phone_code', current.phoneCode], ['phone', current.phone]] as const) {
    const value = input[field];
    if (previous.trim()) {
      if (value !== undefined && value !== previous) errors[field] = 'profileIdentity.phoneProtected';
      // GET returns memberPhone while POST's required-field check uses the
      // legacy phone column. Echo the fresh unchanged phone so accounts with
      // only memberPhone can still update country; never use a draft value.
      if (field === 'phone') fields.phone = previous;
      continue;
    }
    const valid = typeof value === 'string' && (field === 'phone_code' ? /^\+?\d{1,5}$/.test(value) : /^[\d ()-]+$/.test(value) && value.replace(/\D/g, '').length >= 4);
    if (!valid) errors[field] = field === 'phone_code' ? 'accountOps.invalidPhoneCode' : 'accountOps.invalidPhone';
    else fields[field] = value;
  }
  return { fields, errors };
}
