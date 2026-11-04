import { currencyDisplayLabel } from '@/domain/presentation-labels';
import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n/context';
import { Button, Field, Notice, minTouchTarget, useUi } from '@/ui';

export type DeclarationDraftItem = { clientKey: string; id: string | null; title: string; url: string; quantity: string; price: string; currency?: string | null; currencyId?: string | null; productType?: string | null; orderNumber?: string | null; requiresPriceEntry?: boolean };
let draftSequence = 0;
export function newDeclarationItem(): DeclarationDraftItem { return { clientKey: `new-${++draftSequence}`, id: null, title: '', url: '', quantity: '1', price: '' }; }

export function DeclarationEditor({ items, onChange, currency, disabled = false, advancedFields = true, fieldErrors = {} }: { items: DeclarationDraftItem[]; onChange: (items: DeclarationDraftItem[]) => void; currency: string | null; disabled?: boolean; advancedFields?: boolean; fieldErrors?: Record<string, string> }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, formatNumber } = useI18n();
  const update = (clientKey: string, field: keyof DeclarationDraftItem, value: string) => onChange(items.map(item => item.clientKey === clientKey ? { ...item, [field]: value } : item));
  const errorFor = (index: number, field: string) => fieldErrors[`items.${index}.${field}`] || fieldErrors[`declarations.${index}.${field}`] || fieldErrors[`declarationItems.${index}.${field}`];
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={s.heading}>{t('parcelForm.products')}</Text>
    {items.map((item, index) => <View key={item.clientKey} style={s.card}>
      <View style={s.row}><Text style={s.heading}>{t('parcelForm.productNumber', { number: formatNumber(index + 1) })}</Text>{items.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={t('parcelForm.removeProduct', { number: formatNumber(index + 1) })} disabled={disabled} accessibilityState={{ disabled }} onPress={() => onChange(items.filter(value => value.clientKey !== item.clientKey))} style={({ pressed }) => [styles.remove, disabled && styles.disabled, pressed && s.pressed]}><Ionicons name="trash-outline" size={18} color={colors.error} /><Text style={styles.removeText}>{t('parcelForm.remove')}</Text></Pressable>}</View>
      <Field label={t('parcelForm.productTitle')} value={item.title} onChangeText={value => update(item.clientKey, 'title', value)} editable={!disabled} />
      {errorFor(index, 'title') && <Notice error>{t(errorFor(index, 'title'))}</Notice>}
      <Field label={t('parcelForm.productUrl')} value={item.url} onChangeText={value => update(item.clientKey, 'url', value)} editable={!disabled} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
      {errorFor(index, 'url') && <Notice error>{t(errorFor(index, 'url'))}</Notice>}
      <View style={styles.twoColumns}><View style={styles.column}><Field label={t('parcelForm.quantity')} value={item.quantity} onChangeText={value => update(item.clientKey, 'quantity', value)} editable={!disabled} keyboardType="number-pad" /></View><View style={styles.column}><Field label={t('parcelForm.unitPrice', { currency: currencyDisplayLabel(item.currency || currency) || '—' })} value={item.price} onChangeText={value => update(item.clientKey, 'price', value)} editable={!disabled} keyboardType="decimal-pad" /></View></View>
      <Text style={s.small}>{t('parcelForm.rowValueHint')}</Text>
      {errorFor(index, 'quantity') && <Notice error>{t(errorFor(index, 'quantity'))}</Notice>}
      {errorFor(index, 'price') && <Notice error>{t(errorFor(index, 'price'))}</Notice>}
      {advancedFields && <><Field label={t('parcelForm.productType')} value={item.productType || ''} onChangeText={value => update(item.clientKey, 'productType', value)} editable={!disabled} /><Field label={t('parcelForm.orderNumber')} value={item.orderNumber || ''} onChangeText={value => update(item.clientKey, 'orderNumber', value)} editable={!disabled} autoCapitalize="none" autoCorrect={false} /></>}
    </View>)}
    <Button secondary disabled={disabled} onPress={() => onChange([...items, newDeclarationItem()])}>{t('parcelForm.addProduct')}</Button>
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({ stack: { gap: 12 }, twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, column: { flexGrow: 1, flexBasis: 120 }, remove: { minHeight: minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 10 }, removeText: { color: colors.error, fontSize: 13, fontWeight: '600' }, disabled: { opacity: 0.5 } });
