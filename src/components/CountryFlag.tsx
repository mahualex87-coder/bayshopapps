import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, SvgXml } from 'react-native-svg';
import artwork from './country-flags/artwork.json';
import { resolveCountryCode } from './country-code';
import { standaloneCountryLabel } from '@/domain/presentation-labels';
import { useI18n } from '@/i18n/context';
import { useTheme, useThemeStyles } from '@/theme/context';
import type { ThemeColors } from '@/theme/palette';

type FlagSize = 'small' | 'regular';
type FlagProps = { code?: string | null; name?: string | null; size?: FlagSize };

/** Decorative glass-framed artwork. The adjoining country name provides the accessible label. */
export const CountryFlag = memo(function CountryFlag({ code, name, size = 'small' }: FlagProps) {
  const { colors } = useTheme();
  const styles = useThemeStyles(makeStyles);
  const resolved = resolveCountryCode(code, name);
  const xml = resolved ? (artwork as Record<string, string>)[resolved] : null;
  const small = size === 'small';
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, small ? styles.small : styles.regular]}>
    <View style={[styles.art, { width: small ? 24 : 32, height: small ? 18 : 24 }]}>
      {xml ? <SvgXml xml={xml} width="100%" height="100%" /> : <Svg width="100%" height="100%" viewBox="0 0 24 18"><Circle cx="12" cy="9" r="7" fill="none" stroke={colors.muted} strokeWidth="1.3" /><Path d="M5 9h14M12 2c-4 4-4 10 0 14M12 2c4 4 4 10 0 14" fill="none" stroke={colors.muted} strokeWidth="1.1" /></Svg>}
      <LinearGradient colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0)']} style={styles.highlight} />
    </View>
  </View>;
});

export function CountryLabel({ label, code, name, size = 'small', textStyle, style, selectable = false }: FlagProps & { label: string; textStyle?: StyleProp<TextStyle>; style?: StyleProp<ViewStyle>; selectable?: boolean }) {
  const styles = useThemeStyles(makeStyles);
  const { language } = useI18n();
  return <View style={[styles.label, style]}><CountryFlag code={code} name={name || label} size={size} /><Text selectable={selectable} style={[styles.text, textStyle]}>{standaloneCountryLabel(label, language, code)}</Text></View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  frame: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.glassBorder },
  small: { width: 32, height: 26, borderRadius: 9 }, regular: { width: 42, height: 34, borderRadius: 11 },
  art: { overflow: 'hidden', borderRadius: 4 }, highlight: { position: 'absolute', left: 0, right: 0, top: 0, height: '55%' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  text: { flexShrink: 1, color: colors.text, fontSize: 14, lineHeight: 21 },
});
