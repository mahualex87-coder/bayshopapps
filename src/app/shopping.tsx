import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LivePurchasesScreen as LiveShoppingScreen } from '@/features/commerce/MemberPurchases';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionLabel, useCompactStyles } from '@/features/dashboard/components';
import { useDemo } from '@/state/context';
import { money } from '@/state/contracts';
import { Button, Choice, Field, Screen, useUi } from '@/ui';

const filters = ['Toate', 'În procesare', 'Recepționate', 'Anulate'] as const;
const statuses = { Toate: '', 'În procesare': 'În procesare', Recepționate: 'Recepționată', Anulate: 'Anulat' };

function DemoShoppingScreen() {
  const compact = useCompactStyles();
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { state } = useDemo();
  const [filter, setFilter] = useState<string>('Toate');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = search.trim().toLocaleLowerCase('ro');
  const orders = state.orders.filter(order =>
    (!statuses[filter as keyof typeof statuses] || order.status === statuses[filter as keyof typeof statuses]) &&
    (!query || `${order.id} ${order.items.map(item => item.name).join(' ')}`.toLocaleLowerCase('ro').includes(query))
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);

  return <Screen title="Cumpărături" subtitle="Comenzi prin link și produse în coș.">
    <Button onPress={() => router.push('/order/new')}>＋ Comandă prin link</Button>
    <Pressable accessibilityRole="button" accessibilityLabel={`Deschide coșul, ${cartCount} produse`} onPress={() => router.push('/cart')} style={({ pressed }) => [s.card, styles.cart, pressed && s.pressed]}>
      <View style={compact.icon}><Ionicons name="cart-outline" size={21} color={colors.accent} /></View>
      <View style={compact.grow}><Text style={compact.label}>Coșul meu</Text><Text style={s.small}>{cartCount ? `${cartCount} ${cartCount === 1 ? 'produs de verificat' : 'produse de verificat'}` : 'Coșul este gol'}</Text></View>
      {cartCount > 0 && <Text style={styles.cartCount}>{cartCount}</Text>}
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
    <View style={compact.section}>
      <View style={compact.line}>
        <SectionLabel title="Comenzile mele" />
        <Pressable accessibilityRole="button" accessibilityLabel={filtersOpen ? 'Ascunde filtrele comenzilor' : 'Arată filtrele comenzilor'} accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)} style={({ pressed }) => [styles.filterButton, filter !== 'Toate' && styles.filterActive, pressed && s.pressed]}>
          <Ionicons name="options-outline" size={18} color={filter !== 'Toate' ? colors.accent : colors.muted} /><Text style={styles.filterLabel}>Filtre{filter !== 'Toate' ? ' · 1' : ''}</Text><Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={13} color={colors.muted} />
        </Pressable>
      </View>
      <Field label="Caută o comandă" placeholder="Număr comandă sau produs" value={search} onChangeText={setSearch} autoCapitalize="none" clearButtonMode="while-editing" />
      {filtersOpen && <Choice label="Starea comenzii" options={filters} value={filter} onChange={setFilter} />}
      <View style={compact.line}>
        <Text accessibilityLiveRegion="polite" style={s.small}>{orders.length} din {state.orders.length} comenzi{filter !== 'Toate' ? ` · ${filter}` : ''}</Text>
        {(query || filter !== 'Toate') && <Pressable accessibilityRole="button" onPress={() => { setSearch(''); setFilter('Toate'); }} style={({ pressed }) => [compact.textAction, pressed && s.pressed]}><Text style={compact.actionLabel}>Resetează</Text></Pressable>}
      </View>
    </View>
    {orders.length === 0 && <View style={[s.card, styles.empty]}>
      <Ionicons name={query || filter !== 'Toate' ? 'search-outline' : 'bag-outline'} size={28} color={colors.muted} />
      <Text style={s.heading}>{query || filter !== 'Toate' ? 'Nicio comandă găsită' : 'Prima comandă începe cu un link'}</Text>
      <Text style={s.small}>{query || filter !== 'Toate' ? 'Modifică termenul de căutare sau starea aleasă.' : 'Adaugă un produs din magazinul preferat folosind butonul de mai sus.'}</Text>
    </View>}
    {orders.length > 0 && <View style={[s.card, compact.group]}>{orders.map((order, index) => <Pressable key={order.id} accessibilityRole="button" accessibilityLabel={`Comanda ${order.id}, ${order.status}, ${money(order.total)}. Vezi detaliile`} onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })} style={({ pressed }) => [styles.order, index !== orders.length - 1 && compact.divider, pressed && s.pressed]}>
      <View style={compact.line}><Text style={s.small}>{order.id}</Text><Text style={[styles.status, order.status === 'Anulat' && styles.cancelled]}>{order.status}</Text></View>
      {order.items.slice(0, 2).map(item => <View key={item.id} style={styles.product}><Text style={compact.label}>{item.name}</Text><CountryLabel name={item.country} label={[`${item.quantity} buc.`, item.color, item.size, item.country].filter(Boolean).join(' · ')} textStyle={s.small} /></View>)}
      {order.items.length > 2 && <Text style={s.small}>+ încă {order.items.length - 2} produse</Text>}
      <View style={compact.line}>
        <Text style={s.small}>{new Date(order.createdAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
        <View style={styles.price}><Text style={compact.label}>{money(order.total)}</Text><Ionicons name="chevron-forward" size={17} color={colors.muted} /></View>
      </View>
    </Pressable>)}</View>}
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  cart: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  cartCount: { color: colors.accent, backgroundColor: colors.soft, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, fontSize: 13, fontWeight: '700' },
  filterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 12 },
  filterActive: { backgroundColor: colors.soft },
  filterLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  order: { minHeight: 44, paddingVertical: 13, gap: 8 },
  product: { gap: 1 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  status: { color: colors.accent, backgroundColor: colors.soft, fontSize: 12, lineHeight: 17, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, overflow: 'hidden' },
  cancelled: { color: colors.muted },
  empty: { padding: 18, gap: 8 },
});

export default function ShoppingScreen() {
  const live = useLiveAccount();
  return live.authenticated ? <LiveShoppingScreen /> : <DemoShoppingScreen />;
}
