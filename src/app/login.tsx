import { NativeSocialAuth } from '@/features/auth/NativeSocialAuth';
import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { useRef, useState, type ComponentRef } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useDemo } from '@/state/context';
import { useLiveAccount } from '@/api/context';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { useI18n } from '@/i18n/context';
import { LanguagePicker } from '@/i18n/LanguagePicker';

export default function LoginScreen() {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { enterDemo, persistenceError } = useDemo();
  const live = useLiveAccount();
  const { t } = useI18n();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [socialEngaged, setSocialEngaged] = useState(false);
  const authBusy = live.signingIn || socialEngaged;
  const [visible, setVisible] = useState(false); const [error, setError] = useState('');
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const submit = async () => {
    if (!live.canLogin || authBusy) return;
    setError('');
    const result = await live.login(email, password);
    setPassword(''); setVisible(false);
    setError(result.error || '');
  };
  const explore = () => { if (!authBusy) void live.logout().then(enterDemo); };
  return <Screen title={t('auth.welcome')} subtitle={t('auth.subtitle')}>
    {live.canLogin && <LanguagePicker disabled={authBusy} />}
    <NativeSocialAuth enabled={live.canLogin} disabled={live.signingIn} onEngagedChange={setSocialEngaged} />
    <View style={[s.card, styles.form]}>
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} placeholder={t('auth.emailPlaceholder')} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={live.canLogin && !authBusy} textContentType="username" autoComplete="username" returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()} />
      <View style={s.field}>
        <Text style={s.label}>{t('auth.password')}</Text>
        <View style={styles.passwordField}>
          <TextInput ref={passwordInput} accessibilityLabel={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} editable={live.canLogin && !authBusy} textContentType="password" autoComplete="current-password" placeholder={t('auth.passwordPlaceholder')} placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={submit} style={[s.input, styles.passwordInput]} />
          <Pressable accessibilityRole="button" accessibilityLabel={t(visible ? 'auth.hidePassword' : 'auth.showPassword')} onPress={() => setVisible(value => !value)} style={({ pressed }) => [styles.showPassword, pressed && styles.pressed]}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.muted} /></Pressable>
        </View>
      </View>
      {error ? <Notice error>{t(error)}</Notice> : null}
      <Button onPress={() => { void submit(); }} disabled={!live.canLogin || authBusy}>{t(live.signingIn ? 'auth.signingIn' : 'auth.signIn')}</Button>
      <Pressable accessibilityRole="button" disabled={authBusy} onPress={() => router.push('/recover')} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}><Text style={styles.link}>{t('auth.forgotPassword')}</Text></Pressable>
    </View>
    {!live.canLogin && <Pressable accessibilityRole="button" accessibilityLabel={t('auth.explore')} disabled={authBusy} accessibilityState={{ disabled: authBusy }} onPress={explore} style={({ pressed }) => [styles.exploreButton, pressed && styles.pressed]}>
      <View style={styles.exploreIcon}><Ionicons name="cube-outline" size={23} color={colors.accent} /></View>
      <View style={styles.exploreCopy}><Text style={styles.exploreTitle}>{t('auth.explore')}</Text><Text style={s.small}>{t('auth.exploreHint')}</Text></View>
      <Ionicons name="arrow-forward" size={20} color={colors.accent} />
    </Pressable>}
    <View style={styles.registerRow}>
      <Text style={s.small}>{t('auth.firstVisit')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('auth.createAccount')} disabled={authBusy} onPress={() => router.push('/register')} style={({ pressed }) => [styles.textAction, styles.registerAction, pressed && styles.pressed]}><Text style={styles.link}>{t('auth.createAccount')}</Text><Ionicons name="chevron-forward" size={14} color={colors.accent} /></Pressable>
    </View>
    {!live.canLogin && <Notice>{t('auth.webHint')}</Notice>}
    {live.notice && <Notice error>{t(live.notice)}</Notice>}
    {live.notice === 'errors.sessionCleanup' && <Button secondary onPress={() => { void live.logout(); }}>{t('auth.retrySignOut')}</Button>}
    {!live.canLogin && persistenceError && <Notice error>{persistenceError}</Notice>}
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  form: { padding: 16, gap: 14, borderRadius: 20 },
  passwordField: { position: 'relative' }, passwordInput: { paddingRight: 52 },
  showPassword: { position: 'absolute', right: 3, top: 0, bottom: 0, width: minTouchTarget, minHeight: minTouchTarget, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  textAction: { minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '600' }, pressed: { opacity: 0.7 },
  exploreButton: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 74, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 14 },
  exploreIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  exploreCopy: { flex: 1, gap: 3 }, exploreTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  registerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'center', alignItems: 'center' },
  registerAction: { flexDirection: 'row', gap: 3 },
});
