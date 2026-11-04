import { useLiveAccount } from '@/api/context';
import { normalizeUserUrl } from '@/domain/user-url';
import { LiveCheckoutScreen } from '@/features/commerce/LiveCheckout';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useDemo } from '@/state/context';
import { WAREHOUSES, money, type CartItem } from '@/state/contracts';
import { cartTotal } from '@/state/demo';
import { Button, Choice, Field, Notice, Screen, useUi } from '@/ui';
import { useDraftGuard } from '@/navigation/useDraftGuard';

const initial = { country: 'SUA', name: '', url: '', unitPrice: '', localShipping: '0', quantity: '1', color: '', size: '', comment: '', inspection: false };
const numberValue = (value: string) => Number(value.trim().replace(',', '.'));
const validDecimal = (value: string) => /^\d+(?:[.,]\d{1,2})?$/.test(value.trim());

function DemoNewOrderScreen() {
  const { colors, s } = useUi();
  const { dispatch } = useDemo();
  const [form, setForm] = useState({ ...initial });
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const submitting = useRef(false);
  useDraftGuard(!added && (Object.keys(initial) as (keyof typeof initial)[]).some(key => form[key] !== initial[key]), { fallbackHref: '/shopping' });
  const set = <K extends keyof typeof initial>(key: K, value: typeof initial[K]) => { setForm(current => ({ ...current, [key]: value })); setError(''); };
  const item: CartItem = { id: 'PREVIEW', country: form.country, name: form.name.trim(), url: form.url.trim(), unitPrice: numberValue(form.unitPrice), localShipping: numberValue(form.localShipping), quantity: numberValue(form.quantity), color: form.color.trim(), size: form.size.trim(), comment: form.comment.trim(), inspection: form.inspection };
  const hasQuote = validDecimal(form.unitPrice) && validDecimal(form.localShipping) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 100 && item.unitPrice > 0;

  function addProduct() {
    if (submitting.current) return;
    if (!form.name.trim()) { setError('Scrie denumirea produsului.'); return; }
    const url = normalizeUserUrl(form.url);
    try { if (!['https:', 'http:'].includes(new URL(url).protocol)) throw new Error(); }
    catch { setError('Introdu linkul complet al produsului, începând cu https://.'); return; }
    if (!validDecimal(form.unitPrice) || item.unitPrice <= 0 || !validDecimal(form.localShipping)) { setError('Prețul trebuie să fie pozitiv, iar livrarea locală cel puțin 0. Folosește cel mult două zecimale.'); return; }
    if (!/^\d+$/.test(form.quantity.trim()) || item.quantity < 1 || item.quantity > 100) { setError('Cantitatea trebuie să fie între 1 și 100 de bucăți.'); return; }
    submitting.current = true;
    const { id: _, ...input } = item;
    const result = dispatch({ type: 'addCart', item: { ...input, url } });
    if (result.ok) setAdded(true);
    else { setError(result.error || 'Produsul nu a fost adăugat.'); submitting.current = false; }
  }

  function anotherProduct() { setForm({ ...initial }); setAdded(false); setError(''); submitting.current = false; }
  function fillExample() { setForm({ country: 'SUA', name: 'Sneakers Canvas · exemplu', url: 'https://shop.example/sneakers-demo', unitPrice: '39.90', localShipping: '4', quantity: '1', color: 'Alb', size: '42', comment: 'Verificare mărime și culoare, date fictive.', inspection: true }); setError(''); }

  if (added) return <Screen title="Produs adăugat" subtitle="Îl găsești în coșul tău."><View style={s.hero}><Text style={s.eyebrow}>PREGĂTIT PENTRU VERIFICARE</Text><Text style={s.heroTitle}>{form.name}</Text><Text style={{ color: 'white', fontSize: 15 }}>{form.quantity} buc. · {money(cartTotal([item]))}</Text></View><Notice>Verifică produsele în coș înainte de confirmarea comenzii.</Notice><Button onPress={() => router.replace('/cart')}>Vezi coșul</Button><Button secondary onPress={anotherProduct}>Adaugă încă un produs</Button></Screen>;

  return <Screen title="Comandă prin link" subtitle="Completează produsul, apoi verifică toate costurile în coș.">
    
    <Text style={s.small}>Completează manual detaliile produsului din link.</Text>
    <Button secondary onPress={fillExample}>Completează un produs de exemplu</Button>
    <View style={s.card}>
      <Text style={s.heading}>1. Magazin și produs</Text>
      <Choice country label="Țara magazinului / depozitului" options={WAREHOUSES.map(warehouse => warehouse.name)} value={form.country} onChange={value => set('country', value)} />
      <Field label="Linkul produsului *" value={form.url} onChangeText={value => set('url', value)} placeholder="https://shop.example/produs" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={1000} />
      <Field label="Denumirea produsului *" value={form.name} onChangeText={value => set('name', value)} placeholder="De exemplu: Sneakers Canvas" maxLength={160} />
    </View>
    <View style={s.card}>
      <Text style={s.heading}>2. Varianta dorită</Text>
      <Field label="Culoare" value={form.color} onChangeText={value => set('color', value)} placeholder="Alb, negru, albastru…" maxLength={80} />
      <Field label="Mărime / model" value={form.size} onChangeText={value => set('size', value)} placeholder="M, 42, 500 ml…" maxLength={80} />
      <Field label="Cantitate *" value={form.quantity} onChangeText={value => set('quantity', value)} keyboardType="number-pad" maxLength={3} />
      <Field label="Observații pentru comandă" value={form.comment} onChangeText={value => set('comment', value)} placeholder="Detalii despre varianta dorită" multiline numberOfLines={3} maxLength={500} />
    </View>
    <View style={s.card}>
      <Text style={s.heading}>3. Preț și verificare</Text>
      <Field label="Preț per bucată · USD *" value={form.unitPrice} onChangeText={value => set('unitPrice', value)} keyboardType="decimal-pad" placeholder="0,00" maxLength={10} />
      <Field label="Livrare până la depozit · USD" value={form.localShipping} onChangeText={value => set('localShipping', value)} keyboardType="decimal-pad" placeholder="0,00" maxLength={10} />
      <Text style={s.small}>Livrarea locală se adaugă o singură dată pentru această linie de produs.</Text>
      <View style={s.setting}><View style={{ flex: 1, gap: 4 }}><Text style={[s.body, { fontWeight: '600' }]}>Verificare produs</Text><Text style={s.small}>+3,00 USD / linie, indiferent de cantitate.</Text></View><Switch accessibilityLabel="Adaugă verificarea produsului, 3 USD" value={form.inspection} trackColor={{ false: colors.border, true: colors.accent }} onValueChange={value => set('inspection', value)} /></View>
      <View style={s.row}><Text style={s.body}>Comision cumpărare</Text><Text style={s.body}>{money(0)}</Text></View>
      <View style={s.row}><Text style={s.heading}>Total în coș</Text><Text style={[s.heading, { color: colors.accent }]}>{hasQuote ? money(cartTotal([item])) : '—'}</Text></View>
      <Text style={s.small}>Estimare orientativă, fără transport internațional sau taxe de import.</Text>
    </View>
    {error !== '' && <Notice error>{error}</Notice>}
    <Button onPress={addProduct}>Adaugă în coș</Button>
    <Button secondary onPress={() => router.push('/cart')}>Vezi coșul actual</Button>
  </Screen>;
}

export default function NewOrderScreen() {
  const live = useLiveAccount();
  const { carts } = useLocalSearchParams<{ carts?: string }>();
  return live.authenticated ? <LiveCheckoutScreen cartIds={(carts || '').split(',').filter(Boolean)} /> : <DemoNewOrderScreen />;
}
