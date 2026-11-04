import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LiveOverviewRoute } from '@/features/live/routes';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CompactLink, SectionLabel, useCompactStyles } from '@/features/dashboard/components';
import { useDemo } from '@/state/context';
import { money } from '@/state/contracts';
import { Notice, Screen, useUi } from '@/ui';

function DemoHome() {
  const compact = useCompactStyles();
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { state, persistenceError } = useDemo();
  const active = state.shipments.filter(parcel => parcel.status !== 'Primit');
  const missing = state.warehouse.filter(parcel => !parcel.declared && !parcel.shipmentId);
  const unpaid = state.invoices.filter(invoice => invoice.status === 'Neachitată');
  const unread = state.notifications.filter(notification => !notification.read).length;
  const recent = [...state.shipments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const stages: { label: string; count: number; icon: keyof typeof Ionicons.glyphMap; href: Href }[] = [
    { label: 'Așteptare', count: state.incoming.filter(parcel => parcel.status === 'Așteptat').length, icon: 'time-outline', href: '/waiting' },
    { label: 'În stoc', count: state.warehouse.filter(parcel => !parcel.shipmentId).length, icon: 'cube-outline', href: '/warehouse' },
    { label: 'Trimise', count: active.length, icon: 'airplane-outline', href: '/shipments' },
    { label: 'Primite', count: state.shipments.filter(parcel => parcel.status === 'Primit').length, icon: 'checkmark-circle-outline', href: '/received' },
  ];

  return <Screen title={`Salut, ${state.profile.firstName}`} subtitle="Coletele și acțiunile tale, dintr-o privire.">
    {persistenceError && <Notice error>{persistenceError}</Notice>}
    <View style={styles.stages}>
      {stages.map(stage => <Pressable key={stage.label} accessibilityRole="button" accessibilityLabel={`${stage.label}, ${stage.count} colete`} onPress={() => router.push(stage.href)} style={({ pressed }) => [s.card, styles.stage, pressed && s.pressed]}>
        <View style={compact.line}><Ionicons name={stage.icon} size={20} color={colors.accent} /><Text style={styles.count}>{stage.count}</Text></View>
        <View style={compact.line}><Text style={compact.label}>{stage.label}</Text><Ionicons name="chevron-forward" size={14} color={colors.muted} /></View>
      </Pressable>)}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Balanță ${money(state.balances.USD)}. Deschide contul și plățile`} onPress={() => router.push('/balance')} style={({ pressed }) => [s.card, styles.balance, pressed && s.pressed]}>
      <View style={compact.icon}><Ionicons name="wallet-outline" size={22} color={colors.accent} /></View>
      <View style={compact.grow}><Text style={s.small}>Balanță disponibilă</Text><Text style={s.heading}>{money(state.balances.USD)}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
    {(missing.length > 0 || unpaid.length > 0) && <View style={compact.section}>
      <SectionLabel title="De rezolvat" />
      <View style={[s.card, compact.group]}>
        {missing.length > 0 && <CompactLink icon="document-text-outline" title={missing.length === 1 ? 'O declarație de completat' : `${missing.length} declarații de completat`} detail="Completează datele pentru expediere" onPress={() => router.push({ pathname: '/warehouse/[id]', params: { id: missing[0].id } })} last={unpaid.length === 0} />}
        {unpaid.length > 0 && <CompactLink icon="receipt-outline" title={unpaid.length === 1 ? 'O factură neachitată' : `${unpaid.length} facturi neachitate`} detail="Verifică și achită din balanță" onPress={() => router.push('/balance')} last />}
      </View>
    </View>}
    <View style={compact.section}>
      <SectionLabel title="Acțiuni rapide" />
      <View style={[s.card, compact.group]}>
        <CompactLink icon="add-circle-outline" title="Înregistrează un colet" detail="Ai cumpărat singur din magazin" onPress={() => router.push('/incoming/new')} />
        <CompactLink icon="link-outline" title="Comandă prin link" detail="Cumpărăm produsul pentru tine" onPress={() => router.push('/order/new')} last />
      </View>
      <View style={styles.utilityRow}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/warehouse-addresses')} style={({ pressed }) => [styles.utility, pressed && s.pressed]}><Ionicons name="business-outline" size={18} color={colors.muted} /><Text style={styles.utilityText}>Adrese depozite</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/calculator')} style={({ pressed }) => [styles.utility, pressed && s.pressed]}><Ionicons name="calculator-outline" size={18} color={colors.muted} /><Text style={styles.utilityText}>Calculator</Text></Pressable>
      </View>
    </View>
    <View style={compact.section}>
      <SectionLabel title="Expedieri recente" action="Vezi active" onPress={() => router.push('/shipments')} />
      {recent.length > 0 ? <View style={[s.card, compact.group]}>{recent.map((parcel, index) => <CompactLink key={parcel.id} icon={parcel.status === 'Primit' ? 'checkmark-circle-outline' : 'airplane-outline'} title={parcel.name} detail={<CountryLabel code={parcel.warehouseId} label={`${parcel.id} · ${parcel.warehouseId} → ${state.addresses.find(address => address.id === parcel.addressId)?.country ?? state.profile.country}`} textStyle={s.small} />} badge={parcel.status} onPress={() => router.push({ pathname: '/shipment/[id]', params: { id: parcel.id } })} last={index === recent.length - 1} />)}</View> : <Text style={s.small}>Expedierile tale vor apărea aici după ce trimiți produsele din stoc.</Text>}
    </View>
    {unread > 0 && <CompactLink icon="notifications-outline" title={`${unread} ${unread === 1 ? 'notificare necitită' : 'notificări necitite'}`} onPress={() => router.push('/notifications')} last />}
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  stages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stage: { flexBasis: '46%', flexGrow: 1, padding: 12, gap: 5, minHeight: 80 },
  count: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '700', fontVariant: ['tabular-nums'] },
  balance: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  utilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  utility: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flexBasis: '46%', flexGrow: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 12 },
  utilityText: { color: colors.muted, fontSize: 13, fontWeight: '600', flexShrink: 1 },
});

export default function Home() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveOverviewRoute /> : <DemoHome />;
}
