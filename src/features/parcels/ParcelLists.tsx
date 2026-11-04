import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { ParcelStatusBadge } from '@/components/ParcelStatusBadge';
import { parcelStatusTone } from '@/domain/parcel-status';
import { legacyParcelStatusTone } from '@/domain/legacy-parcel-status';
import { CountryLabel } from '@/components/CountryFlag';
import { useState, type ComponentProps } from 'react';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDemo } from '@/state/context';
import { money, WAREHOUSES, type Incoming, type WarehouseItem } from '@/state/contracts';
import { Button, Choice, Notice, Screen, useUi } from '@/ui';

const countryOptions = ['Toate', ...WAREHOUSES.map(warehouse => warehouse.name)];
const normalize = (value: string) => value.trim().toLocaleLowerCase('ro').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const weight = (value: number) => `${value.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const warehouseName = (id: string) => WAREHOUSES.find(warehouse => warehouse.id === id)?.name ?? id;
const productCount = (item: Incoming | WarehouseItem) => item.items.reduce((total, line) => total + line.quantity, 0);

function DepotChip({ id }: { id: string }) {
  const styles = useThemeStyles(makeStyles);
  return <View accessibilityLabel={`Depozit ${warehouseName(id)}`} style={styles.depot}><CountryLabel code={id} label={id} textStyle={styles.depotText} /></View>;
}

function SearchFilters({ query, setQuery, country, setCountry, status, setStatus, statuses }: {
  query: string; setQuery: (query: string) => void; country: string; setCountry: (country: string) => void;
  status?: string; setStatus?: (status: string) => void; statuses?: string[];
}) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  const filterCount = Number(country !== 'Toate') + Number(Boolean(status && status !== 'Toate'));
  return <View style={styles.searchSection}>
    <View style={styles.searchRow}>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={19} color={colors.muted} />
        <TextInput accessibilityLabel="Caută după denumire, ID sau tracking" placeholder="Denumire, ID, tracking" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} returnKeyType="search" value={query} onChangeText={setQuery} style={styles.searchInput} />
        {query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Șterge căutarea" hitSlop={2} onPress={() => setQuery('')} style={styles.clearButton}><Ionicons name="close-circle" size={19} color={colors.muted} /></Pressable>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={filterCount ? `Filtre, ${filterCount} active` : 'Filtre'} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={({ pressed }) => [styles.filterButton, filterCount > 0 && styles.filterActive, pressed && s.pressed]}>
        <Ionicons name="options-outline" size={21} color={filterCount ? colors.accent : colors.text} />
        {filterCount > 0 && <Text style={styles.filterCount}>{filterCount}</Text>}
      </Pressable>
    </View>
    {expanded && <View style={styles.filters}>
      <Choice country label="Depozit" options={countryOptions} value={country} onChange={setCountry} />
      {statuses && setStatus && status && <Choice label="Stare" options={statuses} value={status} onChange={setStatus} />}
      {filterCount > 0 && <Pressable accessibilityRole="button" onPress={() => { setCountry('Toate'); setStatus?.('Toate'); }} style={styles.resetButton}><Text style={styles.resetText}>Șterge filtrele</Text></Pressable>}
    </View>}
  </View>;
}

function EmptyState({ title, description, filtered, reset, icon }: { title: string; description: string; filtered: boolean; reset: () => void; icon: ComponentProps<typeof Ionicons>['name'] }) {
  const { colors } = useUi();
  const styles = useThemeStyles(makeStyles);
  return <View style={styles.empty}>
    <View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={colors.muted} /></View>
    <Text style={styles.emptyTitle}>{filtered ? 'Niciun rezultat' : title}</Text>
    <Text style={styles.emptyDescription}>{filtered ? 'Încearcă altă denumire, alt tracking sau șterge filtrele.' : description}</Text>
    {filtered && <Button secondary onPress={reset}>Resetează căutarea</Button>}
  </View>;
}

export function WarehouseList({ mode, focus }: { mode: 'waiting' | 'stock'; focus?: string }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { state, dispatch } = useDemo();
  const [country, setCountry] = useState('Toate');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Toate');
  const [expanded, setExpanded] = useState<string | undefined>(focus);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const isWaiting = mode === 'waiting';
  const available = state.warehouse.filter(item => !item.shipmentId);
  const pending = state.incoming.filter(item => item.status === 'Așteptat');
  const matches = (warehouseId: string, text: string) => (country === 'Toate' || warehouseName(warehouseId) === country) && normalize(text).includes(normalize(query));
  const parcels = available.filter(item => matches(item.warehouseId, `${item.name} ${item.id} ${item.tracking}`) && (status === 'Toate' || (status === 'De declarat' ? !item.declared : item.declared)));
  const waiting = pending.filter(item => matches(item.warehouseId, `${item.id} ${item.tracking} ${item.items.map(line => line.name).join(' ')}`));
  const filtered = Boolean(query.trim() || country !== 'Toate' || (!isWaiting && status !== 'Toate'));
  const reset = () => { setCountry('Toate'); setStatus('Toate'); setQuery(''); };
  const receive = (id: string) => {
    const result = dispatch({ type: 'receiveIncoming', id });
    setError(!result.ok);
    setMessage(result.ok ? 'Coletul a fost recepționat în stoc.' : result.error || 'Recepția nu a reușit. Încearcă din nou.');
    if (result.ok && result.id) router.push({ pathname: '/warehouse/[id]', params: { id: result.id } });
  };
  const total = isWaiting ? pending.length : available.length;
  const visible = isWaiting ? waiting.length : parcels.length;
  const summary = isWaiting
    ? `${pending.length} colete · ${pending.reduce((sum, item) => sum + productCount(item), 0)} produse așteptate`
    : `${available.length} colete · ${weight(available.reduce((sum, item) => sum + item.weightKg, 0))} în depozit`;

  return <Screen title={isWaiting ? 'Așteptare' : 'În stoc'} subtitle={summary}>
    <Button onPress={() => router.push(isWaiting || !available.length ? '/incoming/new' : '/shipment/new')}>{isWaiting || !available.length ? '+ Adaugă colet' : 'Pregătește expedierea'}</Button>
    <SearchFilters query={query} setQuery={setQuery} country={country} setCountry={setCountry} {...(!isWaiting ? { status, setStatus, statuses: ['Toate', 'De declarat', 'Gata de expediere'] } : {})} />
    {message ? <Notice error={error}>{message}</Notice> : null}
    {filtered && <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{visible} din {total} colete</Text>}
    <View style={styles.list}>
      {isWaiting ? waiting.map(item => {
        const isExpanded = expanded === item.id;
        const recipient = state.addresses.find(address => address.id === item.addressId);
        const title = item.items.map(line => line.name).join(', ') || 'Colet așteptat';
        return <View key={item.id} style={[styles.card, isExpanded && styles.cardExpanded]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${warehouseName(item.warehouseId)}, ${productCount(item)} ${productCount(item) === 1 ? 'produs' : 'produse'}. Detalii colet.`} accessibilityState={{ expanded: isExpanded }} onPress={() => setExpanded(isExpanded ? undefined : item.id)} style={({ pressed }) => [styles.cardBody, pressed && s.pressed]}>
            <View style={styles.cardTop}><DepotChip id={item.warehouseId} /><Text style={styles.identifier}>{item.id}</Text><Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} /></View>
            <Text style={styles.cardTitle}>{title}</Text>
            <View style={styles.metadata}><Text style={styles.secondary}>{productCount(item)} {productCount(item) === 1 ? 'produs' : 'produse'}</Text><Text style={[styles.secondary, styles.tracking]} numberOfLines={1}>{item.tracking}</Text></View>
          </Pressable>
          {isExpanded && <View style={styles.details}>
            <View style={styles.detailLine}><Text style={styles.detailLabel}>Tracking</Text><Text selectable style={styles.detailValue}>{item.tracking}</Text></View>
            <View style={styles.detailLine}><Text style={styles.detailLabel}>Depozit</Text><CountryLabel code={item.warehouseId} label={`${warehouseName(item.warehouseId)} · ${WAREHOUSES.find(warehouse => warehouse.id === item.warehouseId)?.city ?? ''}`} textStyle={styles.detailValue} /></View>
            {recipient && <View style={styles.detailLine}><Text style={styles.detailLabel}>Destinatar</Text><Text style={styles.detailValue}>{recipient.firstName} {recipient.lastName} · {recipient.city}</Text></View>}
            <View style={styles.detailLine}><Text style={styles.detailLabel}>Documente</Text><Text style={styles.detailValue}>{item.documentNames.length} atașate</Text></View>
            <Button secondary onPress={() => receive(item.id)}>Simulează recepția</Button>
          </View>}
        </View>;
      }) : parcels.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${weight(item.weightKg)}, ${item.declared ? 'gata de expediere' : 'declarare necesară'}. Detalii colet.`} onPress={() => router.push({ pathname: '/warehouse/[id]', params: { id: item.id } })} style={({ pressed }) => [styles.card, styles.cardBody, pressed && s.pressed]}>
        <View style={styles.cardTop}><DepotChip id={item.warehouseId} /><Text style={styles.identifier}>{item.id}</Text><ParcelStatusBadge label={item.declared ? 'Gata' : 'De declarat'} tone={parcelStatusTone({ stage: 'warehouse', declared: item.declared })} /><Ionicons name="chevron-forward" size={17} color={colors.muted} /></View>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={styles.metadata}><Text style={styles.metric}>{weight(item.weightKg)}</Text><Text style={styles.secondary}>{productCount(item)} {productCount(item) === 1 ? 'produs' : 'produse'}</Text><Text style={[styles.secondary, styles.tracking]} numberOfLines={1}>{item.tracking}</Text></View>
      </Pressable>)}
      {!visible && <EmptyState filtered={filtered} reset={reset} icon={isWaiting ? 'time-outline' : 'cube-outline'} title={isWaiting ? 'Niciun colet în așteptare' : 'Depozitul este gol'} description={isWaiting ? 'Adaugă trackingul primit de la magazin. Coletul va apărea aici până ajunge la depozit.' : 'Coletele recepționate apar aici. Înregistrează un colet din Așteptare.'} />}
    </View>
  </Screen>;
}

export function ShipmentList({ received }: { received: boolean }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { state } = useDemo();
  const [status, setStatus] = useState('Toate');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('Toate');
  const all = state.shipments.filter(item => received ? item.status === 'Primit' : item.status !== 'Primit');
  const shipments = all.filter(item => (status === 'Toate' || item.status === status) && (country === 'Toate' || warehouseName(item.warehouseId) === country) && normalize(`${item.id} ${item.name} ${item.tracking}`).includes(normalize(query)));
  const filtered = Boolean(query.trim() || country !== 'Toate' || status !== 'Toate');
  const reset = () => { setStatus('Toate'); setCountry('Toate'); setQuery(''); };
  return <Screen title={received ? 'Primite' : 'Trimise'} subtitle={`${all.length} expedieri · ${weight(all.reduce((sum, item) => sum + item.weightKg, 0))}${received ? ' primite' : ' în proces de livrare'}`}>
    {!received && <Button onPress={() => router.push('/shipment/new')}>+ Expediere nouă</Button>}
    <SearchFilters query={query} setQuery={setQuery} country={country} setCountry={setCountry} {...(!received ? { status, setStatus, statuses: ['Toate', 'În pregătire', 'Trimise', 'Reținere vamală'] } : {})} />
    {filtered && <Text accessibilityLiveRegion="polite" style={styles.resultCount}>{shipments.length} din {all.length} expedieri</Text>}
    <View style={styles.list}>
      {shipments.map(item => {
        const recipient = state.addresses.find(address => address.id === item.addressId);
        const total = Object.values(item.costs).reduce((sum, cost) => sum + cost, 0);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.status}, ${weight(item.weightKg)}. Detalii expediere.`} onPress={() => router.push({ pathname: '/shipment/[id]', params: { id: item.id } })} style={({ pressed }) => [styles.card, styles.cardBody, pressed && s.pressed]}>
          <View style={styles.cardTop}><DepotChip id={item.warehouseId} /><Text style={styles.identifier}>{item.id}</Text><ParcelStatusBadge label={item.status} tone={legacyParcelStatusTone(item.status)} /><Ionicons name="chevron-forward" size={17} color={colors.muted} /></View>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <CountryLabel code={item.warehouseId} label={`${warehouseName(item.warehouseId)} → ${recipient?.city || 'Destinația ta'} · ${item.method}`} textStyle={styles.secondary} />
          <View style={styles.metadata}><Text style={styles.metric}>{weight(item.weightKg)}</Text><Text style={styles.secondary}>{item.warehouseItemIds.length} {item.warehouseItemIds.length === 1 ? 'colet' : 'colete'}</Text><Text style={styles.price}>{money(total)}</Text></View>
        </Pressable>;
      })}
      {!shipments.length && <EmptyState filtered={filtered} reset={reset} icon={received ? 'checkmark-circle-outline' : 'airplane-outline'} title={received ? 'Nicio expediere primită încă' : 'Nicio expediere activă'} description={received ? 'După confirmarea livrării, expedierile se mută automat aici. Documentele și istoricul rămân disponibile.' : 'Pregătește o expediere din coletele aflate în stoc. Etapele și trackingul vor apărea aici.'} />}
    </View>
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  searchSection: { gap: 10 }, searchRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, minHeight: 46 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, color: colors.text, fontSize: 14, paddingVertical: 10, paddingRight: 8 },
  clearButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  filterButton: { minWidth: 46, minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14 },
  filterActive: { borderColor: colors.accent }, filterCount: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  filters: { gap: 12, padding: 12, borderRadius: 14, backgroundColor: colors.soft }, resetButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, resetText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  resultCount: { color: colors.muted, fontSize: 12, lineHeight: 18 }, list: { gap: 8 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' }, cardExpanded: { borderColor: colors.border }, cardBody: { padding: 12, gap: 7, minHeight: 44 },
  cardTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 7, rowGap: 6 },
  depot: { backgroundColor: colors.infoSoft, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, minWidth: 29, alignItems: 'center' }, depotText: { color: colors.info, fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 0.4 },
  identifier: { flex: 1, minWidth: 65, color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '500' },
  cardTitle: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.15 },
  metadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4 },
  secondary: { color: colors.muted, fontSize: 12, lineHeight: 18 }, metric: { color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '600' }, tracking: { flex: 1, minWidth: 95 }, price: { marginLeft: 'auto', color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  details: { padding: 12, paddingTop: 10, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }, detailLine: { gap: 2 }, detailLabel: { color: colors.muted, fontSize: 11, lineHeight: 16 }, detailValue: { color: colors.text, fontSize: 13, lineHeight: 19 },
  empty: { paddingHorizontal: 20, paddingVertical: 28, gap: 12, alignItems: 'stretch', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  emptyIcon: { alignSelf: 'center', width: 52, height: 52, borderRadius: 17, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600', textAlign: 'center' }, emptyDescription: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
