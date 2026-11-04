import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { validAuthEmail } from '@/api/public-auth';
import { usePublicAuth } from '@/features/auth/usePublicAuth';
import { useI18n } from '@/i18n/context';
import { LanguagePicker } from '@/i18n/LanguagePicker';
import { Button, Field, Notice, Screen, useUi } from '@/ui';

export default function RecoverScreen() {
  const { s } = useUi();
  const { t, language } = useI18n();
  const { client, busy, result, run, finished } = usePublicAuth();
  const [email, setEmail] = useState(''); const [error, setError] = useState('');
  const submit = () => {
    if (busy || finished) return;
    if (!validAuthEmail(email)) { setError('auth.invalidEmail'); return; }
    setError('');
    void run(signal => client.restore(email, language, signal));
  };
  return <Screen title={t('auth.recoverTitle')} subtitle={t('auth.recoverSubtitle')}>
    <LanguagePicker disabled={busy} />
    <View style={s.card}>
      {!finished && <Field label={t('auth.email')} value={email} onChangeText={value => { setEmail(value); setError(''); }} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" placeholder={t('auth.emailPlaceholder')} returnKeyType="send" onSubmitEditing={submit} />}
      {error ? <Notice error>{t(error)}</Notice> : null}
      {result && <Notice error={result.outcome !== 'accepted'}>{result.message || t(result.errorKey || (result.outcome === 'accepted' ? 'auth.recoveryAccepted' : 'auth.requestRejected'))}</Notice>}
      {!finished && <Button disabled={busy} onPress={submit}>{t(busy ? 'auth.recovering' : 'auth.recoverSubmit')}</Button>}
    </View>
    <Button secondary disabled={busy} onPress={() => router.replace('/login')}>{t('auth.backToLogin')}</Button>
  </Screen>;
}
