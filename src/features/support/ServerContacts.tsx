import { useCallback, useState } from 'react';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { fetch } from 'expo/fetch';
import { Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { profileFormData } from '@/api/account-operations';
import { useI18n } from '@/i18n/context';
import { GlassSurface } from '@/navigation/GlassSurface';
import { usePageLoad } from '@/navigation/PageLoading';
import { ResourceStatus, type LiveResource } from '@/features/live/shared';
import { useUi } from '@/ui';
import { readServerContacts, type ServerContacts as ContactData } from './server-contacts';

export function ContactCards({ data }: { data: ContactData }) {
  const { s } = useUi();
  return <View style={{ gap: 12 }}>{data.sections.map((section, index) => <GlassSurface key={index} style={{ padding: 16, gap: 10 }}>
    {section.title && <Text selectable accessibilityRole="header" style={s.heading}>{section.title}</Text>}
    {section.paragraphs.map((paragraph, paragraphIndex) => <Text key={paragraphIndex} selectable style={[s.body, { fontSize: 15, lineHeight: 23 }]}>{paragraph}</Text>)}
  </GlassSurface>)}</View>;
}
export function ServerContacts() {
  const { s } = useUi(); const { t, language } = useI18n();
  const focused = useIsFocused();
  const { readView, authenticated, accountId, authRevision, accountRevision } = useLiveAccount();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ scope: string; resource: LiveResource<ContactData> } | null>(null);
  const scope = JSON.stringify([authenticated, accountId, authRevision, accountRevision, language, retry]);
  useFocusEffect(useCallback(() => {
    if (!authenticated) return;
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 25_000);
    void (async () => {
      const profile = profileFormData(await readView({ kind: 'profile.read' }, { signal: controller.signal }));
      const countryCode = profile.countries.find(country => country.id === profile.countryId)?.code?.toUpperCase();
      if (!countryCode) throw new Error('contacts.contextUnavailable');
      return readServerContacts(async (url, options) => await fetch(url, options) as unknown as Response, countryCode, language, controller.signal);
    })().then(data => { if (active) setResult({ scope, resource: { data, loading: false, error: null, updatedAt: Date.now() } }); })
      .catch(error => { if (active) setResult({ scope, resource: { data: null, loading: false, error: error instanceof Error && error.message === 'contacts.contextUnavailable' ? error.message : 'contacts.unavailable', updatedAt: null } }); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [authenticated, readView, scope, language]));
  const resource = result?.scope === scope ? result.resource : { data: null, loading: authenticated, error: null, updatedAt: null };
  const pending = focused && authenticated && (resource.loading || (resource.data === null && resource.error === null && resource.updatedAt === null));
  usePageLoad(pending, pending && resource.data === null);
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={s.heading}>{resource.data?.title || t('contacts.title')}</Text>
    <ResourceStatus resource={resource} onRefresh={() => setRetry(value => value + 1)} />
    {resource.data && <ContactCards data={resource.data} />}
  </View>;
}
