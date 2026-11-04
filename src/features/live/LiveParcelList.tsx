import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LiveParcel, LiveParcelStage } from '@/api/contracts';
import type { ParcelPageState, ParcelQuery } from '@/api/parcel-pagination';
import { countryDisplayName } from '@/domain/presentation-labels';
import { deliveryTransportIcon } from '@/domain/delivery-identity';
import { CountryLabel } from '@/components/CountryFlag';
import { GlassSurface } from '@/navigation/GlassSurface';
import { OptionPicker } from '@/features/accountops/shared';
import { useI18n } from '@/i18n/context';
import { Button, Notice, minTouchTarget, useUi } from '@/ui';
import { DetailRow, EmptyState, ResourceStatus, displayMoney, type LiveResource } from './shared';
import { useThemeStyles } from '@/theme/context';
import type { ThemeColors } from '@/theme/palette';
import { ParcelStatus, parcelStatusLabel, knownParcelStatuses } from './ParcelStatus';
import { parcelCardIdentity, parcelSearchHintKey } from './parcel-list-presentation';
import { warehouseSelection, warehouseSelectionIssue } from './warehouse-selection';

const icons: Record<LiveParcelStage, keyof typeof Ionicons.glyphMap> = { waiting: 'time-outline', warehouse: 'cube-outline', sent: 'cube-outline', received: 'checkmark-done-outline' };
const knownFilterStatuses = new Set([...knownParcelStatuses, 'declared', 'undeclared', 'packing-denied']);

type ParcelSelection = { selected: boolean; disabled: boolean; reason: string | null; onToggle: () => void };
type ShipmentSelection = { stock: LiveResource<LiveParcel[]>; canCreate: boolean; onCreate: (ids: string[]) => void };

export const ParcelCard = memo(function ParcelCard({ parcel, onOpen, selection }: { parcel: LiveParcel; onOpen?: (parcel: LiveParcel) => void; selection?: ParcelSelection }) {
  const { colors, s } = useUi(); const styles = useThemeStyles(makeStyles);
  const { t, formatDate, formatNumber, language } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const { identifier, title: distinctTitle, tracking } = parcelCardIdentity(parcel);
  const trackingInHeading = !identifier && !distinctTitle;
  const showStatus = parcel.stage !== 'waiting';
  const status = showStatus ? parcelStatusLabel(parcel, t) : null;
  const depot = countryDisplayName(parcel.countryCode, parcel.countryTitle || parcel.countryCode || '', language);
  const parcelMetadata = [parcel.weightKg === null ? null : t('live.parcel.weight', { weight: formatNumber(parcel.weightKg, { maximumFractionDigits: 3 }) }), formatDate(parcel.createdAt ?? parcel.updatedAt ?? null)].filter(Boolean).join(' · ');
  const metadata = [depot, parcelMetadata].filter(Boolean).join(' · ');
  const amountLabel = t(`live.parcel.${parcel.amountKind || 'amount'}`);
  const price = parcel.amount === null ? null : `${amountLabel}: ${displayMoney(parcel.amount, parcel.currency, formatNumber)}`;
  const restriction = parcel.restrictions;
  const warnings = [
    ...(['waiting', 'warehouse'].includes(parcel.stage) && parcel.declared === false ? [{ key: 'declaration', text: t('live.parcel.declarationRequired'), comment: null }] : []),
    ...(restriction?.heldByProhibition ? [{ key: 'prohibited', text: t('live.parcel.prohibited'), comment: restriction.prohibitionComment }] : []),
    ...(restriction?.heldByDamage ? [{ key: 'damaged', text: t('live.parcel.damaged'), comment: restriction.damageComment }] : []),
    ...(restriction?.packingDenied ? [{ key: 'packingDenied', text: t('live.parcel.packingDenied'), comment: null }] : []),
  ];
  const trackingStatus = parcel.trackingStatus && ['UNKNOWN', 'TRACKED', 'DELIVERED'].includes(parcel.trackingStatus) ? t(`tracking.${parcel.trackingStatus}`) : parcel.trackingStatus;
  const accessibleSummary = [identifier, distinctTitle, tracking ? `${t('live.parcel.tracking')}: ${tracking}` : null, status, price, metadata, parcel.shipperTitle ? `${t('live.parcel.carrier')}: ${parcel.shipperTitle}` : null, ...warnings.map(warning => warning.text)].filter(Boolean).join(', ');
  return <View style={[s.card, styles.card, selection?.selected && styles.selectedCard]}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibleSummary} accessibilityHint={t(onOpen ? 'live.parcel.open' : 'live.parcel.toggle')} accessibilityState={onOpen ? undefined : { expanded }} onPress={() => onOpen ? onOpen(parcel) : setExpanded(value => !value)} style={({ pressed }) => [styles.cardPress, pressed && s.pressed]}>
      <View style={styles.cardHeading}>
        <View style={styles.parcelIcon}><Ionicons name={parcel.stage === 'sent' ? deliveryTransportIcon(parcel.shipperTitle) : icons[parcel.stage]} size={21} color={colors.accent} /></View>
        <View style={styles.cardCopy}>{trackingInHeading && tracking && <Text style={styles.identifier}>{t('parcelSections.tracking')}: {tracking}</Text>}{identifier && <Text style={styles.identifier}>{identifier}</Text>}{distinctTitle && <Text numberOfLines={2} style={s.body}>{distinctTitle}</Text>}</View>
        <Ionicons name={onOpen ? 'chevron-forward' : expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </View>
      {tracking && !trackingInHeading && <Text style={styles.tracking}>{t('parcelSections.tracking')}: {tracking}</Text>}
      {(showStatus || price) && <View style={styles.metadataRow}>{showStatus && <ParcelStatus parcel={parcel} />}{price && <Text style={styles.value}>{price}</Text>}</View>}
      {!!metadata && <View style={styles.countryMetadata}>{depot && <CountryLabel label={depot} code={parcel.countryCode} textStyle={s.small} size="small" />}{!!parcelMetadata && <Text style={s.small}>{depot ? `· ${parcelMetadata}` : parcelMetadata}</Text>}</View>}
      {parcel.shipperTitle && <Text style={s.small}>{t('live.parcel.carrier')}: {parcel.shipperTitle}</Text>}
    </Pressable>
    {warnings.length > 0 && <View style={styles.warnings}>{warnings.map(warning => <Notice key={warning.key} error>{warning.text}{warning.comment ? `\n${warning.comment}` : ''}</Notice>)}</View>}
    {expanded && <View style={styles.details}>
      <DetailRow label={t('live.parcel.tracking')} value={parcel.tracking} />
      {parcel.uid && <DetailRow label={t('live.parcel.code')} value={parcel.uid} />}
      {depot && <DetailRow label={t('live.parcel.depot')} value={depot} country countryCode={parcel.countryCode} />}
      {parcel.serviceName && <DetailRow label={t('live.parcel.service')} value={parcel.serviceName} />}
      {trackingStatus && <DetailRow label={t('live.parcel.trackingStatus')} value={trackingStatus} />}
      {showStatus && parcel.statusLabel && parcel.statusLabel !== status && <DetailRow label={t('live.parcel.statusDetails')} value={parcel.statusLabel} />}
      {showStatus && parcel.status === 'held-by-missing' && <DetailRow label={t('live.parcel.recordedStatus')} value={parcel.status} />}
      {parcel.declared !== null && <DetailRow label={t('live.parcel.declaration')} value={t(parcel.declared ? 'live.parcel.declared' : 'live.parcel.undeclared')} />}
    </View>}
    {selection && <View style={styles.selectionArea}>
      <Pressable accessibilityRole="checkbox" aria-checked={selection.selected} accessibilityState={{ checked: selection.selected, disabled: selection.disabled }} accessibilityLabel={t('warehouseSelection.label', { parcel: parcel.uid || parcel.tracking || parcel.id })} accessibilityHint={selection.reason ? t(selection.reason) : t('warehouseSelection.nextSteps')} disabled={selection.disabled} onPress={selection.onToggle} style={({ pressed }) => [styles.selectParcel, selection.disabled && styles.disabled, pressed && s.pressed]}>
        <Ionicons accessible={false} aria-hidden name={selection.selected ? 'checkbox' : 'square-outline'} size={23} color={selection.selected ? colors.accent : colors.muted} />
        <Text style={[s.small, styles.selectText]}>{t(selection.selected ? 'warehouseSelection.selected' : 'warehouseSelection.select')}</Text>
      </Pressable>
      {selection.reason && !(parcel.stage === 'warehouse' && parcel.declared === false && selection.reason === 'packing.declarationRequired') && <Text style={[s.small, styles.selectionReason]}>{t(selection.reason)}</Text>}
    </View>}
  </View>;
});

/** Rows receive primitives only, so a store emit that changes nothing visible
 * for a parcel does not re-render its card (FlatList re-renders every cell
 * whenever renderItem changes identity). */
const ParcelRow = memo(function ParcelRow({ parcel, onOpen, style, selectable, selected, disabled, reason, onToggle }: { parcel: LiveParcel; onOpen?: (parcel: LiveParcel) => void; style: StyleProp<ViewStyle>; selectable: boolean; selected: boolean; disabled: boolean; reason: string | null; onToggle: (parcel: LiveParcel) => void }) {
  const selection = useMemo<ParcelSelection | undefined>(() => selectable ? { selected, disabled, reason, onToggle: () => onToggle(parcel) } : undefined, [selectable, selected, disabled, reason, onToggle, parcel]);
  return <View style={style}><ParcelCard parcel={parcel} onOpen={onOpen} selection={selection} /></View>;
});

export function LiveParcelList({ stage, page, onRefresh, onQueryChange, onPageChange, onOpen, onCreate, shipment }: { stage: LiveParcelStage; page: ParcelPageState; onRefresh: () => void; onQueryChange: (query: Partial<ParcelQuery>) => void; onPageChange: (page: number) => void; onCreate?: () => void; onOpen?: (parcel: LiveParcel) => void; shipment?: ShipmentSelection }) {
  const { t, countt, formatNumber, language } = useI18n();
  const { colors, s } = useUi(); const styles = useThemeStyles(makeStyles);
  const [search, setSearch] = useState(page.query.search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selection = useMemo(() => warehouseSelection(shipment?.stock.data || [], selectedIds), [shipment?.stock.data, selectedIds]);
  const selectionBusy = !!shipment && (shipment.stock.loading || !!shipment.stock.error || !shipment.stock.data || !shipment.canCreate);
  const toggleParcel = useCallback((parcel: LiveParcel) => {
    if (selectionBusy) return;
    setSelectedIds(previous => {
      if (previous.includes(parcel.id)) return previous.filter(id => id !== parcel.id);
      const current = warehouseSelection(shipment?.stock.data || [], previous);
      return !warehouseSelectionIssue(parcel, current.storageId) ? [...previous, parcel.id] : previous;
    });
  }, [selectionBusy, shipment?.stock.data]);
  const searchInput = useRef<ComponentRef<typeof TextInput>>(null);
  const list = useRef<FlatList<LiveParcel>>(null);
  useEffect(() => {
    if (search === page.query.search) return;
    const timer = setTimeout(() => onQueryChange({ search }), 250);
    return () => clearTimeout(timer);
  }, [search, page.query.search, onQueryChange]);
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [page.query.page, page.query.countryCode, page.query.status]);
  useEffect(() => {
    if (stage === 'waiting' && page.query.status !== 'all') onQueryChange({ status: 'all' });
  }, [stage, page.query.status, onQueryChange]);
  const countryLabel = useCallback((code: string) => countryDisplayName(code, code, language), [language]);
  const countries = useMemo(() => [
    ...(stage !== 'received' ? [{ id: 'all', title: t('live.parcelFilter.allCountries') }] : []),
    ...page.countries.map(country => ({ id: country.code, countryCode: country.code, title: `${countryLabel(country.code)} · ${formatNumber(country.total)}` })),
  ], [stage, page.countries, countryLabel, formatNumber, t]);
  const statuses = useMemo(() => {
    const options = [{ id: 'all', title: t('live.parcelFilter.allStatuses') }, ...page.statuses.filter(status => status.value !== 'all').map(status => {
      const sample = page.items?.find(parcel => parcel.status === status.value);
      const label = knownFilterStatuses.has(status.value) ? t(`status.${status.value}`) : sample?.statusLabel || (status.value === 'held-by-missing' ? t('status.held') : status.value);
      return { id: status.value, title: `${label}${status.total === null ? '' : ` · ${formatNumber(status.total)}`}` };
    })];
    if (!options.some(option => option.id === page.query.status)) options.push({ id: page.query.status, title: knownFilterStatuses.has(page.query.status) ? t(`status.${page.query.status}`) : page.query.status });
    return options;
  }, [page.statuses, page.items, page.query.status, formatNumber, t]);
  const resource = { data: page.items, loading: page.loading, error: page.error, updatedAt: page.updatedAt };
  const searchHint = t(parcelSearchHintKey(stage, page.searchScope));
  const filtered = page.query.search.trim().length > 0 || (stage !== 'waiting' && page.query.status !== 'all');
  const changePage = (next: number) => { if (!page.loading) onPageChange(next); };
  const showPagination = page.items !== null && (page.pageCount === null ? page.hasNext || page.query.page > 1 : page.pageCount > 1);
  const pagination = <View style={styles.pagination}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('live.pagination.previous')} accessibilityState={{ disabled: page.loading || page.query.page <= 1 }} disabled={page.loading || page.query.page <= 1} onPress={() => changePage(page.query.page - 1)} style={({ pressed }) => [styles.pageControl, (page.loading || page.query.page <= 1) && styles.disabled, pressed && s.pressed]}><Ionicons name="chevron-back" size={19} color={colors.accent} /></Pressable>
    <Text accessibilityLiveRegion="polite" style={[s.small, styles.pageNumber]}>{page.pageCount === null ? t('live.pagination.page', { page: formatNumber(page.query.page) }) : t('live.pagination.pageOf', { page: formatNumber(page.query.page), pages: formatNumber(page.pageCount) })}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={t('live.pagination.next')} accessibilityState={{ disabled: page.loading || !page.hasNext }} disabled={page.loading || !page.hasNext} onPress={() => changePage(page.query.page + 1)} style={({ pressed }) => [styles.pageControl, (page.loading || !page.hasNext) && styles.disabled, pressed && s.pressed]}><Ionicons name="chevron-forward" size={19} color={colors.accent} /></Pressable>
  </View>;
  const header = <View style={[s.column, styles.listHeader]}>
    <View style={s.pageHeading}><Text accessibilityRole="header" style={s.title}>{t(`stage.${stage}`)}</Text><Text style={s.subtitle}>{t(`stage.${stage}.subtitle`)}</Text></View>
    {stage === 'waiting' && onCreate && <Button onPress={onCreate}>{t('parcelForm.newTitle')}</Button>}
    {shipment && <Text style={s.body}>{t('warehouseSelection.help')}</Text>}
    <ResourceStatus resource={resource} onRefresh={onRefresh} />
    <View style={styles.filters}>{countries.length > 0 && <View style={styles.filter}><OptionPicker country label={t('live.parcelFilter.country')} value={page.query.countryCode} options={countries} onChange={countryCode => onQueryChange({ countryCode })} /></View>}
    {stage !== 'waiting' && statuses.length > 1 && <View style={styles.filter}><OptionPicker label={t('live.parcelFilter.status')} value={page.query.status} options={statuses} onChange={status => onQueryChange({ status })} /></View>}</View>
    <View style={s.field}><Text style={s.label}>{t('live.parcel.search')}</Text><View style={styles.searchField}>
      <TextInput ref={searchInput} accessibilityLabel={t('live.parcel.search')} accessibilityHint={searchHint} placeholder={t('live.parcel.searchPlaceholder')} value={search} maxLength={200} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => onQueryChange({ search })} placeholderTextColor={colors.muted} style={[s.input, styles.searchInput]} />
      {!!search && <Pressable accessibilityRole="button" accessibilityLabel={t('live.parcel.clearSearch')} onPress={() => { setSearch(''); onQueryChange({ search: '' }); searchInput.current?.focus(); }} style={({ pressed }) => [styles.clearSearch, pressed && s.pressed]}><Ionicons name="close-circle" size={21} color={colors.muted} /></Pressable>}
    </View><Text style={s.small}>{searchHint}</Text></View>
    {page.items !== null && <View style={{ gap: 3 }}><Text accessibilityLiveRegion="polite" style={s.small}>{page.total === null ? countt('live.parcel.count', page.items.length) : countt('live.pagination.shownOf', page.items.length, { total: formatNumber(page.total) })}</Text><Text style={s.small}>{countt('live.pagination.loaded', page.loaded)}{page.overallTotal === null ? '' : ` · ${t('live.pagination.accountTotal', { total: formatNumber(page.overallTotal) })}`}</Text></View>}
    {showPagination && pagination}
  </View>;
  const selectable = !!shipment;
  const renderItem = useCallback(({ item }: { item: LiveParcel }) => {
    const selected = selection.ids.includes(item.id);
    const reason = selectable ? warehouseSelectionIssue(item, selection.storageId) : null;
    return <ParcelRow parcel={item} onOpen={onOpen} style={styles.listItem} selectable={selectable} selected={selected} disabled={selectionBusy || (!selected && !!reason)} reason={reason} onToggle={toggleParcel} />;
  }, [onOpen, styles.listItem, selection.ids, selection.storageId, selectable, selectionBusy, toggleParcel]);
  return <View style={s.flex}><FlatList ref={list} accessibilityLabel={t(`stage.${stage}`)} style={s.flex} contentContainerStyle={styles.listContent} data={page.items || []} extraData={language} keyExtractor={parcelKey} renderItem={renderItem} ListHeaderComponent={header} ItemSeparatorComponent={ItemSeparator} ListFooterComponent={showPagination ? <View style={[s.column, styles.listFooter]}>{pagination}</View> : undefined} ListEmptyComponent={page.items !== null && !page.loading && !page.error ? <View style={styles.listItem}><EmptyState icon={filtered ? 'search-outline' : icons[stage]} title={t(filtered ? 'live.noResults' : 'live.empty')} text={t(filtered ? 'live.searchHint' : `stage.${stage}.empty`)} /></View> : undefined} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={false} onRefresh={onRefresh} refreshing={page.loading && page.items !== null} />
    {shipment && <GlassSurface style={styles.selectionBar}>
      <View style={styles.selectionHeading}><Text accessibilityLiveRegion="polite" style={[s.body, { flex: 1 }]}>{countt('warehouseSelection.count', selection.ids.length)}</Text>{selection.ids.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={t('warehouseSelection.clear')} onPress={() => setSelectedIds([])} style={({ pressed }) => [styles.clearSelection, pressed && s.pressed]}><Ionicons accessible={false} aria-hidden name="close-circle-outline" size={22} color={colors.muted} /></Pressable>}</View>
      {selection.invalid && <Text accessibilityRole="alert" style={[s.small, { color: colors.error }]}>{t('packing.selectionChanged')}</Text>}
      <Button disabled={selectionBusy || !selection.ready} onPress={() => { if (!selectionBusy && selection.ready) shipment.onCreate(selection.ids); }}>{t('warehouseSelection.create')}</Button>
    </GlassSurface>}
  </View>;
}
function ItemSeparator() { return <View style={{ height: 12 }} />; }
const parcelKey = (parcel: LiveParcel) => `${parcel.stage}:${parcel.storageId || ''}:${parcel.id}`;

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  selectedCard: { borderColor: colors.accent }, selectionArea: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  selectParcel: { minHeight: minTouchTarget, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9 }, selectText: { flex: 1, color: colors.text }, selectionReason: { paddingHorizontal: 14, paddingBottom: 10 },
  selectionBar: { marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 12, paddingBottom: 10, paddingTop: 5, gap: 5, borderRadius: 20 }, selectionHeading: { flexDirection: 'row', alignItems: 'center', minHeight: minTouchTarget }, clearSelection: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  tracking: { color: colors.text, fontSize: 12, lineHeight: 18 },
  listContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 20 }, listHeader: { gap: 12, marginBottom: 12 }, listItem: { width: '100%', maxWidth: 596, alignSelf: 'center' }, listFooter: { paddingTop: 14 }, pagination: { flexDirection: 'row', alignItems: 'center', gap: 10 }, pageNumber: { flex: 1, textAlign: 'center' }, pageControl: { minHeight: minTouchTarget, minWidth: minTouchTarget, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.4 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, filter: { flex: 1, flexBasis: 145, minWidth: 145 },
  card: { padding: 0, gap: 0, overflow: 'hidden' }, cardPress: { padding: 14, gap: 10, minHeight: minTouchTarget }, cardHeading: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  parcelIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }, cardCopy: { flex: 1, gap: 3 },
  identifier: { color: colors.text, fontWeight: '700', fontSize: 14, lineHeight: 20 }, metadataRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  countryMetadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  value: { color: colors.text, fontSize: 13, fontWeight: '600' }, details: { paddingHorizontal: 14, paddingBottom: 6 }, warnings: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  searchField: { position: 'relative' }, searchInput: { paddingRight: 54 }, clearSearch: { position: 'absolute', right: 1, top: 0, bottom: 0, minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
