import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LiveRecipientsRoute } from '@/features/live/routes';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useDemo } from '@/state/context';
import type { Address } from '@/state/contracts';
import { Button, Choice, Field, Notice, Screen, useUi } from '@/ui';
import { useDraftGuard } from '@/navigation/useDraftGuard';

type AddressInput = Omit<Address, 'id' | 'archived' | 'used'>;
const emptyAddress: AddressInput = { firstName: '', lastName: '', country: 'Republica Moldova', region: '', city: '', street: '', postalCode: '', phone: '', isCompany: false, company: '' };

function DemoAddressBookScreen() {
  const { colors, s } = useUi();
  const params = useLocalSearchParams<{ add?: string }>();
  const { state, dispatch } = useDemo();
  const [showForm, setShowForm] = useState(params.add === '1');
  const [form, setForm] = useState({ ...emptyAddress });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Active');
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const saving = useRef(false);
  const { bypass, confirmDiscard } = useDraftGuard(showForm && (Object.keys(emptyAddress) as (keyof AddressInput)[]).some(key => form[key] !== emptyAddress[key]), { fallbackHref: '/account' });
  const query = search.trim().toLocaleLowerCase('ro');
  const addresses = state.addresses.filter(address => (filter === 'Arhivate' ? address.archived : !address.archived) && (!query || `${address.firstName} ${address.lastName} ${address.city} ${address.street} ${address.company || ''}`.toLocaleLowerCase('ro').includes(query)));
  const set = <K extends keyof AddressInput>(key: K, value: AddressInput[K]) => setForm(current => ({ ...current, [key]: value }));

  function saveAddress() {
    if (saving.current) return;
    if (![form.firstName, form.lastName, form.country, form.region, form.city, form.street, form.postalCode, form.phone].every(value => value.trim())) { setError(true); setMessage('Completează toate câmpurile marcate cu *.'); return; }
    if (form.isCompany && !form.company?.trim()) { setError(true); setMessage('Introdu denumirea companiei.'); return; }
    saving.current = true;
    const result = dispatch({ type: 'addAddress', input: { ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), region: form.region.trim(), city: form.city.trim(), street: form.street.trim(), postalCode: form.postalCode.trim(), phone: form.phone.trim(), company: form.isCompany ? form.company?.trim() : undefined } });
    setError(!result.ok);
    setMessage(result.ok ? 'Destinatarul a fost adăugat și poate fi ales la înregistrarea coletelor.' : result.error || 'Adresa nu a putut fi salvată.');
    if (result.ok) { setShowForm(false); setForm({ ...emptyAddress }); setSearch(''); setFilter('Active'); if (params.add === '1' && router.canGoBack()) bypass(() => router.back()); }
    if (!result.ok) saving.current = false;
  }

  function archive(id: string) {
    const result = dispatch({ type: 'archiveAddress', id });
    setError(!result.ok); setArchiveId(null);
    setMessage(result.ok ? 'Adresa a fost arhivată. Rămâne vizibilă în istoricul adreselor și al coletelor.' : result.error || 'Adresa nu poate fi arhivată.');
  }

  return <Screen title="Adresele mele" subtitle="Destinatarii și adresele de livrare.">
    
    <View style={s.row}><Text style={s.small}>{state.addresses.filter(address => !address.archived).length} adrese active</Text></View>
    {message !== '' && !showForm && <Notice error={error}>{message}</Notice>}
    {!showForm && <Button onPress={() => { saving.current = false; setShowForm(true); setMessage(''); }}>Adaugă un destinatar</Button>}
    {showForm && <View style={[s.card, { borderColor: colors.accent }]}>
      <Text style={s.heading}>Destinatar nou</Text>
      <Text style={s.small}>Adresa se salvează pe acest dispozitiv.</Text>
      <Button secondary onPress={() => { setForm({ firstName: 'Maria', lastName: 'Exemplu', country: 'Republica Moldova', region: 'Regiune de test', city: 'Oraș Demo', street: 'Strada Fictivă 5, ap. 2', postalCode: 'MD-TEST', phone: '+373 00 000 002', isCompany: false, company: '' }); setMessage(''); }}>Completează un exemplu</Button>
      <Choice label="Tip destinatar" options={['Persoană fizică', 'Companie']} value={form.isCompany ? 'Companie' : 'Persoană fizică'} onChange={value => set('isCompany', value === 'Companie')} />
      {form.isCompany && <Field label="Denumirea companiei *" value={form.company} onChangeText={value => set('company', value)} placeholder="Denumirea companiei" maxLength={120} />}
      <Field label="Prenume *" value={form.firstName} onChangeText={value => set('firstName', value)} maxLength={80} />
      <Field label="Nume *" value={form.lastName} onChangeText={value => set('lastName', value)} maxLength={80} />
      <Choice country label="Țară *" options={['Republica Moldova', 'România']} value={form.country} onChange={value => set('country', value)} />
      <Field label="Regiune / raion / județ *" value={form.region} onChangeText={value => set('region', value)} maxLength={100} />
      <Field label="Oraș / localitate *" value={form.city} onChangeText={value => set('city', value)} maxLength={100} />
      <Field label="Stradă, număr, apartament *" value={form.street} onChangeText={value => set('street', value)} maxLength={200} />
      <Field label="Cod poștal *" value={form.postalCode} onChangeText={value => set('postalCode', value)} autoCapitalize="characters" maxLength={20} />
      <Field label="Telefon *" value={form.phone} onChangeText={value => set('phone', value)} keyboardType="phone-pad" maxLength={22} />
      {message !== '' && <Notice error={error}>{message}</Notice>}
      <Button onPress={saveAddress}>Salvează destinatarul</Button>
      <Button secondary onPress={() => confirmDiscard(() => { setShowForm(false); setForm({ ...emptyAddress }); setMessage(''); })}>Închide formularul</Button>
    </View>}
    <Field label="Caută o adresă" value={search} onChangeText={setSearch} placeholder="Nume, companie, oraș sau stradă" clearButtonMode="while-editing" />
    <Choice label="Agenda de adrese" options={['Active', 'Arhivate']} value={filter} onChange={setFilter} />
    {addresses.length === 0 && <View style={s.card}><Ionicons name="location-outline" size={30} color={colors.muted} /><Text style={s.heading}>{query ? 'Nicio adresă găsită' : filter === 'Arhivate' ? 'Nu ai adrese arhivate' : 'Nu există adrese active'}</Text><Text style={s.body}>{query ? 'Încearcă o altă căutare.' : 'Destinatarii adăugați vor apărea în această listă.'}</Text></View>}
    {addresses.map(address => <View key={address.id} style={[s.card, address.archived && { opacity: 0.75 }]}>
      <View style={s.row}><Text style={s.status}>{address.isCompany ? 'Companie' : 'Persoană fizică'}</Text><Text style={s.small}>{address.id}</Text></View>
      {address.isCompany && <Text style={s.heading}>{address.company}</Text>}
      <Text style={address.isCompany ? s.body : s.heading}>{address.firstName} {address.lastName}</Text>
      <CountryLabel name={address.country} label={`${address.street}\n${address.postalCode}, ${address.city}\n${address.region}, ${address.country}`} selectable textStyle={s.body} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="call-outline" size={16} color={colors.muted} /><Text selectable style={s.small}>{address.phone}</Text></View>
      {address.used && <Text style={s.small}>Adresă folosită în istoricul coletelor.</Text>}
      {!address.archived && (archiveId !== address.id ? <Button secondary onPress={() => { setArchiveId(address.id); setMessage(''); }}>Arhivează adresa</Button> : <View style={{ gap: 10 }}><Notice>Arhivarea ascunde adresa din selecția pentru colete noi. Adresele folosite de un colet activ și ultima adresă activă sunt protejate.</Notice><Button onPress={() => archive(address.id)}>Confirmă arhivarea</Button><Button secondary onPress={() => setArchiveId(null)}>Păstrează adresa activă</Button></View>)}
      {address.archived && <Text style={s.small}>Arhivată · păstrată pentru referință</Text>}
    </View>)}
  </Screen>;
}

export default function AddressBookScreen() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveRecipientsRoute /> : <DemoAddressBookScreen />;
}
