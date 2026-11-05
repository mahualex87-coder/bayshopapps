import { DeliveryPrice } from '@/components/DeliveryPrice';
import { deliveryPriceLabel } from '@/domain/delivery-price';
import { ConsolidationNotice } from '@/components/ConsolidationNotice';
import { countryDisplayName } from '@/domain/presentation-labels';
import { ServiceIdentity, ServiceDetailRow } from '@/components/ServiceIdentity';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { router, useIsFocused } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import type { CheckoutInput } from '@/api/operations-contracts';
import { checkoutItems, checkoutItemFingerprint, checkoutPaymentIssue, orderBillingMissing, checkoutLocalMethodKey, checkoutLocalSelection, type CreatedOrder, type CheckoutPayments } from '@/api/checkout-normalize';
import type { CartItem } from '@/api/operations-normalize';
import type { Resource } from '@/api/service';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { usePageLoad } from '@/navigation/PageLoading';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { PickupPointPicker } from '@/components/PickupPointPicker';
import { DetailRow, ResourceStatus, displayMoney } from '@/features/live/shared';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { CountryLabel } from '@/components/CountryFlag';
import { OrderPaymentPanel } from './OrderPaymentPanel';
import { OrderCheckoutBilling } from './OrderCheckoutBilling';
import type { BillingInput } from '@/api/account-settings';

function Choice({ label, selected, disabled, onPress, children, multiple = false, service = false, logoUrl }: PropsWithChildren<{ label: string; selected: boolean; disabled?: boolean; onPress: () => void; multiple?: boolean; service?: boolean; logoUrl?: string | null }>) {
  const { colors, s } = useUi();
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} aria-checked={selected} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[s.card, { minHeight: minTouchTarget }, selected && { borderColor: colors.accent, backgroundColor: colors.soft }, disabled && { opacity: .55 }]}>{service ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{selected && <Text accessible={false} aria-hidden style={s.heading}>✓</Text>}<ServiceIdentity title={label} logoUrl={logoUrl} textStyle={s.heading} style={{ flex: 1 }} /></View> : <Text style={s.heading}>{selected ? '✓ ' : ''}{label}</Text>}{children}</Pressable>;
}
export function CheckoutPaymentChoices({ quote, value, disabled, onSelect }: {
  quote: CheckoutPayments; value: string; disabled: boolean; onSelect: (key: string) => void;
}) {
  const { t, formatNumber } = useI18n();
  const { s } = useUi();
  const methods = quote.methods.filter(item => item.key !== 'apple-pay' || Platform.OS === 'ios');
  if (!methods.length) return <Notice>{t('commerce.noPaymentMethods')}</Notice>;
  return <>{methods.map(item => {
    const issue = checkoutPaymentIssue(item, quote.currency, quote);
    return <Choice key={item.key} label={item.key === 'platescro' ? t('commerce.payCard') : item.title}
      selected={value === item.key} disabled={disabled || !!issue} onPress={() => onSelect(item.key)}>
      {!!item.description && <Text style={s.small}>{item.description}</Text>}
      <Text style={s.heading}>{displayMoney(item.totalToPay, quote.currency, formatNumber)}</Text>
      {item.commission > 0 && <DetailRow label={t('commerce.paymentCommission')} value={displayMoney(item.commission, quote.currency, formatNumber)} />}
      {issue && <Notice>{t(issue)}</Notice>}
    </Choice>;
  })}</>;
}
export function LiveCheckoutScreen({ cartIds }: { cartIds: string[] }) {
  const live = useLiveAccount(); const { language } = useI18n();
  return <CheckoutFlow key={JSON.stringify([cartIds, live.accountId, live.accountRevision, language])} cartIds={cartIds} />;
}
async function readCartItems(ids: string[], read: ReturnType<typeof useLiveAccount>['readView'], signal: AbortSignal): Promise<CartItem[]> {
  const items: CartItem[] = [];
  for (let offset = 0; offset < ids.length; offset += 4) {
    if (signal.aborted) throw new Error('cancelled');
    items.push(...await Promise.all(ids.slice(offset, offset + 4).map(id => read({ kind: 'cart.detail', id }, { signal }))));
  }
  return checkoutItems(ids, items);
}
function useCheckoutItems(ids: string[], enabled: boolean) {
  const { readView, authenticated } = useLiveAccount(); const [revision, setRevision] = useState(0);
  const [stored, setStored] = useState<{ key: string; resource: Resource<CartItem[]> } | null>(null);
  const key = JSON.stringify([ids, revision, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const [currentIds] = JSON.parse(key) as [string[], number, boolean];
    void readCartItems(currentIds, readView, controller.signal).then(data => { if (!controller.signal.aborted) setStored({ key, resource: { data, loading: false, error: null, updatedAt: Date.now() } }); }).catch(error => { if (!controller.signal.aborted) setStored({ key, resource: { data: null, loading: false, error: errorMessage(error), updatedAt: null } }); });
    return () => controller.abort();
  }, [enabled, key, readView]);
  const resource: Resource<CartItem[]> = stored?.key === key ? stored.resource : { data: null, loading: enabled, error: null, updatedAt: null };
  const pending = enabled && authenticated && (resource.loading || (resource.data === null && resource.error === null && resource.updatedAt === null));
  usePageLoad(pending, pending && resource.data === null);
  return { resource, refresh: () => setRevision(value => value + 1) };
}
function CheckoutFlow({ cartIds }: { cartIds: string[] }) {
  const { s } = useUi();
  const live = useLiveAccount(); const { t, formatNumber, language } = useI18n();
  const [step, setStep] = useState(0), [page, setPage] = useState(1), [search, setSearch] = useState(''), [searchInput, setSearchInput] = useState('');
  const [addressId, setAddressId] = useState(''), [carrierId, setCarrierId] = useState(''), [localId, setLocalId] = useState(''), [optionId, setOptionId] = useState('');
  const [openPickup, setOpenPickup] = useState(false); const [localPage, setLocalPage] = useState(1), [localAddressId, setLocalAddressId] = useState('');
  const [insurance, setInsurance] = useState(false), [services, setServices] = useState<string[]>([]), [paymentKey, setPaymentKey] = useState('');
  const [billingInput, setBillingInput] = useState<BillingInput | null>(null);
  const [editingBilling, setEditingBilling] = useState(false);
  const [waitAllItems, setWaitAllItems] = useState(false), [allowLowerQuantity, setAllowLowerQuantity] = useState(false), [allowOverpricing, setAllowOverpricing] = useState(false);
  const [checking, setChecking] = useState(false), [error, setError] = useState<string | null>(null), [uncertain, setUncertain] = useState(false), [created, setCreated] = useState<{ order: CreatedOrder; quote: CheckoutPayments } | null>(null), [confirmation, setConfirmation] = useState<string | null>(null);
  const submitting = useRef(false);
  const controller = useRef<AbortController | null>(null); useEffect(() => () => controller.current?.abort(), []);
  const validIds = cartIds.length > 0 && new Set(cartIds).size === cartIds.length && cartIds.every(id => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)));
  const products = useCheckoutItems(cartIds, validIds && !created);
  const productsReady = !!products.resource.data && !products.resource.error && !products.resource.loading;
  const addresses = useOperationView(validIds && !created ? { kind: 'checkout.addresses', carts: cartIds, page, search } : null);
  const focused = useIsFocused(); const wasFocused = useRef(false); const hasFocused = useRef(false);
  const refreshAddresses = addresses.refresh;
  useEffect(() => {
    if (focused && !wasFocused.current) { if (hasFocused.current) { void refreshAddresses(); } hasFocused.current = true; }
    wasFocused.current = focused;
  }, [focused, refreshAddresses]);
  const address = addresses.resource.data?.items.find(item => item.id === addressId);
  const carriers = useOperationView(address ? { kind: 'checkout.shipping', carts: cartIds, addressId } : null);
  const carrier = carriers.resource.data?.find(item => item.id === carrierId);
  const locals = useOperationView(address && carrier?.localDelivery ? { kind: 'checkout.localShipping', carts: cartIds, addressId, shipperId: carrier.id } : null);
  const local = locals.resource.data?.find(item => item.id === localId);
  const localOption = local?.options.find(item => item.id === optionId);
  const localAddresses = useOperationView(local?.optionsKey === 'localAddressId' ? { kind: 'checkout.addresses', carts: cartIds, localDeliveryId: local.id, page: localPage } : null);
  const localAddress = localAddresses.resource.data?.items.find(item => item.id === localAddressId) ?? null;
  const localSelection = local ? checkoutLocalSelection(local, optionId, localAddress) : null;
  const refreshLocal = localAddresses.refresh;
  useEffect(() => { if (focused) void refreshLocal(); }, [focused, refreshLocal]);
  const extras = useOperationView(address && carrier ? { kind: 'checkout.insurance', carts: cartIds, addressId, shipperId: carrier.id } : null);
  const payments = useOperationView(validIds && step >= 4 && !created ? { kind: 'checkout.payments', carts: cartIds } : null);
  const payment = payments.resource.data?.methods.find(item => item.key === paymentKey);
  const hasBilling = !!payment && orderBillingMissing(payment.key, null);
  const billing = useOperationView(hasBilling && !created ? { kind: 'orders.payment.billing' } : null);
  const refreshBilling = billing.refresh;
  const billingReady = !hasBilling || !editingBilling && !billing.resource.error && !billing.resource.loading && !!billing.resource.data
    && (!!billingInput || !orderBillingMissing(payment!.key, billing.resource.data));
  const busy = checking || live.mutationPending;
  const guard = useDraftGuard(!created && (step > 0 || !!addressId || busy), { fallbackHref: '/cart', pending: busy, onBack: () => { if (busy) return true; if (!step) return false; setStep(value => value - 1); setConfirmation(null); return true; } });
  const readyAddress = !!address?.completed && !addresses.resource.loading && !addresses.resource.error;
  const readyCarrier = !!carrier && !carrier.selfSend && !carriers.resource.loading && !carriers.resource.error;
  const readyLocal = !!carrier && (!carrier.localDelivery || !!localSelection && !locals.resource.loading && !locals.resource.error && (local?.optionsKey !== 'localAddressId' || !localAddresses.resource.loading && !localAddresses.resource.error));
  const readyExtras = !!extras.resource.data && !extras.resource.loading && !extras.resource.error && services.every(key => extras.resource.data!.services.some(item => item.key === key && item.price !== null)) && (!insurance || carrier?.insurance === true && extras.resource.data.available);
  const readyPayment = !!payment && !!payments.resource.data && !checkoutPaymentIssue(payment, payments.resource.data.currency, payments.resource.data) && billingReady && !payments.resource.error && !payments.resource.loading;
  const review = JSON.stringify([cartIds, products.resource.data, address, carrier, local, localOption, localAddress, extras.resource.data, insurance, services, payments.resource.data, paymentKey, hasBilling ? billingInput : null, waitAllItems, allowLowerQuantity, allowOverpricing]);
  const ready = productsReady && [readyAddress, readyCarrier, readyLocal, readyExtras, readyPayment, readyAddress && readyCarrier && readyLocal && readyExtras && readyPayment && confirmation === review][step];
  const money = (amount: number | null, currency: string | null) => amount === null ? t('common.unavailable') : displayMoney(amount, currency, formatNumber);
  const resetCarrier = () => { setCarrierId(''); setLocalId(''); setOptionId(''); setLocalAddressId(''); setLocalPage(1); setInsurance(false); setServices([]); setConfirmation(null); };
  const submit = async () => {
    if (submitting.current || !ready || !live.canMutate || busy || uncertain || !carrier || !address || !payment || !products.resource.data || !extras.resource.data || !payments.resource.data) return;
    submitting.current = true; setChecking(true); setError(null); const abort = new AbortController(); controller.current = abort;
    try {
      // Revalidate the reviewed account options and quote immediately before the
      // user's one explicit POST. A changed quote requires a new confirmation.
      const [newProducts, newAddresses, newCarriers, newLocals, newLocalAddresses, newExtras, newPayments] = await Promise.all([
        readCartItems(cartIds, live.readView, abort.signal),
        live.readView({ kind: 'checkout.addresses', carts: cartIds, page, search }, { signal: abort.signal }),
        live.readView({ kind: 'checkout.shipping', carts: cartIds, addressId }, { signal: abort.signal }),
        carrier.localDelivery ? live.readView({ kind: 'checkout.localShipping', carts: cartIds, addressId, shipperId: carrier.id }, { signal: abort.signal }) : Promise.resolve(null),
        local?.optionsKey === 'localAddressId' ? live.readView({ kind: 'checkout.addresses', carts: cartIds, localDeliveryId: local.id, page: localPage }, { signal: abort.signal }) : Promise.resolve(null),
        live.readView({ kind: 'checkout.insurance', carts: cartIds, addressId, shipperId: carrier.id }, { signal: abort.signal }),
        live.readView({ kind: 'checkout.payments', carts: cartIds }, { signal: abort.signal }),
      ]);
      if (abort.signal.aborted) return;
      const matches = checkoutItemFingerprint(newProducts) === checkoutItemFingerprint(products.resource.data) && JSON.stringify(newAddresses.items.find(item => item.id === addressId)) === JSON.stringify(address) && JSON.stringify(newCarriers.find(item => item.id === carrierId)) === JSON.stringify(carrier) && (!carrier.localDelivery || JSON.stringify(newLocals?.find(item => item.id === localId)) === JSON.stringify(local)) && (local?.optionsKey !== 'localAddressId' || JSON.stringify(newLocalAddresses?.items.find(item => item.id === localAddressId)) === JSON.stringify(localAddress)) && JSON.stringify(newExtras) === JSON.stringify(extras.resource.data) && JSON.stringify(newPayments) === JSON.stringify(payments.resource.data);
      if (!matches) { setConfirmation(null); setError('commerce.quoteChanged'); products.refresh(); void addresses.refresh(); void carriers.refresh(); void locals.refresh(); void localAddresses.refresh(); void extras.refresh(); void payments.refresh(); return; }
      if (hasBilling) {
        const latest = await live.readView({ kind: 'orders.payment.billing' }, { signal: abort.signal });
        if (!billingInput && orderBillingMissing(payment.key, latest)) {
          setConfirmation(null); setStep(4); setError('payments.billingMissing'); void refreshBilling(); return;
        }
      }
      const input: CheckoutInput = { carts: cartIds, addressId, shipperId: carrierId, ...(carrier.localDelivery && localSelection ? { localPickup: localSelection } : {}), additionServices: services, insurance, waitAllItems: waitAllItems || carrier.forceWaitAllItems === true, allowLowerQuantity, allowOverpricing, paymentType: payment.key, reviewedPayments: newPayments };
      const result = await live.mutate({ kind: 'order.create', input });
      if (abort.signal.aborted) return;
      if (result.ok) setCreated({ order: result.data as CreatedOrder, quote: newPayments });
      else { setError(result.error || 'errors.saveFailed'); setUncertain(result.outcome === 'unknown'); }
    } catch (error) { if (!abort.signal.aborted) setError(errorMessage(error)); }
    finally { submitting.current = false; if (!abort.signal.aborted) setChecking(false); }
  };
  const labels = ['commerce.recipient', 'commerce.carrier', 'commerce.localMethod', 'commerce.services', 'commerce.payment', 'commerce.review'];
  if (created) return <Screen title={t('commerce.orderCreated')}>
    <OrderPaymentPanel created={created.order} quote={created.quote} billingInput={billingInput ?? undefined} />
    {created.order.orders.map(order => <View key={order.id} style={s.card}>
      <Text selectable style={s.heading}>{order.uid || order.id}</Text>
      <Button secondary onPress={() => guard.bypass(() => router.replace({ pathname: '/order/[id]', params: { id: order.id } }))}>{t('commerce.details')}</Button>
    </View>)}
  </Screen>;
  return <Screen title={t('commerce.checkoutTitle')} subtitle={t('commerce.step', { step: step + 1, count: labels.length })}>
    {!validIds ? <Notice error>{t('errors.invalidField')}</Notice> : <>
      <Text accessibilityRole="header" style={s.heading}>{t(labels[step])}</Text>
      {(step === 0 || step === 5) && <><ResourceStatus resource={products.resource} onRefresh={() => { if (!busy) { setConfirmation(null); products.refresh(); } }} />{products.resource.data?.map(item => <View key={item.id} style={s.card}><Text style={s.heading}>{item.title}</Text><Text selectable style={s.small}>{item.uid || item.id}</Text><DetailRow label={t('commerce.quantity')} value={formatNumber(item.quantity)} /><DetailRow label={t('commerce.price')} value={money(item.price, item.currency)} />{item.color && <DetailRow label={t('commerce.color')} value={item.color} />}{item.size && <DetailRow label={t('commerce.size')} value={item.size} />}{item.comment && <DetailRow label={t('commerce.comment')} value={item.comment} />}</View>)}</>}
      {step === 0 && <>{addresses.resource.data?.notifications.map((text, index) => <Notice key={index}>{text}</Notice>)}<ResourceStatus resource={addresses.resource} onRefresh={() => { if (!busy) { setAddressId(''); resetCarrier(); void addresses.refresh(); } }} /><Field label={t('commerce.recipientSearch')} value={searchInput} editable={!busy} onChangeText={setSearchInput} /><Button secondary disabled={busy} onPress={() => { setAddressId(''); resetCarrier(); setPage(1); setSearch(searchInput.trim()); }}>{t('commerce.searchButton')}</Button>
        {addresses.resource.data?.items.length === 0 && !addresses.resource.loading && !addresses.resource.error && <Notice>{t('commerce.noRecipients')}</Notice>}<Button secondary disabled={busy} onPress={() => router.push('/address-book')}>{t('packing.addressBook')}</Button>
        {addresses.resource.data?.items.map(item => <Choice key={item.id} label={item.name || item.id} selected={addressId === item.id} disabled={busy || !item.completed} onPress={() => { setAddressId(item.id); resetCarrier(); }}><CountryLabel selectable name={item.country} label={[item.address, item.city, item.country ? countryDisplayName(null, item.country, language) : null].filter(Boolean).join(', ')} textStyle={s.body} size="small" />{item.phone && <Text selectable style={s.small}>{item.phone}</Text>}{!item.completed && <Notice>{t('packing.incompleteAddress')}</Notice>}</Choice>)}
        {addresses.resource.data && addresses.resource.data.pages > 1 && <View style={s.card}><Text style={s.small}>{t('packing.page', { page, pages: addresses.resource.data.pages })}</Text><Button secondary disabled={busy || page <= 1} onPress={() => { setAddressId(''); resetCarrier(); setPage(page - 1); }}>{t('packing.previousPage')}</Button><Button secondary disabled={busy || page >= addresses.resource.data.pages} onPress={() => { setAddressId(''); resetCarrier(); setPage(page + 1); }}>{t('packing.nextPage')}</Button></View>}
      </>}
      {step === 1 && <><ResourceStatus resource={carriers.resource} onRefresh={() => { if (!busy) { resetCarrier(); void carriers.refresh(); } }} />{carriers.resource.data?.length === 0 && !carriers.resource.loading && !carriers.resource.error && <Notice>{t('commerce.noCarriers')}</Notice>}{carriers.resource.data?.map(item => <Choice service logoUrl={item.logoUrl} key={item.id} label={item.title} selected={carrierId === item.id} disabled={busy || item.selfSend} onPress={() => { setCarrierId(item.id); setLocalId(''); setOptionId(''); setLocalAddressId(''); setLocalPage(1); setInsurance(false); setServices([]); setConfirmation(null); }}><Text style={s.small}>{item.time}</Text>{item.description && <Text style={s.body}>{item.description}</Text>}<ConsolidationNotice carrierAllowsConsolidation={item.consolidation} />{item.selfSend && <Notice>{t('commerce.unsupportedOption')}</Notice>}</Choice>)}</>}
      {step === 2 && <>{!carrier?.localDelivery ? <Notice>{t('commerce.localNotRequired')}</Notice> : <>
        <ResourceStatus resource={locals.resource} onRefresh={() => { if (!busy) { setLocalId(''); setOptionId(''); setLocalAddressId(''); setLocalPage(1); void locals.refresh(); } }} />
        {locals.resource.data?.length === 0 && !locals.resource.loading && !locals.resource.error && <Notice>{t('commerce.noLocalMethods')}</Notice>}
        {locals.resource.data?.map(item => <Choice service logoUrl={item.logoUrl} key={item.id} label={item.title} selected={localId === item.id} disabled={busy || !checkoutLocalMethodKey(item)} onPress={() => { setLocalId(item.id); setOptionId(''); setLocalAddressId(''); setLocalPage(1); setConfirmation(null); setOpenPickup(item.optionsKey !== 'localAddressId'); }}><DeliveryPrice quote={item} method /><Text style={s.body}>{item.description}</Text>{!checkoutLocalMethodKey(item) && <Notice>{t('commerce.unsupportedOption')}</Notice>}</Choice>)}
        {local?.optionsKey === 'localAddressId' ? <>
          <ResourceStatus resource={localAddresses.resource} onRefresh={() => { if (!busy) { setLocalAddressId(''); setConfirmation(null); void localAddresses.refresh(); } }} />
          {localAddresses.resource.data?.notifications.map((text, index) => <Notice key={index}>{text}</Notice>)}
          <Button secondary disabled={busy} onPress={() => router.push('/address-book')}>{t('packing.addressBook')}</Button>
          {localAddresses.resource.data?.items.map(item => <Choice key={item.id} label={item.name || item.id} selected={localAddressId === item.id} disabled={busy || !item.completed} onPress={() => { setLocalAddressId(item.id); setConfirmation(null); }}><CountryLabel name={item.country} label={[item.address, item.city, item.country ? countryDisplayName(null, item.country, language) : null].filter(Boolean).join(', ')} textStyle={s.body} /><DeliveryPrice quote={{ price: item.price, currency: item.currency ?? local.currency }} />{!item.completed && <Notice>{t('packing.incompleteAddress')}</Notice>}</Choice>)}
          {localAddresses.resource.data?.items.length === 0 && !localAddresses.resource.loading && !localAddresses.resource.error && <Notice>{t('commerce.noRecipients')}</Notice>}
          {localAddresses.resource.data && localAddresses.resource.data.pages > 1 && <View style={s.card}><Text style={s.small}>{t('packing.page', { page: localPage, pages: localAddresses.resource.data.pages })}</Text><Button secondary disabled={busy || localPage <= 1} onPress={() => { setLocalAddressId(''); setLocalPage(localPage - 1); }}>{t('packing.previousPage')}</Button><Button secondary disabled={busy || localPage >= localAddresses.resource.data.pages} onPress={() => { setLocalAddressId(''); setLocalPage(localPage + 1); }}>{t('packing.nextPage')}</Button></View>}
        </> : local && <PickupPointPicker label={local.title} value={optionId} points={local.options.map(item => ({ ...item, priceLabel: deliveryPriceLabel({ price: item.price, currency: item.currency ?? local.currency }, formatNumber) ?? t('packing.priceUnavailable') }))} openRequested={openPickup} onOpenRequestHandled={() => setOpenPickup(false)} onChange={value => { setOptionId(value); setConfirmation(null); }} disabled={busy || locals.resource.loading || !!locals.resource.error} />}
      </>}</>}
      {step === 3 && <>{extras.resource.data?.notifications.map((text, index) => <Notice key={index}>{text}</Notice>)}<ResourceStatus resource={extras.resource} onRefresh={() => { if (!busy) { setInsurance(false); setServices([]); setConfirmation(null); void extras.refresh(); } }} />{extras.resource.data && <>
        {extras.resource.data.free && extras.resource.data.freeLimit !== null && <Notice>{t('commerce.freeInsuranceLimit', { amount: money(extras.resource.data.freeLimit, extras.resource.data.currency) })}</Notice>}
        {carrier?.insurance && extras.resource.data.available && <Choice label={t('commerce.insurance')} multiple selected={insurance} disabled={busy} onPress={() => setInsurance(!insurance)}><Text style={s.small}>{extras.resource.data.percent === null ? t('commerce.insuranceRateUnavailable') : t('commerce.insuranceRate', { percent: formatNumber(extras.resource.data.percent) })}</Text><DetailRow label={t('commerce.insuranceMinimum')} value={money(extras.resource.data.minimum, extras.resource.data.currency)} /><DetailRow label={t('commerce.insuranceMaximum')} value={money(extras.resource.data.maximum, extras.resource.data.currency)} /></Choice>}
        {extras.resource.data.services.map(item => <Choice key={item.key} label={item.title} multiple selected={services.includes(item.key)} disabled={busy || item.price === null} onPress={() => setServices(values => values.includes(item.key) ? values.filter(value => value !== item.key) : [...values, item.key])}><Text style={s.body}>{item.description}</Text><Text style={s.small}>{money(item.price, extras.resource.data!.currency)}</Text></Choice>)}
        {carrier?.forceWaitAllItems && <Notice>{t('cartLink.waitAllRequired')}</Notice>}{([['waitAllItems', waitAllItems || carrier?.forceWaitAllItems === true, setWaitAllItems], ['allowLowerQuantity', allowLowerQuantity, setAllowLowerQuantity], ['allowOverpricing', allowOverpricing, setAllowOverpricing]] as const).map(([key, value, change]) => <Choice key={key} label={t(`commerce.${key}`)} multiple selected={value} disabled={busy || key === 'waitAllItems' && carrier?.forceWaitAllItems === true} onPress={() => change(!value)} />)}
      </>}</>}
      {step === 4 && <>
        <ResourceStatus resource={payments.resource} onRefresh={() => { if (!busy) { setConfirmation(null); void payments.refresh(); } }} />
        {payments.resource.data && <CheckoutPaymentChoices quote={payments.resource.data} value={paymentKey} disabled={busy} onSelect={key => {
          if (paymentKey !== key) { setEditingBilling(false); setBillingInput(null); }
          setPaymentKey(key); setError(null); setConfirmation(null);
        }} />}
        {hasBilling && <View style={s.card}>
          <Text style={s.heading}>{t('payments.billing')}</Text>
          <ResourceStatus resource={billing.resource} onRefresh={() => { void refreshBilling(); }} />
          {editingBilling && billing.resource.data
            ? <OrderCheckoutBilling saved={billing.resource.data} selected={billingInput} onClose={() => setEditingBilling(false)} onUse={value => {
                setBillingInput(value); setEditingBilling(false); setError(null); setConfirmation(null);
              }} />
            : <>
              {billing.resource.data && <Text style={s.small}>{t(billingInput ? 'commerce.orderBillingConsent' : billingReady ? 'commerce.orderBillingReady' : 'payments.billingMissing')}</Text>}
              <Button secondary disabled={busy || !billing.resource.data} onPress={() => setEditingBilling(true)}>{t('payments.editBilling')}</Button>
            </>}
        </View>}
      </>}
      {step === 5 && <><ConsolidationNotice carrierAllowsConsolidation={carrier?.consolidation} point={localOption} />{[...new Set([...(addresses.resource.data?.notifications || []), ...(extras.resource.data?.notifications || [])])].map((text, index) => <Notice key={index}>{text}</Notice>)}<View style={s.card}><DetailRow country countryName={address?.country} label={t('commerce.recipient')} value={[address?.name, address?.address, address?.city, address?.country ? countryDisplayName(null, address.country, language) : null].filter(Boolean).join(', ') || null} />{carrier && <ServiceDetailRow label={t('commerce.carrier')} title={carrier.title} logoUrl={carrier.logoUrl} />}{carrier?.localDelivery && <DetailRow label={t('commerce.pickup')} value={localAddress ? [localAddress.name, localAddress.address, localAddress.city].filter(Boolean).join(', ') : localOption?.address ?? null} />}{carrier?.localDelivery && local && <DeliveryPrice quote={{ price: local.optionsKey === 'localAddressId' ? localAddress?.price ?? null : localOption?.price ?? null, currency: local.optionsKey === 'localAddressId' ? localAddress?.currency ?? local.currency : localOption?.currency ?? local.currency }} />}<DetailRow label={t('commerce.payment')} value={payment?.title ?? null} />{payments.resource.data?.lines.map(line => <DetailRow key={line.key} label={t(`commerce.${line.key}`)} value={money(line.amount, payments.resource.data!.currency)} />)}{payment && <><DetailRow label={t('commerce.paymentCommission')} value={money(payment.commission, payments.resource.data!.currency)} /><DetailRow label={t('commerce.totalToPay')} value={money(payment.totalToPay, payments.resource.data!.currency)} /></>}<Notice>{t('commerce.deliveryLater')}</Notice>{extras.resource.data?.services.filter(item => services.includes(item.key)).map(item => <DetailRow key={item.key} label={item.title} value={money(item.price, extras.resource.data!.currency)} />)}{(['waitAllItems', 'allowLowerQuantity', 'allowOverpricing', 'insurance'] as const).map(key => <DetailRow key={key} label={t(`commerce.${key}`)} value={t(({ waitAllItems: waitAllItems || carrier?.forceWaitAllItems === true, allowLowerQuantity, allowOverpricing, insurance })[key] ? 'commerce.yes' : 'commerce.no')} />)}</View><Choice label={t('commerce.confirmOrder')} multiple selected={confirmation === review} disabled={busy || uncertain} onPress={() => setConfirmation(confirmation === review ? null : review)} /></>}
      {error && <Notice error>{t(error)}</Notice>}{uncertain && <><Notice error>{t('commerce.unknown')}</Notice><Button secondary onPress={() => guard.bypass(() => router.replace('/shopping'))}>{t('commerce.checkList')}</Button></>}
      {step < 5 ? <Button disabled={!ready || busy || uncertain} onPress={() => { setError(null); setStep(step + 1); }}>{t('commerce.continue')}</Button> : <Button disabled={!ready || !live.canMutate || busy || uncertain} onPress={() => { void submit(); }}>{t(busy ? 'commerce.submitting' : 'commerce.placeOrder')}</Button>}
      {step > 0 && <Button secondary disabled={busy || uncertain} onPress={() => { setStep(step - 1); setConfirmation(null); setError(null); }}>{t('commerce.back')}</Button>}
      <Button secondary disabled={busy} onPress={() => guard.confirmDiscard(() => guard.bypass(() => router.replace('/cart')))}>{t('accountOps.cancel')}</Button>
    </>}
  </Screen>;
}
