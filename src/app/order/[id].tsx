import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LivePurchaseDetailScreen as LiveOrderDetailScreen } from '@/features/commerce/MemberPurchases';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useDemo } from '@/state/context';
import { money } from '@/state/contracts';
import { cartTotal } from '@/state/demo';
import { Button, Notice, Screen, useUi } from '@/ui';

function DemoOrderDetailScreen() {
  const { colors, s } = useUi();
  const params = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useDemo();
  const order = state.orders.find(item => item.id === params.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  if (!order) return <Screen title="Comandă indisponibilă"><Notice>Comanda nu mai este disponibilă în datele curente.</Notice><Button onPress={() => router.replace('/shopping')}>Vezi toate comenzile</Button></Screen>;
  const products = order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const shipping = order.items.reduce((sum, item) => sum + item.localShipping, 0);
  const inspection = order.items.reduce((sum, item) => sum + (item.inspection ? 3 : 0), 0);

  function cancel() {
    const result = dispatch({ type: 'cancelOrder', id: params.id });
    setError(!result.ok); setConfirmCancel(false);
    setMessage(result.ok ? 'Comanda a fost anulată local. Suma a revenit în soldul virtual USD.' : result.error || 'Comanda nu poate fi anulată.');
  }

  return <Screen title="Detalii comandă" subtitle={order.id}>
    
    <View style={s.hero}>
      <View style={s.row}><Text style={s.eyebrow}>COMANDĂ</Text><Ionicons name={order.status === 'Anulat' ? 'close-circle-outline' : 'bag-check-outline'} size={28} color="white" /></View>
      <Text style={s.heroTitle}>{order.status}</Text>
      <View style={s.row}><Text style={{ color: colors.heroMuted }}>{new Date(order.createdAt).toLocaleDateString('ro-RO')}</Text><Text style={{ color: 'white', fontSize: 20, fontWeight: '600' }}>{money(order.total)}</Text></View>
    </View>
    {message !== '' && <Notice error={error}>{message}</Notice>}
    {order.status === 'În procesare' && <Notice>Comanda este salvată local; achiziția de la magazin nu a fost efectuată.</Notice>}
    {order.status === 'Anulat' && <Notice>Comandă închisă. Suma a fost restituită în soldul virtual.</Notice>}
    <Text style={s.heading}>Produsele comenzii</Text>
    {order.items.map(item => <View key={item.id} style={s.card}>
      <View style={s.row}><CountryLabel name={item.country} label={item.country} textStyle={s.status} /><Text style={s.small}>{item.quantity} buc.</Text></View>
      <Text style={s.heading}>{item.name}</Text>
      <Text style={s.body}>{[item.color, item.size].filter(Boolean).join(' · ') || 'Variantă standard'}</Text>
      <Text selectable style={s.small}>{item.url}</Text>
      {item.comment !== '' && <Text style={s.small}>Observații: {item.comment}</Text>}
      <View style={s.row}><Text style={s.body}>Produs · {item.quantity} × {money(item.unitPrice)}</Text><Text style={s.body}>{money(item.unitPrice * item.quantity)}</Text></View>
      <View style={s.row}><Text style={s.small}>Livrare locală</Text><Text style={s.body}>{money(item.localShipping)}</Text></View>
      {item.inspection && <View style={s.row}><Text style={s.small}>Verificare produs</Text><Text style={s.body}>{money(3)}</Text></View>}
      <View style={s.row}><Text style={[s.body, { fontWeight: '600' }]}>Subtotal</Text><Text style={s.heading}>{money(cartTotal([item]))}</Text></View>
    </View>)}
    <View style={s.card}>
      <Text style={s.heading}>Detaliile prețului</Text>
      <View style={s.row}><Text style={s.body}>Produse</Text><Text style={s.body}>{money(products)}</Text></View>
      <View style={s.row}><Text style={s.body}>Livrare locală</Text><Text style={s.body}>{money(shipping)}</Text></View>
      <View style={s.row}><Text style={s.body}>Verificare</Text><Text style={s.body}>{money(inspection)}</Text></View>
      <View style={s.row}><Text style={s.body}>Comision</Text><Text style={s.body}>{money(0)}</Text></View>
      <View style={[s.row, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }]}><Text style={s.heading}>Total {order.status === 'Anulat' ? 'restituit' : 'comandă'}</Text><Text style={[s.heading, { color: colors.accent }]}>{money(order.total)}</Text></View>
      <Text style={s.small}>Transportul internațional și taxele de import nu sunt incluse.</Text>
      <Button secondary onPress={() => router.push('/balance')}>Vezi soldul și tranzacțiile</Button>
    </View>
    {order.status === 'În procesare' && (!confirmCancel ? <Button secondary onPress={() => setConfirmCancel(true)}>Anulează comanda</Button> : <View style={[s.card, { borderColor: colors.accent }]}><Text style={s.heading}>Anulezi {order.id}?</Text><Text style={s.body}>{money(order.total)} vor reveni în soldul virtual USD. Produsele nu se vor întoarce automat în coș.</Text><Button onPress={cancel}>Confirmă anularea</Button><Button secondary onPress={() => setConfirmCancel(false)}>Păstrează comanda</Button></View>)}
    <Button secondary onPress={() => router.replace('/shopping')}>Toate comenzile</Button>
  </Screen>;
}

export default function OrderDetailScreen() {
  const live = useLiveAccount();
  const { id } = useLocalSearchParams<{ id: string }>();
  return live.authenticated ? <LiveOrderDetailScreen id={id} /> : <DemoOrderDetailScreen />;
}
