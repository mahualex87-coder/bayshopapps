import { AppearancePicker } from '@/theme/AppearancePicker';
import { useLiveAccount } from '@/api/context';
import { LiveSettingsRoute } from '@/features/live/routes';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useDemo } from '@/state/context';
import type { Preferences } from '@/state/contracts';
import { Button, Choice, Field, Notice, Screen, useUi } from '@/ui';
import { useDraftGuard } from '@/navigation/useDraftGuard';

const notificationOptions: { key: keyof Preferences; title: string; detail: string }[] = [
  { key: 'info', title: 'Informații despre serviciu', detail: 'Actualizări despre funcționare și opțiuni noi.' },
  { key: 'email', title: 'E-mail', detail: 'Actualizări despre comenzi și colete.' },
  { key: 'sms', title: 'SMS', detail: 'Alerte pe numărul din profil.' },
  { key: 'push', title: 'Notificări în aplicație', detail: 'Preferință pentru viitoarea integrare push.' },
  { key: 'telegram', title: 'Telegram', detail: 'Preferință locală; contul Telegram nu este conectat.' },
];

function DemoSettingsScreen() {
  const { colors, s } = useUi();
  const { state, dispatch } = useDemo();
  const [tab, setTab] = useState('Date personale');
  const [phone, setPhone] = useState(state.profile.phone);
  const [country, setCountry] = useState(state.profile.country);
  const [language, setLanguage] = useState(state.profile.language);
  const [preferences, setPreferences] = useState({ ...state.preferences });
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const profileDirty = phone !== state.profile.phone || country !== state.profile.country || language !== state.profile.language;
  const preferencesDirty = (Object.keys(preferences) as (keyof Preferences)[]).some(key => preferences[key] !== state.preferences[key]);
  useDraftGuard(profileDirty || preferencesDirty, { fallbackHref: '/account' });

  function saveProfile() {
    const cleanPhone = phone.trim();
    const digitCount = cleanPhone.replace(/\D/g, '').length;
    if (!/^\+?[\d\s()-]+$/.test(cleanPhone) || digitCount < 7 || digitCount > 15) { setError(true); setMessage('Introdu un număr de telefon valid, cu 7–15 cifre.'); return; }
    const result = dispatch({ type: 'updateProfile', input: { phone: cleanPhone, country, language } });
    if (result.ok) setPhone(cleanPhone);
    setError(!result.ok);
    setMessage(result.ok ? 'Datele de profil au fost salvate.' : result.error || 'Verifică datele introduse.');
  }

  function savePreferences() {
    const result = dispatch({ type: 'updatePreferences', input: preferences });
    setError(!result.ok);
    setMessage(result.ok ? 'Preferințele au fost salvate.' : result.error || 'Preferințele nu au fost salvate.');
  }

  return <Screen title="Profil și setări" subtitle="Datele și preferințele contului tău.">
    
    <AppearancePicker /><Choice label="Secțiune" options={['Date personale', 'Notificări', 'Servicii', 'Despre aplicație']} value={tab} onChange={value => { setTab(value); setMessage(''); }} />
    {message !== '' && <Notice error={error}>{message}</Notice>}
    {tab === 'Date personale' && <>
      <View style={s.card}>
        <Text style={s.heading}>Date personale</Text>
        <Field label="Prenume" value={state.profile.firstName} editable={false} />
        <Field label="Nume" value={state.profile.lastName} editable={false} />
        <Field label="E-mail" value={state.profile.email} editable={false} />
        <Text style={s.small}>Numele și e-mailul nu pot fi modificate aici.</Text>
        <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+373 600 00000" maxLength={20} />
        <Choice country label="Țară" options={Array.from(new Set([state.profile.country, 'Republica Moldova', 'România']))} value={country} onChange={setCountry} />
        <Choice label="Limba preferată" options={Array.from(new Set([state.profile.language, 'Română', 'Русский', 'English']))} value={language} onChange={setLanguage} />
        <Text style={s.small}>Limba se salvează ca preferință. Interfața este disponibilă în română.</Text>
        <Button onPress={saveProfile}>Salvează datele</Button>
      </View>
      <View style={s.card}><Text style={s.heading}>Siguranța contului</Text><Text style={s.body}>Schimbarea parolei și verificarea e-mailului vor fi disponibile după conectarea serviciului BayShop.</Text></View>
    </>}
    {tab === 'Notificări' && <View style={s.card}>
      <Text style={s.heading}>Cum vrei să primești noutăți</Text>
      {notificationOptions.map(option => <View style={s.setting} key={option.key}><View style={{ flex: 1, gap: 4 }}><Text style={[s.body, { fontWeight: '600' }]}>{option.title}</Text><Text style={s.small}>{option.detail}</Text></View><Switch accessibilityLabel={option.title} value={preferences[option.key]} trackColor={{ false: colors.border, true: colors.accent }} onValueChange={value => setPreferences(current => ({ ...current, [option.key]: value }))} /></View>)}
      <Notice>Preferințele se salvează local; trimiterea notificărilor nu este încă activă.</Notice>
      <Button onPress={savePreferences}>Salvează preferințele</Button>
    </View>}
    {tab === 'Servicii' && <View style={s.card}>
      <Text style={s.heading}>Gestionarea serviciilor</Text>
      <View style={s.setting}><View style={{ flex: 1, gap: 4 }}><Text style={[s.body, { fontWeight: '600' }]}>AutoSend</Text><Text style={s.small}>Preferință pentru expedierea automată din depozit.</Text></View><Switch accessibilityLabel="AutoSend" value={preferences.autoSend} trackColor={{ false: colors.border, true: colors.accent }} onValueChange={value => setPreferences(current => ({ ...current, autoSend: value }))} /></View>
      <Notice>AutoSend se salvează ca preferință; expedierea automată nu este încă activă.</Notice>
      <Button onPress={savePreferences}>Salvează serviciile</Button>
    </View>}
    {tab === 'Despre aplicație' && <View style={s.card}>
      <Text style={s.heading}>BayShop</Text><Text style={s.small}>Versiunea 0.6.2</Text>
      <Text style={s.body}>Coletele, comenzile și soldurile sunt date de exemplu. Modificările se păstrează pe acest dispozitiv și nu sunt sincronizate cu serviciul BayShop. Plățile, expedierile și mesajele de suport sunt simulate.</Text>
      <Text style={s.small}>Informațiile de autentificare aparțin acestei versiuni de evaluare. Nu folosi parola contului BayShop real.</Text>
    </View>}
  </Screen>;
}

export default function SettingsScreen() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveSettingsRoute /> : <DemoSettingsScreen />;
}
