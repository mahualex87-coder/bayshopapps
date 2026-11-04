import { ParcelStatusBadge } from '@/components/ParcelStatusBadge';
import { parcelStatusTone } from '@/domain/parcel-status';
import { CountryLabel } from '@/components/CountryFlag';
import { normalizeUserUrl } from '@/domain/user-url';
import { useLiveAccount } from '@/api/context';
import { LiveStockDetailRoute } from '@/features/live';
import { useVisualPreferences } from '@/navigation/accessibility';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Modal, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useDemo } from '@/state/context';
import { WAREHOUSES, money, type DeclarationItem } from '@/state/contracts';
import { Button, Field, Notice, Screen, useUi } from '@/ui';
import { useDraftGuard } from '@/navigation/useDraftGuard';

type Line = { id: string; name: string; url: string; quantity: string; unitPrice: string };
const draft = (items: DeclarationItem[]): Line[] => items.map(item => ({ ...item, quantity: String(item.quantity), unitPrice: String(item.unitPrice) }));
const newLine = (lines: Line[]): Line => {
  let index = 1;
  while (lines.some(line => line.id === `draft-${index}`)) index += 1;
  return { id: `draft-${index}`, name: '', url: '', quantity: '1', unitPrice: '' };
};
const SERVICES = [
  { name: 'Verificare conținut', icon: 'checkmark-circle-outline' as const, detail: 'Verificarea produselor și a eventualelor defecte.' },
  { name: 'Fotografii suplimentare', icon: 'camera-outline' as const, detail: 'Fotografii suplimentare pentru produsele din colet.' },
  { name: 'Împărțire colet', icon: 'git-branch-outline' as const, detail: 'Separarea produselor în mai multe colete.' },
  { name: 'Reambalare', icon: 'cube-outline' as const, detail: 'Înlocuirea ambalajului înainte de expediere.' },
];

function DemoWarehouseDetail() {
  const { colors, s } = useUi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useDemo();
  const { reduceMotion } = useVisualPreferences();
  const item = state.warehouse.find(p => p.id === id);
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [documents, setDocuments] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [document, setDocument] = useState<string | null>(null);
  const [originalDeclaration, setOriginalDeclaration] = useState('');
  const { confirmDiscard } = useDraftGuard(editing && JSON.stringify({ lines, documents }) !== originalDeclaration, { fallbackHref: '/warehouse' });
  if (!item) return <Screen title="Colet negăsit"><Notice>Acest colet nu mai este disponibil.</Notice><Button onPress={() => router.replace('/warehouse')}>Înapoi la depozit</Button></Screen>;
  const total = item.items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const startEdit = () => { const nextLines = item.items.length ? draft(item.items) : [newLine([])]; setOriginalDeclaration(JSON.stringify({ lines: nextLines, documents: item.documentNames })); setLines(nextLines); setDocuments(item.documentNames); setEditing(true); setMessage(''); };
  const update = (lineId: string, field: keyof Omit<Line, 'id'>, value: string) => setLines(prev => prev.map(line => line.id === lineId ? { ...line, [field]: value } : line));
  const fail = (text: string) => { setMessage(text); setError(true); };
  const save = () => {
    const items: DeclarationItem[] = [];
    for (const [index, line] of lines.entries()) {
      const quantity = Number(line.quantity); const unitPrice = Number(line.unitPrice.replace(',', '.'));
      const url = normalizeUserUrl(line.url);
      if (!line.name.trim()) return fail(`Produsul ${index + 1}: completează denumirea, marca și modelul.`);
      if (!/^https?:\/\/\S+\.[^\s]+$/i.test(url)) return fail(`Produsul ${index + 1}: completează un link valid, începând cu https://.`);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return fail(`Produsul ${index + 1}: cantitatea trebuie să fie între 1 și 100.`);
      if (!line.unitPrice.trim() || !Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 100000 || Math.abs(Math.round(unitPrice * 100) / 100 - unitPrice) > 0.0000001) return fail(`Produsul ${index + 1}: prețul trebuie să fie între 0,01 și 100.000 USD, cu maximum două zecimale.`);
      items.push({ id: line.id, name: line.name.trim(), url, quantity, unitPrice });
    }
    const result = dispatch({ type: 'declareItem', id: item.id, items, documentNames: documents });
    setError(!result.ok); setMessage(result.ok ? 'Declarația a fost salvată. Coletul poate fi selectat pentru expediere.' : result.error || 'Declarația nu a putut fi salvată.');
    if (result.ok) setEditing(false);
  };
  const request = (service: string) => {
    const result = dispatch({ type: 'requestService', id: item.id, service });
    setError(!result.ok); setMessage(result.ok ? `„${service}”: cerere salvată local, fără trimitere către depozit.` : result.error || 'Solicitarea nu a putut fi înregistrată.');
  };
  return <Screen title={item.name} subtitle={<CountryLabel code={item.warehouseId} label={`${item.id} · Depozit ${WAREHOUSES.find(w => w.id === item.warehouseId)?.name || item.warehouseId}`} textStyle={s.subtitle} />}>
    
    <View style={s.card}><View style={s.row}><Text style={s.heading}>{item.weightKg.toFixed(2)} kg fizice</Text><ParcelStatusBadge label={item.shipmentId ? 'Inclus în expediere' : item.declared ? 'Declarație completă' : 'Declarare necesară'} tone={item.shipmentId ? 'neutral' : parcelStatusTone({ stage: 'warehouse', declared: item.declared })} /></View><Text style={s.body}>{item.items.reduce((sum, line) => sum + line.quantity, 0)} produse · {money(total)} valoare declarată</Text><Text style={s.small}>Recepționat: {new Date(item.receivedAt).toLocaleDateString('ro-RO')}</Text><Text selectable style={s.small}>Tracking local: {item.tracking}</Text></View>
    {message && !editing ? <Notice error={error}>{message}</Notice> : null}
    <Text style={s.heading}>Fotografii la recepție</Text>
    <View style={s.choices}>{item.photoLabels.map((label, index) => <Pressable key={`${label}-${index}`} accessibilityRole="button" accessibilityLabel={`Vezi fotografia ${label}`} onPress={() => setPhoto(label)} style={[s.card, { flexGrow: 1, flexBasis: '44%', alignItems: 'center', backgroundColor: colors.soft }]}><Ionicons name="cube-outline" size={44} color={colors.muted} /><Text style={s.small}>{label}</Text><Text style={s.status}>Previzualizare</Text></Pressable>)}</View>
    {!item.photoLabels.length && <Notice>Nu sunt fotografii pentru acest colet. Poți solicita fotografii suplimentare.</Notice>}
    {!editing ? <>
      <View style={s.row}><Text style={s.heading}>Declarație de produse</Text><Text style={s.small}>USD</Text></View>
      {item.items.map(line => <View key={line.id} style={s.card}><Text style={s.heading}>{line.name}</Text><Text style={s.body}>{line.quantity} × {money(line.unitPrice)} = {money(line.quantity * line.unitPrice)}</Text><Text selectable style={s.small}>{line.url}</Text></View>)}
      {!item.shipmentId && <Button secondary onPress={startEdit}>{item.declared ? 'Editează declarația' : 'Completează declarația'}</Button>}
      <Text style={s.heading}>Documente</Text>
      {item.documentNames.map(name => <Button key={name} secondary onPress={() => setDocument(name)}>▤ {name}</Button>)}
      {!item.documentNames.length && <Text style={s.small}>Niciun document atașat.</Text>}
    </> : <>
      <Text style={s.heading}>Editează declarația</Text><Field label="Tracking local — nemodificabil" value={item.tracking} editable={false} />
      {lines.map((line, index) => <View key={line.id} style={s.card}><View style={s.row}><Text style={s.heading}>Produsul {index + 1}</Text>{lines.length > 1 && <Button secondary onPress={() => setLines(prev => prev.filter(l => l.id !== line.id))}>Elimină</Button>}</View><Field label="Denumire, marcă și model" value={line.name} onChangeText={value => update(line.id, 'name', value)} /><Field label="Linkul produsului" value={line.url} onChangeText={value => update(line.id, 'url', value)} keyboardType="url" autoCapitalize="none" autoCorrect={false} /><Field label="Cantitate" value={line.quantity} onChangeText={value => update(line.id, 'quantity', value)} keyboardType="number-pad" /><Field label="Preț pe bucată (USD)" value={line.unitPrice} onChangeText={value => update(line.id, 'unitPrice', value)} keyboardType="decimal-pad" /></View>)}
      <Button secondary onPress={() => setLines(prev => [...prev, newLine(prev)])}>+ Adaugă produs</Button>
      <View style={s.card}><Text style={s.heading}>Atașamente</Text><Text style={s.small}>Poți adăuga exemple de documente. Încărcarea fișierelor nu este încă disponibilă.</Text>{documents.map(name => <View key={name} style={s.row}><Text style={s.small}>{name}</Text><Button secondary onPress={() => setDocuments(prev => prev.filter(d => d !== name))}>Elimină</Button></View>)}{['factura-exemplu-DEMO.pdf', 'declaratie-vamala-DEMO.pdf'].map(name => <Button key={name} secondary onPress={() => setDocuments(prev => prev.includes(name) ? prev : [...prev, name])}>Adaugă {name.startsWith('factura') ? 'o factură exemplu' : 'o declarație exemplu'}</Button>)}</View>
      {message ? <Notice error={error}>{message}</Notice> : null}
      <Button onPress={save}>Salvează declarația</Button><Button secondary onPress={() => confirmDiscard(() => { setEditing(false); setMessage(''); })}>Renunță la modificări</Button>
    </>}
    {!editing && !item.shipmentId && <><Text style={s.heading}>Servicii de depozit</Text><Text style={s.small}>Solicitările se salvează local; nu sunt trimise către depozit.</Text>{SERVICES.map(service => { const requested = item.serviceRequests.includes(service.name); return <View key={service.name} style={s.card}><View style={s.row}><Ionicons name={service.icon} size={26} color={colors.text} /><Text style={s.heading}>{service.name}</Text></View><Text style={s.small}>{service.detail}</Text>{requested ? <Text style={s.status}>Cerere salvată local</Text> : <Button secondary onPress={() => request(service.name)}>Înregistrează cererea</Button>}</View>; })}{!item.declared && <Button onPress={startEdit}>Declară pentru a continua</Button>}</>}
    {item.shipmentId && <Button onPress={() => router.push({ pathname: '/shipment/[id]', params: { id: item.shipmentId } })}>Vezi expedierea</Button>}
    <Modal visible={photo !== null} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setPhoto(null)}><Screen standalone title="Fotografie" subtitle={photo || ''}><View style={[s.hero, { minHeight: 250, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="cube-outline" size={110} color={colors.accent} /><Text style={s.eyebrow}>PREVIZUALIZARE</Text></View><Notice>Imagine exemplu. Fotografiile reale ale coletului nu sunt încă disponibile.</Notice><Button onPress={() => setPhoto(null)}>Închide fotografia</Button></Screen></Modal>
    <Modal visible={document !== null} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setDocument(null)}><Screen standalone title="Previzualizare document" subtitle={document || ''}><Notice>Exemplu fără valoare fiscală; nu este un document emis.</Notice><Text style={s.body}>Colet: {item.id}</Text>{item.items.map(line => <Text key={line.id} style={s.body}>{line.name} · {line.quantity} × {money(line.unitPrice)}</Text>)}<Text style={s.heading}>Valoare declarată: {money(total)}</Text><Button onPress={() => setDocument(null)}>Închide documentul</Button></Screen></Modal>
  </Screen>;
}

export default function WarehouseDetail() {
  const live = useLiveAccount();
  const { id } = useLocalSearchParams<{ id: string }>();
  return live.authenticated ? <LiveStockDetailRoute id={id} /> : <DemoWarehouseDetail />;
}
