import type { SocialPending, SocialProfile, SocialProfileField } from '../../api/native-social-auth.ts';

export function initialSocialProfile(pending: SocialPending, countryId?: string): SocialProfile {
  if (!countryId || !pending.isNew || !pending.editableFields.includes('countryId') || !pending.formats.countries.some(country => country.id === countryId)) return pending.profile;
  return { ...pending.profile, countryId };
}

/** The server owns editable fields; populated identity is never unlocked here. */
export function updateSocialProfile(pending: SocialPending, current: SocialProfile, field: SocialProfileField, value: string): SocialProfile {
  return pending.editableFields.includes(field) ? { ...current, [field]: value } : current;
}

export function socialProfileErrors(pending: SocialPending, profile: SocialProfile, acceptedTerms: boolean, now = Date.now()): Partial<Record<SocialProfileField | 'terms' | 'session', string>> {
  const errors: Partial<Record<SocialProfileField | 'terms' | 'session', string>> = {};
  if (Date.parse(pending.expiresAt) <= now) errors.session = 'socialAuth.error.flow_expired';
  for (const field of pending.requiredFields) if (!profile[field].trim()) errors[field] = 'accountOps.required';
  if (pending.editableFields.includes('countryId') && !pending.formats.countries.some(country => country.id === profile.countryId)) errors.countryId = 'accountOps.selectCountry';
  if (pending.editableFields.includes('phoneCode') && !/^\+?\d{1,5}$/.test(profile.phoneCode)) errors.phoneCode = 'accountOps.invalidPhoneCode';
  if (pending.editableFields.includes('phone') && !/^[\d ()-]+$/.test(profile.phone)) errors.phone = 'accountOps.invalidPhone';
  if (pending.termsRequired && !acceptedTerms) errors.terms = 'socialAuth.error.terms_required';
  return errors;
}

export function socialErrorKey(code: string): string {
  const codes = ['provider_unavailable', 'invalid_identity', 'flow_expired', 'account_link_required', 'provider_email_required', 'account_unavailable', 'terms_required', 'invalid_profile', 'locked_profile_field', 'incomplete_profile', 'invalid_country', 'invalid_phone', 'account_changed', 'try_again', 'rate_limited', 'temporarily_unavailable', 'request_unknown', 'request_failed', 'request_rejected', 'provider_failed', 'request_pending'];
  return codes.includes(code) ? `socialAuth.error.${code}` : 'socialAuth.error.request_failed';
}
