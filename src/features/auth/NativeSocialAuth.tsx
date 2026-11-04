import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useI18n } from '@/i18n/context';
import { Button, Notice, useUi } from '@/ui';
import { SocialProfileCompletion } from './SocialProfileCompletion';
import { SocialProviderButton } from './SocialProviderButton';
import { useNativeSocialAuth } from './useNativeSocialAuth';

type Props = { initialCountryId?: string; enabled: boolean; disabled: boolean; onEngagedChange: (value: boolean) => void };
export function NativeSocialAuth(props: Props) {
  const { language } = useI18n();
  // Unmounting aborts the previous flow and drops all credentials and metadata.
  // A new locale or capability scope must never inherit a pending identity.
  return <SocialAuthFlow key={`${props.enabled}:${language}`} {...props} />;
}

function SocialAuthFlow({ enabled, disabled, onEngagedChange, initialCountryId }: Props) {
  const flow = useNativeSocialAuth(enabled); const { t } = useI18n(); const { s } = useUi();
  const engaged = flow.busy || flow.pending !== null;
  useEffect(() => { onEngagedChange(engaged); return () => onEngagedChange(false); }, [engaged, onEngagedChange]);
  if (!flow.providers.length && !flow.pending && !flow.error && !flow.unavailable && !flow.checkingAvailability) return null;
  return <View style={{ gap: 12 }}>
    {flow.checkingAvailability && <Text accessibilityRole="status" style={[s.small, { textAlign: 'center' }]}>{t('socialAuth.checkingMethods')}</Text>}
    {flow.unavailable && !flow.pending && <><Text style={[s.small, { textAlign: 'center' }]}>{t('socialAuth.unavailable')}</Text><Button secondary disabled={disabled || flow.busy || flow.checkingAvailability} onPress={flow.retryAvailability}>{t('socialAuth.retryMethods')}</Button></>}
    {!flow.pending && <View style={{ gap: 10 }}>{flow.providers.map(provider => <SocialProviderButton key={provider} provider={provider} disabled={disabled || flow.busy} onPress={() => { void flow.start(provider); }} />)}</View>}
    {flow.pending && <SocialProfileCompletion key={flow.pending.expiresAt} pending={flow.pending} busy={flow.busy} initialCountryId={initialCountryId} onSubmit={(profile, accepted) => { void flow.complete(profile, accepted); }} onCancel={flow.cancel} />}
    {flow.busy && <Text accessibilityRole="status" style={s.small}>{t('socialAuth.working')}</Text>}
    {flow.error && <Notice error>{t(flow.error)}</Notice>}
    {!engaged && flow.providers.length > 0 && <Text style={[s.small, { textAlign: 'center' }]}>{t('socialAuth.orEmail')}</Text>}
  </View>;
}
