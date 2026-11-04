import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LiveAccountRoute } from '@/features/live/routes';
import { useSupportChat } from '@/features/support/SupportChatProvider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CompactLink, SectionLabel, useCompactStyles } from '@/features/dashboard/components';
import { useDemo } from '@/state/context';
import { money } from '@/state/contracts';
import { Button, Notice, Screen, useUi } from '@/ui';

const profileLinks: { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; href: Href }[] = [
  { title: 'Date personale și setări', subtitle: 'Profil, limbă și notificări', icon: 'person-circle-outline', href: '/settings' },
  { title: 'Adresele mele', subtitle: 'Destinatari și adrese de livrare', icon: 'location-outline', href: '/address-book' },
  { title: 'Adresele depozitelor', subtitle: 'Adrese pentru magazinele din străinătate', icon: 'business-outline', href: '/warehouse-addresses' },
];

function DemoAccountScreen() {
  const compact = useCompactStyles();
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { state, dispatch, logout, persistenceError } = useDemo();
  const { canLogin } = useLiveAccount();
  const support = useSupportChat();
  const [confirm, setConfirm] = useState<'reset' | 'logout' | null>(null);
  const [message, setMessage] = useState('');
  const unpaid = state.invoices.filter(invoice => invoice.status === 'Neachitată');
  const unread = state.notifications.filter(notification => !notification.read).length;

  function resetDemo() {
    const result = dispatch({ type: 'reset' });
    setConfirm(null);
    setMessage(result.ok ? 'Datele inițiale au fost restabilite.' : result.error || 'Resetarea nu a reușit.');
  }

  return <Screen title="Contul meu">
    {canLogin && <Button onPress={logout}>Conectează contul BayShop</Button>}
    <View style={[s.card, styles.profile]}>
      <View style={styles.avatar}><Text style={styles.initials}>{state.profile.firstName.slice(0, 1)}{state.profile.lastName.slice(0, 1)}</Text></View>
      <View style={compact.grow}><Text style={s.heading}>{state.profile.firstName} {state.profile.lastName}</Text><Text style={s.small}>{state.profile.email}</Text><CountryLabel name={state.profile.country} label={`${state.profile.id} · ${state.profile.country}`} selectable textStyle={s.small} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Editează profilul" onPress={() => router.push('/settings')} style={({ pressed }) => [styles.edit, pressed && s.pressed]}><Ionicons name="create-outline" size={22} color={colors.accent} /></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Balanță ${money(state.balances.USD)}, ${unpaid.length} facturi neachitate`} onPress={() => router.push('/balance')} style={({ pressed }) => [s.card, styles.balance, pressed && s.pressed]}>
      <View style={compact.line}><View style={styles.balanceLabel}><Ionicons name="wallet-outline" size={20} color={colors.accent} /><Text style={compact.label}>Balanța mea</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></View>
      <View style={compact.line}><Text style={styles.amount}>{money(state.balances.USD)}</Text><Text style={s.small}>{unpaid.length === 0 ? 'Toate facturile achitate' : `${unpaid.length} ${unpaid.length === 1 ? 'factură neachitată' : 'facturi neachitate'}`}</Text></View>
    </Pressable>
    {persistenceError && <Notice error>{persistenceError}</Notice>}
    {message !== '' && <Notice>{message}</Notice>}
    <View style={compact.section}>
      <SectionLabel title="Profil și livrare" />
      <View style={[s.card, compact.group]}>{profileLinks.map((item, index) => <CompactLink key={item.title} icon={item.icon} title={item.title} detail={item.subtitle} onPress={() => router.push(item.href)} last={index === profileLinks.length - 1} />)}</View>
    </View>
    <View style={compact.section}>
      <SectionLabel title="Ajutor și noutăți" />
      <View style={[s.card, compact.group]}>
        <CompactLink icon="chatbubbles-outline" title="Asistență" detail="Conversațiile și solicitările tale" onPress={() => { void support.open(); }} />
        <CompactLink icon="notifications-outline" title="Notificări" detail={unread ? `${unread} ${unread === 1 ? 'notificare necitită' : 'notificări necitite'}` : 'Ești la zi'} onPress={() => router.push('/notifications')} last />
      </View>
    </View>
    <View style={compact.section}>
      <SectionLabel title="Sesiune și date" />
      <View style={[s.card, compact.group]}>
        {!confirm ? <>
          <CompactLink icon="refresh-outline" title="Resetează datele" onPress={() => { setMessage(''); setConfirm('reset'); }} />
          <CompactLink icon="log-out-outline" title="Ieși din cont" onPress={() => { setMessage(''); setConfirm('logout'); }} last />
        </> : <View accessibilityLiveRegion="polite" style={styles.confirmation}>
          <Text style={s.heading}>{confirm === 'reset' ? 'Restabilești datele inițiale?' : 'Ieși din cont?'}</Text>
          <Text style={s.body}>{confirm === 'reset' ? 'Comenzile, adresele, soldurile și solicitările salvate vor fi înlocuite cu datele inițiale.' : 'Datele salvate rămân pe dispozitiv. Te poți conecta din nou pentru a continua.'}</Text>
          <Button onPress={() => confirm === 'reset' ? resetDemo() : logout()}>{confirm === 'reset' ? 'Da, resetează datele' : 'Da, ieși din cont'}</Button>
          <Button secondary onPress={() => setConfirm(null)}>Renunță</Button>
        </View>}
      </View>
    </View>
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  edit: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  balance: { padding: 13, gap: 7 },
  balanceLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  amount: { color: colors.text, fontSize: 23, lineHeight: 29, fontWeight: '700', fontVariant: ['tabular-nums'] },
  confirmation: { gap: 12, paddingVertical: 14 },
});

export default function AccountScreen() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveAccountRoute /> : <DemoAccountScreen />;
}
