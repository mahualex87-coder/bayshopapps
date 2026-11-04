import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { bundledDeliveryBrand, deliveryTransportIcon, publicDeliveryLogo } from '@/domain/delivery-identity';
import { useUi } from '@/ui';
import { useThemeStyles } from '@/theme/context';
import type { ThemeColors } from '@/theme/palette';

export function ServiceIdentity({ title, logoUrl, textStyle, style }: { title: string; logoUrl?: string | null; textStyle?: StyleProp<TextStyle>; style?: StyleProp<ViewStyle> }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const icon = deliveryTransportIcon(title);
  const brand = bundledDeliveryBrand(title);
  const logo = icon === 'cube-outline' ? publicDeliveryLogo(logoUrl) : null;
  const remoteLogo = logo && failedLogo !== logo ? logo : null;
  const logoSource = remoteLogo ? { uri: remoteLogo } : brand === 'dpd' ? require('@/assets/branding/carriers/dpd-official.png') : brand === 'usps' ? require('@/assets/branding/carriers/usps-bayshop.png') : null;
  return <View style={[styles.identity, style]}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={[styles.mark, brand === 'dpd' && styles.dpdMark]}>
      {logoSource ? <Image source={logoSource} crossOrigin="anonymous" referrerPolicy="no-referrer" resizeMode="contain" onError={() => { if (remoteLogo) setFailedLogo(remoteLogo); }} accessible={false} aria-hidden style={[styles.logo, brand === 'dpd' && styles.dpdLogo]} /> : <Ionicons name={icon} size={20} color={colors.muted} accessible={false} aria-hidden />}
    </View>
    <Text style={[s.body, styles.title, textStyle]}>{title}</Text>
  </View>;
}

export function ServiceDetailRow({ label, title, logoUrl }: { label: string; title: string; logoUrl?: string | null }) {
  const styles = useThemeStyles(makeStyles);
  return <View style={styles.detail}><Text style={styles.label}>{label}</Text><ServiceIdentity title={title} logoUrl={logoUrl} textStyle={styles.value} /></View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  mark: { width: 36, height: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 36, height: 28 }, title: { flexShrink: 1, minWidth: 0 },
  dpdMark: { width: 68, height: 36, padding: 4, borderRadius: 6, backgroundColor: '#FFFFFF' }, dpdLogo: { width: 60, height: 28 },
  detail: { paddingVertical: 10, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  label: { color: colors.muted, fontSize: 12 }, value: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
