import { useEffect, useState } from 'react';
import { getLocales } from 'expo-localization';
import { fetch } from 'expo/fetch';
import { Text, View } from 'react-native';
import { confirmedRegistrationRegion, initialOnboardingSelection, readPublicOnboarding, type DeviceLocale, type OnboardingCatalog, type RegistrationRegion } from '@/api/public-onboarding';
import { OptionPicker } from '@/features/accountops/shared';
import { useI18n } from '@/i18n/context';
import { Button, Notice, useUi } from '@/ui';
import { usePageLoad } from '@/navigation/PageLoading';

// A non-secret choice survives navigation between login and registration, but
// never supplies country availability: every screen validates the server list.
let previousChoice: { countryId: string; languageId: string } | null = null;
export const registrationRegionEnabled = process.env.EXPO_PUBLIC_BAYSHOP_REGION_ONBOARDING === 'true';
export function useRegistrationRegion(enabled = registrationRegionEnabled) {
  const { language, setLanguage } = useI18n();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; catalog: OnboardingCatalog | null } | null>(null);
  const [selection, setSelection] = useState(previousChoice || { countryId: '', languageId: '' });
  const [confirmed, setConfirmed] = useState<RegistrationRegion | null>(null);
  const key = `${language}:${revision}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void readPublicOnboarding(fetch, language, controller.signal).then(catalog => {
      if (controller.signal.aborted) return;
      let locales: DeviceLocale[] = []; try { locales = getLocales(); } catch { /* Explicit selection remains available. */ }
      const selected = initialOnboardingSelection(catalog, locales, language, previousChoice);
      setSelection(selected); setResult({ key, catalog });
    }).catch(() => { if (!controller.signal.aborted) setResult({ key, catalog: null }); });
    return () => controller.abort();
  }, [enabled, key, language]);
  const current = result?.key === key ? result : null;
  const catalog = current?.catalog || null;
  usePageLoad(enabled && !current);
  const valid = confirmedRegistrationRegion(catalog, selection.countryId, selection.languageId);
  const confirmedRegion = valid && confirmed && valid.countryId === confirmed.countryId && valid.languageId === confirmed.languageId && language === valid.language ? valid : null;
  const selectCountry = (countryId: string) => {
    const country = catalog?.countries.find(country => country.id === countryId); if (!country) return;
    const choice = { countryId, languageId: country.languages.find(item => item.code === language)?.id || country.defaultLanguageId };
    previousChoice = choice; setSelection(choice); setConfirmed(null);
  };
  const selectLanguage = (languageId: string) => { if (!catalog?.countries.find(country => country.id === selection.countryId)?.languages.some(item => item.id === languageId)) return; const choice = { ...selection, languageId }; previousChoice = choice; setSelection(choice); setConfirmed(null); };
  const confirm = async () => { if (!valid) return; previousChoice = selection; if (await setLanguage(valid.language)) setConfirmed(valid); };
  return { enabled, catalog, loading: enabled && !current, unavailable: !!current && !catalog, selection, valid, confirmedRegion, selectCountry, selectLanguage, confirm, retry: () => setRevision(value => value + 1) };
}

export function RegistrationRegionPicker({ region, disabled = false }: { region: ReturnType<typeof useRegistrationRegion>; disabled?: boolean }) {
  const { t } = useI18n(); const { s } = useUi();
  const country = region.catalog?.countries.find(country => country.id === region.selection.countryId);
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('onboarding.title')}</Text>
    <Text style={s.small}>{t('onboarding.hint')}</Text>
    {region.loading ? <Text accessibilityRole="status" style={s.small}>{t('onboarding.loading')}</Text> : region.unavailable ? <><Notice error>{t('onboarding.unavailable')}</Notice><Button secondary disabled={disabled} onPress={region.retry}>{t('live.retry')}</Button></> : <>
      <OptionPicker country label={t('field.country')} value={region.selection.countryId} options={region.catalog?.countries || []} disabled={disabled} onChange={region.selectCountry} />
      <OptionPicker label={t('language.title')} value={region.selection.languageId} options={country?.languages || []} disabled={disabled || !country} onChange={region.selectLanguage} />
      {!!region.selection.languageId && !region.valid && <Notice>{t('onboarding.languageUnsupported')}</Notice>}
      {!region.confirmedRegion && <Button disabled={disabled || !region.valid} onPress={() => { void region.confirm(); }}>{t('onboarding.continue')}</Button>}
    </>}
  </View>;
}
