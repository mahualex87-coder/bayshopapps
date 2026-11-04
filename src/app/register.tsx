import { RegistrationRegionPicker, useRegistrationRegion } from '@/features/auth/RegistrationRegionPicker';
import { NativeSocialAuth } from '@/features/auth/NativeSocialAuth';
import { useLiveAccount } from '@/api/context';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { registrationError } from '@/api/public-auth';
import { usePublicAuth } from '@/features/auth/usePublicAuth';
import { InternalContentViewer } from '@/features/content/InternalContentViewer';
import { publicContentPages } from '@/features/content/public-content-policy';
import { useI18n } from '@/i18n/context';
import { LanguagePicker } from '@/i18n/LanguagePicker';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';

export default function RegisterScreen() {
  const { colors, s } = useUi();
  const live = useLiveAccount();
  const region = useRegistrationRegion();
  const [socialEngaged, setSocialEngaged] = useState(false);
  const { t, language } = useI18n();
  const { client, busy, result, run, finished } = usePublicAuth();
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false); const [visible, setVisible] = useState(false); const [error, setError] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const requestBusy = busy || socialEngaged;
  const disabled = requestBusy || finished;
  const submit = () => {
    if (disabled) return;
    if (region.enabled && !region.confirmedRegion) { setError('onboarding.required'); return; }
    const input = { firstName, lastName, email, password, confirmation, accepted, region: region.confirmedRegion || undefined };
    const validation = registrationError(input);
    setError(validation || '');
    if (validation) return;
    setPassword(''); setConfirmation(''); setVisible(false);
    void run(signal => client.register(input, language, signal));
  };
  return <Screen title={t('auth.createAccount')} subtitle={t('auth.registrationSubtitle')}>
    {!finished && (region.enabled ? <RegistrationRegionPicker region={region} disabled={requestBusy} /> : <LanguagePicker disabled={requestBusy} />)}
    {!finished && (!region.enabled || region.confirmedRegion) && <NativeSocialAuth enabled={live.canLogin} disabled={busy} initialCountryId={region.confirmedRegion?.countryId} onEngagedChange={setSocialEngaged} />}
    {(!region.enabled || region.confirmedRegion || finished) && <View style={s.card}>
      {!finished && <>
        <Field label={t('auth.firstName')} value={firstName} onChangeText={setFirstName} editable={!requestBusy} autoComplete="given-name" textContentType="givenName" autoCapitalize="words" />
        <Field label={t('auth.lastName')} value={lastName} onChangeText={setLastName} editable={!requestBusy} autoComplete="family-name" textContentType="familyName" autoCapitalize="words" />
        <Field label={t('auth.email')} value={email} onChangeText={setEmail} editable={!requestBusy} placeholder={t('auth.emailPlaceholder')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
        <Field label={t('auth.password')} value={password} onChangeText={setPassword} editable={!requestBusy} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" />
        <Field label={t('auth.repeatPassword')} value={confirmation} onChangeText={setConfirmation} editable={!requestBusy} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" />
        <Button secondary disabled={requestBusy} onPress={() => setVisible(value => !value)}>{t(visible ? 'auth.hidePassword' : 'auth.showPassword')}</Button>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={t('auth.acceptTerms')} aria-checked={accepted} accessibilityState={{ checked: accepted, disabled: requestBusy }} disabled={requestBusy} onPress={() => setAccepted(value => !value)} style={[s.row, { minHeight: minTouchTarget, justifyContent: 'flex-start', flexWrap: 'nowrap' }]}>
          <Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={25} color={accepted ? colors.accent : colors.muted} />
          <Text style={[s.body, { flex: 1 }]}>{t('auth.acceptTerms')}</Text>
        </Pressable>
        <Button secondary disabled={requestBusy} onPress={() => setShowTerms(true)}>{t('auth.readTerms')}</Button>
      </>}
      {error && !finished ? <Notice error>{t(error)}</Notice> : null}
      {result && <Notice error={result.outcome !== 'accepted'}>{result.message || t(result.errorKey || (result.outcome === 'accepted' ? 'auth.registrationAccepted' : 'auth.requestRejected'))}</Notice>}
      {!finished && <Button disabled={requestBusy} onPress={submit}>{t(busy ? 'auth.registering' : 'auth.registerSubmit')}</Button>}
    </View>}
    <Button secondary disabled={requestBusy} onPress={() => router.replace('/login')}>{t('auth.backToLogin')}</Button>
    {showTerms && <InternalContentViewer url={publicContentPages.terms} title={t('contentReader.termsTitle')} onClose={() => setShowTerms(false)} />}
  </Screen>;
}
