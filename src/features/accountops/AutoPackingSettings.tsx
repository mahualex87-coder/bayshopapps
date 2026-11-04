import { DeliveryPrice } from '@/components/DeliveryPrice';
import { deliveryPriceLabel } from '@/domain/delivery-price';
import { ConsolidationNotice } from '@/components/ConsolidationNotice';
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import { autoPackingDraft, autoPackingDraftKey, type AutoPackingReadCommand, type AutoPackingReadResult, type AutoPackingSaveInput, type AutoPackingSettings } from '@/api/account-auto-packing';
import type { LiveWarehouse } from '@/api/contracts';
import type { Resource } from '@/api/service';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { displayMoney, ResourceStatus } from '@/features/live/shared';
import { CountryLabel } from '@/components/CountryFlag';
import { PickupPointPicker } from '@/components/PickupPointPicker';
import { ServiceIdentity } from '@/components/ServiceIdentity';
import { countryDisplayName } from '@/domain/presentation-labels';
import { sortCountries } from '@/domain/option-order';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { usePageLoad } from '@/navigation/PageLoading';
import { useI18n } from '@/i18n/context';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { MutationFeedback, OptionPicker } from './shared';

function useAutoPackingView<Q extends AutoPackingReadCommand>(query: Q | null) {
  const { authenticated, readView, accountId, accountRevision } = useLiveAccount();
  const focused = useIsFocused();
  const { language } = useI18n();
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([query, language, authenticated, accountId, accountRevision]);
  const requestKey = JSON.stringify([key, revision]);
  const [stored, setStored] = useState<{ key: string; resource: Resource<AutoPackingReadResult<Q>> } | null>(null);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useFocusEffect(useCallback(() => {
    const [key] = JSON.parse(requestKey) as [string, number];
    const abort = new AbortController();
    const command = JSON.parse(key)[0] as Q | null;
    if (command && authenticated) {
      setStored(previous => ({ key, resource: { data: previous?.key === key ? previous.resource.data : null, loading: true, error: null, updatedAt: null } }));
      void readView(command, { signal: abort.signal }).then(data => { if (!abort.signal.aborted) setStored({ key, resource: { data: data as AutoPackingReadResult<Q>, loading: false, error: null, updatedAt: Date.now() } }); }).catch(error => { if (!abort.signal.aborted) setStored(previous => ({ key, resource: { data: previous?.key === key ? previous.resource.data : null, loading: false, error: errorMessage(error), updatedAt: previous?.key === key ? previous.resource.updatedAt : null } })); });
    }
    return () => abort.abort();
  }, [requestKey, authenticated, readView]));
  const resource: Resource<AutoPackingReadResult<Q>> = stored?.key === key ? stored.resource : { data: null, loading: !!query && authenticated, error: null, updatedAt: null };
  const pending = focused && query !== null && authenticated && (resource.loading || (resource.data === null && resource.error === null && resource.updatedAt === null));
  usePageLoad(pending, pending && resource.data === null);
  return { resource, reload };
}

function Select({ label, checked, disabled, onPress, service, logoUrl, children, radio = false }: PropsWithChildren<{ label: string; checked: boolean; disabled?: boolean; onPress(): void; service?: boolean; logoUrl?: string | null; radio?: boolean }>) {
  const { colors, s } = useUi();
  return <Pressable accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityLabel={label} aria-checked={checked} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress} style={[s.card, { minHeight: minTouchTarget }, checked && { borderColor: colors.accent }, disabled && { opacity: 0.55 }]}>
    <View style={[s.row, { flexWrap: 'nowrap' }]}><View style={{ flex: 1 }}>{service ? <ServiceIdentity title={label} logoUrl={logoUrl} /> : <Text style={s.heading}>{label}</Text>}</View><Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={23} color={checked ? colors.accent : colors.muted} /></View>{children}
  </Pressable>;
}

function AutoPackingForm({ storage, warehouses, initial, onWarehouseChange, canPreservePolicy }: { storage: LiveWarehouse; warehouses: LiveWarehouse[]; initial: AutoPackingSettings; onWarehouseChange(id: string): void; canPreservePolicy: boolean }) {
  const live = useLiveAccount(); const { t, language, formatNumber } = useI18n(); const { s } = useUi();
  const [draft, setDraft] = useState(() => autoPackingDraft(storage.id, initial));
  const [baseline, setBaseline] = useState(() => autoPackingDraft(storage.id, initial));
  const [savedSettings, setSavedSettings] = useState(initial);
  const [page, setPage] = useState(1), [searchText, setSearchText] = useState(''), [search, setSearch] = useState('');
  const [openPickup, setOpenPickup] = useState(false); const [localPage, setLocalPage] = useState(1), [confirmation, setConfirmation] = useState<string | null>(null);
  const [checking, setChecking] = useState(false), [saved, setSaved] = useState(false), [unknown, setUnknown] = useState(false), [error, setError] = useState<string | null>(null);
  const active = useRef(true); useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [handledInitial, setHandledInitial] = useState(initial);
  const dirty = autoPackingDraftKey(draft) !== autoPackingDraftKey(baseline);
  const busy = checking || live.mutationPending;
  if (handledInitial !== initial) {
    setHandledInitial(initial);
    // A focus refresh may update a pristine form, but never replace an unsaved draft.
    if (!dirty && !busy && !unknown) { const next = autoPackingDraft(storage.id, initial); setSavedSettings(initial); setDraft(next); setBaseline(next); setConfirmation(null); }
  }
  const { confirmDiscard } = useDraftGuard(dirty || busy, { pending: busy, fallbackHref: '/settings' });
  const update = (change: Partial<AutoPackingSaveInput>) => { setDraft(previous => ({ ...previous, ...change })); setConfirmation(null); setSaved(false); setError(null); };
  const addresses = useAutoPackingView(draft.enabled ? { kind: 'autoPacking.addresses', storageId: storage.id, page, search } : null);
  const address = addresses.resource.data?.items.find(item => item.id === draft.addressId) ?? null;
  const carriers = useAutoPackingView(draft.enabled && address?.completed ? { kind: 'autoPacking.shipping', storageId: storage.id, addressId: address.id } : null);
  const carrier = carriers.resource.data?.find(item => item.id === draft.shipperId) ?? null;
  const locals = useAutoPackingView(draft.enabled && address?.completed && carrier?.localDelivery ? { kind: 'autoPacking.localShipping', storageId: storage.id, addressId: address.id, shipperId: carrier.id } : null);
  const local = locals.resource.data?.find(item => item.id === draft.localDeliveryId) ?? null;
  const localAddresses = useAutoPackingView(draft.enabled && local?.optionsKey === 'localAddressId' ? { kind: 'autoPacking.addresses', storageId: storage.id, page: localPage, localDeliveryId: local.id } : null);
  const localAddress = localAddresses.resource.data?.items.find(item => item.id === draft.localAddonId) ?? null;
  const extras = useAutoPackingView(draft.enabled && address?.completed && carrier ? { kind: 'autoPacking.insurance', storageId: storage.id, addressId: address.id, shipperId: carrier.id } : null);
  const currency = storage.availableCurrencies?.find(item => item.id === storage.currencyId)?.title ?? null;
  const money = (amount: number | null, code: string | null = currency) => amount === null ? t('common.unavailable') : displayMoney(amount, code, formatNumber);
  const localReady = !!carrier && (!carrier.localDelivery || !!local && !locals.resource.loading && !locals.resource.error && (local.optionsKey === 'localAddressId' ? !!localAddress?.completed && !localAddresses.resource.loading && !localAddresses.resource.error : (local.optionsKey === 'terminal' || local.optionsKey.startsWith('localStorage-')) && local.options.some(option => option.id === draft.localAddonId)));
  const routeReady = !!address?.completed && !addresses.resource.loading && !addresses.resource.error && !!carrier && !carrier.selfSend && !carriers.resource.loading && !carriers.resource.error && localReady && !!extras.resource.data && !extras.resource.loading && !extras.resource.error && (!draft.insurance || carrier.insurance && extras.resource.data.available) && draft.serviceKeys.every(key => extras.resource.data!.services.some(service => service.key === key && service.price !== null));
  const inputReady = !draft.enabled || routeReady;
  const reviewKey = JSON.stringify([autoPackingDraftKey(draft), address, carrier, local, localAddress, extras.resource.data, savedSettings.serviceFee]);
  const confirmed = confirmation === reviewKey;
  const submitted = useRef<AutoPackingSaveInput | null>(null);
  const readBack = async () => {
    setChecking(true); setError(null);
    try { const value = await live.readView({ kind: 'autoPacking.settings', storageId: storage.id }); if (!active.current) return; const next = autoPackingDraft(storage.id, value); const matches = submitted.current === null || autoPackingDraftKey(next) === autoPackingDraftKey(submitted.current); setSavedSettings(value); setDraft(next); setBaseline(next); setConfirmation(null); setSaved(matches); setError(matches ? null : 'autoPacking.notApplied'); setUnknown(false); submitted.current = null; }
    catch (failure) { if (active.current) { setError(errorMessage(failure)); setUnknown(true); } }
    finally { if (active.current) setChecking(false); }
  };
  const save = async () => {
    if (!inputReady || !confirmed || busy || unknown || !canPreservePolicy || !live.canMutate) return;
    setChecking(true); setError(null);
    try {
      const currentSettings = await live.readView({ kind: 'autoPacking.settings', storageId: storage.id });
      if (!active.current) return;
      if (autoPackingDraftKey(autoPackingDraft(storage.id, currentSettings)) !== autoPackingDraftKey(baseline) || currentSettings.serviceFee !== savedSettings.serviceFee) {
        setConfirmation(null); setError('autoPacking.optionsChanged'); return;
      }
      if (draft.enabled && address && carrier && extras.resource.data) {
        // Re-read all selected server options. A quote or recipient change requires a new confirmation.
        const [freshAddresses, freshCarriers, freshExtras, freshLocals, freshLocalAddresses] = await Promise.all([
          live.readView({ kind: 'autoPacking.addresses', storageId: storage.id, page, search }),
          live.readView({ kind: 'autoPacking.shipping', storageId: storage.id, addressId: address.id }),
          live.readView({ kind: 'autoPacking.insurance', storageId: storage.id, addressId: address.id, shipperId: carrier.id }),
          carrier.localDelivery ? live.readView({ kind: 'autoPacking.localShipping', storageId: storage.id, addressId: address.id, shipperId: carrier.id }) : Promise.resolve(null),
          local?.optionsKey === 'localAddressId' ? live.readView({ kind: 'autoPacking.addresses', storageId: storage.id, page: localPage, localDeliveryId: local.id }) : Promise.resolve(null),
        ]);
        if (!active.current) return;
        if (JSON.stringify(freshAddresses.items.find(item => item.id === address.id)) !== JSON.stringify(address) || JSON.stringify(freshCarriers.find(item => item.id === carrier.id)) !== JSON.stringify(carrier) || JSON.stringify(freshExtras) !== JSON.stringify(extras.resource.data) || JSON.stringify(freshLocals?.find(item => item.id === local?.id) ?? null) !== JSON.stringify(local) || JSON.stringify(freshLocalAddresses?.items.find(item => item.id === localAddress?.id) ?? null) !== JSON.stringify(localAddress)) {
          setConfirmation(null); setError('autoPacking.optionsChanged'); addresses.reload(); carriers.reload(); locals.reload(); extras.reload(); localAddresses.reload(); return;
        }
      }
      submitted.current = draft;
      const result = await live.mutate({ kind: 'autoPacking.save', input: draft });
      if (!active.current) return;
      if (result.ok) await readBack();
      else { setError(result.error || 'errors.mutationRejected'); setUnknown(result.outcome === 'unknown'); if (result.outcome !== 'unknown') submitted.current = null; }
    } catch (failure) { if (active.current) setError(errorMessage(failure)); }
    finally { if (active.current) setChecking(false); }
  };
  const pageButtons = (value: { page: number; pages: number } | null, set: (page: number) => void) => value && value.pages > 1 && <View style={s.row}><Button secondary disabled={busy || value.page <= 1} onPress={() => set(value.page - 1)}>{t('packing.previousPage')}</Button><Text style={s.small}>{t('packing.page', { page: value.page, pages: value.pages })}</Text><Button secondary disabled={busy || value.page >= value.pages} onPress={() => set(value.page + 1)}>{t('packing.nextPage')}</Button></View>;
  const countryAddress = (item: { address: string | null; city: string | null; country: string | null }) => [item.address, item.city, item.country ? countryDisplayName(null, item.country, language) : null].filter(Boolean).join(', ');
  return <>
    <OptionPicker country label={t('autoPacking.warehouse')} value={storage.id} options={warehouses.map(item => ({ id: item.id, title: item.title, countryCode: item.code }))} disabled={busy} onChange={id => confirmDiscard(() => onWarehouseChange(id))} />
    {!canPreservePolicy && <Notice>{t('autoPacking.safeSaveUnavailable')}</Notice>}
    <Select label={t('autoPacking.enabled')} checked={draft.enabled} disabled={busy || unknown} onPress={() => update({ enabled: !draft.enabled })}><Text style={s.body}>{t('autoPacking.explanation')}</Text>{savedSettings.serviceFee !== null && <Text style={s.small}>{t('autoPacking.fee', { price: money(savedSettings.serviceFee) })}</Text>}</Select>
    <Notice>{t('autoPacking.declarationManual')}</Notice>
    {!draft.enabled && <View style={s.card}><Text style={s.heading}>{t('autoPacking.savedRoute')}</Text><Text style={s.body}>{savedSettings.addressName || t('autoPacking.noRecipient')}</Text>{savedSettings.shipperName && <ServiceIdentity title={savedSettings.shipperName} />}{savedSettings.localName && <Text style={s.body}>{savedSettings.localName}</Text>}<Text style={s.small}>{t('autoPacking.offHelp')}</Text></View>}
    {draft.enabled && <>
      <Text style={s.heading}>{t('autoPacking.recipient')}</Text><Field label={t('packing.searchAddress')} value={searchText} onChangeText={setSearchText} editable={!busy} /><Button secondary disabled={busy} onPress={() => { setPage(1); setSearch(searchText.trim()); }}>{t('packing.search')}</Button>
      <ResourceStatus resource={addresses.resource} onRefresh={addresses.reload} />
      {draft.addressId && !address && !addresses.resource.loading && <Notice>{t('autoPacking.findRecipient', { address: savedSettings.addressName || draft.addressId })}</Notice>}
      {addresses.resource.data?.items.map(item => <Select key={item.id} radio label={item.name || item.id} checked={draft.addressId === item.id} disabled={busy || !item.completed} onPress={() => { update({ addressId: item.id, shipperId: null, localDeliveryId: null, localAddonId: null, insurance: false, serviceKeys: [] }); setLocalPage(1); }}><CountryLabel name={item.country} label={countryAddress(item)} textStyle={s.body} />{item.phone && <Text selectable style={s.small}>{item.phone}</Text>}{!item.completed && <Text style={s.small}>{t('packing.incompleteAddress')}</Text>}</Select>)}
      {pageButtons(addresses.resource.data, setPage)}<Button secondary disabled={busy} onPress={() => router.push('/address-book')}>{t('packing.addressBook')}</Button>
      {address?.completed && <><Text style={s.heading}>{t('autoPacking.carrier')}</Text><ResourceStatus resource={carriers.resource} onRefresh={carriers.reload} />{carriers.resource.data?.map(item => <Select key={item.id} radio service logoUrl={item.logoUrl} label={item.title} checked={draft.shipperId === item.id} disabled={busy || item.selfSend} onPress={() => update({ shipperId: item.id, localDeliveryId: null, localAddonId: null, insurance: false, serviceKeys: [] })}>{item.time && <Text style={s.small}>{item.time}</Text>}{item.description && <Text style={s.body}>{item.description}</Text>}<ConsolidationNotice carrierAllowsConsolidation={item.consolidation} />{item.selfSend && <Text style={s.small}>{t('packing.selfSend')}</Text>}</Select>)}{carriers.resource.data?.length === 0 && <Notice>{t('autoPacking.noCarriers')}</Notice>}</>}
      {carrier?.localDelivery && <><Text style={s.heading}>{t('autoPacking.localDelivery')}</Text><ResourceStatus resource={locals.resource} onRefresh={locals.reload} />{locals.resource.data?.map(item => { const supported = item.optionsKey === 'terminal' || item.optionsKey === 'localAddressId' || item.optionsKey.startsWith('localStorage-'); return <Select key={item.id} radio service logoUrl={item.logoUrl} label={item.title} checked={draft.localDeliveryId === item.id} disabled={busy || !supported} onPress={() => { update({ localDeliveryId: item.id, localAddonId: null }); setLocalPage(1); setOpenPickup(item.optionsKey !== 'localAddressId'); }}><DeliveryPrice quote={item} method />{item.description && <Text style={s.small}>{item.description}</Text>}{!supported && <Text style={s.small}>{t('packing.unsupportedLocal')}</Text>}</Select>; })}
        {local?.optionsKey === 'localAddressId' ? <><ResourceStatus resource={localAddresses.resource} onRefresh={localAddresses.reload} />{localAddresses.resource.data?.items.map(item => <Select key={item.id} radio label={item.name || item.id} checked={draft.localAddonId === item.id} disabled={busy || !item.completed} onPress={() => update({ localAddonId: item.id })}><CountryLabel name={item.country} label={countryAddress(item)} textStyle={s.body} /><DeliveryPrice quote={{ price: item.price, currency: item.currency ?? local.currency }} /></Select>)}{pageButtons(localAddresses.resource.data, setLocalPage)}</> : local && <PickupPointPicker label={local.title} value={draft.localAddonId || ''} disabled={busy || locals.resource.loading || !!locals.resource.error} points={local.options.map(item => ({ ...item, priceLabel: deliveryPriceLabel({ price: item.price, currency: item.currency ?? local.currency }, formatNumber) ?? t('packing.priceUnavailable') }))} openRequested={openPickup} onOpenRequestHandled={() => setOpenPickup(false)} onChange={id => update({ localAddonId: id })} />}
      </>}
      {carrier && <><Text style={s.heading}>{t('autoPacking.services')}</Text><ResourceStatus resource={extras.resource} onRefresh={extras.reload} />{extras.resource.data?.notifications.map((notice, index) => <Notice key={index}>{notice}</Notice>)}
        {extras.resource.data && <><Select label={t('packing.insurance')} checked={draft.insurance} disabled={busy || !draft.insurance && (!carrier.insurance || !extras.resource.data.available)} onPress={() => update({ insurance: !draft.insurance })}><Text style={s.small}>{!extras.resource.data.available || !carrier.insurance ? t('packing.insuranceUnavailable') : extras.resource.data.free ? t('packing.freeInsurance') : t('packing.insuranceRate', { percent: extras.resource.data.percent === null ? t('common.unavailable') : formatNumber(extras.resource.data.percent), minimum: money(extras.resource.data.minimum, extras.resource.data.currency), maximum: money(extras.resource.data.maximum, extras.resource.data.currency) })}</Text>{extras.resource.data.freeLimit !== null && <Text style={s.small}>{t('autoPacking.insuranceLimit', { price: money(extras.resource.data.freeLimit, extras.resource.data.currency) })}</Text>}</Select>
          {extras.resource.data.services.map(item => <Select key={item.key} label={item.title} checked={draft.serviceKeys.includes(item.key)} disabled={busy || item.price === null && !draft.serviceKeys.includes(item.key)} onPress={() => update({ serviceKeys: draft.serviceKeys.includes(item.key) ? draft.serviceKeys.filter(key => key !== item.key) : [...draft.serviceKeys, item.key] })}><Text style={s.body}>{money(item.price, extras.resource.data!.currency)}</Text>{item.oldPrice !== null && item.price !== null && item.oldPrice > item.price && <Text style={[s.small, { textDecorationLine: 'line-through' }]}>{money(item.oldPrice, extras.resource.data!.currency)}</Text>}{item.description && <Text style={s.small}>{item.description}</Text>}</Select>)}
          {draft.serviceKeys.filter(key => !extras.resource.data!.services.some(service => service.key === key)).map(key => <Select key={key} label={savedSettings.services.find(service => service.key === key)?.title || key} checked disabled={busy} onPress={() => update({ serviceKeys: draft.serviceKeys.filter(value => value !== key) })}><Text style={s.small}>{t('autoPacking.unavailableService')}</Text></Select>)}
        </>}
      </>}
    </>}
    {dirty && <><ConsolidationNotice carrierAllowsConsolidation={carrier?.consolidation} point={local?.options.find(option => option.id === draft.localAddonId)} /><Notice>{t(draft.enabled ? 'autoPacking.enableWarning' : 'autoPacking.disableWarning')}</Notice><Select label={t('autoPacking.confirm')} checked={confirmed} disabled={busy || unknown} onPress={() => setConfirmation(value => value === reviewKey ? null : reviewKey)} /></>}
    {error === 'autoPacking.optionsChanged' && <Button secondary disabled={busy} onPress={() => confirmDiscard(() => { void readBack(); })}>{t('autoPacking.reloadSaved')}</Button>}
    <MutationFeedback error={error} saved={saved} unknown={unknown} onCheck={() => { void readBack(); }} />
    <Button disabled={!canPreservePolicy || !live.canMutate || busy || unknown || !dirty || !confirmed || !inputReady} onPress={() => { void save(); }}>{t(busy ? 'accountOps.saving' : 'accountOps.save')}</Button>
  </>;
}

export function AutoPackingSettingsScreen() {
  const live = useLiveAccount(); const { t } = useI18n();
  const warehouses = useOperationView({ kind: 'warehouses.read' }); const capabilities = useOperationView({ kind: 'settings.read' });
  const [storageId, setStorageId] = useState('');
  const available = sortCountries(warehouses.resource.data ?? [], item => ({ code: item.code, name: item.title, id: item.id }));
  const storage = available.find(item => item.id === storageId) ?? (storageId ? null : available[0]);
  const settings = useAutoPackingView(storage ? { kind: 'autoPacking.settings', storageId: storage.id } : null);
  return <Screen title={t('autoPacking.title')} subtitle={t('autoPacking.subtitle')}>
    <ResourceStatus resource={warehouses.resource} onRefresh={() => { void warehouses.refresh(); }} />
    {capabilities.resource.error && <ResourceStatus resource={capabilities.resource} onRefresh={() => { void capabilities.refresh(); }} />}
    {(!settings.resource.data || !!settings.resource.error) && <ResourceStatus resource={settings.resource} onRefresh={settings.reload} />}
    {storage && settings.resource.data ? <AutoPackingForm key={`${live.accountId}:${storage.id}`} storage={storage} warehouses={available} initial={settings.resource.data} onWarehouseChange={setStorageId} canPreservePolicy={capabilities.resource.data?.capabilities.autoPackingPolicyPreserved === true && !capabilities.resource.loading && !capabilities.resource.error} /> : available.length > 0 && <OptionPicker country label={t('autoPacking.warehouse')} value={storage?.id || ''} options={available.map(item => ({ id: item.id, title: item.title, countryCode: item.code }))} onChange={setStorageId} />}
    {!warehouses.resource.loading && !warehouses.resource.error && available.length === 0 && <Notice>{t('autoPacking.noWarehouses')}</Notice>}
  </Screen>;
}
