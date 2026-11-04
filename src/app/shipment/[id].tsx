import { ParcelStatusBadge } from '@/components/ParcelStatusBadge';
import { legacyParcelStatusTone } from '@/domain/legacy-parcel-status';
import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LiveShipmentDetailRoute } from '@/features/live';
import { useVisualPreferences } from '@/navigation/accessibility';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Modal, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useDemo } from '@/state/context';
import { WAREHOUSES, money } from '@/state/contracts';
import { Button, Choice, Notice, Screen, useUi } from '@/ui';
import { useDraftGuard } from '@/navigation/useDraftGuard';

const LOCAL = ['Depozitul nostru', 'Oficiile Nova Poshta', 'Post-terminal', 'Livrare la domiciliu'];
const NEXT: Record<string, string> = { 'În pregătire': 'Simulează plecarea din depozit', Trimise: 'Simulează controlul vamal', 'Reținere vamală': 'Simulează primirea coletului' };

function DemoShipmentDetail() {
  const { colors, s } = useUi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useDemo();
  const { reduceMotion } = useVisualPreferences();
  const shipment = state.shipments.find(item => item.id === id);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [document, setDocument] = useState<string | null>(null);
  const [editingDelivery, setEditingDelivery] = useState(false);
  const [delivery, setDelivery] = useState(shipment?.localDelivery || LOCAL[0]);
  const { confirmDiscard } = useDraftGuard(editingDelivery && delivery !== shipment?.localDelivery, { fallbackHref: shipment?.status === 'Primit' ? '/received' : '/shipments' });
  if (!shipment) return <Screen title="Expediere negăsită"><Notice>Expedierea nu mai este disponibilă.</Notice><Button onPress={() => router.replace('/shipments')}>Vezi expedierile</Button></Screen>;
  const recipient = state.addresses.find(address => address.id === shipment.addressId);
  const parcels = state.warehouse.filter(item => shipment.warehouseItemIds.includes(item.id));
  const invoice = state.invoices.find(item => item.shipmentId === shipment.id);
  const total = Object.values(shipment.costs).reduce((sum, cost) => sum + cost, 0);
  const advance = () => {
    const result = dispatch({ type: 'advanceShipment', id: shipment.id });
    setError(!result.ok); setMessage(result.ok ? 'Etapa a fost actualizată local.' : result.error || 'Etapa nu poate fi actualizată.');
  };
  const saveDelivery = () => {
    const result = dispatch({ type: 'updateLocalDelivery', id: shipment.id, localDelivery: delivery });
    setError(!result.ok); setMessage(result.ok ? 'Tipul livrării locale a fost actualizat.' : result.error || 'Livrarea nu poate fi actualizată.');
    if (result.ok) setEditingDelivery(false);
  };
  const pay = () => {
    if (!invoice) return;
    const result = dispatch({ type: 'payInvoice', id: invoice.id });
    setError(!result.ok); setMessage(result.ok ? 'Plata a fost simulată din soldul virtual.' : result.error || 'Plata nu a putut fi înregistrată.');
  };
  return <Screen title={shipment.name} subtitle={<CountryLabel code={shipment.warehouseId} label={`${shipment.id} · ${WAREHOUSES.find(w => w.id === shipment.warehouseId)?.name || shipment.warehouseId} → ${recipient?.city || 'Destinație'}`} textStyle={s.subtitle} />}>
    
    <View style={s.hero}><Text style={s.eyebrow}>EXPEDIERE</Text><View style={s.row}><ParcelStatusBadge label={shipment.status} tone={legacyParcelStatusTone(shipment.status)} /><Ionicons name={shipment.status === 'Primit' ? 'checkmark-circle-outline' : 'airplane-outline'} size={36} color={colors.accent} /></View><Text selectable style={{ color: colors.successSoft, fontSize: 15 }}>{shipment.tracking}</Text><Text style={{ color: colors.successSoft }}>{shipment.method.replace(/ · demo$/i, '')}</Text></View>
    {message ? <Notice error={error}>{message}</Notice> : null}
    {shipment.status === 'Reținere vamală' && <Notice>Detaliile controlului vamal vor fi disponibile după conectarea operatorului.</Notice>}
    <View style={s.card}><Text style={s.heading}>Greutatea expedierii</Text><View style={s.row}><Text style={s.body}>Fizică</Text><Text style={s.body}>{shipment.weightKg.toFixed(2)} kg</Text></View><View style={s.row}><Text style={s.body}>Volumetrică</Text><Text style={s.body}>{shipment.volumetricKg.toFixed(2)} kg</Text></View><Text style={s.small}>Greutatea volumetrică este estimată.</Text></View>
    <Text style={s.heading}>Traseul coletului</Text>
    <View style={s.card}>{shipment.events.map((event, index) => <View key={`${event.date}-${index}`} style={{ flexDirection: 'row', gap: 14, paddingVertical: 8 }}><View style={{ alignItems: 'center', width: 20 }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: index === shipment.events.length - 1 ? colors.accent : colors.text, marginTop: 5 }} />{index < shipment.events.length - 1 && <View style={{ width: 2, backgroundColor: colors.border, flex: 1, minHeight: 36, marginTop: 5 }} />}</View><View style={{ flex: 1, gap: 5 }}><Text style={s.heading}>{event.label}</Text><Text style={s.small}>{new Date(event.date).toLocaleString('ro-RO')}</Text><Text style={s.body}>{event.detail}</Text></View></View>)}</View>
    <View style={s.card}><Text style={s.heading}>Destinatar</Text><Text style={s.body}>{recipient?.firstName} {recipient?.lastName}</Text><Text style={s.body}>{recipient?.street}</Text><CountryLabel name={recipient?.country} label={`${recipient?.city ?? ''}, ${recipient?.region ?? ''}, ${recipient?.country ?? ''}`} textStyle={s.small} /><Text style={s.small}>{recipient?.phone} · {recipient?.postalCode}</Text><Text style={s.label}>Livrare locală</Text><Text style={s.body}>{shipment.localDelivery}</Text>{shipment.status !== 'Primit' && !editingDelivery && <Button secondary onPress={() => { setDelivery(shipment.localDelivery); setEditingDelivery(true); }}>Schimbă tipul livrării</Button>}{editingDelivery && <><Choice label="Alege livrarea locală" options={LOCAL} value={delivery} onChange={setDelivery} />{['Oficiile Nova Poshta', 'Post-terminal'].includes(delivery) && <Notice>Selecția oficiului sau terminalului exact nu este încă disponibilă.</Notice>}<Button onPress={saveDelivery}>Salvează livrarea</Button><Button secondary onPress={() => confirmDiscard(() => setEditingDelivery(false))}>Anulează</Button></>}</View>
    <Text style={s.heading}>Colete incluse ({parcels.length})</Text>
    {parcels.map(item => <View key={item.id} style={s.card}><Text style={s.heading}>{item.name}</Text><Text style={s.small}>{item.id} · {item.weightKg.toFixed(2)} kg</Text>{item.items.map(line => <Text key={line.id} style={s.body}>{line.quantity} × {line.name}</Text>)}<Button secondary onPress={() => router.push({ pathname: '/warehouse/[id]', params: { id: item.id } })}>Vezi declarația</Button></View>)}
    <View style={s.card}><Text style={s.heading}>Costuri</Text><View style={s.row}><Text style={s.body}>Transport</Text><Text style={s.body}>{money(shipment.costs.shipping)}</Text></View><View style={s.row}><Text style={s.body}>Servicii suplimentare</Text><Text style={s.body}>{money(shipment.costs.services)}</Text></View><Text style={s.small}>{shipment.services.length ? shipment.services.map(service => service.replace(/ demo$/i, '')).join(', ') : 'Fără servicii suplimentare'}</Text><View style={s.row}><Text style={s.body}>Manipulare</Text><Text style={s.body}>{money(shipment.costs.handling)}</Text></View><View style={s.row}><Text style={s.body}>Taxe de import</Text><Text style={s.body}>{shipment.costs.importTax > 0 ? money(shipment.costs.importTax) : 'Nedeterminate'}</Text></View><Text style={s.small}>Taxele de import necesită confirmare separată. O valoare zero nu înseamnă scutire de taxe.</Text><View style={s.row}><Text style={s.heading}>Total</Text><Text style={s.heading}>{money(total)}</Text></View></View>
    {invoice && <View style={s.card}><View style={s.row}><Text style={s.heading}>Factură</Text><Text style={s.status}>{invoice.status}</Text></View><Text style={s.body}>{invoice.id} · {money(invoice.amount, invoice.currency)}</Text><Button secondary onPress={() => setDocument(invoice.title)}>Previzualizează factura</Button>{invoice.status === 'Neachitată' && <><Text style={s.small}>Sold disponibil: {money(state.balances[invoice.currency], invoice.currency)}</Text><Text style={s.small}>Simulare locală: nu se transferă bani reali.</Text><Button onPress={pay}>Achită {money(invoice.amount, invoice.currency)} din sold</Button><Button secondary onPress={() => router.push('/balance')}>Vezi soldul și alimentarea</Button></>}</View>}
    <Text style={s.heading}>Documente de expediere</Text>
    <Button secondary onPress={() => setDocument('Declarație de produse')}>▤ Previzualizează declarația</Button>
    {shipment.documents.map(doc => <Button key={doc.id} secondary onPress={() => setDocument(doc.name)}>▤ {doc.name}</Button>)}
    {!shipment.documents.length && <Text style={s.small}>Documentele vor apărea în etapele următoare.</Text>}
    <View style={s.card}><Text style={s.heading}>Simulator de parcurs</Text><Text style={s.body}>Schimbă local etapa pentru a previzualiza urmărirea. Nu se actualizează o expediere reală.</Text>{shipment.status === 'Primit' ? <Notice>Parcurs încheiat. Coletul a fost marcat ca primit local.</Notice> : <>{shipment.status === 'În pregătire' && invoice?.status === 'Neachitată' && <Text style={s.small}>Înregistrează mai întâi plata facturii pentru a continua.</Text>}<Button onPress={advance}>{NEXT[shipment.status]}</Button></>}</View>
    <Modal visible={document !== null} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setDocument(null)}><Screen standalone title="Previzualizare document" subtitle={document || ''}><Notice>Exemplu fără valoare fiscală; nu este un document emis de BayShop.</Notice><View style={s.card}><Text style={s.heading}>Expediere {shipment.id}</Text><Text style={s.body}>Destinatar: {recipient?.firstName} {recipient?.lastName}</Text>{document?.startsWith('Declarație') ? <>{parcels.flatMap(parcel => parcel.items.map(line => <View key={`${parcel.id}-${line.id}`} style={{ gap: 5 }}><Text style={s.body}>{line.name}</Text><Text style={s.small}>{line.quantity} × {money(line.unitPrice)} = {money(line.quantity * line.unitPrice)}</Text><Text style={s.small}>{line.url}</Text></View>))}<Text style={s.heading}>Valoare declarată: {money(parcels.reduce((sum, parcel) => sum + parcel.items.reduce((value, line) => value + line.quantity * line.unitPrice, 0), 0))}</Text></> : <><Text style={s.body}>Transport: {money(shipment.costs.shipping)}</Text><Text style={s.body}>Servicii: {money(shipment.costs.services)}</Text><Text style={s.body}>Manipulare: {money(shipment.costs.handling)}</Text><Text style={s.heading}>Total: {money(total)}</Text></>}<Text style={s.small}>Taxele de import necesită stabilire separată în serviciul real.</Text></View><Button onPress={() => setDocument(null)}>Închide documentul</Button></Screen></Modal>
  </Screen>;
}

export default function ShipmentDetail() {
  const live = useLiveAccount();
  const { id } = useLocalSearchParams<{ id: string }>();
  return live.authenticated ? <LiveShipmentDetailRoute id={id} /> : <DemoShipmentDetail />;
}
