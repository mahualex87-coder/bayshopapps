import { DeliveryPrice } from '@/components/DeliveryPrice';
import { deliveryPriceLabel } from '@/domain/delivery-price';
import { ConsolidationNotice } from '@/components/ConsolidationNotice';
import { ServiceIdentity } from '@/components/ServiceIdentity';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import type { ReadCommand, PackingInput } from '@/api/operations-contracts';
import type { Resource } from '@/api/service';
import { packingAddresses, packingCarriers, packingEligibility, packingInsurance, packingLocal, packingLocalFields, packingSelectedAddress, type PackingAddress, type PackingCarrier, type PackingLocal } from '@/api/packing-normalize';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { usePageLoad } from '@/navigation/PageLoading';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { displayMoney, ResourceStatus } from '@/features/live/shared';
import { PickupPointPicker } from '@/components/PickupPointPicker';
import { CountryLabel } from '@/components/CountryFlag';
import { countryDisplayName } from '@/domain/presentation-labels';
import { warehouseSelection } from '@/features/live/warehouse-selection';

function usePackingView<T>(query: ReadCommand | null, decode: (raw: unknown) => T) {
  const { readView, authenticated, language, accountId, accountRevision } = useLiveAccount();
  const focused = useIsFocused();
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; resource: Resource<T> } | null>(null);
  const key = JSON.stringify(query);
  const viewKey = JSON.stringify([key, revision, language, authenticated, accountId, accountRevision]);
  const resource: Resource<T> = loaded?.key === viewKey ? loaded.resource : { data: null, loading: !!query && authenticated, error: null, updatedAt: null };
  const pending = focused && query !== null && authenticated && (resource.loading || (resource.data === null && resource.error === null && resource.updatedAt === null));
  usePageLoad(pending, pending && resource.data === null);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    const command = JSON.parse(key) as ReadCommand | null;
    if (command && authenticated) {
      setLoaded(previous => ({ key: viewKey, resource: { data: previous?.key === viewKey ? previous.resource.data : null, loading: true, error: null, updatedAt: null } }));
      void readView(command, { signal: controller.signal }).then(raw => {
      if (!controller.signal.aborted) setLoaded({ key: viewKey, resource: { data: decode(raw), loading: false, error: null, updatedAt: Date.now() } });
    }).catch(error => { if (!controller.signal.aborted) setLoaded({ key: viewKey, resource: { data: null, loading: false, error: errorMessage(error), updatedAt: null } }); });
    }
    return () => controller.abort();
  }, [key, readView, authenticated, viewKey, decode]));
  return { resource, reload: useCallback(() => setRevision(value => value + 1), []) };
}

function SelectCard({ selected, disabled, label, onPress, children, checkbox = false, service = false, logoUrl }: PropsWithChildren<{ selected: boolean; disabled?: boolean; label: string; onPress: () => void; checkbox?: boolean; service?: boolean; logoUrl?: string | null }>) {
  const { colors, s } = useUi();
  return <Pressable accessibilityRole={checkbox ? 'checkbox' : 'radio'} accessibilityLabel={label} aria-checked={selected} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[s.card, { minHeight: minTouchTarget }, selected && { borderColor: colors.accent, backgroundColor: colors.soft }, disabled && { opacity: 0.6 }]}>
    <View style={[s.row, { flexWrap: 'nowrap' }]}><View style={{ flex: 1 }}>{service ? <ServiceIdentity title={label} logoUrl={logoUrl} textStyle={s.heading} /> : <Text style={s.heading}>{label}</Text>}</View><Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={selected ? colors.accent : colors.muted} /></View>{children}
  </Pressable>;
}

export function LivePackingWizard({ initialBoxIds = [] }: { initialBoxIds?: string[] }) {
  const { colors, s } = useUi();
  const live = useLiveAccount(); const { t, formatNumber, language } = useI18n();
  const [step, setStep] = useState(0); const [boxes, setBoxes] = useState<string[]>(() => [...new Set(initialBoxIds)]);
  const [recipientSelection, setRecipient] = useState<PackingAddress | null>(null);
  const [carrierSelection, setCarrier] = useState<PackingCarrier | null>(null);
  const [localSelection, setLocal] = useState<PackingLocal | null>(null); const [localOption, setLocalOption] = useState(''); const [localAddressSelection, setLocalAddress] = useState<PackingAddress | null>(null);
  const [insurance, setInsurance] = useState(false); const [services, setServices] = useState<string[]>([]); const [hold, setHold] = useState(false);
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [searchInput, setSearchInput] = useState('');
  const [openPickup, setOpenPickup] = useState(false); const [localPage, setLocalPage] = useState(1); const [confirmation, setConfirmation] = useState<string | null>(null);
  const [checking, setChecking] = useState(false); const [error, setError] = useState<string | null>(null); const [uncertain, setUncertain] = useState(false); const [created, setCreated] = useState<string[] | null>(null);
  const submitController = useRef<AbortController | null>(null);
  const stock = live.resources.warehouse;
  useEffect(() => () => submitController.current?.abort(), []);
  const busy = checking || live.mutationPending;
  const previous = useCallback(() => { if (busy) return true; if (!step) return false; setStep(value => value - 1); setError(null); setConfirmation(null); return true; }, [busy, step]);
  const { bypass, confirmDiscard } = useDraftGuard(!created && (boxes.length > 0 || step > 0 || busy), { onBack: previous, fallbackHref: '/warehouse', pending: busy });
  const chosen = (stock.data ?? []).filter(parcel => boxes.includes(parcel.id));
  const selection = warehouseSelection(stock.data || [], boxes);
  const stockReady = !!stock.data && !stock.loading && !stock.error && selection.ready;
  const addresses = usePackingView(step >= 1 && stockReady ? { kind: 'packing.addresses', boxes, page, search } : null, packingAddresses);
  const recipient = packingSelectedAddress(recipientSelection, addresses.resource);
  const carriers = usePackingView(step >= 2 && recipient && stockReady ? { kind: 'packing.shipping', boxes, addressId: recipient.id } : null, packingCarriers);
  const carrier = carriers.resource.data?.items.find(value => value.id === carrierSelection?.id) ?? null;
  const locals = usePackingView(step >= 3 && carrier?.localDelivery && recipient && stockReady ? { kind: 'packing.localShipping', boxes, addressId: recipient.id, shipperId: carrier.id } : null, packingLocal);
  const local = locals.resource.data?.find(value => value.id === localSelection?.id) ?? null;
  const localAddresses = usePackingView(step >= 3 && local?.optionsKey === 'localAddressId' && stockReady ? { kind: 'packing.addresses', boxes, localDeliveryId: local.id, page: localPage } : null, packingAddresses);
  const localAddress = packingSelectedAddress(localAddressSelection, localAddresses.resource);
  const extras = usePackingView(step >= 4 && recipient && carrier && stockReady ? { kind: 'packing.insurance', boxes, addressId: recipient.id, shipperId: carrier.id } : null, packingInsurance);
  const reviewKey = JSON.stringify([boxes, recipient, carrier, local, localOption, localAddress, insurance, services, hold, extras.resource.data]);
  const confirmed = confirmation === reviewKey;
  const resetAfterBoxes = () => { setRecipient(null); setCarrier(null); setLocal(null); setLocalOption(''); setLocalAddress(null); setInsurance(false); setServices([]); setConfirmation(null); setPage(1); setError(null); };
  const toggleBox = (id: string) => { resetAfterBoxes(); setBoxes(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); };
  const selectRecipient = (value: PackingAddress) => { setRecipient(value); setCarrier(null); setLocal(null); setInsurance(false); setServices([]); setConfirmation(null); };
  const selectCarrier = (value: PackingCarrier) => { setCarrier(value); setLocal(null); setLocalOption(''); setLocalAddress(null); setInsurance(false); setServices([]); setConfirmation(null); };
  const carrierProblem = (value: PackingCarrier) => value.overweight ? 'packing.overweight' : value.selfSend ? 'packing.selfSend' : null;
  const localSupported = (value: PackingLocal) => value.optionsKey === 'terminal' || value.optionsKey === 'localAddressId' || value.optionsKey.startsWith('localStorage-');
  const localReady = !!carrier && (!carrier.localDelivery || (!!local && !locals.resource.error && !locals.resource.loading && (local.optionsKey === 'localAddressId' ? !!localAddress?.completed && !localAddresses.resource.error && !localAddresses.resource.loading : local.options.some(option => option.id === localOption))));
  const servicesReady = !!extras.resource.data && services.every(key => extras.resource.data!.services.some(value => value.key === key && value.price !== null)) && (!insurance || (!!carrier?.insurance && extras.resource.data.available));
  const recipientReady = !!recipient?.completed && !addresses.resource.loading && !addresses.resource.error;
  const currentReady = stockReady && (step === 0 || recipientReady && (step === 1 || (step === 2 ? !!carrier && !carrierProblem(carrier) && !carriers.resource.loading && !carriers.resource.error : step === 3 ? localReady : step === 4 ? servicesReady && !extras.resource.loading && !extras.resource.error : confirmed && !!carrier && !carrierProblem(carrier) && !carriers.resource.loading && !carriers.resource.error && localReady && servicesReady && !extras.resource.loading && !extras.resource.error)));
  const money = (amount: number | null, currency: string | null) => amount === null ? t('common.unavailable') : displayMoney(amount, currency, formatNumber);
  const notices = (items: string[] | undefined) => items?.map((text, index) => <Notice key={`${index}-${text}`}>{text}</Notice>);
  const addressCards = (items: PackingAddress[] | undefined, selected: PackingAddress | null, choose: (value: PackingAddress) => void, localQuote = false) => items?.map(value => <SelectCard key={value.id} label={value.name || value.id} selected={selected?.id === value.id} disabled={busy || !value.completed} onPress={() => choose(value)}><CountryLabel selectable name={value.country} label={[value.address, value.city, countryDisplayName(null, value.country || '', language)].filter(Boolean).join(', ')} textStyle={s.body} size="small" />{value.phone && <Text selectable style={s.small}>{value.phone}</Text>}{localQuote && <DeliveryPrice quote={{ price: value.price, currency: value.currency ?? local?.currency ?? null }} />}{!value.completed && <Text style={[s.small, { color: colors.error }]}>{t('packing.incompleteAddress')}</Text>}</SelectCard>);
  const pagination = (value: ReturnType<typeof packingAddresses> | null, change: (value: number) => void) => value && value.pages > 1 && <View style={s.card}><Text style={s.small}>{t('packing.page', { page: value.page, pages: value.pages })}</Text><View style={s.row}><Button secondary disabled={busy || value.page <= 1} onPress={() => change(value.page - 1)}>{t('packing.previousPage')}</Button><Button secondary disabled={busy || value.page >= value.pages} onPress={() => change(value.page + 1)}>{t('packing.nextPage')}</Button></View></View>;
  const submit = async () => {
    if (!currentReady || busy || uncertain || !recipient || !carrier || !extras.resource.data || !localReady) return;
    setChecking(true); setError(null);
    const controller = new AbortController(); submitController.current = controller;
    try {
      // Re-check availability immediately before the explicit user-requested PUT.
      const details = await Promise.all(boxes.map(id => live.readView({ kind: 'stock.detail', id }, { signal: controller.signal })));
      if (controller.signal.aborted) return;
      if (details.some(value => value.declared !== true || value.packingDenied !== false || value.heldByDamage !== false || value.heldByProhibition !== false)) { setError('packing.selectionChanged'); return; }
      const [newCarriers, newExtras, newLocals, newAddresses, newLocalAddresses] = await Promise.all([
        live.readView({ kind: 'packing.shipping', boxes, addressId: recipient.id }, { signal: controller.signal }).then(packingCarriers),
        live.readView({ kind: 'packing.insurance', boxes, addressId: recipient.id, shipperId: carrier.id }, { signal: controller.signal }).then(packingInsurance),
        carrier.localDelivery ? live.readView({ kind: 'packing.localShipping', boxes, addressId: recipient.id, shipperId: carrier.id }, { signal: controller.signal }).then(packingLocal) : Promise.resolve(null),
        live.readView({ kind: 'packing.addresses', boxes, page, search }, { signal: controller.signal }).then(packingAddresses),
        local?.optionsKey === 'localAddressId' ? live.readView({ kind: 'packing.addresses', boxes, localDeliveryId: local.id, page: localPage }, { signal: controller.signal }).then(packingAddresses) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      const freshRecipient = newAddresses.items.find(value => value.id === recipient.id);
      const freshLocalAddress = newLocalAddresses?.items.find(value => value.id === localAddress?.id) ?? null;
      if (!freshRecipient?.completed || JSON.stringify(freshRecipient) !== JSON.stringify(recipient) || JSON.stringify(freshLocalAddress) !== JSON.stringify(localAddress)) {
        setConfirmation(null); setError('packing.recipientChanged'); addresses.reload(); if (local?.optionsKey === 'localAddressId') localAddresses.reload(); carriers.reload(); extras.reload(); if (carrier.localDelivery) locals.reload(); return;
      }
      const freshCarrier = newCarriers.items.find(value => value.id === carrier.id);
      const freshLocal = newLocals?.find(value => value.id === local?.id) ?? null;
      if (JSON.stringify(freshCarrier) !== JSON.stringify(carrier) || JSON.stringify(newExtras) !== JSON.stringify(extras.resource.data) || JSON.stringify(freshLocal) !== JSON.stringify(local)) {
        setConfirmation(null); setServices(previous => previous.filter(key => newExtras.services.some(value => value.key === key))); if (!newExtras.available || !freshCarrier?.insurance) setInsurance(false); setError('packing.quoteChanged'); carriers.reload(); extras.reload(); if (carrier.localDelivery) locals.reload(); return;
      }
      const input: PackingInput = { boxes, addressId: recipient.id, shipperId: carrier.id, insurance: insurance && extras.resource.data.available && carrier.insurance, sentOnUserAlert: hold, additionServices: services, ...packingLocalFields(carrier.localDelivery ? local : null, localOption, localAddress) };
      const result = await live.mutate({ kind: 'packing.create', input });
      if (controller.signal.aborted) return;
      if (result.ok) { setCreated((result.data as { codeNumber: string }[]).map(item => item.codeNumber)); setConfirmation(null); }
      else { setError(result.error || 'errors.mutationRejected'); setUncertain(result.outcome === 'unknown'); }
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setChecking(false); }
  };

  if (created) return <Screen title={t(created.length > 1 ? 'packing.createdMultiple' : 'packing.created')}><View style={s.card}>{created.map(code => <Text selectable key={code} style={s.heading}>{code}</Text>)}</View><Button onPress={() => bypass(() => router.replace('/shipments'))}>{t('packing.view')}</Button></Screen>;
  return <Screen title={t('packing.title')} subtitle={t('packing.step', { step: step + 1, total: 6, title: t(`packing.steps.${step}`) })}>
    <View accessibilityRole="progressbar" accessibilityLabel={t('packing.title')} accessibilityValue={{ min: 1, max: 6, now: step + 1 }} style={{ flexDirection: 'row', gap: 6 }}>{Array.from({ length: 6 }, (_, index) => <View key={index} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: index <= step ? colors.accent : colors.border }} />)}</View>
    {step === 0 && <><Notice>{t('packing.chooseBoxes')}</Notice>{!!stock.data && !stock.loading && !stock.error && selection.invalid && <><Notice error>{t('packing.selectionChanged')}</Notice><Button secondary disabled={busy} onPress={() => { setBoxes([]); resetAfterBoxes(); }}>{t('packing.clearSelection')}</Button></>}<ResourceStatus resource={stock} onRefresh={() => { void live.refresh(['warehouse']); }} />{stock.data?.map(parcel => { const problem = packingEligibility(parcel); const otherWarehouse = chosen.length > 0 && chosen[0].storageId !== parcel.storageId; return <SelectCard key={parcel.id} checkbox label={parcel.title || parcel.uid || parcel.id} selected={boxes.includes(parcel.id)} disabled={busy || !boxes.includes(parcel.id) && (!!problem || otherWarehouse)} onPress={() => toggleBox(parcel.id)}><CountryLabel selectable code={parcel.countryCode} name={parcel.countryTitle} label={[parcel.uid, countryDisplayName(parcel.countryCode, parcel.countryTitle || parcel.countryCode || '', language), parcel.weightKg === null ? null : `${formatNumber(parcel.weightKg, { maximumFractionDigits: 3 })} kg`].filter(Boolean).join(' · ')} textStyle={s.small} size="small" />{(problem || otherWarehouse) && <Text style={[s.small, { color: colors.error }]}>{t(problem || 'packing.otherWarehouse')}</Text>}</SelectCard>; })}{stock.data?.length === 0 && <Notice>{t('packing.none')}</Notice>}</>}
    {step >= 1 && recipientSelection && !addresses.resource.loading && !addresses.resource.error && !recipient?.completed && <Notice error>{t('packing.recipientChanged')}</Notice>}
    {step === 1 && <><Field label={t('packing.searchAddress')} value={searchInput} onChangeText={setSearchInput} editable={!busy} /><Button secondary disabled={busy} onPress={() => { setPage(1); setSearch(searchInput.trim()); }}>{t('packing.search')}</Button><ResourceStatus resource={addresses.resource} onRefresh={addresses.reload} />{notices(addresses.resource.data?.notifications)}{addressCards(addresses.resource.data?.items, recipient, selectRecipient)}{pagination(addresses.resource.data, setPage)}{addresses.resource.data?.items.length === 0 && <Notice>{t('packing.none')}</Notice>}<Button secondary disabled={busy} onPress={() => router.push('/address-book')}>{t('packing.addressBook')}</Button></>}
    {step === 2 && <><ResourceStatus resource={carriers.resource} onRefresh={carriers.reload} />{notices(carriers.resource.data?.notifications)}{carriers.resource.data?.items.map(value => { const problem = carrierProblem(value); return <SelectCard service logoUrl={value.logoUrl} key={value.id} label={value.title} selected={carrier?.id === value.id} disabled={busy || !!problem} onPress={() => selectCarrier(value)}><Text style={s.body}>{money(value.price, value.currency)}</Text>{!value.currency && <Text style={s.small}>{t('packing.currencyUnknown')}</Text>}{value.time && <Text style={s.body}>{value.time}</Text>}{value.description && <Text style={s.small}>{value.description}</Text>}{problem && <Text style={[s.small, { color: colors.error }]}>{t(problem)}</Text>}{!problem && <ConsolidationNotice carrierAllowsConsolidation={value.consolidation} />}</SelectCard>; })}{carriers.resource.data?.items.length === 0 && <Notice>{t('packing.none')}</Notice>}</>}
    {step === 3 && <>{!carrier?.localDelivery ? <Notice>{t('packing.noLocal')}</Notice> : <><ResourceStatus resource={locals.resource} onRefresh={locals.reload} />{locals.resource.data?.map(value => <SelectCard service logoUrl={value.logoUrl} key={value.id} label={value.title} selected={local?.id === value.id} disabled={busy || !localSupported(value)} onPress={() => { setLocal(value); setLocalOption(''); setLocalAddress(null); setLocalPage(1); setOpenPickup(value.optionsKey !== 'localAddressId'); }}><DeliveryPrice quote={value} method />{value.description && <Text style={s.small}>{value.description}</Text>}{!localSupported(value) && <Text style={s.small}>{t('packing.unsupportedLocal')}</Text>}</SelectCard>)}{locals.resource.data?.length === 0 && <Notice>{t('packing.none')}</Notice>}{local?.optionsKey === 'localAddressId' ? <><ResourceStatus resource={localAddresses.resource} onRefresh={localAddresses.reload} />{addressCards(localAddresses.resource.data?.items, localAddress, setLocalAddress, true)}{pagination(localAddresses.resource.data, setLocalPage)}</> : local && <PickupPointPicker label={local.title} value={localOption} points={local.options.map(option => ({ ...option, priceLabel: deliveryPriceLabel({ price: option.price, currency: option.currency ?? local.currency }, formatNumber) ?? t('packing.priceUnavailable') }))} openRequested={openPickup} onOpenRequestHandled={() => setOpenPickup(false)} onChange={setLocalOption} disabled={busy || locals.resource.loading || !!locals.resource.error} />}</>}</>}
    {step === 4 && <><ResourceStatus resource={extras.resource} onRefresh={extras.reload} />{notices(extras.resource.data?.notifications)}{extras.resource.data && <>{extras.resource.data.available && carrier?.insurance ? <SelectCard checkbox label={t('packing.insurance')} selected={insurance} disabled={busy || (!extras.resource.data.free && (extras.resource.data.percent === null || extras.resource.data.minimum === null || extras.resource.data.maximum === null))} onPress={() => setInsurance(value => !value)}><Text style={s.small}>{extras.resource.data.free ? t('packing.freeInsurance') : t('packing.insuranceRate', { percent: extras.resource.data.percent === null ? t('common.unavailable') : formatNumber(extras.resource.data.percent), minimum: money(extras.resource.data.minimum, extras.resource.data.currency), maximum: money(extras.resource.data.maximum, extras.resource.data.currency) })}</Text></SelectCard> : <Notice>{t('packing.insuranceUnavailable')}</Notice>}<Text style={s.heading}>{t('packing.additionalServices')}</Text>{extras.resource.data.services.map(value => <SelectCard checkbox key={value.key} label={value.title} selected={services.includes(value.key)} disabled={busy || value.price === null} onPress={() => setServices(previous => previous.includes(value.key) ? previous.filter(key => key !== value.key) : [...previous, value.key])}><Text style={s.body}>{money(value.price, extras.resource.data!.currency)}</Text>{value.description && <Text style={s.small}>{value.description}</Text>}</SelectCard>)}<SelectCard checkbox label={t('packing.hold')} selected={hold} disabled={busy} onPress={() => setHold(value => !value)}><Text style={s.small}>{t('packing.holdHelp')}</Text></SelectCard></>}</>}
    {step === 5 && <><ConsolidationNotice carrierAllowsConsolidation={carrier?.consolidation} point={local?.options.find(option => option.id === localOption)} /><Notice>{t('packing.review')}</Notice>{notices([...new Set([...(addresses.resource.data?.notifications || []), ...(carriers.resource.data?.notifications || []), ...(extras.resource.data?.notifications || [])])])}<View style={s.card}><Text style={s.heading}>{t('packing.steps.0')}</Text>{chosen.map(parcel => <Text key={parcel.id} style={s.body}>{parcel.uid || parcel.id} · {parcel.title}</Text>)}<Text style={s.heading}>{t('packing.steps.1')}</Text><Text selectable style={s.body}>{recipient?.name}</Text><CountryLabel selectable name={recipient?.country} label={[recipient?.address, recipient?.city, countryDisplayName(null, recipient?.country || '', language)].filter(Boolean).join(', ')} textStyle={s.body} size="small" />{carrier && <ServiceIdentity title={carrier.title} logoUrl={carrier.logoUrl} textStyle={s.heading} />}{carrier?.description && <Text style={s.small}>{carrier.description}</Text>}<Text style={s.body}>{t('packing.quote')}: {money(carrier?.price ?? null, carrier?.currency ?? extras.resource.data?.currency ?? null)}</Text>{local && <><ServiceIdentity title={local.title} logoUrl={local.logoUrl} textStyle={s.heading} /><Text style={s.body}>{local.optionsKey === 'localAddressId' ? [localAddress?.name, localAddress?.address, localAddress?.city].filter(Boolean).join(', ') : local.options.find(option => option.id === localOption)?.address}</Text><DeliveryPrice quote={{ price: local.optionsKey === 'localAddressId' ? localAddress?.price ?? null : local.options.find(option => option.id === localOption)?.price ?? null, currency: local.optionsKey === 'localAddressId' ? localAddress?.currency ?? local.currency : local.options.find(option => option.id === localOption)?.currency ?? local.currency }} /></>}<Text style={s.heading}>{t('packing.additionalServices')}</Text>{extras.resource.data?.services.filter(value => services.includes(value.key)).map(value => <Text key={value.key} style={s.body}>{value.title} · {money(value.price, extras.resource.data!.currency)}</Text>)}{!services.length && <Text style={s.small}>{t('packing.noServices')}</Text>}{insurance && <Text style={s.body}>{t('packing.insurance')}</Text>}{hold && <Text style={s.body}>{t('packing.hold')}</Text>}</View><Notice>{t('packing.estimateNote')}</Notice><SelectCard checkbox label={t('packing.confirm')} selected={confirmed} disabled={busy || uncertain} onPress={() => setConfirmation(confirmed ? null : reviewKey)} /></>}
    {error && <Notice error>{t(error)}</Notice>}{uncertain && <><Notice>{t('packing.checkUnknown')}</Notice><Button secondary onPress={() => bypass(() => router.replace('/shipments'))}>{t('packing.view')}</Button></>}
    {!uncertain && <Button disabled={busy || !currentReady || !live.canMutate} onPress={() => { setError(null); if (step === 5) void submit(); else { setConfirmation(null); setStep(value => value + 1); } }}>{t(busy ? 'packing.saving' : step === 5 ? 'packing.submit' : 'packing.continue')}</Button>}
    {step > 0 && <Button secondary disabled={busy} onPress={previous}>{t('packing.back')}</Button>}
    {error === 'packing.selectionChanged' && <Button secondary onPress={() => confirmDiscard(() => bypass(() => router.replace('/warehouse')))}>{t('packing.steps.0')}</Button>}
  </Screen>;
}
