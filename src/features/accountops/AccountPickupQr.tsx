import Ionicons from '@expo/vector-icons/Ionicons';
import { Component, useState, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { useLiveAccount } from '@/api/context';
import { useI18n } from '@/i18n/context';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { Button, Notice, minTouchTarget, useUi } from '@/ui';
import { useThemeStyles } from '@/theme/context';
import type { ThemeColors } from '@/theme/palette';
import { useQrBrightness } from './useQrBrightness';
import { useVisualPreferences } from '@/navigation/accessibility';

class QrBoundary extends Component<PropsWithChildren<{ fallback: ReactNode; onFailure: () => void }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function PickupCode({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { authenticated, resources } = useLiveAccount();
  const { resource, refresh } = useOperationView({ kind: 'account.qr' }, { pageLoad: false });
  const { width } = useWindowDimensions();
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const code = !resource.loading && !resource.error ? resource.data?.code : null;
  const loading = resource.loading || (!resource.data && !resource.error);
  useQrBrightness(authenticated && !!code && failedAt !== resource.updatedAt);
  const name = [resources.profile.data?.firstName, resources.profile.data?.lastName].filter(Boolean).join(' ');
  const unavailable = <View style={styles.failure}><Notice error>{t('accountQr.unavailable')}</Notice><Button secondary onPress={() => { void refresh(); }}>{t('accountQr.retry')}</Button></View>;
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safe}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{t('accountQr.title')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('accountQr.close')} onPress={onClose} style={({ pressed }) => [styles.close, pressed && s.pressed]}><Ionicons name="close" color={colors.text} size={25} /></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {!!name && <Text style={styles.name}>{name}</Text>}
      {loading ? <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={s.body}>{t('accountQr.loading')}</Text></View>
        : code ? <QrBoundary key={resource.updatedAt} fallback={unavailable} onFailure={() => setFailedAt(resource.updatedAt)}><View accessible accessibilityRole="image" accessibilityLabel={t('accountQr.image')} style={styles.qrCard}><QRCode value={code} size={Math.min(280, Math.max(128, width - 96))} quietZone={12} color="#000000" backgroundColor="#FFFFFF" ecl="M" onError={() => { throw new Error('QR rendering unavailable'); }} /></View></QrBoundary>
          : unavailable}
      <Text style={styles.description}>{t('accountQr.description')}</Text>
    </ScrollView>
  </SafeAreaView>;
}

/** Mounted only on demand: no persistent QR cache or background renewal. */
export function AccountPickupQrAction() {
  const { t } = useI18n();
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { authenticated } = useLiveAccount();
  const [open, setOpen] = useState(false);
  const { reduceMotion } = useVisualPreferences();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t('accountQr.collectAll')}. ${t('accountQr.open')}`} onPress={() => setOpen(true)} style={({ pressed }) => [styles.open, pressed && s.pressed]}><Ionicons name="qr-code-outline" color={colors.text} size={25} accessible={false} /><Text style={styles.openLabel}>{t('accountQr.collectAll')}</Text></Pressable>
    {open && authenticated && <Modal visible animationType={reduceMotion ? 'none' : 'fade'} presentationStyle="fullScreen" onRequestClose={() => setOpen(false)}><SafeAreaProvider initialMetrics={initialWindowMetrics}><PickupCode onClose={() => setOpen(false)} /></SafeAreaProvider></Modal>}
  </>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  open: { minWidth: minTouchTarget, minHeight: minTouchTarget, maxWidth: 116, paddingHorizontal: 8, paddingVertical: 7, gap: 4, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft },
  openLabel: { color: colors.text, fontSize: 11, lineHeight: 15, textAlign: 'center', fontWeight: '500', flexShrink: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 8 },
  title: { flex: 1, minWidth: 0, color: colors.text, fontSize: 20, fontWeight: '700' },
  close: { minWidth: minTouchTarget, minHeight: minTouchTarget, borderRadius: 14, backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 24 },
  name: { color: colors.text, fontSize: 20, fontWeight: '600', textAlign: 'center' },
  // A white quiet zone and black modules are deliberate in both themes.
  qrCard: { alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 20, backgroundColor: '#FFFFFF' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', maxWidth: 330 },
  loading: { gap: 12, alignItems: 'center', paddingVertical: 60 },
  failure: { width: '100%', maxWidth: 360, gap: 12 },
});
