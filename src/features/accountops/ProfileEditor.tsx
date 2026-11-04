import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useLiveAccount } from '@/api/context';
import { profileFormData, type ProfileFormData } from '@/api/account-operations';
import { profileDraftFields, validateProfileUpdate, type ProfileDraft } from '@/api/profile-identity';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Field, Notice, Screen, useUi } from '@/ui';
import { ResourceStatus } from '@/features/live/shared';
import { MutationFeedback, useAccountView } from './shared';
import { useOperationView } from '@/features/live/forms/useOperationView';

function ProfileBirthdayRow({ onSet }: { onSet: () => void }) {
  const { s, colors } = useUi();
  const { t, formatDate } = useI18n();
  const { canMutate, mutationPending } = useLiveAccount();
  const focused = useIsFocused();
  // Read again when returning from the existing birthday editor; only a value
  // confirmed by the account API appears in this fourth row.
  const { resource, refresh } = useOperationView(focused ? { kind: 'settings.read' } : null);
  const settings = resource.data;
  const value = settings?.birthday.value;
  return <View style={{ gap: 6 }}>
    <Text style={s.small}>{t('accountSettings.birthday')}</Text>
    {value ? <Text selectable style={s.body}>{formatDate(value)}</Text> : settings ? settings.birthday.editable && settings.capabilities.birthdaySave ? <Button secondary disabled={!canMutate || mutationPending} onPress={onSet}>{t('accountSettings.setBirthday')}</Button> : <Text style={s.small}>{t(settings.capabilities.birthdaySave ? 'accountSettings.birthdayUnavailable' : 'accountSettings.serverUpdateRequired')}</Text> : resource.error ? <><Text style={[s.small, { color: colors.error }]}>{t(resource.error)}</Text><Button secondary onPress={() => { void refresh(); }}>{t('live.retry')}</Button></> : <ActivityIndicator size="small" color={colors.accent} style={{ alignSelf: 'flex-start' }} />}
  </View>;
}

function ProfileForm({ initial, onReload, onSaved }: { initial: ProfileFormData; onReload: () => void; onSaved: () => void }) {
  const { s } = useUi();
  const { t } = useI18n();
  const live = useLiveAccount();
  const [form, setForm] = useState<ProfileDraft>({ countryId: initial.countryId, phoneCode: initial.phoneCode, phone: initial.phone });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [unknown, setUnknown] = useState(false);
  const fields = profileDraftFields(initial, form);
  const dirty = Object.keys(fields).length > 0;
  const { confirmDiscard, bypass } = useDraftGuard(dirty || live.mutationPending, { fallbackHref: '/account', pending: live.mutationPending });
  const profile = live.resources.profile;
  const lockedPhone = !!initial.phone.trim();
  const lockedCode = !!initial.phoneCode.trim();
  const phoneCode = initial.phoneCode.trim().replace(/^\+?/, '+');
  const fullPhone = initial.phone.trim().startsWith('+') ? initial.phone.trim() : `${phoneCode} ${initial.phone.trim()}`;
  const set = (key: keyof ProfileDraft, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const save = async () => {
    setError(null); setFieldErrors({});
    const checked = validateProfileUpdate(fields, initial);
    if (Object.keys(checked.errors).length) { setFieldErrors(checked.errors); setError(checked.errors.identity || 'errors.validation'); return; }
    const result = await live.mutate({ kind: 'profile.save', input: checked.fields });
    if (result.ok) { setUnknown(false); bypass(onSaved); }
    else { setFieldErrors(result.fieldErrors || {}); setError(result.fieldErrors?.identity || result.error || 'errors.loadFailed'); setUnknown(result.outcome === 'unknown'); }
  };
  const value = (label: string, text: string | null | undefined) => <View style={{ gap: 4 }}><Text style={s.small}>{t(label)}</Text><Text selectable style={s.body}>{text || t('live.unavailable')}</Text></View>;
  return <>
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}><View style={{ flex: 1, minWidth: 0 }}>{value('field.lastName', initial.surname)}</View><View style={{ flex: 1, minWidth: 0 }}>{value('field.firstName', initial.name)}</View></View>
      {value('field.email', profile.data?.email)}
      {lockedCode && lockedPhone ? value('field.phone', fullPhone) : <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 90 }}>{lockedCode ? value('accountOps.phoneCode', phoneCode) : <Field label={t('accountOps.phoneCode')} value={form.phoneCode} error={fieldErrors.phone_code ? t(fieldErrors.phone_code) : undefined} onChangeText={value => set('phoneCode', value)} keyboardType="phone-pad" editable={!live.mutationPending && !unknown} />}</View>
        <View style={{ flex: 1, minWidth: 0 }}>{lockedPhone ? value('field.phone', initial.phone) : <Field label={t('field.phone')} value={form.phone} error={fieldErrors.phone ? t(fieldErrors.phone) : undefined} onChangeText={value => set('phone', value)} keyboardType="phone-pad" editable={!live.mutationPending && !unknown} />}</View>
      </View>}
      <ProfileBirthdayRow onSet={() => confirmDiscard(() => bypass(() => router.push('/account/details')))} />
    </View>
    {(profile.error || profile.data?.emailError) && <><Notice error>{t('profileIdentity.emailUnavailable')}</Notice><Button secondary disabled={profile.loading || live.mutationPending} onPress={() => { void live.refresh(['profile']); }}>{t('profileIdentity.retryEmail')}</Button></>}
    <Notice>{t('profileIdentity.protected')}</Notice>
    {(lockedPhone || lockedCode) && <Notice>{t('profileIdentity.phoneProtected')}</Notice>}
    <MutationFeedback error={error} unknown={unknown} onCheck={() => confirmDiscard(onReload)} />
    {(!lockedCode || !lockedPhone) && <Button disabled={!dirty || !live.canMutate || unknown} onPress={() => { void save(); }}>{t(live.mutationPending ? 'accountOps.saving' : 'accountOps.save')}</Button>}
    <Button secondary disabled={live.mutationPending} onPress={() => confirmDiscard(() => bypass(() => router.back()))}>{t('accountOps.cancel')}</Button>
  </>;
}

export function LiveProfileEditor() {
  const { t } = useI18n();
  const { resource, reload } = useAccountView({ kind: 'profile.read' }, profileFormData);
  const [saved, setSaved] = useState(false);
  return <Screen title={t('profileIdentity.settings')} subtitle={t('profileIdentity.intro')}>
    {!resource.data && <ResourceStatus resource={resource} onRefresh={reload} />}
    {saved && !resource.loading && <Notice>{t('accountOps.saved')}</Notice>}
    {resource.data && <ProfileForm key={resource.updatedAt} initial={resource.data} onReload={reload} onSaved={() => { setSaved(true); reload(); }} />}
    {!resource.data && !resource.loading && !resource.error && <Notice>{t('live.unavailable')}</Notice>}
  </Screen>;
}
