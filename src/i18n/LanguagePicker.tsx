import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { minTouchTarget, Notice, useUi } from '@/ui';
import { useI18n } from './context';

const choices = [{ code: 'ro', name: 'Română' }, { code: 'ru', name: 'Русский' }, { code: 'en', name: 'English' }] as const;

export function LanguagePicker({ disabled = false, showServerNote = false }: { disabled?: boolean; showServerNote?: boolean }) {
  const { s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { language, setLanguage, t, persistenceError, changeError } = useI18n();
  return <View style={s.field}>
    <Text style={s.label}>{t('language.title')}</Text>
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('language.title')}>
      {choices.map(choice => <Pressable key={choice.code} disabled={disabled} accessibilityRole="radio" aria-checked={language === choice.code} accessibilityState={{ checked: language === choice.code, disabled }} accessibilityLabel={t('language.option', { name: choice.name })} onPress={() => { void setLanguage(choice.code); }} style={({ pressed }) => [styles.option, language === choice.code && styles.selected, disabled && styles.disabled, pressed && s.pressed]}>
        <Text style={[styles.label, language === choice.code && styles.selectedLabel]}>{choice.name}</Text>
      </Pressable>)}
    </View>
    {disabled && <Text style={s.small}>{t('errors.languageBusy')}</Text>}
    {showServerNote && <Text style={s.small}>{t('language.serverNote')}</Text>}
    {changeError && <Notice error>{t(changeError)}</Notice>}
    {persistenceError && <Notice error>{t(persistenceError)}</Notice>}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: minTouchTarget, minWidth: 86, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border },
  selected: { backgroundColor: colors.text, borderColor: colors.text }, label: { fontSize: 14, fontWeight: '600', color: colors.text }, selectedLabel: { color: colors.surface }, disabled: { opacity: 0.55 },
});
