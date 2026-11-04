import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { accountRegionFromPersonalData, accountRegionInterfaceLanguage, accountRegionLanguage, normalizeAccountSettings, type AccountRegion } from '@/api/account-settings';
import type { Language } from '@/i18n/core';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Notice, Screen, useUi } from '@/ui';
import { ResourceStatus } from '@/features/live/shared';
import { MutationFeedback, OptionPicker, useAccountView } from './shared';

function RegionForm({ initial, enabled, onCheck }: { initial: AccountRegion; enabled: boolean; onCheck: () => void }) {
  const { t, setLanguage } = useI18n(); const { s } = useUi(); const live = useLiveAccount();
  const [region, setRegion] = useState(initial);
  const [countryId, setCountryId] = useState(initial.countryId);
  const [languageId, setLanguageId] = useState(initial.languageId || '');
  const [error, setError] = useState<string | null>(null); const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false); const [unknown, setUnknown] = useState(false); const [verifying, setVerifying] = useState(false);
  const [confirmedLanguage, setConfirmedLanguage] = useState<Language | null>(null);
  const mounted = useRef(true);
  const appliedLanguage = useRef<Language | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const busy = live.mutationPending || verifying;
  const dirty = countryId !== region.countryId || languageId !== (region.languageId || '');
  const { confirmDiscard } = useDraftGuard(!unknown && dirty || busy, { fallbackHref: '/settings', pending: busy });
  // Wait for the committed clean form so the existing draft/pending guards
  // remain effective. Never change the interface from an unconfirmed choice.
  useEffect(() => {
    if (!confirmedLanguage || dirty || busy || unknown || appliedLanguage.current === confirmedLanguage) return;
    appliedLanguage.current = confirmedLanguage;
    void setLanguage(confirmedLanguage).then(changed => {
      if (!changed && mounted.current) setError('accountRegion.interfaceSyncFailed');
    });
  }, [confirmedLanguage, dirty, busy, unknown, setLanguage]);
  const countries = region.countries; const languages = countries.find(country => country.id === countryId)?.languages || [];
  const valid = !!countryId && languages.some(language => language.id === languageId);
  const save = async () => {
    if (!enabled || !dirty || !valid || busy || unknown || !live.canMutate) return;
    setError(null); setFields({}); setSaved(false);
    const result = await live.mutate({ kind: 'settings.region.save', countryId, languageId });
    if (!mounted.current) return;
    if (!result.ok) { setError(result.error || 'errors.loadFailed'); setFields(result.fieldErrors || {}); setUnknown(result.outcome === 'unknown'); return; }
    setVerifying(true);
    try {
      const latest = await live.readView({ kind: 'settings.read' });
      if (!mounted.current) return;
      if (!latest.region || latest.region.countryId !== countryId || latest.region.languageId !== languageId) throw new Error('readback');
      setRegion(latest.region); setCountryId(latest.region.countryId); setLanguageId(latest.region.languageId || ''); setSaved(true);
      appliedLanguage.current = null; setConfirmedLanguage(accountRegionInterfaceLanguage(latest.region));
    } catch { if (mounted.current) { setError('accountSettings.readbackFailed'); setUnknown(true); } }
    finally { if (mounted.current) setVerifying(false); }
  };
  return <>
    {!enabled && <Notice>{t('accountRegion.unavailable')}</Notice>}
    <View style={s.card}>
      <OptionPicker country label={t('field.country')} value={countryId} options={countries} disabled={!enabled || busy || unknown} error={fields.countryId} onChange={value => { setCountryId(value); setLanguageId(accountRegionLanguage(region, value, languageId)); setSaved(false); setError(null); setFields({}); }} />
      <OptionPicker label={t('accountSettings.accountLanguage')} value={languageId} options={languages} disabled={!enabled || busy || unknown} error={fields.languageId} onChange={value => { setLanguageId(value); setSaved(false); setError(null); setFields({}); }} />
      {enabled && !languageId && <Text style={s.small}>{t('accountRegion.chooseLanguage')}</Text>}
      <Text style={s.small}>{t('accountRegion.hint')}</Text>
    </View>
    <MutationFeedback error={error} saved={saved} unknown={unknown && error !== 'accountSettings.readbackFailed'} onCheck={() => confirmDiscard(onCheck)} />
    {unknown && error === 'accountSettings.readbackFailed' && <Button secondary onPress={() => confirmDiscard(onCheck)}>{t('accountOps.check')}</Button>}
    {enabled && <Button disabled={busy || unknown || !live.canMutate || !dirty || !valid} onPress={() => { void save(); }}>{t(busy ? 'accountOps.saving' : 'accountRegion.save')}</Button>}
  </>;
}

export function LiveAccountRegionSettings() {
  const { t } = useI18n();
  const settings = useAccountView({ kind: 'settings.read' }, normalizeAccountSettings, { preserveOnAccountRevision: true });
  const legacy = useAccountView({ kind: 'profile.read' }, accountRegionFromPersonalData, { preserveOnAccountRevision: true });
  const region = settings.resource.data?.region || legacy.resource.data;
  const enabled = !!settings.resource.data?.capabilities.accountRegionSave && !!settings.resource.data?.region;
  const reload = () => { settings.reload(); legacy.reload(); };
  return <Screen title={t('accountRegion.title')} subtitle={t('accountRegion.intro')}>
    {settings.resource.loading ? <ResourceStatus resource={settings.resource} onRefresh={reload} /> : region ? <RegionForm key={JSON.stringify([region, enabled])} initial={region} enabled={enabled} onCheck={reload} /> : <ResourceStatus resource={legacy.resource} onRefresh={reload} />}
    {!settings.resource.loading && settings.resource.error && settings.resource.error !== 'accountSettings.serverUpdateRequired' && region && <><Notice error>{t(settings.resource.error)}</Notice><Button secondary onPress={reload}>{t('live.retry')}</Button></>}
  </Screen>;
}
