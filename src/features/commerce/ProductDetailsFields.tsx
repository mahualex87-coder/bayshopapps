import { Text, View } from 'react-native';
import { useI18n } from '@/i18n/context';
import { Field, useUi } from '@/ui';

export type ProductDetailsValues = { title: string; quantity: string; price: string; shipping: string; color: string; size: string; comment: string };

/** The same compact product form is used when adding and editing a cart item. */
export function ProductDetailsFields({ values, onChange, errors, disabled, currency }: {
  values: ProductDetailsValues;
  onChange(key: keyof ProductDetailsValues, value: string): void;
  errors: Record<string, string>;
  disabled: boolean;
  currency?: string | null;
}) {
  const { t } = useI18n(); const { s } = useUi();
  const field = (key: keyof ProductDetailsValues, label = t(`commerce.${key}`)) => <Field
    label={label} labelSuffix={(key === 'price' || key === 'shipping') && currency ? currency.toUpperCase() : undefined} value={values[key]} onChangeText={value => onChange(key, value)}
    error={errors[key] ? t(errors[key]) : undefined} editable={!disabled}
    keyboardType={key === 'quantity' ? 'number-pad' : key === 'price' || key === 'shipping' ? 'decimal-pad' : 'default'}
    multiline={key === 'comment'} numberOfLines={key === 'comment' ? 2 : 1}
    style={key === 'comment' ? { minHeight: 70, textAlignVertical: 'top' } : undefined}
  />;
  const moneyLabel = (key: 'price' | 'shipping') => `${t(`cartLink.${key}Label`)} *`;
  return <>
    {field('title', `${t('commerce.title')} *`)}
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ flex: 0.8, minWidth: 0 }}>{field('quantity', `${t('commerce.quantity')} *`)}</View>
      <View style={{ flex: 1.4, minWidth: 0 }}>{field('price', moneyLabel('price'))}</View>
    </View>
    {field('shipping', moneyLabel('shipping'))}
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, minWidth: 0 }}>{field('color', t('cartLink.colorLabel'))}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{field('size', t('cartLink.sizeLabel'))}</View>
    </View>
    <Text style={s.small}>{t('cartLink.variantHelp')}</Text>
    {field('comment')}
  </>;
}
