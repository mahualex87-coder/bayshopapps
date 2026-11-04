import { countryDisplayName } from '@/domain/presentation-labels';
import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { plainServerText } from '@/api/account-operations';
import { CountryLabel } from '@/components/CountryFlag';
import { postalAddressFields } from './address-fields';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveAddressField, LiveRecipientAddress, LiveWarehouseAddress } from '@/api/contracts';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { useI18n } from '@/i18n/context';
import { EmptyState, ResourceStatus, type LiveResourceProps } from './shared';
import { GlassSurface } from '@/navigation/GlassSurface';
import { groupWarehouseAddresses, resolveWarehouseAddressSelection } from '@/domain/warehouse-address-selection';

type Feedback = { key: string; label: string; error: boolean };

async function writeClipboard(value: string, personal: boolean): Promise<boolean> {
  if (Platform.OS !== 'web') return Clipboard.setStringAsync(value, { android: { isSensitive: personal } });
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
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

function confirmCopy() {
  if (AppState.currentState !== 'active') return;
  if (Platform.OS === 'android') void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick).catch(() => {});
  else if (Platform.OS === 'ios') void Haptics.selectionAsync().catch(() => {});
}

function AddressCard({ title, fields: rawFields, countryCode, headerCountryFlag = true, copyEnabled = true }: { title: string; fields: LiveAddressField[]; countryCode?: string; headerCountryFlag?: boolean; copyEnabled?: boolean }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const fields = postalAddressFields(rawFields);
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    if (!feedback || feedback.error) return;
    const timer = setTimeout(() => setFeedback(null), 2200);
    return () => clearTimeout(timer);
  }, [feedback]);
  const fullAddress = fields.map(field => field.value).join('\n');
  const copy = async (key: string, label: string, value: string, personal: boolean) => {
    if (!copyEnabled) return;
    const currentRequest = ++request.current;
    try {
      const copied = await writeClipboard(value, personal);
      if (currentRequest !== request.current) return;
      setFeedback({ key, label, error: !copied });
      if (copied) confirmCopy();
    } catch { if (currentRequest === request.current) setFeedback({ key, label, error: true }); }
  };
  return <View style={[s.card, styles.card]}>
    <View style={styles.cardHeader}>
      <View style={styles.headerCopy}>{countryCode && headerCountryFlag ? <CountryLabel label={title} code={countryCode} size="regular" textStyle={s.heading} /> : <Text accessibilityRole="header" style={s.heading}>{title}</Text>}</View>
      {fields.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={t('live.copy.allLabel', { title })} accessibilityState={{ disabled: !copyEnabled }} accessibilityHint={!copyEnabled ? t('live.addresses.copyDisabled') : undefined} disabled={!copyEnabled} onPress={() => { void copy('all', t('live.copy.fullAddress'), fullAddress, fields.some(field => field.personal)); }} style={({ pressed }) => [styles.copyAll, !copyEnabled && styles.disabled, pressed && s.pressed]}><Ionicons name={feedback?.key === 'all' && !feedback.error ? 'checkmark' : 'copy-outline'} size={18} color={colors.accent} /><Text style={styles.copyAllLabel}>{t(feedback?.key === 'all' && !feedback.error ? 'live.copy.done' : 'live.copy.all')}</Text></Pressable>}
    </View>
    {fields.map((field, index) => {
      const key = `${index}:${field.label}:${field.value}`;
      const label = field.labelKey ? t(field.labelKey) : field.label;
      const copied = feedback?.key === key && !feedback.error;
      return <View key={key} style={styles.fieldRow}>
        <View style={styles.fieldCopy}><Text style={styles.fieldLabel}>{label}</Text><>{field.labelKey === 'field.country' ? <CountryLabel label={field.value} code={countryCode} selectable={copyEnabled} textStyle={styles.fieldValue} /> : <Text selectable={copyEnabled} style={styles.fieldValue}>{field.value}</Text>}</></View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('live.copy.fieldLabel', { field: label, title })} accessibilityHint={t(copyEnabled ? 'live.copy.fieldHint' : 'live.addresses.copyDisabled')} accessibilityState={{ disabled: !copyEnabled }} disabled={!copyEnabled} onPress={() => { void copy(key, label, field.value, field.personal); }} style={({ pressed }) => [styles.copyButton, copied && styles.copied, !copyEnabled && styles.disabled, pressed && s.pressed]}><Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={colors.accent} />{copied && <Text style={styles.copiedLabel}>{t('live.copy.done')}</Text>}</Pressable>
      </View>;
    })}
    {fields.length === 0 && <Text style={[s.small, styles.feedback]}>{t('live.addresses.noDetails')}</Text>}
    {feedback && <Text accessibilityRole={feedback.error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[s.small, styles.feedback, feedback.error && styles.error]}>{feedback.error ? t('live.copy.error') : t('live.copy.confirmation', { field: feedback.label })}</Text>}
  </View>;
}

export function LiveAddresses({ resource, onRefresh }: LiveResourceProps<LiveWarehouseAddress[]>) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, language, formatNumber } = useI18n();
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [selectedAddressIds, setSelectedAddressIds] = useState<Record<string, string>>({});
  const addresses = resource.data;
  const countries = groupWarehouseAddresses(addresses || []).map(group => ({ ...group, countryTitle: countryDisplayName(group.countryCode, group.countryTitle, language) }));
  const { group, address: selected } = resolveWarehouseAddressSelection(countries, selectedCountryId, selectedAddressIds);
  const addressLabel = (address: LiveWarehouseAddress, short = false) => {
    const key = address.kind === 'private' ? short ? 'live.addresses.privateShort' : 'live.addresses.private' : address.kind === 'storage' ? short ? 'live.addresses.generalShort' : 'live.addresses.shared' : 'live.addresses.address';
    const peers = group?.addresses.filter(item => item.kind === address.kind) || [];
    return `${t(key)}${peers.length > 1 ? ` ${formatNumber(peers.findIndex(item => item.id === address.id) + 1)}` : ''}`;
  };
  return <Screen title={t('live.addresses.title')} subtitle={t('live.addresses.subtitle')}>
    <ResourceStatus resource={resource} onRefresh={onRefresh} />
    {countries.length > 0 && <View style={s.field}>
      <Text style={s.label}>{t('live.addresses.country')}</Text>
      <View style={styles.countryOptions} accessibilityRole="radiogroup" accessibilityLabel={t('live.addresses.country')}>
        {countries.map(country => <GlassSurface key={country.id} style={[styles.countrySurface, group?.id === country.id && styles.selectedSurface]}>
          <Pressable accessibilityRole="radio" accessibilityLabel={country.countryTitle} aria-checked={group?.id === country.id} accessibilityState={{ checked: group?.id === country.id }} onPress={() => setSelectedCountryId(country.id)} style={({ pressed }) => [styles.countryOption, group?.id === country.id && styles.selectedOption, pressed && s.pressed]}>
            <CountryLabel label={country.countryTitle} code={country.countryCode} textStyle={[styles.countryLabel, group?.id === country.id && styles.selectedLabel]} style={styles.countryCopy} />
            {group?.id === country.id && <Ionicons name="checkmark-circle" size={17} color={colors.accent} accessible={false} aria-hidden />}
          </Pressable>
        </GlassSurface>)}
      </View>
    </View>}
    {group && group.addresses.length > 1 && <View style={s.field}>
      <Text style={s.label}>{t('live.addresses.type')}</Text>
      <GlassSurface style={styles.addressOptions}>
        <View style={styles.addressOptionList} accessibilityRole="radiogroup" accessibilityLabel={t('live.addresses.type')}>
          {group.addresses.map(address => <Pressable key={address.id} accessibilityRole="radio" accessibilityLabel={`${addressLabel(address)}${address.active === false ? ` · ${t('live.addresses.inactive')}` : ''}`} aria-checked={selected?.id === address.id} accessibilityState={{ checked: selected?.id === address.id }} onPress={() => setSelectedAddressIds(previous => ({ ...previous, [group.id]: address.id }))} style={({ pressed }) => [styles.addressOption, selected?.id === address.id && styles.selectedAddress, pressed && s.pressed]}>
            <Ionicons name={address.kind === 'private' ? 'person-outline' : address.kind === 'storage' ? 'business-outline' : 'location-outline'} size={18} color={selected?.id === address.id ? colors.accent : colors.muted} accessible={false} aria-hidden />
            <View style={styles.optionCopy}><Text style={[styles.typeLabel, selected?.id === address.id && styles.selectedLabel]}>{addressLabel(address, true)}</Text>{address.active === false && <Text style={styles.inactiveLabel}>{t('live.addresses.inactive')}</Text>}</View>
          </Pressable>)}
        </View>
      </GlassSurface>
    </View>}
    {selected?.active === false && <Notice error>{t('live.addresses.inactiveWarning')}</Notice>}
    {selected && <AddressCard key={`${selected.id}:${resource.updatedAt}:${selected.active}:${language}`} title={addressLabel(selected)} countryCode={selected.countryCode} headerCountryFlag={false} fields={selected.fields} copyEnabled={selected.active !== false} />}
    {selected?.notifications?.map((notification, index) => {
      const error = notification.type === 'danger' || notification.type === 'error';
      return <View key={`${selected.id}:notification:${index}:${language}`} accessibilityRole={error ? 'alert' : undefined} style={[styles.serverNote, error && styles.serverNoteWarning]}>
        <Ionicons name={error ? 'alert-circle-outline' : 'information-circle-outline'} size={19} color={error ? colors.error : colors.muted} accessible={false} aria-hidden />
        <Text selectable style={[styles.serverNoteText, error && styles.error]}>{plainServerText(notification.text)}</Text>
      </View>;
    })}
    {addresses?.length === 0 && !resource.loading && !resource.error && <EmptyState icon="location-outline" title={t('live.addresses.emptyTitle')} text={t('live.addresses.emptyText')} />}
  </Screen>;
}

export function LiveRecipientAddresses({ resource, onRefresh }: LiveResourceProps<LiveRecipientAddress[]>) {
  const { t, language, formatNumber } = useI18n();
  const [search, setSearch] = useState('');
  const filtered = resource.data?.filter(address => [address.name, ...postalAddressFields(address.fields).map(field => field.value)].join(' ').toLocaleLowerCase(language).includes(search.trim().toLocaleLowerCase(language)));
  return <Screen title={t('live.recipients.title')} subtitle={t('live.recipients.subtitle')}>
    <ResourceStatus resource={resource} onRefresh={onRefresh} />
    <Button onPress={() => router.push('/recipient/new')}>{t('accountOps.newRecipient')}</Button>
    <Field label={t('accountOps.recipientSearch')} value={search} onChangeText={setSearch} autoCorrect={false} />
    {filtered?.map((address, index) => <View key={`${address.id}:${resource.updatedAt}:${language}`} style={{ gap: 6 }}><AddressCard title={address.name || t('live.recipients.fallback', { number: formatNumber(index + 1) })} fields={address.fields} />{address.isEditable === true ? <Button secondary disabled={resource.loading || !!resource.error} onPress={() => router.push({ pathname: '/recipient/[id]', params: { id: address.id } })}>{t('accountOps.editRecipient')}</Button> : <Notice>{t(address.isEditable === false ? 'accountOps.recipientReadOnly' : 'accountOps.recipientPermissionUnavailable')}</Notice>}</View>)}
    {filtered?.length === 0 && !!search.trim() && <Notice>{t('live.noResults')}</Notice>}
    {resource.data?.length === 0 && !resource.loading && !resource.error && <EmptyState icon="location-outline" title={t('live.recipients.emptyTitle')} text={t('live.recipients.emptyText')} />}
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  countryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countrySurface: { flexBasis: '48%', flexGrow: 1, minWidth: 120, borderRadius: 18, borderColor: colors.glassBorder },
  selectedSurface: { borderColor: colors.accentBorder },
  countryOption: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, padding: 10, minHeight: 60 },
  countryCopy: { flex: 1 }, countryLabel: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  selectedOption: { backgroundColor: colors.accentSoft }, selectedLabel: { color: colors.accentText },
  addressOptions: { borderRadius: 18, padding: 4, borderColor: colors.glassBorder },
  addressOptionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  addressOption: { flexBasis: '45%', flexGrow: 1, minHeight: minTouchTarget, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  selectedAddress: { backgroundColor: colors.accentSoft }, optionCopy: { flexShrink: 1, gap: 2 }, typeLabel: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '600' }, inactiveLabel: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  serverNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft },
  serverNoteWarning: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }, serverNoteText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 22 },
  card: { padding: 0, gap: 0, overflow: 'hidden' }, cardHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: 14 }, headerCopy: { flex: 1, minWidth: 110, gap: 3 },
  copyAll: { minHeight: minTouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.soft }, copyAllLabel: { fontSize: 12, fontWeight: '600', color: colors.accent },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 70, paddingVertical: 11, paddingLeft: 14, paddingRight: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, fieldCopy: { flex: 1, gap: 4 },
  fieldLabel: { color: colors.muted, fontSize: 12, lineHeight: 17 }, fieldValue: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  copyButton: { minWidth: 48, minHeight: 48, paddingHorizontal: 4, paddingVertical: 5, gap: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, copied: { backgroundColor: colors.accentSoft }, copiedLabel: { color: colors.accent, fontSize: 10, fontWeight: '600' },
  feedback: { paddingHorizontal: 14, paddingTop: 3, paddingBottom: 12 }, error: { color: colors.error }, disabled: { opacity: 0.35 },
});
