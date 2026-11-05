import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveAccount } from '@/api/context';
import type { PurchaseChoice, PurchaseDetail, PurchaseLocation, PurchasePage, PurchaseSummary } from '@/api/member-purchases';
import { ParcelStatusBadge } from '@/components/ParcelStatusBadge';
import { parcelStatusTone } from '@/domain/parcel-status';
import { CountryLabel } from '@/components/CountryFlag';
import { useI18n } from '@/i18n/context';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { OptionPicker } from '@/features/accountops/shared';
import { EmptyState, ResourceStatus, displayMoney } from '@/features/live/shared';
import { RemoteDocumentButton } from '@/features/live/forms/ParcelContent';
import { RemotePageButton } from '@/features/content/RemotePageButton';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { GlassSurface } from '@/navigation/GlassSurface';
import { useVisualPreferences } from '@/navigation/accessibility';
import { OrderPaymentPanel } from './OrderPaymentPanel';
import { OrderCancellationCard } from '@/features/refunds/OrderCancellationCard';

function PurchaseRow({ label, value }: { label: string; value: string | null }) {
  const { t } = useI18n(); const { s } = useUi();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 12, rowGap: 3, paddingVertical: 4 }}>
    <Text style={[s.small, { flex: 1, minWidth: 110 }]}>{label}</Text>
    <Text selectable style={[s.body, { flex: 1, minWidth: 110, textAlign: 'right' }]}>{value || t('common.unavailable')}</Text>
  </View>;
}

function shopGroups(orders: PurchaseSummary[]) {
  const groups = new Map<string, { shops: PurchaseSummary['shops']; orders: PurchaseSummary[] }>();
  for (const order of orders) {
    const key = order.shops.length ? JSON.stringify([order.shops.map(shop => shop.id).sort(), order.currency]) : `order:${order.id}`;
    const group = groups.get(key);
    if (group) group.orders.push(order); else groups.set(key, { shops: order.shops, orders: [order] });
  }
  return [...groups.entries()];
}

function StatusPair({ order }: { order: Pick<PurchaseSummary, 'paymentStatusLabel' | 'processingStatusLabel'> }) {
  const { t } = useI18n(); const { s, colors } = useUi();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    <View style={{ flex: 1, minWidth: 110, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}><Ionicons accessible={false} name="card-outline" size={16} color={colors.muted} /><View style={{ flex: 1 }}><Text style={s.small}>{t('purchases.payment')}</Text><Text style={s.body}>{order.paymentStatusLabel || t('common.unavailable')}</Text></View></View>
    <View style={{ flex: 1, minWidth: 110, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}><Ionicons accessible={false} name="cube-outline" size={16} color={colors.muted} /><View style={{ flex: 1 }}><Text style={s.small}>{t('purchases.processing')}</Text><Text style={s.body}>{order.processingStatusLabel || t('common.unavailable')}</Text></View></View>
  </View>;
}

function ParcelLinks({ locations, compact = false }: { locations: PurchaseLocation[]; compact?: boolean }) {
  const { t } = useI18n(); const { s, colors } = useUi();
  if (locations.length === 0) return compact ? null : <Notice>{t('purchases.noParcel')}</Notice>;
  const open = (location: PurchaseLocation) => {
    if (location.route === 'warehouse') router.push({ pathname: '/warehouse/[id]', params: { id: location.id } });
    if (location.route === 'shipment') router.push({ pathname: '/shipment/[id]', params: { id: location.id, ...(location.received === null ? {} : { section: location.received ? 'received' : 'shipments' }) } });
  };
  return <View style={{ gap: compact ? 4 : 8 }}>
    {!compact && <Text accessibilityRole="header" style={s.heading}>{t('purchases.relatedParcels')}</Text>}
    {locations.map(location => {
      const label = `${t(location.kind === 'stock' ? 'purchases.stockParcel' : 'purchases.shipment')} ${location.code || location.id}`;
      const content = <><Ionicons accessible={false} name={location.kind === 'stock' ? 'cube-outline' : location.received ? 'checkmark-circle-outline' : 'paper-plane-outline'} size={20} color={colors.accent} /><View style={{ flex: 1 }}><Text selectable={!location.route} style={s.body}>{label}</Text>{!compact && <ParcelStatusBadge label={location.statusLabel || t('common.unavailable')} tone={location.status ? parcelStatusTone({ status: location.status }) : 'neutral'} />}{!location.route && !compact && <Text style={s.small}>{t('purchases.parcelReadOnly')}</Text>}</View>{location.route && <Ionicons accessible={false} name="chevron-forward" size={17} color={colors.muted} />}</>;
      const style = { minHeight: minTouchTarget, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 10, paddingVertical: compact ? 5 : 9, borderRadius: 12, gap: 9, backgroundColor: colors.soft };
      return location.route ? <Pressable key={`${location.kind}:${location.id}`} accessibilityRole="button" accessibilityLabel={t('purchases.openParcel', { code: location.code || location.id })} onPress={() => open(location)} style={({ pressed }) => [style, pressed && s.pressed]}>{content}</Pressable> : <View key={`${location.kind}:${location.id}`} style={style}>{content}</View>;
    })}
  </View>;
}

function PurchaseCard({ order }: { order: PurchaseSummary }) {
  const { t, formatDate, formatNumber } = useI18n(); const { colors, s } = useUi();
  const code = order.uid || order.id;
  return <GlassSurface style={{ padding: 13, gap: 10, borderRadius: 18 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('purchases.openOrder', { code })} onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })} style={({ pressed }) => [{ gap: 9, minHeight: minTouchTarget }, pressed && s.pressed]}>
      <View style={s.row}><Text style={s.heading}>{code}</Text><Text style={s.small}>{formatDate(order.createdAt)}</Text></View>
      {order.countryCode && <CountryLabel code={order.countryCode} label={order.countryTitle || order.countryCode} size="small" textStyle={s.small} />}
      {order.productTitles.slice(0, 2).map((title, index) => <Text key={index} numberOfLines={2} style={s.body}>{title}</Text>)}
      {order.itemCount > 2 && <Text style={s.small}>{t('purchases.moreProducts', { count: formatNumber(order.itemCount - 2) })}</Text>}
      <StatusPair order={order} />
      <View style={s.row}><Text style={s.small}>{t('purchases.total')}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={s.heading}>{order.totalPrice === null ? t('common.unavailable') : displayMoney(order.totalPrice, order.currency, formatNumber)}</Text><Ionicons accessible={false} name="chevron-forward" size={17} color={colors.muted} /></View></View>
    </Pressable>
    {order.locations.length > 0 && <Text style={s.small}>{t('purchases.parcelCount', { count: formatNumber(order.locations.length) })}</Text>}
  </GlassSurface>;
}

function Pagination({ data, disabled, onChange }: { data: PurchasePage; disabled: boolean; onChange: (page: number) => void }) {
  const { t, formatNumber } = useI18n(); const { s } = useUi();
  if (!data.total) return null;
  const from = (data.page - 1) * data.perPage + 1; const to = Math.min(data.total, from + data.items.length - 1);
  return <View style={{ gap: 8 }}>
    <Text accessibilityLiveRegion="polite" style={s.small}>{t('purchases.range', { from: formatNumber(from), to: formatNumber(to), total: formatNumber(data.total) })}</Text>
    {data.pageCount > 1 && <><View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Button secondary disabled={disabled || data.page <= 1} onPress={() => onChange(data.page - 1)}>{t('commerce.previousPage')}</Button></View><View style={{ flex: 1 }}><Button secondary disabled={disabled || data.page >= data.pageCount} onPress={() => onChange(data.page + 1)}>{t('commerce.nextPage')}</Button></View></View><Text style={s.small}>{t('commerce.page', { page: formatNumber(data.page), pages: formatNumber(data.pageCount) })}</Text></>}
  </View>;
}

function PurchasesList() {
  const { t, formatNumber } = useI18n(); const { s, colors } = useUi(); const { reduceMotion } = useVisualPreferences();
  const focused = useIsFocused();
  const hasFocused = useRef(false); const wasFocused = useRef(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [country, setCountry] = useState(''); const [payment, setPayment] = useState(''); const [processing, setProcessing] = useState(''); const [page, setPage] = useState(1); const [expanded, setExpanded] = useState(false);
  const [previousPage, setPreviousPage] = useState<PurchasePage | null>(null);
  useEffect(() => { if (search.trim() === query) return; const timeout = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350); return () => clearTimeout(timeout); }, [search, query]);
  const result = useOperationView({ kind: 'purchases.list', page, perPage: 20, ...(query ? { search: query } : {}), ...(country ? { countryCode: country } : {}), ...(payment ? { paymentStatus: payment } : {}), ...(processing ? { processingStatus: processing } : {}) });
  const refresh = result.refresh;
  // The hook already loads on mount/query changes; re-read only on a later
  // return from cart or details, preserving the current filters and page.
  useEffect(() => {
    if (focused && !wasFocused.current) {
      if (hasFocused.current) void refresh();
      hasFocused.current = true;
    }
    wasFocused.current = focused;
  }, [focused, refresh]);
  // Preserve the last confirmed filter catalog while the next page loads.
  if (result.resource.data && result.resource.data !== previousPage) setPreviousPage(result.resource.data);
  const filters = result.resource.data?.filters || previousPage?.filters;
  const activeCount = [country, payment, processing].filter(Boolean).length;
  const changePage = (value: number) => { setPage(value); scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion }); };
  const options = (values: PurchaseChoice[], country = false) => [{ id: '', title: t('purchases.all') }, ...values.map(value => ({ id: value.value, title: value.label, ...(country ? { countryCode: value.value } : {}) }))];
  return <Screen title={t('purchases.title')} subtitle={t('purchases.intro')} scrollRef={scrollRef}>
    <Button onPress={() => router.push('/order/link')}>{t('cartLink.title')}</Button>
    <Field label={t('purchases.search')} value={search} onChangeText={setSearch} placeholder={t('purchases.searchPlaceholder')} maxLength={150} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" />
    <Pressable accessibilityRole="button" accessibilityLabel={t('purchases.filters')} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [s.row, { minHeight: minTouchTarget, paddingHorizontal: 6 }, pressed && s.pressed]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons accessible={false} name="options-outline" color={colors.accent} size={20} /><Text style={s.heading}>{t('purchases.filters')}{activeCount ? ` · ${formatNumber(activeCount)}` : ''}</Text></View><Ionicons accessible={false} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} /></Pressable>
    {expanded && filters && <View style={s.card}>
      <OptionPicker country label={t('field.country')} value={country} options={options(filters.countries, true)} onChange={value => { setCountry(value); setPage(1); }} />
      <OptionPicker label={t('commerce.paymentStatus')} value={payment} options={options(filters.paymentStatuses)} onChange={value => { setPayment(value); setPage(1); }} />
      <OptionPicker label={t('commerce.processingStatus')} value={processing} options={options(filters.processingStatuses)} onChange={value => { setProcessing(value); setPage(1); }} />
      {(activeCount > 0 || search) && <Button secondary onPress={() => { setCountry(''); setPayment(''); setProcessing(''); setSearch(''); setQuery(''); setPage(1); }}>{t('purchases.clearFilters')}</Button>}
    </View>}
    <ResourceStatus resource={result.resource} onRefresh={() => { void result.refresh(); }} />
    {result.resource.data && <>
      {result.resource.data.items.length === 0 && !result.resource.error ? <EmptyState icon="bag-outline" title={t('purchases.emptyTitle')} text={t(query || activeCount ? 'purchases.emptyFiltered' : 'purchases.empty')} /> : <Text style={s.small}>{t('purchases.totalOrders', { count: formatNumber(result.resource.data.total) })}</Text>}
      {shopGroups(result.resource.data.items).map(([key, group]) => <View key={key} style={{ gap: 10 }}>
        {group.shops.length > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 }}><Ionicons accessible={false} name="storefront-outline" size={20} color={colors.accent} /><Text style={[s.heading, { flex: 1 }]}>{group.shops.map(shop => shop.title || t('cartLink.unknownShop')).join(' · ')}</Text></View>}
        {group.orders.map(order => <PurchaseCard key={order.id} order={order} />)}
      </View>)}
      <Pagination data={result.resource.data} disabled={result.resource.loading} onChange={changePage} />
    </>}
    <Button secondary onPress={() => router.push('/cart')}>{t('commerce.openCart')}</Button>
  </Screen>;
}
export function LivePurchasesScreen() {
  const live = useLiveAccount(); const { language } = useI18n();
  return <PurchasesList key={`${live.accountId || 'loading'}:${live.accountRevision}:${language}`} />;
}

function PurchaseDetails({ order }: { order: PurchaseDetail }) {
  const { t, formatDate, formatNumber } = useI18n(); const { s } = useUi();
  const labels = { goods: 'commerce.realPrice', localShipping: 'commerce.localShipping', commission: 'commerce.commission', total: 'commerce.totalPrice' };
  return <>
    <GlassSurface style={{ padding: 14, gap: 10, borderRadius: 18 }}>
      <Text selectable style={s.heading}>{order.uid || order.id}</Text>
      {order.shops.length > 0 && <Text style={s.body}>{order.shops.map(shop => shop.title || t('cartLink.unknownShop')).join(' · ')}</Text>}
      {order.countryCode && <CountryLabel code={order.countryCode} label={order.countryTitle || order.countryCode} textStyle={s.body} />}
      <StatusPair order={order} />
      <PurchaseRow label={t('commerce.createdAt')} value={formatDate(order.createdAt)} />
      {order.paidAt && <PurchaseRow label={t('commerce.paidAt')} value={formatDate(order.paidAt)} />}
      {order.cancelReason && <PurchaseRow label={t('commerce.cancelReason')} value={order.cancelReason} />}
      {order.amounts.map(amount => <PurchaseRow key={amount.key} label={t(labels[amount.key])} value={amount.amount === null ? null : displayMoney(amount.amount, order.currency, formatNumber)} />)}
      {order.invoiceUrl && <RemoteDocumentButton url={order.invoiceUrl} label={t('commerce.invoice')} />}
    </GlassSurface>
    <ParcelLinks locations={order.locations} />
    <Text accessibilityRole="header" style={s.heading}>{t('purchases.products')}</Text>
    {order.items.map(item => <View key={item.id} style={s.card}>
      <Text style={s.heading}>{item.title}</Text>{item.uid && <Text selectable style={s.small}>{item.uid}</Text>}
      {item.shopTitle && <Text style={s.small}>{item.shopTitle}</Text>}
      <PurchaseRow label={t('commerce.quantity')} value={item.quantity === null ? null : formatNumber(item.quantity)} />
      <PurchaseRow label={t('commerce.price')} value={item.price === null ? null : displayMoney(item.price, order.currency, formatNumber)} />
      <PurchaseRow label={t('commerce.shipping')} value={item.localShipping === null ? null : displayMoney(item.localShipping, order.currency, formatNumber)} />
      {item.color && <PurchaseRow label={t('purchases.color')} value={item.color} />}{item.size && <PurchaseRow label={t('purchases.size')} value={item.size} />}{item.variations && <PurchaseRow label={t('purchases.variations')} value={item.variations} />}
      {item.tracking && <PurchaseRow label={t('commerce.tracking')} value={item.tracking} />}
      <StatusPair order={item} />
      {item.url && <RemotePageButton url={item.url} label={t('commerce.url')} />}
    </View>)}
  </>;
}
export function LivePurchaseDetailScreen({ id }: { id: string }) {
  const { t } = useI18n(); const result = useOperationView({ kind: 'purchases.detail', id });
  const order = result.resource.data?.id === id ? result.resource.data : null;
  return <Screen title={t('commerce.order')}>
    <ResourceStatus resource={result.resource} onRefresh={() => { void result.refresh(); }} />
    {order?.paymentStatus === 'unpaid' && <OrderPaymentPanel orderId={id} />}
    {order && <PurchaseDetails order={order} />}
    {result.resource.data && !order && <Notice error>{t('commerce.notFound')}</Notice>}
    <OrderCancellationCard id={id} onConfirmed={() => { void result.refresh(); }} />
  </Screen>;
}
