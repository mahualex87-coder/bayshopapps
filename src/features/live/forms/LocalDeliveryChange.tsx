import { DeliveryPrice } from '@/components/DeliveryPrice';
import { deliveryPriceLabel } from '@/domain/delivery-price';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import { deliveryReviewKey, deliverySelection, supportedDeliveryMethod } from '@/api/local-delivery';
import { OptionPicker } from '@/features/accountops/shared';
import { PickupPointPicker } from '@/components/PickupPointPicker';
import { useI18n } from '@/i18n/context';
import { useConfirmation } from '@/navigation/Confirmation';
import { Button, Field, Notice, useUi } from '@/ui';
import { DetailRow, ResourceStatus, displayMoney } from '../shared';
import { useOperationView } from './useOperationView';

export function LocalDeliveryChange({ id, fresh, onRefresh, onDirty, onPending }: { id: string; fresh: boolean; onRefresh: () => void; onDirty: (dirty: boolean) => void; onPending: (pending: boolean) => void }) {
  const { s } = useUi();
  const live = useLiveAccount(); const { t, formatNumber } = useI18n(); const { confirmDiscard } = useConfirmation();
  const [openPickup, setOpenPickup] = useState(false); const [open, setOpen] = useState(false); const [methodId, setMethodId] = useState(''); const [optionId, setOptionId] = useState('');
  const [addressId, setAddressId] = useState(''); const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [searchDraft, setSearchDraft] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const [unknown, setUnknown] = useState(false); const [busy, setBusy] = useState(false); const submitting = useRef(false);
  const methods = useOperationView(open ? { kind: 'shipment.localDelivery.read', id } : null);
  const method = methods.resource.data?.find(item => item.id === methodId);
  const courier = method?.optionsKey === 'localAddressId';
  const addresses = useOperationView(open && courier ? { kind: 'shipment.localDelivery.addresses', id, localDeliveryId: methodId, page, search } : null);
  const address = addresses.resource.data?.items.find(item => item.id === addressId) || null;
  const option = method?.options.find(item => item.id === optionId);
  const blocked = busy || live.mutationPending || unknown;
  const dirty = !!methodId || busy;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => () => onPending(false), [onPending]);
  const selectionReady = !!method && supportedDeliveryMethod(method) && (courier ? !!address?.completed && !addresses.resource.loading && !addresses.resource.error : !!option);
  const price = courier ? address?.price : option?.price;
  const currency = courier ? address?.currency ?? method?.currency : option?.currency ?? method?.currency;
  const priceReady = price != null && !!currency && (!method?.additionalService || method.additionalService.price !== null && !!method.currency);
  const currentReview = method && selectionReady ? deliveryReviewKey(method, optionId, address) : null;
  const ready = fresh && selectionReady && priceReady && !methods.resource.loading && !methods.resource.error && !blocked;
  const reset = () => { setOpen(false); setOpenPickup(false); setMethodId(''); setOptionId(''); setAddressId(''); setConfirmation(null); setMessage(null); setUnknown(false); };
  const close = () => { if (dirty && !unknown) confirmDiscard(reset); else reset(); };
  const submit = async () => {
    if (!ready || !live.canMutate || !method || !confirmation || confirmation !== currentReview || submitting.current) return;
    submitting.current = true; setBusy(true); onPending(true); setMessage(null); setSaved(false);
    let dispatched = false;
    try {
      // Read the permission and exact prices again before the user's final save.
      const [detail, latestMethods] = await Promise.all([live.readView({ kind: 'shipment.detail', id }), live.readView({ kind: 'shipment.localDelivery.read', id })]);
      const latestMethod = latestMethods.find(item => item.id === method.id);
      const latestAddress = courier ? (await live.readView({ kind: 'shipment.localDelivery.addresses', id, localDeliveryId: method.id, page, search })).items.find(item => item.id === addressId) || null : null;
      if (detail.permissions.changeLocalDelivery !== true) { setMessage('deliveryChange.notAllowed'); setConfirmation(null); onRefresh(); return; }
      if (!latestMethod || !supportedDeliveryMethod(latestMethod) || courier && !latestAddress?.completed || !courier && !latestMethod.options.some(item => item.id === optionId) || deliveryReviewKey(latestMethod, optionId, latestAddress) !== confirmation) {
        setMessage('deliveryChange.changed'); setConfirmation(null); await methods.refresh(); if (courier) await addresses.refresh(); return;
      }
      dispatched = true;
      const result = await live.mutate({ kind: 'shipment.localDelivery.save', id, input: deliverySelection(latestMethod, optionId, latestAddress) });
      if (result.ok) { reset(); setSaved(true); onRefresh(); }
      else { setMessage(result.error || 'errors.saveFailed'); setUnknown(result.outcome === 'unknown'); }
    } catch (error) { setMessage(dispatched ? 'errors.mutationUnknown' : errorMessage(error)); setUnknown(dispatched); }
    finally { submitting.current = false; setBusy(false); onPending(false); }
  };
  if (!open) return <><Button secondary disabled={!fresh || live.mutationPending} onPress={() => { setSaved(false); setOpen(true); }}>{t('deliveryChange.open')}</Button>{saved && <Notice>{t('deliveryChange.saved')}</Notice>}</>;
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('deliveryChange.title')}</Text>
    <ResourceStatus resource={methods.resource} onRefresh={() => { if (!blocked) { setConfirmation(null); void methods.refresh(); } }} />
    {methods.resource.data?.length === 0 && <Notice>{t('deliveryChange.empty')}</Notice>}
    {!!methods.resource.data?.length && <OptionPicker service label={t('deliveryChange.method')} value={methodId} options={methods.resource.data.map(item => ({ id: item.id, title: `${item.title} · ${deliveryPriceLabel(item, formatNumber, true) ?? t('packing.priceUnavailable')}`, logoUrl: item.logoUrl }))} disabled={blocked} onChange={value => { setMethodId(value); setOpenPickup(methods.resource.data?.find(item => item.id === value)?.optionsKey !== 'localAddressId'); setOptionId(''); setAddressId(''); setPage(1); setSearch(''); setSearchDraft(''); setConfirmation(null); setMessage(null); }} />}
    {method && <>
      <DeliveryPrice quote={method} method />{method.description && <Text style={s.body}>{method.description}</Text>}
      {!supportedDeliveryMethod(method) ? <Notice error>{t('deliveryChange.unsupported')}</Notice> : courier ? <>
        <Field label={t('deliveryChange.search')} value={searchDraft} onChangeText={setSearchDraft} editable={!blocked} onSubmitEditing={() => { if (!blocked) { setPage(1); setSearch(searchDraft.trim()); setAddressId(''); setConfirmation(null); } }} />
        <Button secondary disabled={blocked} onPress={() => { setPage(1); setSearch(searchDraft.trim()); setAddressId(''); setConfirmation(null); }}>{t('deliveryChange.searchButton')}</Button>
        <ResourceStatus resource={addresses.resource} onRefresh={() => { if (!blocked) { setConfirmation(null); void addresses.refresh(); } }} />
        {addresses.resource.data?.notifications.map((notice, index) => <Notice key={index}>{notice}</Notice>)}
        {addresses.resource.data?.items.length === 0 && <Notice>{t('deliveryChange.noAddresses')}</Notice>}
        {!!addresses.resource.data?.items.length && <OptionPicker label={t('deliveryChange.address')} value={addressId} disabled={blocked || addresses.resource.loading || !!addresses.resource.error} options={addresses.resource.data.items.map(item => ({ id: item.id, title: `${[item.name, item.address, item.city].filter(Boolean).join(' · ') || item.id} · ${deliveryPriceLabel({ price: item.price, currency: item.currency ?? method.currency }, formatNumber) ?? t('packing.priceUnavailable')}` }))} onChange={value => { setAddressId(value); setConfirmation(null); }} />}
        {address && !address.completed && <Notice error>{t('packing.incompleteAddress')}</Notice>}
        {addresses.resource.data && addresses.resource.data.pages > 1 && <View style={s.row}><Button secondary disabled={blocked || addresses.resource.loading || page <= 1} onPress={() => { setPage(page - 1); setAddressId(''); setConfirmation(null); }}>{t('live.pagination.previous')}</Button><Button secondary disabled={blocked || addresses.resource.loading || page >= addresses.resource.data!.pages} onPress={() => { setPage(page + 1); setAddressId(''); setConfirmation(null); }}>{t('live.pagination.next')}</Button></View>}
      </> : <PickupPointPicker label={t('deliveryChange.pickup')} value={optionId} points={method.options.map(item => ({ ...item, priceLabel: deliveryPriceLabel({ price: item.price, currency: item.currency ?? method.currency }, formatNumber) ?? t('packing.priceUnavailable') }))} openRequested={openPickup} onOpenRequestHandled={() => setOpenPickup(false)} disabled={blocked || methods.resource.loading || !!methods.resource.error} onChange={value => { setOptionId(value); setConfirmation(null); }} />}
      {selectionReady && <><DetailRow label={t('deliveryChange.cost')} value={price == null ? null : displayMoney(price, currency || null, formatNumber)} />{!priceReady && <Notice error>{t('deliveryChange.costUnavailable')}</Notice>}</>}
      {method.additionalService && <View style={{ gap: 4 }}><Text style={s.small}>{t('deliveryChange.switchingFee')}</Text><DetailRow label={method.additionalService.title} value={method.additionalService.price === null ? null : displayMoney(method.additionalService.price, method.currency, formatNumber)} /></View>}
    </>}
    {confirmation && confirmation === currentReview ? <><Notice>{t('deliveryChange.confirm')}</Notice><Button disabled={!ready || !live.canMutate} onPress={() => { void submit(); }}>{t(busy ? 'parcelForm.saving' : 'deliveryChange.save')}</Button><Button secondary disabled={blocked} onPress={() => setConfirmation(null)}>{t('deliveryChange.changeChoice')}</Button></> : <Button disabled={!ready} onPress={() => setConfirmation(currentReview)}>{t('deliveryChange.review')}</Button>}
    {message && <Notice error>{t(message)}</Notice>}
    {unknown && <><Notice error>{t('parcelForm.unknownHint')}</Notice><Button secondary disabled={busy} onPress={onRefresh}>{t('deliveryChange.check')}</Button></>}
    <Button secondary disabled={busy || live.mutationPending} onPress={close}>{t('parcelForm.cancel')}</Button>
  </View>;
}
