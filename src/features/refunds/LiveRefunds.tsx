import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import { findCreatedRefund, quoteRefund, type FinancialAcknowledgement, type RefundOverview, type RefundQuote, type RefundRequest } from '@/api/account-financial-actions';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { GlassSurface } from '@/navigation/GlassSurface';
import { Button, Field, Notice, Screen, useUi } from '@/ui';
import { DetailRow, ResourceStatus, displayMoney } from '@/features/live/shared';
import { OptionPicker } from '@/features/accountops/shared';
import { useOperationView } from '@/features/live/forms/useOperationView';

type PendingCheck = { kind: 'create'; quote: RefundQuote; beforeIds: string[]; acknowledgedId: string | null } | { kind: 'cancel'; id: string; acknowledged: boolean };

function RefundsForm({ initial }: { initial: RefundOverview }) {
  const live = useLiveAccount(); const { t, formatNumber, formatDate } = useI18n(); const { s, colors } = useUi();
  const [data, setData] = useState(initial);
  const [currencyId, setCurrencyId] = useState(initial.balances.find(row => row.amount > 0)?.id ?? initial.balances[0]?.id ?? '');
  const [methodId, setMethodId] = useState(''); const [amount, setAmount] = useState('');
  const [review, setReview] = useState<{ quote: RefundQuote; beforeIds: string[] } | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const running = useRef(false);
  const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null);
  const [check, setCheck] = useState<PendingCheck | null>(null);
  const [shown, setShown] = useState(20);
  const busy = pending || live.mutationPending;
  const disabled = busy || !!check || !live.canMutate || !data.guardedWrites;
  useDraftGuard(!check && (!!amount || !!review || !!cancelId), { fallbackHref: '/account', pending: busy });
  const balance = data.balances.find(row => row.id === currencyId);
  const methods = data.methods.filter(row => row.currencyIds.includes(currencyId));
  const selectedMethod = methods.find(row => row.id === methodId) ?? (methods.length === 1 ? methods[0] : undefined);
  const money = (value: number, code: string | null) => displayMoney(value, code, formatNumber);
  const resetMessages = () => { setError(null); setSuccess(null); setReview(null); };

  const verify = async (operation: PendingCheck) => {
    const latest = await live.readView({ kind: 'refunds.read' });
    setData(latest);
    if (operation.kind === 'create') {
      const created = findCreatedRefund(latest, operation.beforeIds, operation.quote, operation.acknowledgedId);
      if (!created) { setCheck(operation); setError('refunds.unconfirmed'); return; }
      setAmount(''); setReview(null); setCheck(null); setSuccess('refunds.created'); setError(null);
    } else {
      // On old servers, an absent row can also mean it was approved. Only an
      // explicit successful DELETE plus absence proves cancellation.
      if (!operation.acknowledged || latest.requests.some(row => row.id === operation.id)) { setCheck(operation); setError('refunds.unconfirmed'); return; }
      setCancelId(null); setCheck(null); setSuccess('refunds.canceled'); setError(null);
    }
  };
  const run = async (action: () => Promise<void>) => {
    if (running.current || live.mutationPending) return;
    running.current = true; setPending(true); setError(null); setSuccess(null);
    try { await action(); } catch (failure) { setError(errorMessage(failure)); }
    finally { running.current = false; setPending(false); }
  };
  const prepare = () => run(async () => {
    if (!live.canMutate || check || !selectedMethod) return;
    const latest = await live.readView({ kind: 'refunds.read' }); setData(latest);
    const quote = quoteRefund(latest, { currencyId, refundTypeId: selectedMethod.id, amount });
    setReview({ quote, beforeIds: latest.requests.map(row => row.id) }); setCancelId(null);
  });
  const submit = () => run(async () => {
    if (!review || check || !live.canMutate) return;
    const { quote, beforeIds } = review;
    const operation: PendingCheck = { kind: 'create', quote, beforeIds, acknowledgedId: null };
    const result = await live.mutate({ kind: 'refund.create', currencyId: quote.currencyId, refundTypeId: quote.methodId, amount: quote.amount, reviewRevision: quote.revision });
    if (!result.ok) {
      setError(result.error || 'errors.loadFailed');
      if (result.outcome === 'unknown') { setCheck(operation); setReview(null); }
      else setReview(null);
      return;
    }
    operation.acknowledgedId = (result.data as FinancialAcknowledgement | undefined)?.id ?? null;
    setCheck(operation); setReview(null);
    try { await verify(operation); } catch { setError('refunds.unconfirmed'); }
  });
  const cancel = (request: RefundRequest) => run(async () => {
    if (check || !request.canCancel || !live.canMutate) return;
    const result = await live.mutate({ kind: 'refund.cancel', id: request.id });
    const operation: PendingCheck = { kind: 'cancel', id: request.id, acknowledged: result.ok };
    if (!result.ok) { setError(result.error || 'errors.loadFailed'); if (result.outcome === 'unknown') setCheck(operation); else setCancelId(null); return; }
    setCheck(operation);
    try { await verify(operation); } catch { setError('refunds.unconfirmed'); }
  });

  return <>
    {data.guardedWrites ? <GlassSurface style={{ padding: 16, gap: 12, borderRadius: 20 }}>
      <Text style={s.small}>{t('refunds.intro')}</Text>
      <OptionPicker currency label={t('refunds.currency')} value={currencyId} options={data.balances.map(row => ({ id: row.id, title: row.currency }))} disabled={disabled || !!review} onChange={value => { setCurrencyId(value); setMethodId(''); resetMessages(); }} />
      {balance && <DetailRow label={t('refunds.available')} value={money(balance.amount, balance.currency)} />}
      <Field label={`${t('refunds.amount')}${balance ? ` · ${balance.currency}` : ''}`} value={amount} onChangeText={value => { setAmount(value); resetMessages(); }} editable={!disabled && !review} keyboardType="decimal-pad" placeholder="0.00" />
      {methods.length ? <OptionPicker label={t('refunds.method')} value={selectedMethod?.id ?? ''} options={methods.map(row => ({ id: row.id, title: row.title }))} disabled={disabled || !!review} onChange={value => { setMethodId(value); resetMessages(); }} /> : <Notice>{t('refunds.noMethods')}</Notice>}
      {selectedMethod && (Number(selectedMethod.commissionPercent) > 0 || Number(selectedMethod.minimumCommission) > 0) && <Text style={s.small}>{t('refunds.methodFee', { percent: formatNumber(Number(selectedMethod.commissionPercent)), minimum: money(Number(selectedMethod.minimumCommission), balance?.currency ?? null) })}</Text>}
      {!review && <Button disabled={disabled || !balance || balance.amount <= 0 || !amount || !selectedMethod} onPress={() => { void prepare(); }}>{t(pending ? 'refunds.checking' : 'refunds.review')}</Button>}
      {review && <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
        <Text accessibilityRole="header" style={s.heading}>{t('refunds.reviewTitle')}</Text>
        <DetailRow label={t('refunds.method')} value={review.quote.methodTitle} />
        <DetailRow label={t('refunds.reserved')} value={money(review.quote.reservedAmount, review.quote.currency)} />
        {review.quote.estimatedFee > 0 && <><DetailRow label={t('refunds.estimatedFee')} value={money(review.quote.estimatedFee, review.quote.currency)} /><Text style={s.small}>{t('refunds.feeHint')}</Text></>}
        <Notice>{t('refunds.reserveHint')}</Notice>
        <Button disabled={disabled} onPress={() => { void submit(); }}>{t(busy ? 'accountOps.saving' : 'refunds.confirm')}</Button>
        <Button secondary disabled={busy} onPress={() => setReview(null)}>{t('refunds.edit')}</Button>
      </View>}
    </GlassSurface> : <Notice>{t('refunds.readOnly')}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    {success && <Notice>{t(success)}</Notice>}
    {check && <><Notice>{t('refunds.noRepeat')}</Notice><Button secondary disabled={busy} onPress={() => { void run(async () => { try { await verify(check); } catch { setError('refunds.unconfirmed'); } }); }}>{t('refunds.check')}</Button></>}
    <Text accessibilityRole="header" style={s.heading}>{t('refunds.requests')}</Text>
    {data.requests.length === 0 && <Text style={s.small}>{t('refunds.empty')}</Text>}
    {data.requests.slice(0, shown).map(request => <GlassSurface key={request.id} style={{ padding: 14, gap: 8, borderRadius: 18 }}>
      <View style={s.row}><Text style={[s.heading, { flex: 1 }]}>{request.methodTitle || t('refunds.requestNumber', { id: request.id })}</Text><Text style={s.heading}>{money(request.amount, request.currency)}</Text></View>
      <View style={s.row}><Text style={s.small}>{formatDate(request.createdAt)}</Text><Text style={[s.small, { color: request.status === 'approved' ? colors.success : request.status === 'declined' ? colors.error : colors.muted }]}>{t(['awaiting', 'approved', 'declined'].includes(request.status) ? `refunds.status.${request.status}` : 'refunds.status.other')}</Text></View>
      {request.canCancel && (cancelId === request.id ? <><Notice>{t('refunds.cancelQuestion')}</Notice><Button disabled={disabled} onPress={() => { void cancel(request); }}>{t('refunds.confirmCancel')}</Button><Button secondary disabled={busy} onPress={() => setCancelId(null)}>{t('refunds.keep')}</Button></> : <Button secondary disabled={disabled || !!review} onPress={() => { resetMessages(); setCancelId(request.id); }}>{t('refunds.cancel')}</Button>)}
    </GlassSurface>)}
    {data.requests.length > shown && <Button secondary onPress={() => setShown(value => value + 20)}>{t('commerce.more')}</Button>}
  </>;
}

export function LiveRefundsScreen() {
  const { t } = useI18n(); const live = useLiveAccount();
  const result = useOperationView({ kind: 'refunds.read' });
  return <Screen title={t('refunds.title')}><ResourceStatus resource={result.resource} onRefresh={() => { void result.refresh(); }} />{result.resource.data && <RefundsForm key={`${live.accountId}:${live.accountRevision}:${live.language}`} initial={result.resource.data} />}</Screen>;
}
