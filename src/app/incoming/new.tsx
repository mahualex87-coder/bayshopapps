import { CountryLabel } from '@/components/CountryFlag';
import { normalizeUserUrl } from '@/domain/user-url';
import { useLiveAccount } from '@/api/context';
import { LiveIncomingFormRoute } from '@/features/live';
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useDemo } from '@/state/context';
import { WAREHOUSES, money, type DeclarationItem } from '@/state/contracts';
import { Button, Choice, Field, Notice, Screen, useUi } from '@/ui';
import { useDraftGuard } from '@/navigation/useDraftGuard';

type Line = { id: string; name: string; url: string; quantity: string; unitPrice: string };
const emptyLine = (id: string): Line => ({ id, name: '', url: '', quantity: '1', unitPrice: '' });

function DemoIncomingForm() {
  const { colors, s } = useUi();
  const { state, dispatch } = useDemo();
  const [warehouseId, setWarehouseId] = useState('US');
  const [tracking, setTracking] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine('line-1')]);
  const [documents, setDocuments] = useState<string[]>([]);
  const addresses = state.addresses.filter(a => !a.archived);
  const [addressId, setAddressId] = useState(addresses[0]?.id || '');
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');
  const [initialAddressId] = useState(addressId);
  useDraftGuard(!created && (tracking.length > 0 || documents.length > 0 || warehouseId !== 'US' || addressId !== initialAddressId || lines.length !== 1 || lines.some(line => line.name !== '' || line.url !== '' || line.quantity !== '1' || line.unitPrice !== '')), { fallbackHref: '/waiting' });
  const currency = 'USD' as const;
  const update = (id: string, field: keyof Omit<Line, 'id'>, value: string) => setLines(prev => prev.map(line => line.id === id ? { ...line, [field]: value } : line));
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice.replace(',', '.')) || 0), 0);
  const attach = (name: string) => setDocuments(prev => prev.includes(name) ? prev : [...prev, name]);
  const save = () => {
    setError('');
    if (tracking.trim().length < 4) return setError('Completează un tracking de minimum 4 caractere primit de la magazin.');
    if (!addresses.some(a => a.id === addressId)) return setError('Selectează un destinatar activ înainte de înregistrare.');
    const items: DeclarationItem[] = [];
    for (const [index, line] of lines.entries()) {
      const quantity = Number(line.quantity); const unitPrice = Number(line.unitPrice.replace(',', '.'));
      const url = normalizeUserUrl(line.url);
      if (!line.name.trim()) return setError(`Produsul ${index + 1}: completează denumirea, marca și modelul.`);
      if (!/^https?:\/\/\S+\.[^\s]+$/i.test(url)) return setError(`Produsul ${index + 1}: adaugă un link valid, de exemplu https://magazin.test/produs.`);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return setError(`Produsul ${index + 1}: cantitatea trebuie să fie un număr întreg între 1 și 100.`);
      if (!line.unitPrice.trim() || !Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 100000 || Math.abs(Math.round(unitPrice * 100) / 100 - unitPrice) > 0.0000001) return setError(`Produsul ${index + 1}: prețul pe bucată trebuie să fie între 0,01 și 100.000 USD, cu maximum două zecimale.`);
      items.push({ id: line.id, name: line.name.trim(), url, quantity, unitPrice });
    }
    const result = dispatch({ type: 'addIncoming', input: { warehouseId, tracking: tracking.trim(), items, documentNames: documents, addressId } });
    if (!result.ok) return setError(result.error || 'Coletul nu a putut fi înregistrat.');
    setCreated(result.id || 'DEMO');
  };
  if (created) return <Screen title="Colet înregistrat" subtitle="Coletul așteptat a fost salvat local."><Notice>{created} · Îl găsești în lista „Așteptare”.</Notice><Button onPress={() => router.replace({ pathname: '/waiting', params: { focus: created } })}>Vezi coletele așteptate</Button><Button secondary onPress={() => { setCreated(''); setTracking(''); setLines([emptyLine(`line-${Date.now()}`)]); setDocuments([]); }}>Înregistrează încă un colet</Button></Screen>;
  return <Screen title="Colet așteptat" subtitle="Anunță ce va ajunge la depozit și completează declarația produselor.">
    
    <Choice country label="Depozitul de destinație" options={WAREHOUSES.map(w => w.name)} value={WAREHOUSES.find(w => w.id === warehouseId)!.name} onChange={name => setWarehouseId(WAREHOUSES.find(w => w.name === name)!.id)} />
    <View style={s.card}><Text style={s.label}>Moneda declarației</Text><Text style={s.heading}>{currency}</Text><Text style={s.small}>Valorile produselor se completează în USD.</Text></View>
    <Field label="Număr de tracking local *" value={tracking} onChangeText={setTracking} autoCapitalize="characters" placeholder="Tracking primit de la magazin" />
    <Text style={s.heading}>Produsele din colet</Text>
    {lines.map((line, index) => <View key={line.id} style={s.card}>
      <View style={s.row}><Text style={s.heading}>Produsul {index + 1}</Text>{lines.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={`Elimină produsul ${index + 1}`} onPress={() => setLines(prev => prev.filter(l => l.id !== line.id))} style={{ padding: 10 }}><Text style={{ color: colors.error }}>Elimină</Text></Pressable>}</View>
      <Field label="Denumire, marcă și model *" value={line.name} onChangeText={value => update(line.id, 'name', value)} placeholder="Ex.: Căști wireless, marcă și model" />
      <Field label="Linkul produsului *" value={line.url} onChangeText={value => update(line.id, 'url', value)} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://magazin.test/produs" />
      <Field label="Cantitate *" value={line.quantity} onChangeText={value => update(line.id, 'quantity', value)} keyboardType="number-pad" />
      <Field label={`Preț pe bucată (${currency}) *`} value={line.unitPrice} onChangeText={value => update(line.id, 'unitPrice', value)} keyboardType="decimal-pad" placeholder="0,00" />
    </View>)}
    <Button secondary onPress={() => setLines(prev => [...prev, emptyLine(`line-${Date.now()}`)])}>+ Adaugă un produs</Button>
    <View style={s.card}><Text style={s.heading}>Documente însoțitoare</Text><Text style={s.small}>Poți adăuga exemple de documente. Încărcarea fișierelor de pe telefon nu este încă disponibilă.</Text>{documents.map(name => <View key={name} style={s.row}><Text style={s.body}>{name}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Elimină ${name}`} onPress={() => setDocuments(prev => prev.filter(d => d !== name))} style={{ padding: 10 }}><Text style={{ color: colors.error }}>Elimină</Text></Pressable></View>)}<Button secondary onPress={() => attach('factura-exemplu-DEMO.pdf')}>Adaugă un exemplu de factură</Button><Button secondary onPress={() => attach('declaratie-vamala-DEMO.pdf')}>Adaugă un exemplu de declarație</Button></View>
    <Text style={s.heading}>Destinatar</Text>
    <Button secondary onPress={() => router.push({ pathname: '/address-book', params: { add: '1' } })}>+ Adaugă un destinatar</Button>
    {addresses.map(address => <Pressable key={address.id} accessibilityRole="radio" aria-checked={address.id === addressId} accessibilityState={{ checked: address.id === addressId }} onPress={() => setAddressId(address.id)} style={[s.card, address.id === addressId && { borderColor: colors.text, backgroundColor: colors.soft }]}><View style={s.row}><Text style={s.heading}>{address.firstName} {address.lastName}</Text><Text style={s.status}>{address.id === addressId ? 'Selectat' : 'Selectează'}</Text></View><Text style={s.body}>{address.street}, {address.city}</Text><CountryLabel name={address.country} label={`${address.country} · ${address.phone}`} textStyle={s.small} /></Pressable>)}
    {!addresses.length && <Notice error>Nu există un destinatar activ. Adaugă o adresă din Cont, apoi revino la formular.</Notice>}
    <View style={s.card}><View style={s.row}><Text style={s.heading}>Valoare declarată</Text><Text style={s.heading}>{money(total, currency)}</Text></View><Text style={s.small}>Transportul se calculează separat.</Text></View>
    {error ? <Notice error>{error}</Notice> : null}
    <Button onPress={save}>Înregistrează coletul</Button>
  </Screen>;
}

export default function IncomingForm() {
  const live = useLiveAccount();
  return live.authenticated ? <LiveIncomingFormRoute /> : <DemoIncomingForm />;
}
