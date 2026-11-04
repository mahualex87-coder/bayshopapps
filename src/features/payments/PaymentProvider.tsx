import { Notice } from '@/ui';
import { useI18n } from '@/i18n/context';
import type { BrowserFailureCode } from './paypal-browser-controller';

export type ProviderAction = { kind: 'redirect'; url: string } | { kind: 'form'; url: string; method: 'POST'; fields: Record<string, string> };
export type PaymentProviderProps = { action: ProviderAction; onClose: () => void; onReturn: (paymentId?: string) => void; onFailure?: (code?: BrowserFailureCode) => void };
export function PaymentProvider(_props: PaymentProviderProps) {
  const { t } = useI18n();
  return <Notice>{t('payments.nativeOnly')}</Notice>;
}
