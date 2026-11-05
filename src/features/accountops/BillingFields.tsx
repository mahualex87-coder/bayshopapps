import { View } from 'react-native';
import type { BillingInput } from '@/api/account-settings';
import type { ServerOption } from '@/api/account-operations';
import { useI18n } from '@/i18n/context';
import { Field, useUi } from '@/ui';
import { OptionPicker } from './shared';

const billingLabels: Record<keyof BillingInput, string> = { first_name: 'field.firstName', last_name: 'field.lastName', company_name: 'field.company', address1: 'field.address', city: 'field.city', state: 'field.region', email: 'field.email', phone: 'field.phone', zip: 'field.postalCode', country: 'field.country' };

export function BillingFields({ form, countries, fields, disabled, set }: {
  form: BillingInput; countries: ServerOption[]; fields: Record<string, string>; disabled: boolean;
  set: (key: keyof BillingInput, value: string) => void;
}) {
  const { s } = useUi(); const { t } = useI18n();
  const field = (key: keyof BillingInput) => <Field label={t(billingLabels[key])} value={form[key]} onChangeText={value => set(key, value)} editable={!disabled} error={fields[key] ? t(fields[key]) : undefined} keyboardType={key === 'email' ? 'email-address' : key === 'phone' ? 'phone-pad' : 'default'} autoCapitalize={key === 'email' ? 'none' : 'sentences'} autoCorrect={key !== 'email'} />;
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}><View style={{ flex: 1 }}>{field('first_name')}</View><View style={{ flex: 1 }}>{field('last_name')}</View></View>
      {field('company_name')}
      <OptionPicker country label={t('field.country')} value={form.country} options={countries} disabled={disabled} error={fields.country} onChange={value => set('country', value)} />
      {field('state')}{field('city')}{field('address1')}{field('zip')}{field('phone')}{field('email')}
    </View>
  );
}
