import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LivePackingWizard } from '@/features/packing/LivePackingWizard';
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useDemo } from '@/state/context';
import { shipmentQuote } from '@/state/demo';
import { WAREHOUSES, money } from '@/state/contracts';
import { Button, Choice, Notice, Screen, useUi } from '@/ui';
import { useDraftGuard } from '@/navigation/useDraftGuard';

const STEPS = ['Colete', 'Destinatar', 'Transport', 'Servicii', 'Verificare'];
const LOCAL = ['Depozitul nostru', 'Oficiile Nova Poshta', 'Post-terminal', 'Livrare la domiciliu'];
const SERVICES = [
  { name: 'Reambalare', detail: 'Un ambalaj comun pentru produsele selectate.' },
  { name: 'Protecție suplimentară', detail: 'Protecție suplimentară pentru produse fragile.' },
  { name: 'Eliminare cutii de pantofi', detail: 'Eliminarea ambalajului original pentru reducerea volumului.' },
  { name: 'Asigurare demo', detail: 'Opțiune ilustrativă, fără poliță sau acoperire reală.' },
];

function DemoNewShipment() {
  const { colors, s } = useUi();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { state, dispatch } = useDemo();
  const available = state.warehouse.filter(item => !item.shipmentId);
  const initialIds = (ids || '').split(',').filter(id => available.some(item => item.id === id && item.declared));
  const [warehouseId, setWarehouseId] = useState(available.find(item => initialIds.includes(item.id))?.warehouseId || available[0]?.warehouseId || 'US');
  const [selected, setSelected] = useState<string[]>(initialIds);
  const addresses = state.addresses.filter(address => !address.archived);
  const [addressId, setAddressId] = useState(addresses[0]?.id || '');
  const [method, setMethod] = useState('Air Post · demo');
  const [localDelivery, setLocalDelivery] = useState(LOCAL[0]);
  const [services, setServices] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [initialSelection] = useState({ warehouseId, addressId });
  const previousStep = useCallback(() => {
    if (step === 0) return false;
    setStep(value => value - 1); setError(''); setAccepted(false);
    return true;
  }, [step]);
  const { bypass } = useDraftGuard(selected.length > 0 || step > 0 || warehouseId !== initialSelection.warehouseId || addressId !== initialSelection.addressId || method !== 'Air Post · demo' || localDelivery !== LOCAL[0] || services.length > 0, { onBack: previousStep, fallbackHref: '/warehouse' });
  const chosen = available.filter(item => selected.includes(item.id));
  const recipient = addresses.find(address => address.id === addressId);
  const quote = shipmentQuote(chosen, services);
  const weight = quote.weightKg;
  const volumetric = quote.volumetricKg;
  const shipping = quote.costs.shipping;
  const servicesCost = quote.costs.services;
  const total = Math.round(Object.values(quote.costs).reduce((sum, value) => sum + value, 0) * 100) / 100;
  const goodsValue = chosen.reduce((sum, item) => sum + item.items.reduce((s, line) => s + line.quantity * line.unitPrice, 0), 0);
  const validate = () => {
    if (step === 0 && (!chosen.length || chosen.length !== selected.length)) return 'Selectează cel puțin un colet disponibil.';
    if (step === 0 && chosen.some(item => !item.declared || item.warehouseId !== warehouseId)) return 'Expedierea poate include numai colete declarate din același depozit.';
    if (step === 1 && !recipient) return 'Selectează un destinatar activ.';
    return '';
  };
  const next = () => { const problem = validate(); setError(problem); if (!problem) setStep(value => Math.min(4, value + 1)); };
  const confirm = () => {
    if (!accepted) return setError('Confirmă că ai verificat coletele, destinatarul și costurile.');
    const result = dispatch({ type: 'createShipment', input: { warehouseItemIds: selected, addressId, method, localDelivery, services } });
    if (!result.ok) return setError(result.error || 'Expedierea nu a putut fi creată.');
    bypass(() => {
      if (result.id) router.replace({ pathname: '/shipment/[id]', params: { id: result.id } });
      else router.replace('/shipments');
    });
  };
  const toggle = (id: string) => { setError(''); setSelected(prev => prev.includes(id) ? prev.filter(value => value !== id) : [...prev, id]); };
  return <Screen key={step} title="Pregătește expedierea" subtitle={`Pasul ${step + 1} din ${STEPS.length} · ${STEPS[step]}`}>
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`Pregătire expediere: ${STEPS[step]}`} accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1, text: `Pasul ${step + 1} din ${STEPS.length}` }} style={{ flexDirection: 'row', gap: 6 }}>{STEPS.map((label, index) => <View key={label} style={{ flex: 1, height: 5, backgroundColor: index <= step ? colors.text : colors.border, borderRadius: 4 }} />)}</View>
    {step === 0 && <>
      <Notice>Reunește colete declarate din același depozit într-o singură expediere.</Notice>
      <Choice country label="Depozitul de origine" options={WAREHOUSES.map(w => w.name)} value={WAREHOUSES.find(w => w.id === warehouseId)!.name} onChange={name => { setWarehouseId(WAREHOUSES.find(w => w.name === name)!.id); setSelected([]); setError(''); }} />
      {available.filter(item => item.warehouseId === warehouseId).map(item => <View key={item.id} style={[s.card, selected.includes(item.id) && { borderColor: colors.text, backgroundColor: colors.soft }]}>
        <View style={s.row}><Text style={s.heading}>{item.name}</Text><Text style={s.status}>{item.id}</Text></View><Text style={s.body}>{item.weightKg.toFixed(2)} kg · {item.items.reduce((sum, line) => sum + line.quantity, 0)} produse</Text>
        <Text style={s.small}>{money(item.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0))} valoare declarată</Text>
        {item.declared ? <Pressable accessibilityRole="checkbox" aria-checked={selected.includes(item.id)} accessibilityState={{ checked: selected.includes(item.id) }} accessibilityLabel={`Selectează ${item.name}`} onPress={() => toggle(item.id)} style={[s.button, selected.includes(item.id) ? { backgroundColor: colors.primaryButton } : s.secondaryButton]}><Text style={[s.buttonText, !selected.includes(item.id) && { color: colors.text }]}>{selected.includes(item.id) ? '✓ Selectat' : 'Selectează coletul'}</Text></Pressable> : <><Notice error>Declarația este incompletă.</Notice><Button secondary onPress={() => router.push({ pathname: '/warehouse/[id]', params: { id: item.id } })}>Completează declarația</Button></>}
      </View>)}
      {!available.some(item => item.warehouseId === warehouseId) && <View style={s.card}><Text style={s.heading}>Depozitul este gol</Text><Text style={s.body}>Selectează alt depozit sau înregistrează un colet așteptat.</Text><Button secondary onPress={() => router.push('/incoming/new')}>Înregistrează un colet</Button></View>}
      <View style={s.card}><View style={s.row}><Text style={s.heading}>{chosen.length} colete selectate</Text><Text style={s.heading}>{weight.toFixed(2)} kg</Text></View><Text style={s.small}>Valoarea produselor: {money(goodsValue)}</Text></View>
    </>}
    {step === 1 && <>
      <Text style={s.heading}>Unde va ajunge expedierea?</Text>
      <Button secondary onPress={() => router.push({ pathname: '/address-book', params: { add: '1' } })}>+ Adaugă un destinatar</Button>
      {addresses.map(address => <Pressable key={address.id} accessibilityRole="radio" aria-checked={addressId === address.id} accessibilityState={{ checked: addressId === address.id }} onPress={() => setAddressId(address.id)} style={[s.card, addressId === address.id && { borderColor: colors.text, backgroundColor: colors.soft }]}><View style={s.row}><Text style={s.heading}>{address.firstName} {address.lastName}</Text>{addressId === address.id && <Ionicons name="checkmark-circle" size={24} color={colors.text} />}</View><Text style={s.body}>{address.street}</Text><CountryLabel name={address.country} label={`${address.city}, ${address.region}, ${address.country}`} textStyle={s.body} /><Text style={s.small}>{address.postalCode} · {address.phone}</Text></Pressable>)}
      {!addresses.length && <Notice error>Adaugă un destinatar activ din Cont → Adrese, apoi revino aici.</Notice>}
    </>}
    {step === 2 && <>
      <Choice label="Transport internațional" options={['Air Post', 'Road Express']} value={method.replace(/ · demo$/i, '')} onChange={value => setMethod(`${value} · demo`)} />
      <View style={s.card}><Text style={s.heading}>{method.replace(/ · demo$/i, '')}</Text><Text style={s.body}>Cost orientativ: {money(shipping)}</Text><Text style={s.small}>Greutate fizică {weight.toFixed(2)} kg · volumetrică estimată {volumetric.toFixed(2)} kg. Termenul real va fi oferit de transportator.</Text></View>
      <Choice label="Livrare locală" options={LOCAL} value={localDelivery} onChange={setLocalDelivery} />
      <Notice>{localDelivery === 'Depozitul nostru' ? 'Adresa de ridicare și programul vor fi disponibile după conectarea operatorului.' : localDelivery === 'Livrare la domiciliu' ? `Livrare la adresa aleasă: ${recipient?.street}, ${recipient?.city}.` : 'Selecția oficiului sau terminalului exact nu este încă disponibilă.'}</Notice>
    </>}
    {step === 3 && <>
      <Text style={s.heading}>Personalizează ambalarea</Text>
      {SERVICES.map(service => { const enabled = services.includes(service.name); return <Pressable key={service.name} accessibilityRole="checkbox" aria-checked={enabled} accessibilityState={{ checked: enabled }} onPress={() => setServices(prev => enabled ? prev.filter(value => value !== service.name) : [...prev, service.name])} style={[s.card, enabled && { borderColor: colors.text, backgroundColor: colors.soft }]}><View style={s.row}><Text style={s.heading}>{service.name.replace(/ demo$/i, '')}</Text><Ionicons name={enabled ? 'checkbox' : 'square-outline'} size={25} color={colors.text} /></View><Text style={s.body}>{service.detail}</Text><Text style={s.small}>+ {money(4)}</Text></Pressable>; })}
      <Notice>Costuri ilustrative; asigurarea nu constituie o ofertă sau o poliță.</Notice>
    </>}
    {step === 4 && <>
      <View style={s.card}><Text style={s.heading}>Verifică expedierea</Text><CountryLabel code={warehouseId} label={`${chosen.length} colete din ${WAREHOUSES.find(w => w.id === warehouseId)?.name ?? ''}`} textStyle={s.body} />{chosen.map(item => <Text key={item.id} style={s.small}>• {item.name} · {item.weightKg.toFixed(2)} kg</Text>)}<Text style={s.body}>{recipient?.firstName} {recipient?.lastName}</Text><CountryLabel name={recipient?.country} label={`${recipient?.street ?? ''}, ${recipient?.city ?? ''}, ${recipient?.country ?? ''}`} textStyle={s.small} /><Text style={s.body}>{method.replace(/ · demo$/i, '')}</Text><Text style={s.small}>{localDelivery}</Text><Text style={s.small}>Servicii: {services.length ? services.map(service => service.replace(/ demo$/i, '')).join(', ') : 'Fără servicii suplimentare'}</Text></View>
      <View style={s.card}><Text style={s.heading}>Estimarea costurilor</Text><View style={s.row}><Text style={s.body}>Transport internațional</Text><Text style={s.body}>{money(shipping)}</Text></View><View style={s.row}><Text style={s.body}>Servicii ({services.length})</Text><Text style={s.body}>{money(servicesCost)}</Text></View><View style={s.row}><Text style={s.body}>Manipulare</Text><Text style={s.body}>{money(quote.costs.handling)}</Text></View><View style={s.row}><Text style={s.body}>Taxe de import</Text><Text style={s.small}>Nedeterminate</Text></View><View style={s.row}><Text style={s.heading}>Total fără taxe de import</Text><Text style={s.heading}>{money(total)}</Text></View></View>
      <Notice>Confirmarea salvează local expedierea și factura. Nu trimite colete și nu efectuează plăți reale.</Notice>
      <Pressable accessibilityRole="checkbox" aria-checked={accepted} accessibilityState={{ checked: accepted }} onPress={() => setAccepted(value => !value)} style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}><Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={25} color={colors.text} /><Text style={[s.body, { flex: 1 }]}>Am verificat coletele, destinatarul și costurile.</Text></Pressable>
    </>}
    {error ? <Notice error>{error}</Notice> : null}
    <Button onPress={step === 4 ? confirm : next}>{step === 4 ? 'Confirmă expedierea' : `Continuă: ${STEPS[step + 1]}`}</Button>
    {step > 0 && <Button secondary onPress={previousStep}>← Pasul anterior</Button>}
  </Screen>;
}

export default function NewShipment() {
  const live = useLiveAccount();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  return live.authenticated ? <LivePackingWizard initialBoxIds={(ids || '').split(',').filter(Boolean)} /> : <DemoNewShipment />;
}
