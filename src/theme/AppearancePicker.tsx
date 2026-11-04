import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n/context';
import { Notice, minTouchTarget, useUi } from '@/ui';
import { useTheme } from './context';
import type { ThemeMode } from './core';

const choices = [
  { value: 'system', icon: 'phone-portrait-outline' }, { value: 'light', icon: 'sunny-outline' }, { value: 'dark', icon: 'moon-outline' },
] as const;
export function AppearancePicker() {
  const { t } = useI18n();
  const { colors, s } = useUi();
  const { mode, setMode, persistenceError } = useTheme();
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('appearance.title')}</Text>
    <Text style={s.small}>{t('appearance.hint')}</Text>
    <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={t('appearance.title')}>
      {choices.map(choice => <Pressable key={choice.value} accessibilityRole="radio" accessibilityLabel={t(`appearance.${choice.value}`)} accessibilityState={{ checked: mode === choice.value }} aria-checked={mode === choice.value} onPress={() => setMode(choice.value as ThemeMode)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: minTouchTarget, padding: 12, borderRadius: 12, backgroundColor: mode === choice.value ? colors.accentSoft : colors.soft, borderWidth: 1, borderColor: mode === choice.value ? colors.accentBorder : colors.border }, pressed && s.pressed]}>
        <Ionicons accessible={false} aria-hidden name={choice.icon} color={mode === choice.value ? colors.accent : colors.muted} size={21} />
        <Text style={[s.body, { flex: 1 }]}>{t(`appearance.${choice.value}`)}</Text>
        {mode === choice.value && <Ionicons accessible={false} aria-hidden name="checkmark" color={colors.accent} size={21} />}
      </Pressable>)}
    </View>
    {persistenceError && <Notice error>{t('appearance.saveError')}</Notice>}
  </View>;
}
