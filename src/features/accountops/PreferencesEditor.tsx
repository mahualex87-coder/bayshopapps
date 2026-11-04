import { useState } from 'react';
import { PushSettings } from '@/features/push/PushProvider';
import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { TelegramChannel } from './TelegramChannel';
import { useLiveAccount } from '@/api/context';
import { preferenceKeys, preferencesData, type Preferences } from '@/api/account-operations';
import type { NotificationOptionsInput } from '@/api/operations-contracts';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { useI18n } from '@/i18n/context';
import { GlassSurface } from '@/navigation/GlassSurface';
import { Button, Notice, Screen, useUi } from '@/ui';
import { ResourceStatus } from '@/features/live/shared';
import { MutationFeedback, useAccountView } from './shared';

type PreferenceKey = keyof Preferences['values'];
type ExpectedPreferences = Partial<Record<PreferenceKey, boolean>>;
const allKeys: PreferenceKey[] = ['obtainMass', ...preferenceKeys];
const channels: PreferenceKey[] = ['obtainMails', 'obtainSms', 'obtainGcm', 'obtainViber', 'obtainTelegram'];

function PreferencesForm({ initial, onReload, onSaved, onEdited }: { initial: Preferences; onReload: () => void; onEdited: () => void; onSaved: (expected: ExpectedPreferences) => void }) {
  const { colors, s } = useUi(); const { t } = useI18n(); const live = useLiveAccount();
  const [values, setValues] = useState(initial.values);
  const [baseline, setBaseline] = useState(initial.values);
  const [hasTelegram, setHasTelegram] = useState(initial.hasTelegram);
  const syncTelegram = (fresh: Preferences) => {
    const serverValue = fresh.values.obtainTelegram;
    // Preserve edits to other channels and any unsubmitted Telegram toggle.
    setValues(previous => previous.obtainTelegram === baseline.obtainTelegram || !fresh.hasTelegram
      ? { ...previous, obtainTelegram: serverValue } : previous);
    setBaseline(previous => ({ ...previous, obtainTelegram: serverValue }));
    setHasTelegram(fresh.hasTelegram);
  };
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const { confirmDiscard, bypass } = useDraftGuard(dirty || live.mutationPending, { fallbackHref: '/settings', pending: live.mutationPending });
  const save = async () => {
    if (live.mutationPending || unknown || !live.canMutate) return;
    setError(null);
    const input: NotificationOptionsInput = {};
    const expected: ExpectedPreferences = {};
    for (const key of allKeys) {
      const value = values[key];
      if (typeof value === 'boolean' && value !== baseline[key]) { input[key] = value ? 1 : 0; expected[key] = value; }
    }
    if (Object.keys(input).length === 0) return;
    const result = await live.mutate({ kind: 'preferences.save', input });
    if (result.ok) { setBaseline(values); setUnknown(false); onSaved(expected); }
    else { setError(result.error || 'errors.loadFailed'); setUnknown(result.outcome === 'unknown'); }
  };
  const renderOption = (key: PreferenceKey) => {
    const label = t(key === 'obtainMass' ? 'settingsHub.informational' : `accountOps.preference.${key}`);
    const value = values[key];
    return <View key={key} style={s.setting}><Text style={[s.body, { flex: 1, paddingRight: 12 }]}>{label}</Text>
      {value === null ? <Text style={[s.small, { flexShrink: 1, textAlign: 'right' }]}>{t('settingsHub.unavailable')}</Text> : <Switch accessibilityLabel={label} value={value} disabled={live.mutationPending || unknown || !live.canMutate || (key === 'obtainTelegram' && !hasTelegram)} trackColor={{ false: colors.border, true: colors.accent }} onValueChange={next => { setValues(previous => ({ ...previous, [key]: next })); setError(null); onEdited(); }} />}
    </View>;
  };
  return <>
    <Text accessibilityRole="header" style={s.heading}>{t('settingsHub.messageTypes')}</Text>
    <GlassSurface style={{ padding: 14 }}>{renderOption('obtainMass')}{renderOption('alertOnSystem')}</GlassSurface>
    {values.obtainMass === null && <Text style={s.small}>{t('settingsHub.informationalUnavailable')}</Text>}
    <Text accessibilityRole="header" style={s.heading}>{t('settingsHub.channels')}</Text>
    <GlassSurface style={{ padding: 14 }}>{channels.map(key => key !== 'obtainTelegram' ? renderOption(key) : <View key={key}>
      {hasTelegram ? renderOption(key) : <Text style={s.body}>{t('accountOps.preference.obtainTelegram')}</Text>}
      <TelegramChannel linked={hasTelegram} disabled={live.mutationPending || unknown || !live.canMutate} onVerified={syncTelegram} />
    </View>)}</GlassSurface>
    <PushSettings accountEnabled={initial.values.obtainGcm} />
    <MutationFeedback error={error} unknown={unknown} onCheck={() => confirmDiscard(onReload)} />
    <Button disabled={!dirty || !live.canMutate || live.mutationPending || unknown} onPress={() => { void save(); }}>{t(live.mutationPending ? 'accountOps.saving' : 'accountOps.save')}</Button>
    <Button secondary disabled={live.mutationPending} onPress={() => confirmDiscard(() => bypass(() => router.back()))}>{t('accountOps.cancel')}</Button>
  </>;
}

function PreferencesContent() {
  const { t } = useI18n();
  const { resource, reload } = useAccountView({ kind: 'preferences.read' }, preferencesData);
  const [expected, setExpected] = useState<ExpectedPreferences | null>(null);
  const confirmed = !!expected && !!resource.data && Object.entries(expected).every(([key, value]) => resource.data!.values[key as PreferenceKey] === value);
  return <Screen title={t('settingsHub.notifications')} subtitle={t('settingsHub.notificationIntro')}>
    {!resource.data && <ResourceStatus resource={resource} onRefresh={reload} />}
    {expected && resource.loading && <Notice>{t('settingsHub.verifying')}</Notice>}
    {expected && resource.data && !resource.loading && <Notice error={!confirmed}>{t(confirmed ? 'accountOps.saved' : 'settingsHub.notConfirmed')}</Notice>}
    {resource.data && <PreferencesForm key={resource.updatedAt} initial={resource.data} onReload={reload} onEdited={() => setExpected(null)} onSaved={next => { setExpected(next); reload(); }} />}
  </Screen>;
}

export function LivePreferencesEditor() {
  const { accountId, accountRevision, authRevision, language, authenticated } = useLiveAccount();
  // Verification state and drafts belong to this account and locale only.
  return <PreferencesContent key={JSON.stringify([accountId, accountRevision, authRevision, language, authenticated])} />;
}
