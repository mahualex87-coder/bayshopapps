import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { CountryLabel } from '@/components/CountryFlag';
import { useLiveAccount } from '@/api/context';
import { LiveAddressesRoute } from '@/features/live/routes';
import { useI18n } from '@/i18n/context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { WAREHOUSES } from '@/state/contracts';
import { Button, Choice, Notice, Screen, useUi } from '@/ui';
import { ADDRESS_VERIFIED_AT, warehouseAddressFields } from '@/domain/warehouse-addresses';

type CopyFeedback = { key: string; label: string; error: boolean };
// Personal internal build: use the exact account identity requested by its owner.
const ACCOUNT_IDENTITY = { name: 'ALEXANDRU MAHU', clientCode: 'M8051661' };

function copyFeedback() {
  if (AppState.currentState !== 'active') return;
  if (Platform.OS === 'android') void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick).catch(() => {});
  else if (Platform.OS === 'ios') void Haptics.selectionAsync().catch(() => {});
}
async function writeClipboard(value: string, personal: boolean): Promise<boolean> {
  if (Platform.OS !== 'web') return Clipboard.setStringAsync(value, { android: { isSensitive: personal } });
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  // LAN previews may use HTTP. The legacy fallback must run synchronously in
  // the press event and its actual boolean result determines success feedback.
  const previousFocus = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const input = document.createElement('textarea');
  input.value = value;
  input.readOnly = true;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;font-size:16px';
  document.body.appendChild(input);
  try {
    input.select();
    input.setSelectionRange(0, value.length);
    return document.execCommand('copy');
  } finally {
    input.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); }
  }
}

function DemoWarehouseAddressesScreen() {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t } = useI18n();
  const [country, setCountry] = useState('SUA');
  const [addressType, setAddressType] = useState('Depozit');
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const request = useRef(0);
  const warehouse = WAREHOUSES.find(item => item.name === country) || WAREHOUSES[0];
  const { fields, city, surcharge, complete } = warehouseAddressFields(warehouse.id, addressType === 'Privată', ACCOUNT_IDENTITY);
  const address = fields.map(field => field.value).join('\n');
  const copyKey = (label: string, value: string) => `${warehouse.id}:${addressType}:${label}:${value}`;
  const allKey = copyKey('Adresa completă', address);
  const copiedAll = feedback?.key === allKey && !feedback.error;
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    if (!feedback || feedback.error) return;
    const timeout = setTimeout(() => setFeedback(null), 2200);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const changeCountry = (value: string) => { request.current += 1; setFeedback(null); setCountry(value); setAddressType('Depozit'); };
  const changeType = (value: string) => { request.current += 1; setFeedback(null); setAddressType(value); };
  const copy = async (label: string, value: string, personal: boolean) => {
    const currentRequest = ++request.current;
    const key = copyKey(label, value);
    try {
      const copied = await writeClipboard(value, personal);
      if (currentRequest !== request.current) return;
      setFeedback({ key, label, error: !copied });
      if (copied) copyFeedback();
    } catch { if (currentRequest === request.current) setFeedback({ key, label, error: true }); }
  };

  return <Screen title="Adresele depozitelor" subtitle="Alege țara și copiază câmpurile în adresa de livrare.">
    <Choice country label="Depozit" options={WAREHOUSES.map(item => item.name)} value={country} onChange={changeCountry} />
    {warehouse.id === 'US' && <Choice label="Tipul adresei" options={['Depozit', 'Privată']} value={addressType} onChange={changeType} />}
    {!!surcharge && <Notice>{surcharge}</Notice>}
    <View style={[s.card, styles.addressCard]}>
      <View style={styles.cardHeader}>
        <View style={styles.headerCopy}><CountryLabel code={warehouse.id} label={warehouse.name} textStyle={s.heading} /><Text style={s.small}>{city}{warehouse.id === 'US' ? ` · ${addressType.toLocaleLowerCase('ro')}` : ''}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Copiază toată adresa" disabled={!complete} accessibilityState={{ disabled: !complete }} accessibilityHint={!complete ? 'Completează mai întâi numele și codul clientului' : undefined} onPress={() => { void copy('Adresa completă', address, true); }} style={({ pressed }) => [styles.copyAll, !complete && styles.disabled, pressed && styles.pressed]}><Ionicons name={copiedAll ? 'checkmark' : 'copy-outline'} size={18} color={colors.accent} /><Text style={styles.copyAllLabel}>{copiedAll ? 'Copiat' : 'Copiază tot'}</Text></Pressable>
      </View>
      {feedback?.key === allKey && feedback.error && <Text accessibilityRole="alert" style={[styles.errorText, styles.allError]}>Copierea automată nu este disponibilă. Selectează și copiază manual câmpurile de mai jos.</Text>}
      {fields.map(({ label, value, complete: fieldComplete, personal }) => {
        const key = copyKey(label, value);
        const copied = feedback?.key === key && !feedback.error;
        const failed = feedback?.key === key && feedback.error;
        return <View key={label} style={styles.fieldRow}>
          <View style={styles.fieldCopy}><Text style={styles.fieldLabel}>{label}</Text>{label === 'Țară / Country' ? <CountryLabel code={warehouse.id} label={value} selectable textStyle={[styles.fieldValue, !fieldComplete && styles.incomplete]} /> : <Text selectable style={[styles.fieldValue, !fieldComplete && styles.incomplete]}>{value}</Text>}{!fieldComplete && <Text style={s.small}>Completează datele tale pentru copiere.</Text>}{failed && <Text accessibilityRole="alert" style={styles.errorText}>Selectează textul și copiază-l manual.</Text>}</View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Copiază ${label}`} accessibilityHint="Copiază doar valoarea acestui câmp" disabled={!fieldComplete} accessibilityState={{ disabled: !fieldComplete }} onPress={() => { void copy(label, value, personal); }} style={({ pressed }) => [styles.copyButton, !fieldComplete && styles.disabled, copied && styles.copiedButton, pressed && styles.pressed]}><Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={colors.accent} />{copied && <Text style={styles.copiedLabel}>Copiat</Text>}</Pressable>
        </View>;
      })}
    </View>
    <View role={feedback?.error ? 'alert' : 'status'} accessibilityLiveRegion="polite" style={styles.feedback}><Text style={[s.small, feedback?.error && styles.errorText]}>{feedback?.error ? 'Copierea automată nu este disponibilă aici. Selectează textul și copiază-l manual.' : feedback ? `Copiat: ${feedback.label}` : 'Fiecare câmp poate fi copiat separat.'}</Text></View>
    <Text style={s.small}>{t('nativeFlow.addressSnapshot', { date: ADDRESS_VERIFIED_AT })}</Text>
    <Text style={s.small}>{t('nativeFlow.addressSignInHint')}</Text>
    <Button secondary onPress={() => router.push('/login')}>{t('nativeFlow.signIn')}</Button>
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  addressCard: { padding: 0, gap: 0, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: 14 },
  headerCopy: { flex: 1, minWidth: 110, gap: 3 },
  copyAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.soft },
  copyAllLabel: { fontSize: 12, fontWeight: '600', color: colors.accent },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 70, paddingVertical: 11, paddingLeft: 14, paddingRight: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  fieldCopy: { flex: 1, gap: 4 }, fieldLabel: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  fieldValue: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }, incomplete: { color: colors.muted },
  copyButton: { minWidth: 48, minHeight: 48, paddingHorizontal: 4, paddingVertical: 5, gap: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  copiedButton: { backgroundColor: colors.accentSoft }, copiedLabel: { color: colors.accent, fontSize: 10, fontWeight: '600' },
  feedback: { minHeight: 20, paddingHorizontal: 2 }, errorText: { color: colors.error, fontSize: 12, lineHeight: 18 }, allError: { paddingHorizontal: 14, paddingBottom: 12 },
  disabled: { opacity: 0.35 }, pressed: { backgroundColor: colors.soft },
});

export default function WarehouseAddressesScreen() {
  const { authenticated } = useLiveAccount();
  return authenticated ? <LiveAddressesRoute /> : <DemoWarehouseAddressesScreen />;
}
