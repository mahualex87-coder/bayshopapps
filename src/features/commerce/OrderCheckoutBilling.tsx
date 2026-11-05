import { useState } from 'react';
import { Text } from 'react-native';
import { addressFormats } from '@/api/account-operations';
import { billingFields, billingInputFields, type BillingInput } from '@/api/account-settings';
import type { PaymentBilling } from '@/api/payments-catalog';
import { MutationInputError } from '@/api/mutations';
import { useI18n } from '@/i18n/context';
import { BillingFields } from '@/features/accountops/BillingFields';
import { useAccountView } from '@/features/accountops/shared';
import { ResourceStatus } from '@/features/live/shared';
import { Button, Notice, useUi } from '@/ui';

export function OrderCheckoutBilling({ saved, selected, onUse, onClose }: {
  saved: PaymentBilling | null; selected: BillingInput | null;
  onUse: (input: BillingInput) => void; onClose: () => void;
}) {
  const { t } = useI18n(); const { s } = useUi();
  const countries = useAccountView({ kind: 'recipient.formats' }, addressFormats);
  const [form, setForm] = useState<BillingInput>(() => selected || Object.fromEntries(
    billingFields.map(key => [key, saved?.fields?.[key] ?? '']),
  ) as BillingInput);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const use = () => {
    const missing: Record<string, string> = {};
    for (const key of ['address1', 'city', 'state', 'email', 'phone', 'zip', 'country'] as const) {
      if (!form[key].trim()) missing[key] = 'errors.fieldRequired';
    }
    if (!countries.resource.data?.countries.some(value => value.id === form.country)) missing.country = 'accountOps.selectCountry';
    try {
      const checked = billingInputFields(form);
      if (!Object.keys(missing).length) { onUse(checked); return; }
    } catch (cause) {
      if (cause instanceof MutationInputError) Object.assign(missing, cause.fieldErrors);
      else throw cause;
    }
    setErrors(missing);
  };
  return <>
    <Text style={s.small}>{t('commerce.orderBillingConsent')}</Text>
    <ResourceStatus resource={countries.resource} onRefresh={countries.reload} />
    {countries.resource.data && <BillingFields form={form} countries={countries.resource.data.countries} fields={errors} disabled={false} set={(key, value) => {
      setForm(previous => ({ ...previous, [key]: value }));
      setErrors(previous => ({ ...previous, [key]: '' }));
    }} />}
    {Object.values(errors).some(Boolean) && <Notice error>{t('errors.validation')}</Notice>}
    <Button disabled={!countries.resource.data || !!countries.resource.error} onPress={use}>{t('commerce.useOrderBilling')}</Button>
    <Button secondary onPress={onClose}>{t('accountOps.cancel')}</Button>
  </>;
}
