import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useLiveAccount } from '@/api/context';
import { normalizeLegacyPaymentsData, type LegacyPaymentSelection } from '@/api/payment-legacy';
import { useI18n } from '@/i18n/context';
import { Button, Choice, Notice, Screen, useUi } from '@/ui';
import { ResourceStatus } from '@/features/live/shared';
import { useAccountView } from '@/features/accountops/shared';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { usePageLoad } from '@/navigation/PageLoading';
import { useBlockSupportChat, useSupportChat } from '@/features/support/SupportChatProvider';
import { PaymentProvider } from './PaymentProvider';
import { usePaymentFlow } from './usePaymentFlow';
import { paymentFeeConditions } from './payment-display';
import { eligibleInvoiceIds, invoiceSelectionKey, selectedInvoiceIds, toggleAllInvoices, toggleInvoice, type InvoiceSelectionIntent } from './invoice-selection';

const money = (amount: string, currency: string) => `${amount} ${currency.toUpperCase()}`;
function selectionForMethod(methodId: string, billIds: string[]): LegacyPaymentSelection | null {
  if (methodId === 'platescro') return { paymentType: 'platescro', billIds, hostedChannel: 'CC' };
  if (methodId === 'apple-pay') return { paymentType: 'platescro', billIds, hostedChannel: 'APAY' };
  if (methodId === 'google-pay') return { paymentType: 'platescro', billIds, hostedChannel: 'GPAY' };
  if (methodId === 'paypal' || methodId === 'terminals') return { paymentType: methodId, billIds };
  return null;
}
export function LivePayments() {
  const { accountId, accountRevision, language, authenticated } = useLiveAccount();
  return <PaymentsScreen key={`${authenticated}:${accountId}:${accountRevision}:${language}`} />;
}
function PaymentsScreen() {
  const { s, colors } = useUi();
  const { t, formatDate } = useI18n();
  const support = useSupportChat();
  const { canMutate, authenticated, accountId } = useLiveAccount();
  const { resource, reload } = useAccountView({ kind: 'payments.read' }, normalizeLegacyPaymentsData);
  const flow = usePaymentFlow(reload);
  useBlockSupportChat(flow.busy || !!flow.provider);
  // Initial local cleanup only. Checkout, provider and confirmation activity
  // use their own feedback and must never hide the payment controls.
  usePageLoad(authenticated && !!accountId && !flow.ready);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useDraftGuard(false, { pending: flow.busy });
  const [currency, setCurrency] = useState('');
  const [selectionIntent, setSelectionIntent] = useState<InvoiceSelectionIntent>({});
  const [methodId, setMethodId] = useState('');
  const [copied, setCopied] = useState(false);
  const catalog = resource.data?.catalog;
  const groups = catalog?.invoiceGroups;
  const group = groups?.find(item => item.currency === currency) ?? groups?.[0];
  const invoices = group?.invoices;
  const selectionKey = invoiceSelectionKey(group);
  const eligible = eligibleInvoiceIds(groups, group);
  const selected = selectedInvoiceIds(eligible, selectionIntent, selectionKey);
  // These are distinct processor checkout channels. The signed preparation
  // and confirmation still belong to BayShop's existing platescro payment.
  const methods = catalog?.methods?.filter(item => ['platescro', 'paypal', 'terminals'].includes(item.id) || item.id === 'apple-pay' && Platform.OS === 'ios' || item.id === 'google-pay' && ['ios', 'android'].includes(Platform.OS));
  const method = methods?.find(item => item.id === methodId);
  const paymentSelection = method ? selectionForMethod(method.id, selected) : null;
  const cardMethod = catalog?.methods?.find(item => item.id === 'platescro');
  const supportsCurrency = (item: NonNullable<typeof methods>[number]) => item.currencies?.includes(group?.currency || '') === true
    && (!['apple-pay', 'google-pay'].includes(item.id) || cardMethod?.currencies?.includes(group?.currency || '') === true);
  const selectedMethodSupported = !!method && supportsCurrency(method);
  const locked = flow.busy || !!flow.provider || !flow.ready || resource.loading || !!resource.error;
  const { attempt, status, action } = flow;
  const completed = status?.state === 'paid' || flow.invoicesPaid;
  const terminal = action?.kind === 'terminal' ? action : null;
  const showCurrentResult = completed || terminal !== null;
  const terminalOrigin = terminal && flow.terminalOrigin?.attemptKey === attempt?.attemptKey && flow.terminalOrigin?.currency === (attempt?.version === 2 ? attempt.scope.currency : null) ? flow.terminalOrigin : null;
  useEffect(() => {
    if (flow.error || showCurrentResult) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [flow.error, showCurrentResult]);
  const diagnosticCode = typeof flow.diagnosticCode === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/.test(flow.diagnosticCode) ? flow.diagnosticCode : null;
  const backToInvoices = () => { setMethodId(''); setCopied(false); void flow.showInvoices(); };
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return <Screen scrollRef={scrollRef} title={t('accountOps.payments')} subtitle={t('payments.intro')}>
    <ResourceStatus resource={resource} onRefresh={reload} />
    {flow.error && <Notice error>{t(flow.error)}</Notice>}
    {flow.error && diagnosticCode && <Text selectable style={s.small}>{t('payments.diagnostic', { code: diagnosticCode })}</Text>}
    {!flow.ready && !flow.error && <ActivityIndicator color={colors.accent} />}
    {flow.checking && <View style={[s.row, { justifyContent: 'flex-start' }]}><ActivityIndicator size="small" color={colors.accent} /><Text style={s.small}>{t('payments.checking')}</Text></View>}
    {showCurrentResult ? <View style={s.card}>
      <View style={[s.row, { flexWrap: 'nowrap' }]}><Ionicons name={completed ? 'checkmark-circle' : 'receipt-outline'} size={26} color={colors.accent} /><Text style={[s.heading, { flex: 1 }]}>{t(status?.state === 'paid' ? 'payments.paid' : flow.invoicesPaid ? 'payments.invoicesPaid' : 'payments.terminalCode')}</Text></View>
      {!!attempt?.paymentId && <Text selectable style={s.small}>{t('payments.reference', { reference: attempt.paymentId })}</Text>}
      {terminal && !completed && <>
        <Text selectable style={[s.title, { textAlign: 'center', letterSpacing: 2 }]}>{terminal.paymentCode}</Text>
        <Text selectable style={[s.heading, { textAlign: 'center' }]}>{`${terminal.amount}${terminal.currencySign ? ` ${terminal.currencySign}` : ''}`}</Text>
        {terminalOrigin && !!terminal.currencySign && <Text style={s.small}>{t('payments.terminalEquivalent', { original: money(terminalOrigin.amount, terminalOrigin.currency), converted: `${terminal.amount} ${terminal.currencySign}` })}</Text>}
        <Text style={s.body}>{t('payments.terminalHelp')}</Text>
        <Text style={s.small}>{t('payments.terminalOtherMethods')}</Text>
        <Button secondary onPress={() => { void Clipboard.setStringAsync(terminal.paymentCode).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{t(copied ? 'payments.copied' : 'payments.copyCode')}</Button>
        <Button disabled={flow.busy} onPress={backToInvoices}>{t('payments.chooseOtherMethod')}</Button>
      </>}
      {completed && <><Text style={s.body}>{t(status?.state === 'paid' ? 'payments.synced' : 'payments.invoicesPaidHelp')}</Text><Button disabled={flow.busy} onPress={() => { void flow.finish(); setMethodId(''); }}>{t('payments.done')}</Button></>}
    </View> : <>
      {groups === null && <Notice>{t('payments.unavailableData')}</Notice>}
      {groups?.length === 0 && <Notice>{t('accountOps.noUnpaidInvoices')}</Notice>}
      {!!groups?.length && <>
        {groups.length > 1 && <Choice label={t('payments.currency')} value={group?.currency || ''} options={groups.map(item => item.currency)} onChange={value => { if (!locked) { flow.clearError(); setCurrency(value); setMethodId(''); } }} />}
        <View style={s.row}><Text style={s.heading}>{t('accountOps.unpaidInvoices')} · {group?.currency}</Text><Text style={s.small}>{t('payments.selected', { count: selected.length })}</Text></View>
        {!!eligible.length && <Button secondary disabled={locked} onPress={() => { flow.clearError(); setSelectionIntent(intent => toggleAllInvoices(intent, selectionKey, eligible)); }}>{t(selected.length === eligible.length ? 'payments.clearSelection' : 'payments.selectAll')}</Button>}
        {invoices?.map(invoice => <Pressable key={invoice.id} accessibilityRole="checkbox" aria-checked={selected.includes(invoice.id)} accessibilityLabel={`${invoice.reference || invoice.id}, ${invoice.amount} ${group?.currency}`} accessibilityState={{ checked: selected.includes(invoice.id), disabled: locked || !eligible.includes(invoice.id) }} disabled={locked || !eligible.includes(invoice.id)} onPress={() => { flow.clearError(); setSelectionIntent(intent => toggleInvoice(intent, selectionKey, eligible, invoice.id)); }} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Ionicons name={selected.includes(invoice.id) ? 'checkbox' : 'square-outline'} size={24} color={selected.includes(invoice.id) ? colors.accent : colors.muted} /><View style={{ flex: 1, gap: 4 }}><View style={s.row}><Text style={[s.heading, { flexShrink: 1 }]}>{invoice.reference || t('payments.invoice', { reference: invoice.id })}</Text><Text style={s.heading}>{money(invoice.amount, group?.currency || '')}</Text></View>{!!invoice.description && <Text style={s.body}>{invoice.description}</Text>}{!!invoice.createdAt && <Text style={s.small}>{formatDate(invoice.createdAt)}</Text>}</View>
        </Pressable>)}
        {invoices === null && <Notice>{t('payments.unavailableData')}</Notice>}
        <Text accessibilityRole="header" style={s.heading}>{t('accountOps.paymentMethods')}</Text>
        {methods?.map(item => {
          const wallet = item.id === 'apple-pay' || item.id === 'google-pay';
          const supported = supportsCurrency(item);
          const disabled = locked || !supported;
          const fee = paymentFeeConditions(wallet ? cardMethod : item);
          const feeText = fee ? [fee.percent ? `${fee.percent}%` : null, fee.fixed ? money(fee.fixed, group?.currency || '') : null].filter(Boolean).join(' + ') : null;
          const title = item.id === 'platescro' ? t('payments.card') : item.id === 'apple-pay' ? 'Apple Pay' : item.id === 'google-pay' ? 'Google Pay' : item.title || item.id;
          return <Pressable key={item.id} accessibilityRole="radio" aria-checked={methodId === item.id} accessibilityLabel={title} accessibilityState={{ checked: methodId === item.id, disabled }} disabled={disabled} onPress={() => { flow.clearError(); setMethodId(item.id); }} style={[s.card, { opacity: disabled ? 0.55 : 1, borderColor: methodId === item.id ? colors.accent : colors.border }]}>
            <View style={[s.row, { justifyContent: 'flex-start', flexWrap: 'nowrap' }]}>{item.logoUrl && <Image source={{ uri: item.logoUrl }} resizeMode="contain" style={{ width: 46, height: 28 }} accessible={false} />}<Text style={[s.heading, { flex: 1 }]}>{title}</Text><Ionicons name={methodId === item.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={methodId === item.id ? colors.accent : colors.muted} /></View>
            {(wallet || item.id === 'platescro') && <Text style={s.small}>{t('payments.viaEuplatesc')}</Text>}
            {supported && fee && <View style={{ gap: 2 }}><View style={[s.row, { flexWrap: 'wrap' }]}><Text style={s.small}>{t('payments.commission')}</Text><Text style={s.body}>{feeText}</Text></View>{fee.minimum && <Text style={s.small}>{t(fee.fixed ? 'payments.minimumBeforeFixed' : 'payments.minimumFee', { amount: money(fee.minimum, group?.currency || '') })}</Text>}</View>}
            {!wallet && !!item.description && <Text style={s.body}>{item.description}</Text>}{!supported && <Text style={s.small}>{t('payments.methodUnavailable')}</Text>}
          </Pressable>;
        })}
        {methods?.length === 0 && <Notice>{t('accountContent.noPaymentMethods')}</Notice>}
        <View style={s.card}><Text style={s.heading}>{t('payments.billing')}</Text>{catalog?.billing.fields && <Text selectable style={s.body}>{[catalog.billing.fields.first_name, catalog.billing.fields.last_name].filter(Boolean).join(' ')}{'\n'}{[catalog.billing.fields.address1, catalog.billing.fields.city, catalog.billing.fields.country].filter(Boolean).join(', ')}</Text>}<Button secondary disabled={flow.busy} onPress={() => router.push('/account/billing')}>{t('payments.editBilling')}</Button></View>
        <Text style={s.small}>{t(methodId === 'terminals' ? 'payments.terminalPreparation' : 'payments.providerTotal')}</Text>
        <Button disabled={locked || !paymentSelection || !selectedMethodSupported || !selected.length || !canMutate || Platform.OS === 'web'} onPress={() => { if (!locked && canMutate && Platform.OS !== 'web' && paymentSelection && resource.data && selectedMethodSupported && selected.length) { setCopied(false); void flow.start(paymentSelection, resource.data); } }}>{t(flow.busy ? 'payments.submitting' : methodId === 'terminals' ? 'payments.createCode' : 'payments.continue')}</Button>
      </>}
    </>}
    <Text style={s.small}>{t('payments.serverConfirmation')}</Text>
    <Button secondary disabled={flow.busy} onPress={() => router.push('/balance')}>{t('payments.history')}</Button>
    <Button secondary disabled={flow.busy || support.disabled} onPress={() => { void support.open(); }}>{t(support.busy ? 'supportChat.opening' : 'accountContent.paymentHelp')}</Button>
    {flow.provider && <PaymentProvider action={flow.provider} onClose={flow.closeProvider} onReturn={id => { void flow.providerReturn(id); }} onFailure={code => { void flow.providerFailed(code); }} />}
  </Screen>;
}
