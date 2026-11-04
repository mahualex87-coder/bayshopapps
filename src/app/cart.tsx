import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LiveCartScreen } from '@/features/commerce/LiveCommerce';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDemo } from '@/state/context';
import { money } from '@/state/contracts';
import { cartTotal } from '@/state/demo';
import { Button, Notice, Screen, useUi } from '@/ui';

function DemoCartScreen() {
  const { colors, s } = useUi();
  const { state, dispatch } = useDemo();
  const [reviewing, setReviewing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const confirming = useRef(false);
  const quantity = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const products = state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const localShipping = state.cart.reduce((sum, item) => sum + item.localShipping, 0);
  const inspection = state.cart.reduce((sum, item) => sum + (item.inspection ? 3 : 0), 0);
  const total = cartTotal(state.cart);

  function updateQuantity(id: string, count: number) {
    const result = dispatch({ type: 'updateCartQuantity', id, quantity: count });
    setReviewing(false); setError(result.ok ? '' : result.error || 'Cantitatea nu a fost modificată.');
  }
  function remove(id: string) {
    const result = dispatch({ type: 'removeCart', id });
    setRemoving(null); setReviewing(false); setError(result.ok ? '' : result.error || 'Produsul nu a fost eliminat.');
  }
  function checkout() {
    if (confirming.current) return;
    confirming.current = true;
    const result = dispatch({ type: 'checkoutCart' });
    if (result.ok && result.id) router.replace({ pathname: '/order/[id]', params: { id: result.id } });
    else { setError(result.error || 'Comanda nu a putut fi creată.'); setReviewing(false); confirming.current = false; }
  }

  if (state.cart.length === 0) return <Screen title="Coșul meu" subtitle="Produsele adăugate prin link apar aici."><View style={[s.card, { alignItems: 'center', paddingVertical: 38 }]}><Ionicons name="cart-outline" size={50} color={colors.accent} /><Text style={s.heading}>Coșul este gol</Text><Text style={[s.body, { textAlign: 'center' }]}>Adaugă produse prin link, apoi verifică detaliile comenzii.</Text></View><Button onPress={() => router.push('/order/new')}>Adaugă un produs prin link</Button><Button secondary onPress={() => router.replace('/shopping')}>Vezi comenzile mele</Button></Screen>;

  return <Screen title="Coșul meu" subtitle={`${state.cart.length} produse · ${quantity} bucăți · USD`}>
    
    {state.cart.map(item => <View key={item.id} style={s.card}>
      <View style={s.row}><CountryLabel name={item.country} label={item.country} textStyle={s.status} /><Pressable accessibilityRole="button" accessibilityLabel={`Elimină ${item.name} din coș`} onPress={() => { setRemoving(item.id); setReviewing(false); }} style={{ padding: 10 }}><Ionicons name="trash-outline" size={20} color={colors.muted} /></Pressable></View>
      <Text style={s.heading}>{item.name}</Text>
      <Text style={s.small}>{[item.color, item.size].filter(Boolean).join(' · ') || 'Fără variantă specificată'}</Text>
      <Text selectable numberOfLines={2} style={s.small}>{item.url}</Text>
      {item.comment !== '' && <Text style={s.small}>Observații: {item.comment}</Text>}
      <View style={s.row}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Scade cantitatea pentru ${item.name}`} accessibilityState={{ disabled: item.quantity <= 1 }} disabled={item.quantity <= 1} onPress={() => updateQuantity(item.id, item.quantity - 1)} style={[s.choice, item.quantity <= 1 && { opacity: 0.4 }]}><Ionicons name="remove" size={18} color={colors.text} /></Pressable>
          <Text accessibilityLabel={`${item.quantity} bucăți`} style={s.heading}>{item.quantity}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Mărește cantitatea pentru ${item.name}`} accessibilityState={{ disabled: item.quantity >= 100 }} disabled={item.quantity >= 100} onPress={() => updateQuantity(item.id, item.quantity + 1)} style={[s.choice, item.quantity >= 100 && { opacity: 0.4 }]}><Ionicons name="add" size={18} color={colors.text} /></Pressable>
        </View>
        <Text style={s.heading}>{money(item.unitPrice * item.quantity)}</Text>
      </View>
      <Text style={s.small}>{money(item.unitPrice)} / buc. · Livrare locală {money(item.localShipping)}{item.inspection ? ' · Verificare 3,00 USD' : ''}</Text>
      <View style={s.row}><Text style={s.body}>Total produs și servicii</Text><Text style={[s.body, { fontWeight: '700' }]}>{money(cartTotal([item]))}</Text></View>
      {removing === item.id && <View style={{ gap: 10 }}><Notice>Elimini acest produs din coș?</Notice><Button onPress={() => remove(item.id)}>Da, elimină produsul</Button><Button secondary onPress={() => setRemoving(null)}>Păstrează produsul</Button></View>}
    </View>)}
    <Button secondary onPress={() => router.push('/order/new')}>Adaugă alt produs</Button>
    <View style={s.card}>
      <Text style={s.heading}>Sumarul comenzii</Text>
      <View style={s.row}><Text style={s.body}>Produse · {quantity} buc.</Text><Text style={s.body}>{money(products)}</Text></View>
      <View style={s.row}><Text style={s.body}>Livrare până la depozite</Text><Text style={s.body}>{money(localShipping)}</Text></View>
      <View style={s.row}><Text style={s.body}>Verificare produse</Text><Text style={s.body}>{money(inspection)}</Text></View>
      <View style={s.row}><Text style={s.body}>Comision</Text><Text style={s.body}>{money(0)}</Text></View>
      <View style={[s.row, { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 15 }]}><Text style={s.heading}>Total</Text><Text style={[s.heading, { color: colors.accent, fontSize: 24 }]}>{money(total)}</Text></View>
      <Text style={s.small}>Transportul internațional și taxele de import se calculează separat.</Text>
    </View>
    {error !== '' && <Notice error>{error}</Notice>}
    {state.balances.USD < total && <View style={{ gap: 10 }}><Notice error>Sold insuficient: ai {money(state.balances.USD)}, iar comanda costă {money(total)}.</Notice><Button secondary onPress={() => router.push('/balance')}>Alimentează soldul</Button></View>}
    {!reviewing ? <Button onPress={() => { setReviewing(true); setRemoving(null); setError(''); }}>Verifică și continuă</Button> : <View style={[s.card, { borderColor: colors.accent }]}>
      <Text style={s.heading}>Confirmă comanda</Text>
      <Text style={s.body}>Pentru {quantity} bucăți se vor scădea {money(total)} din soldul virtual USD.</Text>
      <View style={s.row}><Text style={s.small}>Sold disponibil</Text><Text style={s.body}>{money(state.balances.USD)}</Text></View>
      {state.balances.USD >= total && <View style={s.row}><Text style={s.small}>Sold după confirmare</Text><Text style={s.body}>{money(state.balances.USD - total)}</Text></View>}
      <Notice>Simulare locală: nu se cumpără produse și nu se transferă bani reali.</Notice>
      <Button onPress={checkout}>Confirmă comanda · {money(total)}</Button>
      <Button secondary onPress={() => setReviewing(false)}>Revino la produse</Button>
    </View>}
  </Screen>;
}

export default function CartScreen() {
  const live = useLiveAccount();
  const { storageId } = useLocalSearchParams<{ storageId?: string }>();
  return live.authenticated ? <LiveCartScreen key={JSON.stringify([storageId, live.accountId, live.accountRevision])} initialStorageId={storageId} /> : <DemoCartScreen />;
}
