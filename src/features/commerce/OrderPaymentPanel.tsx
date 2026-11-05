import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { useLiveAccount } from '@/api/context';
import { ApiError, errorMessage } from '@/api/client';
import { prepareHostedCheckout } from '@/api/hosted-checkout';
import type { LegacyPaymentStartResult } from '@/api/payment-legacy';
import { useI18n } from '@/i18n/context';
import { Button, Notice, useUi } from '@/ui';
import { displayMoney } from '@/features/live/shared';
import { PaymentProvider, type ProviderAction } from '@/features/payments/PaymentProvider';
import { isPayPalApprovalUrl } from '@/features/payments/payment-attempt';
import { waitForPaymentForeground } from '@/features/payments/usePaymentFlow';
import { orderPaymentIntent, orderPaymentState, type OrderPaymentReceipt, type OrderPaymentState } from './order-payment-session';

export type OrderPaymentPanelProps = (OrderPaymentReceipt & { onDetails?: () => void }) | { orderId: string };
const externalMethods = ['platescro', 'paypal', 'apple-pay', 'google-pay'];

export function OrderPaymentPanel(props: OrderPaymentPanelProps) {
  const { accountId, authRevision, accountRevision, authenticated, getOrderPaymentContext } = useLiveAccount();
  if (!authenticated || !accountId) return null;
  const orderId = 'created' in props ? props.created.orders[0]?.id : props.orderId;
  if (!orderId) return null;
  const owner = JSON.stringify([accountId, authRevision, accountRevision]);
  const receipt = 'created' in props ? props : getOrderPaymentContext(orderId) ?? undefined;
  return <ScopedOrderPayment key={JSON.stringify([owner, orderId])} owner={owner} orderId={orderId}
    receipt={receipt} onDetails={'onDetails' in props ? props.onDetails : undefined} />;
}

function ScopedOrderPayment({ owner, orderId, receipt, onDetails }: {
  owner: string; orderId: string; receipt?: OrderPaymentReceipt; onDetails?: () => void;
}) {
  const { s } = useUi();
  const { t, formatNumber } = useI18n();
  const { canMutate, mutate, readView } = useLiveAccount();
  const [intent] = useState(() => orderPaymentIntent(owner, orderId, receipt));
  const [orders] = useState(() => intent?.created.orders ?? [{ id: orderId, uid: null }]);
  const [status, setStatus] = useState<OrderPaymentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [provider, setProvider] = useState<ProviderAction | null>(null);
  const statusRequest = useRef<AbortController | null>(null);
  const startRequest = useRef<AbortController | null>(null);
  const check = useCallback(async () => {
    statusRequest.current?.abort();
    const request = new AbortController(); statusRequest.current = request;
    setChecking(true); setStatus(null); setError(null);
    try {
      const details = await Promise.all(orders.map(async order => {
        const rows = await readView({ kind: 'order.detail', id: order.id }, { signal: request.signal });
        const own = rows.find(item => item.id === order.id);
        if (!own) throw new ApiError(0, 'errors.contract');
        return own;
      }));
      if (!request.signal.aborted) setStatus(orderPaymentState(orders, details));
    } catch (cause) {
      if (!request.signal.aborted) setError(errorMessage(cause));
    } finally { if (!request.signal.aborted) setChecking(false); }
  }, [orders, readView]);
  useEffect(() => {
    void check();
    return () => { statusRequest.current?.abort(); startRequest.current?.abort(); };
  }, [check]);

  const start = async () => {
    if (!intent || intent.attempted || startRequest.current || provider || status !== 'payable' ||
        checking || !canMutate || !externalMethods.includes(intent.created.type) || Platform.OS === 'web') return;
    const controller = new AbortController(); startRequest.current = controller;
    intent.attempted = true; setStarting(true); setError(null);
    try {
      const { created, quote, billingInput } = intent;
      const result = await mutate({ kind: 'orders.payment.start', input: { created, quote, ...(billingInput ? { billingInput } : {}) } }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        if (result.outcome === 'rejected') intent.attempted = false;
        throw new ApiError(0, result.error || 'payments.unknown');
      }
      const payment = result.data as LegacyPaymentStartResult;
      const channel = created.type === 'apple-pay' ? 'APAY' : created.type === 'google-pay' ? 'GPAY' : null;
      if (!payment || payment.paymentType !== (created.type === 'paypal' ? 'paypal' : 'platescro')) throw new ApiError(0, 'errors.contract');
      let action: ProviderAction;
      if (channel) {
        if (payment.action.kind !== 'form') throw new ApiError(0, 'payments.checkoutFailed');
        await waitForPaymentForeground(controller.signal, Date.now() + 10000);
        const hosted = await prepareHostedCheckout(payment.action, { fetch: expoFetch, signal: controller.signal });
        if (hosted.channel !== channel || hosted.paymentId !== payment.paymentId) throw new ApiError(0, 'payments.checkoutFailed');
        action = { kind: 'redirect', url: hosted.url };
      } else if (created.type === 'paypal' && payment.action.kind === 'redirect' && isPayPalApprovalUrl(payment.action.url)) {
        action = payment.action;
      } else if (created.type === 'platescro' && payment.action.kind === 'form') {
        action = payment.action;
      } else throw new ApiError(0, 'payments.checkoutFailed');
      await waitForPaymentForeground(controller.signal, Date.now() + 10000);
      if (!controller.signal.aborted && AppState.currentState === 'active') setProvider(action);
    } catch (cause) {
      if (!controller.signal.aborted) { await check(); if (!controller.signal.aborted) setError(errorMessage(cause)); }
    } finally {
      if (startRequest.current === controller) startRequest.current = null;
      if (!controller.signal.aborted) setStarting(false);
    }
  };
  const returned = () => { setProvider(null); void check(); };
  const created = intent?.created;
  const method = intent?.quote.methods.find(item => item.key === created?.type);
  const amount = method && intent ? displayMoney(method.totalToPay, intent.quote.currency, formatNumber) : null;
  return <View style={[s.card, { gap: 8 }]}>
    <Text accessibilityRole="header" style={s.heading}>{t('commerce.paymentStatus')}</Text>
    {method && <Text style={s.body}>{method.title}{amount ? ' · ' + amount : ''}</Text>}
    {intent && method && method.commission > 0 && <Text style={s.small}>{t('commerce.orderPaymentFee', { amount: displayMoney(method.commission, intent.quote.currency, formatNumber) })}</Text>}
    {status === 'paid' ? <Notice>{t('payments.paid')}</Notice> : <>
      {status === 'unavailable' && <Notice>{t('commerce.orderPaymentUnavailable')}</Notice>}
      {status === 'payable' && !intent && <Text style={s.small}>{t('commerce.orderPaymentContextMissing')}</Text>}
      {status === 'payable' && created?.type === 'terminals' && <>
        {created.orders.some(order => !order.terminalCode) && <Notice>{t('commerce.orderTerminalNoCode')}</Notice>}
        {created.orders.filter(order => !!order.terminalCode).map(order => <View key={order.id} style={{ gap: 2 }}>
          <Text style={s.small}>{t('payments.terminalCode')}{created.orders.length > 1 ? ' · ' + (order.uid ?? order.id) : ''}</Text>
          <Text selectable style={s.heading}>{order.terminalCode}</Text>
        </View>)}
      </>}
      {status === 'payable' && created?.type === 'balance' && <Text style={s.small}>{t('commerce.orderBalancePending')}</Text>}
      {intent && status === 'payable' && !starting && intent.attempted && <Notice>{t('commerce.orderPaymentChecking')}</Notice>}
      {status === 'payable' && created && externalMethods.includes(created.type) && !intent?.attempted &&
        (Platform.OS === 'web' ? <Notice>{t('payments.nativeOnly')}</Notice> :
          <Button disabled={!canMutate || checking || starting || !method} onPress={() => { void start(); }}>{t('commerce.orderPayAmount', { amount: amount ?? '' })}</Button>)}
    </>}
    {checking && <Text accessibilityLiveRegion="polite" style={s.small}>{t('payments.checking')}</Text>}
    {starting && <Text accessibilityLiveRegion="polite" style={s.small}>{t('commerce.submitting')}</Text>}
    {error && <Notice error>{t(error)}</Notice>}
    {status !== 'paid' && <Button secondary disabled={checking || starting} onPress={() => { void check(); }}>{t('payments.check')}</Button>}
    {onDetails && <Button secondary disabled={starting} onPress={onDetails}>{t('commerce.details')}</Button>}
    {provider && <PaymentProvider action={provider} onReturn={returned} onClose={returned} onFailure={returned} />}
  </View>;
}
