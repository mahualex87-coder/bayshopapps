import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { SocialPending, SocialProfile, SocialProfileField } from '@/api/native-social-auth';
import { OptionPicker } from '@/features/accountops/shared';
import { phoneCodeOptions } from '@/domain/phone-code-options';
import { InternalContentViewer } from '@/features/content/InternalContentViewer';
import { publicContentPages } from '@/features/content/public-content-policy';
import { useI18n } from '@/i18n/context';
import { Button, Field, Notice, minTouchTarget, useUi } from '@/ui';
import { initialSocialProfile, socialProfileErrors, updateSocialProfile } from './social-completion';

export function SocialProfileCompletion({ pending, busy, onSubmit, onCancel, initialCountryId }: { initialCountryId?: string; pending: SocialPending; busy: boolean; onSubmit: (profile: SocialProfile, acceptedTerms: boolean) => void; onCancel: () => void }) {
  const { s, colors } = useUi(); const { t, language } = useI18n();
  const [profile, setProfile] = useState(() => initialSocialProfile(pending, initialCountryId)); const [accepted, setAccepted] = useState(false); const [showTerms, setShowTerms] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof socialProfileErrors>>({});
  const editable = (field: SocialProfileField) => !busy && pending.editableFields.includes(field);
  const update = (field: SocialProfileField, value: string) => { setProfile(current => updateSocialProfile(pending, current, field, value)); setErrors(current => ({ ...current, [field]: undefined })); };
  const submit = () => { if (busy) return; const validation = socialProfileErrors(pending, profile, accepted); setErrors(validation); if (!Object.keys(validation).length) onSubmit(profile, accepted); };
  const codes = phoneCodeOptions(pending.formats, language);
  const selectedCode = codes.find(code => code.callingCode === profile.phoneCode && code.countryId === profile.countryId) || codes.find(code => code.callingCode === profile.phoneCode);
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t(pending.isNew ? 'socialAuth.completeNew' : 'socialAuth.completeExisting')}</Text>
    <Text style={s.small}>{t(pending.isNew ? 'socialAuth.confirmIdentity' : 'socialAuth.keepIdentity')}</Text>
    <Field label={t('auth.email')} value={profile.email} editable={false} autoCapitalize="none" />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}><Field label={t('auth.firstName')} value={profile.firstName} onChangeText={value => update('firstName', value)} editable={editable('firstName')} error={errors.firstName && t(errors.firstName)} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" /></View>
      <View style={{ flex: 1, minWidth: 0 }}><Field label={t('auth.lastName')} value={profile.lastName} onChangeText={value => update('lastName', value)} editable={editable('lastName')} error={errors.lastName && t(errors.lastName)} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" /></View>
    </View>
    <OptionPicker country label={t('field.country')} value={profile.countryId} options={pending.formats.countries} disabled={!editable('countryId')} onChange={value => update('countryId', value)} error={errors.countryId} />
    {pending.editableFields.includes('phoneCode') ? <OptionPicker label={t('accountOps.phoneCode')} value={selectedCode?.id || ''} options={codes.map(code => ({ id: code.id, title: `${code.title} (${code.callingCode})` }))} onChange={value => { const code = codes.find(option => option.id === value); if (code) update('phoneCode', code.callingCode); }} disabled={busy} error={errors.phoneCode} /> : <Field label={t('accountOps.phoneCode')} value={profile.phoneCode} editable={false} />}
    <Field label={t('field.phone')} value={profile.phone} onChangeText={value => update('phone', value)} editable={editable('phone')} keyboardType="phone-pad" autoComplete="tel-national" textContentType="telephoneNumber" error={errors.phone && t(errors.phone)} />
    {pending.termsRequired && <>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={t('auth.acceptTerms')} aria-checked={accepted} accessibilityState={{ checked: accepted, disabled: busy }} disabled={busy} onPress={() => { setAccepted(value => !value); setErrors(current => ({ ...current, terms: undefined })); }} style={[s.row, { minHeight: minTouchTarget, justifyContent: 'flex-start', flexWrap: 'nowrap' }]}><Ionicons accessible={false} aria-hidden name={accepted ? 'checkbox' : 'square-outline'} size={25} color={accepted ? colors.accent : colors.muted} /><Text style={[s.body, { flex: 1 }]}>{t('auth.acceptTerms')}</Text></Pressable>
      <Button secondary disabled={busy} onPress={() => setShowTerms(true)}>{t('auth.readTerms')}</Button>
    </>}
    {errors.terms && <Notice error>{t(errors.terms)}</Notice>}{errors.session && <Notice error>{t(errors.session)}</Notice>}
    <Button disabled={busy} onPress={submit}>{t(busy ? 'socialAuth.working' : pending.isNew ? 'socialAuth.create' : 'socialAuth.continue')}</Button>
    <Button secondary disabled={busy} onPress={onCancel}>{t('socialAuth.cancel')}</Button>
    {showTerms && <InternalContentViewer url={publicContentPages.terms} title={t('contentReader.termsTitle')} onClose={() => setShowTerms(false)} />}
  </View>;
}
