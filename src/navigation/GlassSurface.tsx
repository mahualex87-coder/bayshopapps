import type { ThemeColors } from '@/theme/palette';
import { useTheme, useThemeStyles } from '@/theme/context';
import type { ComponentRef, PropsWithChildren, RefObject } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useVisualPreferences } from './accessibility';

export function GlassSurface({ children, style, blurTarget, onLayout }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; blurTarget?: RefObject<ComponentRef<typeof View> | null>; onLayout?: ViewProps['onLayout'] }>) {
  const { scheme, isDark } = useTheme();
  const styles = useThemeStyles(makeStyles);
  const { reduceTransparency } = useVisualPreferences();
  const nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable() && !reduceTransparency;
  const solid = reduceTransparency || (Platform.OS === 'android' && !blurTarget);
  return <View onLayout={onLayout} style={[styles.base, solid && styles.solid, style]}>
    {nativeGlass ? <GlassView pointerEvents="none" colorScheme={scheme} glassEffectStyle="regular" style={styles.material} />
      : !solid && <BlurView pointerEvents="none" tint={isDark ? 'systemMaterialDark' : 'systemMaterialLight'} intensity={80} blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" style={[styles.material, styles.fallback]} />}
    {children}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  base: { overflow: 'hidden', borderWidth: 1, borderColor: colors.glassHighlight, borderRadius: 26 },
  material: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, },
  fallback: { backgroundColor: colors.glassStrong }, solid: { backgroundColor: colors.surface, borderColor: colors.border },
});
