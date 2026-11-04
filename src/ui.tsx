import { CountryLabel } from '@/components/CountryFlag';
import { normalizeUserUrl } from '@/domain/user-url';
import { sortCountries } from '@/domain/option-order';
import { standaloneCountryLabel } from '@/domain/presentation-labels';
import { useI18n } from '@/i18n/context';
import { useRef, type ComponentRef, type PropsWithChildren, type ReactNode, type RefObject } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShellNavigation } from '@/navigation/context';
import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassSurface } from '@/navigation/GlassSurface';
import { useTheme, useThemeStyles } from '@/theme/context';
import type { ThemeColors } from '@/theme/palette';

export const minTouchTarget = Platform.OS === 'android' ? 48 : 44;

export function useUi() {
  const { colors } = useTheme();
  const s = useThemeStyles(makeSharedStyles);
  return { colors, s };
}

export function Screen({ children, title, subtitle, titleAction, standalone = false, scrollRef }: PropsWithChildren<{ title: string; subtitle?: ReactNode; titleAction?: ReactNode; standalone?: boolean; scrollRef?: RefObject<ComponentRef<typeof ScrollView> | null> }>) {
  const { colors, s } = useUi();
  const insets = useSafeAreaInsets();
  const shell = useShellNavigation();
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  const content = <ScrollView ref={scrollRef} contentContainerStyle={[s.content, { paddingBottom: 20 + (standalone || !shell ? insets.bottom : 0) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={false}>
    <View style={s.column}><View style={s.pageHeading}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text accessibilityRole="header" style={[s.title, { flex: 1, minWidth: 0 }]}>{title}</Text>{titleAction}</View>{subtitle && (typeof subtitle === 'string' ? <Text style={s.subtitle}>{subtitle}</Text> : subtitle)}</View>{children}</View>
  </ScrollView>;
  if (shell && !standalone) return <View style={s.flex}>{content}</View>;
  return <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <BlurTargetView ref={blurTarget} style={s.flex}>
      <LinearGradient colors={[colors.gradientTop, colors.gradientMiddle, colors.gradientBottom]} locations={[0, 0.48, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={[s.flex, { paddingTop: insets.top + 66 }]} edges={['left', 'right']}>{content}</SafeAreaView>
    </BlurTargetView>
    <View style={[s.authHeader, { top: insets.top + 5 }]}>
      <GlassSurface blurTarget={blurTarget} style={s.authGlass}>
        <View style={s.wordmark}><Image source={require('../assets/branding/brand-mark.png')} style={{ width: 32, height: 29 }} resizeMode="contain" accessible={false} /><Text maxFontSizeMultiplier={1.2} style={s.brand}>bayshop<Text style={{ color: colors.accent }}>.</Text></Text></View>
      </GlassSurface>
    </View>
  </KeyboardAvoidingView>;
}

export function Button({ children, onPress, secondary = false, disabled = false }: PropsWithChildren<{ onPress: () => void; secondary?: boolean; disabled?: boolean }>) {
  const { colors, s } = useUi();
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondaryButton, disabled && { opacity: 0.55 }, pressed && s.pressed]}><Text style={[s.buttonText, secondary && { color: colors.text }]}>{children}</Text></Pressable>;
}

export function Field({ label, labelSuffix, error, ...props }: TextInputProps & { label: string; labelSuffix?: string; error?: string }) {
  const { colors, s } = useUi();
  const { scheme } = useTheme();
  const onBlur: TextInputProps['onBlur'] = event => {
    if (props.keyboardType === 'url' && props.editable !== false && !props.readOnly && typeof props.value === 'string') {
      const normalized = normalizeUserUrl(props.value);
      if (normalized !== props.value) props.onChangeText?.(normalized);
    }
    props.onBlur?.(event);
  };
  return <View style={s.field}><Text style={s.label}>{label}{labelSuffix ? <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '400' }}>{`  ${labelSuffix}`}</Text> : null}</Text><TextInput keyboardAppearance={scheme} selectionColor={colors.accent} {...props} onBlur={onBlur} accessibilityLabel={[label, labelSuffix].filter(Boolean).join(' ')} accessibilityHint={[props.accessibilityHint, error].filter(Boolean).join('. ') || undefined} style={[s.input, props.style, error ? { borderColor: colors.error } : undefined]} placeholderTextColor={colors.muted} />{error && <Text accessibilityRole="alert" style={[s.small, { color: colors.error }]}>{error}</Text>}</View>;
}

export function Choice({ label, options, value, onChange, country = false }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void; country?: boolean }) {
  const { s } = useUi();
  const { language } = useI18n();
  if (country) options = sortCountries(options, name => ({ name, placeholder: name === '' || name === 'Toate' }));
  return <View style={s.field}><Text style={s.label}>{label}</Text><View style={s.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>{options.map(option => <Pressable key={option} accessibilityRole="radio" aria-checked={option === value} accessibilityState={{ checked: option === value }} accessibilityLabel={`${label}: ${country ? standaloneCountryLabel(option, language) : option}`} onPress={() => onChange(option)} style={[s.choice, option === value && s.choiceSelected]}><>{country ? <CountryLabel label={option} textStyle={[s.choiceText, option === value && s.choiceTextSelected]} /> : <Text style={[s.choiceText, option === value && s.choiceTextSelected]}>{option}</Text>}</></Pressable>)}</View></View>;
}

export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  const { colors, s } = useUi();
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={s.notice}><Text style={[s.noticeText, error && { color: colors.error }]}>{children}</Text></View>;
}

const makeSharedStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.background },
  brandRow: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authHeader: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  authGlass: { width: '100%', maxWidth: 620, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 23 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 }, logo: { backgroundColor: colors.primaryButton, color: colors.onAccent, fontSize: 24, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 1, borderRadius: 9 }, brand: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -1 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 20 }, column: { width: '100%', maxWidth: 596, alignSelf: 'center', gap: 12 },
  pageHeading: { gap: 4, paddingTop: 12, paddingBottom: 2 }, title: { color: colors.text, fontSize: 25, fontWeight: '700', letterSpacing: -.7 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '600' }, body: { color: colors.text, fontSize: 14, lineHeight: 21 }, small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: colors.primaryButton, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: Math.max(46, minTouchTarget), justifyContent: 'center', alignItems: 'center' }, secondaryButton: { backgroundColor: colors.soft }, buttonText: { color: colors.onAccent, fontWeight: '600', fontSize: 14, textAlign: 'center' }, pressed: { opacity: 0.7 },
  field: { gap: 8 }, label: { fontSize: 13, fontWeight: '600', color: colors.text }, input: { minHeight: 49, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { maxWidth: '100%', minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: colors.soft, borderRadius: 11 }, choiceSelected: { backgroundColor: colors.text }, choiceText: { fontSize: 14, color: colors.text }, choiceTextSelected: { color: colors.surface },
  notice: { backgroundColor: colors.soft, borderRadius: 13, padding: 12 }, noticeText: { color: colors.text, fontSize: 13, lineHeight: 20 },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' },
  status: { color: colors.text, backgroundColor: colors.soft, fontSize: 11, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  hero: { backgroundColor: colors.heroSurface, borderRadius: 18, padding: 18, gap: 12 }, heroTitle: { color: colors.heroText, fontWeight: '600', fontSize: 23, lineHeight: 30, letterSpacing: -.5 }, eyebrow: { color: colors.heroMuted, fontSize: 11, letterSpacing: 1.7 },
  setting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, minHeight: minTouchTarget, gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
});
