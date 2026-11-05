import { BillingFields } from './BillingFields';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLiveAccount } from '@/api/context';
import { type AccountSettings, type BillingInput, billingFields, normalizeAccountSettings, validBirthday } from '@/api/account-settings';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Field, Notice, Screen, useUi } from '@/ui';
import { DetailRow, ResourceStatus } from '@/features/live/shared';
import { AttachmentsEditor, type ExistingFile, type StagedFile } from '@/features/live/forms/AttachmentsEditor';
import { MutationFeedback, useAccountView } from './shared';

type SettingsFormProps = { settings: AccountSettings; reload: () => void };

function SettingsFeedback({ error, saved, unknown, onCheck }: { error: string | null; saved: boolean; unknown: boolean; onCheck: () => void }) {
  const { t } = useI18n();
  const readbackFailed = error === 'accountSettings.readbackFailed';
  return <><MutationFeedback error={error} saved={saved} unknown={unknown && !readbackFailed} onCheck={onCheck} />{unknown && readbackFailed && <Button secondary onPress={onCheck}>{t('accountOps.check')}</Button>}</>;
}

function SettingsContent({ children }: { children: (props: SettingsFormProps) => ReactNode }) {
  const { resource, reload } = useAccountView({ kind: 'settings.read' }, normalizeAccountSettings);
  return resource.data ? children({ settings: resource.data, reload }) : <ResourceStatus resource={resource} onRefresh={reload} />;
}

function PasswordForm({ settings }: SettingsFormProps) {
  const { t } = useI18n(); const { s } = useUi(); const live = useLiveAccount();
  const [oldPassword, setOldPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [repeat, setRepeat] = useState('');
  const [visible, setVisible] = useState(false); const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({}); const [saved, setSaved] = useState(false); const [unknown, setUnknown] = useState(false);
  const enabled = settings.capabilities.passwordLogRedacted;
  const busy = live.mutationPending; const disabled = busy || unknown || !enabled;
  useDraftGuard(!unknown && !!(oldPassword || newPassword || repeat) || busy, { fallbackHref: '/settings', pending: busy });
  const save = async () => {
    if (disabled || !live.canMutate) return;
    setSaved(false); setError(null); setFields({});
    if (newPassword !== repeat) { setFields({ repeat: 'auth.passwordMismatch' }); return; }
    const result = await live.mutate({ kind: 'password.change', input: { oldPassword, newPassword } });
    if (result.ok) { setOldPassword(''); setNewPassword(''); setRepeat(''); setVisible(false); setSaved(true); }
    else { setError(result.error || 'errors.loadFailed'); setFields(result.fieldErrors || {}); setUnknown(result.outcome === 'unknown'); }
  };
  return <>
    {!enabled && <Notice>{t('accountSettings.serverUpdateRequired')}</Notice>}
    <View style={s.card}>
      <Field label={t('accountSettings.currentPassword')} value={oldPassword} onChangeText={value => { setOldPassword(value); setSaved(false); }} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="current-password" editable={!disabled} error={fields.oldPassword || fields.old ? t(fields.oldPassword || fields.old) : undefined} />
      <Field label={t('accountSettings.newPassword')} value={newPassword} onChangeText={value => { setNewPassword(value); setSaved(false); }} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} textContentType="newPassword" autoComplete="new-password" editable={!disabled} error={fields.newPassword || fields.new ? t(fields.newPassword || fields.new) : undefined} />
      <Field label={t('auth.repeatPassword')} value={repeat} onChangeText={setRepeat} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} textContentType="newPassword" autoComplete="new-password" editable={!disabled} error={fields.repeat ? t(fields.repeat) : undefined} />
      <Button secondary disabled={busy} onPress={() => setVisible(value => !value)}>{t(visible ? 'auth.hidePassword' : 'auth.showPassword')}</Button>
    </View>
    <MutationFeedback error={error} saved={saved} />
    {unknown && <Notice error>{t('accountSettings.passwordUnknown')}</Notice>}
    <Button disabled={disabled || !live.canMutate || !oldPassword || !newPassword || !repeat} onPress={() => { void save(); }}>{t(busy ? 'accountOps.saving' : 'accountSettings.changePassword')}</Button>
  </>;
}
export function LiveSecuritySettings() {
  const { t } = useI18n();
  return <Screen title={t('accountSettings.security')} subtitle={t('accountSettings.securityIntro')}><SettingsContent>{props => <PasswordForm {...props} />}</SettingsContent></Screen>;
}


function BillingForm({ settings, reload }: SettingsFormProps) {
  const { t } = useI18n(); const live = useLiveAccount();
  const [form, setForm] = useState(settings.billing.fields); const [baseline, setBaseline] = useState(settings.billing.fields);
  const [error, setError] = useState<string | null>(null); const [fields, setFields] = useState<Record<string, string>>({}); const [saved, setSaved] = useState(false); const [unknown, setUnknown] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const dirty = billingFields.some(key => form[key] !== baseline[key]);
  const enabled = settings.capabilities.billingSave; const disabled = live.mutationPending || verifying || unknown || !enabled;
  const { confirmDiscard } = useDraftGuard(!unknown && dirty || live.mutationPending || verifying, { fallbackHref: '/settings', pending: live.mutationPending || verifying });
  const set = (key: keyof BillingInput, value: string) => { setForm(previous => ({ ...previous, [key]: value })); setFields(previous => ({ ...previous, [key]: '' })); setSaved(false); };
  const save = async () => {
    if (disabled || !live.canMutate) return;
    setError(null); setFields({}); setSaved(false);
    const result = await live.mutate({ kind: 'settings.billing.save', input: form });
    if (result.ok) {
      setVerifying(true);
      try { const latest = await live.readView({ kind: 'settings.read' }); if (billingFields.some(key => latest.billing.fields[key].trim() !== form[key].trim())) throw new Error('readback'); setForm(latest.billing.fields); setBaseline(latest.billing.fields); setSaved(true); }
      catch { setError('accountSettings.readbackFailed'); setUnknown(true); }
      finally { setVerifying(false); }
    } else { setFields(result.fieldErrors || {}); setError(result.error || 'errors.loadFailed'); setUnknown(result.outcome === 'unknown'); }
  };
  return <>
    {!enabled && <Notice>{t('accountSettings.serverUpdateRequired')}</Notice>}
    <BillingFields form={form} countries={settings.billing.countries} fields={fields} disabled={disabled} set={set} />
    <SettingsFeedback error={error} saved={saved} unknown={unknown} onCheck={() => confirmDiscard(reload)} />
    <Button disabled={disabled || !dirty || !live.canMutate} onPress={() => { void save(); }}>{t(live.mutationPending || verifying ? 'accountOps.saving' : 'accountOps.save')}</Button>
  </>;
}
export function LiveBillingSettings() {
  const { t } = useI18n();
  return <Screen title={t('accountSettings.billing')} subtitle={t('accountSettings.billingIntro')}><SettingsContent>{props => <BillingForm key={JSON.stringify(props.settings.billing)} {...props} />}</SettingsContent></Screen>;
}

function IdentityForm({ settings, reload }: SettingsFormProps) {
  const { t } = useI18n(); const live = useLiveAccount();
  const [existing, setExisting] = useState<ExistingFile[]>(settings.identity.files.map(file => ({ ...file, url: file.url || '' }))); const [staged, setStaged] = useState<StagedFile[]>([]);
  const [baseline, setBaseline] = useState(settings.identity.files.map(file => file.id));
  const [revision, setRevision] = useState(settings.identity.revision);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false); const [unknown, setUnknown] = useState(false);
  const dirty = staged.length > 0 || existing.map(file => file.id).join(',') !== baseline.join(',');
  const enabled = settings.capabilities.identityDocumentsSave; const disabled = live.mutationPending || verifying || unknown || !enabled;
  const { confirmDiscard } = useDraftGuard(!unknown && dirty || live.mutationPending || verifying, { fallbackHref: '/settings', pending: live.mutationPending || verifying });
  const save = async () => {
    if (disabled || !live.canMutate) return;
    setError(null); setSaved(false);
    const result = await live.mutate({ kind: 'settings.identity.save', revision, retainedIds: existing.flatMap(file => file.id ? [file.id] : []), files: staged });
    if (result.ok) {
      setVerifying(true); setStaged([]);
      try { const latest = await live.readView({ kind: 'settings.read' }); if (latest.identity.files.length !== existing.length + staged.length || existing.some(file => !latest.identity.files.some(current => current.id === file.id))) throw new Error('readback'); setExisting(latest.identity.files.map(file => ({ ...file, url: file.url || '' }))); setRevision(latest.identity.revision); setBaseline(latest.identity.files.map(file => file.id)); setSaved(true); }
      catch { setError('accountSettings.readbackFailed'); setUnknown(true); }
      finally { setVerifying(false); }
    } else { setError(result.error || 'errors.loadFailed'); setUnknown(result.outcome === 'unknown'); }
  };
  return <>
    {!enabled && <Notice>{t('accountSettings.serverUpdateRequired')}</Notice>}
    <Notice>{t('accountSettings.identityHint')}</Notice>
    <AttachmentsEditor title={t('accountSettings.documents')} existing={existing.map((file, index) => ({ ...file, displayName: t('accountSettings.documentNumber', { number: String(index + 1) }) }))} onExistingChange={enabled ? value => { setExisting(value); setSaved(false); } : undefined} staged={staged} onStagedChange={value => { setStaged(value); setSaved(false); }} allowPdf={settings.identity.allowedMimeTypes.includes('application/pdf')} maxFiles={settings.identity.maxFiles} maxBytes={settings.identity.maxBytes} disabled={disabled} readOnly={!enabled} />
    <SettingsFeedback error={error} saved={saved} unknown={unknown} onCheck={() => confirmDiscard(reload)} />
    <Button disabled={disabled || !live.canMutate || !dirty} onPress={() => { void save(); }}>{t(live.mutationPending || verifying ? 'accountOps.saving' : 'accountSettings.sendDocuments')}</Button>
  </>;
}
export function LiveIdentitySettings() {
  const { t } = useI18n();
  return <Screen title={t('accountSettings.identity')} subtitle={t('accountSettings.identityIntro')}><SettingsContent>{props => <IdentityForm key={JSON.stringify(props.settings.identity)} {...props} />}</SettingsContent></Screen>;
}

function BirthdayAndLanguageForm({ settings, reload }: SettingsFormProps) {
  const { t, formatDate } = useI18n(); const { s } = useUi(); const live = useLiveAccount();
  const [day, setDay] = useState(''); const [month, setMonth] = useState(''); const [year, setYear] = useState('');
  const [birthdayValue, setBirthdayValue] = useState(settings.birthday.value);
  const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false); const [unknown, setUnknown] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const busy = live.mutationPending || verifying || unknown; const birthdayEditable = settings.birthday.editable && !birthdayValue && settings.capabilities.birthdaySave;
  const dirty = !!(day || month || year);
  const { confirmDiscard } = useDraftGuard(!unknown && dirty || live.mutationPending || verifying, { fallbackHref: '/account', pending: live.mutationPending || verifying });
  const saveBirthday = async () => {
    if (!birthdayEditable || busy || !live.canMutate) return;
    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    setError(null); setSaved(false);
    if (!validBirthday(date) || date > new Date().toISOString().slice(0, 10)) { setError('accountSettings.invalidBirthday'); return; }
    const result = await live.mutate({ kind: 'settings.birthday.save', birthday: date });
    if (result.ok) {
      setVerifying(true); setDay(''); setMonth(''); setYear('');
      try { const latest = await live.readView({ kind: 'settings.read' }); if (latest.birthday.value !== date) throw new Error('readback'); setBirthdayValue(latest.birthday.value); setSaved(true); }
      catch { setError('accountSettings.readbackFailed'); setUnknown(true); }
      finally { setVerifying(false); }
    } else { setError(result.error || 'errors.loadFailed'); setUnknown(result.outcome === 'unknown'); }
  };
  return <>
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{t('accountSettings.birthday')}</Text>
      {birthdayEditable ? <>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label={t('accountSettings.day')} placeholder="DD" keyboardType="number-pad" maxLength={2} value={day} onChangeText={value => { setDay(value.replace(/\D/g, '')); setSaved(false); }} editable={!busy} /></View>
          <View style={{ flex: 1 }}><Field label={t('accountSettings.month')} placeholder="MM" keyboardType="number-pad" maxLength={2} value={month} onChangeText={value => { setMonth(value.replace(/\D/g, '')); setSaved(false); }} editable={!busy} /></View>
          <View style={{ flex: 1.4 }}><Field label={t('accountSettings.year')} placeholder="YYYY" keyboardType="number-pad" maxLength={4} value={year} onChangeText={value => { setYear(value.replace(/\D/g, '')); setSaved(false); }} editable={!busy} /></View>
        </View>
        <Text style={s.small}>{t('accountSettings.birthdayOnce')}</Text>
        <Button disabled={busy || !live.canMutate || !day || !month || year.length !== 4} onPress={() => { void saveBirthday(); }}>{t(live.mutationPending || verifying ? 'accountOps.saving' : 'accountSettings.saveBirthday')}</Button>
      </> : <><DetailRow label={t('accountSettings.birthday')} value={birthdayValue ? formatDate(birthdayValue) : null} /><Text style={s.small}>{t(birthdayValue ? 'accountSettings.birthdayLocked' : 'accountSettings.serverUpdateRequired')}</Text></>}
    </View>
    <SettingsFeedback error={error} saved={saved} unknown={unknown} onCheck={() => confirmDiscard(reload)} />
    <Button secondary disabled={live.mutationPending} onPress={() => confirmDiscard(() => router.push('/account/identity'))}>{t('accountSettings.identity')}</Button>
  </>;
}
export function LiveAdditionalProfileSettings() {
  const { t } = useI18n();
  return <Screen title={t('accountSettings.personalDetails')}><SettingsContent>{props => <BirthdayAndLanguageForm key={JSON.stringify([props.settings.birthday, props.settings.language])} {...props} />}</SettingsContent></Screen>;
}
