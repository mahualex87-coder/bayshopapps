import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { DemoProvider, useDemo } from '@/state/context';
import { useUi } from '@/ui';
import { AppThemeProvider, useTheme } from '@/theme/context';
import { AppShell } from '@/navigation/AppShell';
import { useVisualPreferences } from '@/navigation/accessibility';
import { ConfirmationProvider } from '@/navigation/Confirmation';
import { PushProvider, PushNavigationBridge } from '@/features/push/PushProvider';
import { LaunchExperience } from '@/features/launch/LaunchExperience';
import { LiveAccountProvider, useLiveAccount } from '@/api/context';
import { I18nProvider, useI18n } from '@/i18n/context';
import { SupportSessionBoundary } from '@/features/support/SupportSessionBoundary';
import { SupportChatProvider } from '@/features/support/SupportChatProvider';
import { GoogleCredentialSessionBoundary } from '@/features/auth/GoogleCredentialSessionBoundary';
import { PageLoadingBoundary, PageLoadingProvider, useInitialPageReady } from '@/navigation/PageLoading';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
  SplashScreen.setOptions({ fade: false });
}

function LaunchGate() {
  const { s } = useUi();
  const { ready: themeReady } = useTheme();
  const { ready } = useDemo();
  const { ready: languageReady } = useI18n();
  const live = useLiveAccount();
  const pageReady = useInitialPageReady();
  const [finished, setFinished] = useState(false);
  const finish = useCallback(() => setFinished(true), []);
  const showAnimatedLaunch = useCallback(() => {
    if (Platform.OS !== 'web') SplashScreen.hide();
  }, []);
  return <View style={s.flex}>
    <View {...(Platform.OS === 'web' ? { inert: !finished } : {})} style={s.flex} pointerEvents={finished ? 'auto' : 'none'} aria-hidden={!finished} accessibilityElementsHidden={!finished} importantForAccessibility={finished ? 'auto' : 'no-hide-descendants'}><Navigation launchFinished={finished} /></View>
    {!finished && <View onLayout={showAnimatedLaunch} style={StyleSheet.absoluteFill}><LaunchExperience ready={ready && live.ready && languageReady && themeReady && pageReady} onFinished={finish} /></View>}
  </View>;
}

function Navigation({ launchFinished }: { launchFinished: boolean }) {
  const { colors, s } = useUi();
  const { ready: themeReady } = useTheme();
  const { t, ready: languageReady } = useI18n();
  const demo = useDemo();
  const live = useLiveAccount();
  const demoAuthenticated = Platform.OS === 'web' && demo.authenticated;
  const authenticated = demoAuthenticated || live.authenticated;
  const { reduceMotion } = useVisualPreferences();
  if (!demo.ready || !live.ready || !languageReady || !themeReady) return <View style={[s.safe, { alignItems: 'center', justifyContent: 'center', gap: 16 }]}><ActivityIndicator color={colors.accent} /><Text style={s.body}>{t('auth.preparing')}</Text></View>;
  const stack = <Stack screenLayout={({ children, route }) => <PageLoadingBoundary routeId={route.key}>{children}</PageLoadingBoundary>} screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'slide_from_right', contentStyle: { backgroundColor: 'transparent' } }}>
    <Stack.Protected guard={!authenticated}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" /><Stack.Screen name="recover" />
    </Stack.Protected>
    <Stack.Protected guard={authenticated}>
      <Stack.Screen name="index" /><Stack.Screen name="waiting" /><Stack.Screen name="warehouse" /><Stack.Screen name="shipments" /><Stack.Screen name="received" /><Stack.Screen name="account" />
      <Stack.Screen name="balance" /><Stack.Screen name="address-book" /><Stack.Screen name="warehouse-addresses" /><Stack.Screen name="settings" /><Stack.Screen name="calculator" /><Stack.Screen name="notifications" /><Stack.Screen name="support" /><Stack.Screen name="shopping" /><Stack.Screen name="cart" /><Stack.Screen name="incoming/new" /><Stack.Screen name="warehouse/[id]" /><Stack.Screen name="shipment/new" /><Stack.Screen name="shipment/[id]" /><Stack.Screen name="order/[id]" /><Stack.Screen name="order/new" /><Stack.Screen name="order/link" />
    </Stack.Protected>
    <Stack.Protected guard={live.authenticated}><Stack.Screen name="shops" /><Stack.Screen name="shop/[id]" /><Stack.Screen name="refunds" /><Stack.Screen name="incoming/[id]" /><Stack.Screen name="account/edit" /><Stack.Screen name="account/details" /><Stack.Screen name="account/region" /><Stack.Screen name="account/security" /><Stack.Screen name="account/billing" /><Stack.Screen name="account/identity" /><Stack.Screen name="account/services" /><Stack.Screen name="preferences" /><Stack.Screen name="payments" /><Stack.Screen name="loyalty" /><Stack.Screen name="recipient/new" /><Stack.Screen name="recipient/[id]" /></Stack.Protected>
  </Stack>;
  return authenticated ? <AppShell>{stack}<PushNavigationBridge active={launchFinished} /></AppShell> : stack;
}

function ThemedApp() {
  const { colors, isDark } = useTheme();
  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: colors.background, card: colors.surface, primary: colors.accent, text: colors.text, border: colors.border, notification: colors.accent } };
  }, [colors, isDark]);
  return <ThemeProvider value={navigationTheme}><I18nProvider><LiveAccountProvider><PushProvider><SupportSessionBoundary /><GoogleCredentialSessionBoundary /><DemoProvider><StatusBar style={isDark ? 'light' : 'dark'} /><ConfirmationProvider><PageLoadingProvider><SupportChatProvider><LaunchGate /></SupportChatProvider></PageLoadingProvider></ConfirmationProvider></DemoProvider></PushProvider></LiveAccountProvider></I18nProvider></ThemeProvider>;
}
export default function RootLayout() { return <AppThemeProvider><ThemedApp /></AppThemeProvider>; }
