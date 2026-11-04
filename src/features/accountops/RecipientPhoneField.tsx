import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { AddressFormats } from '@/api/account-operations';
import { recipientFieldLabel } from '@/api/recipient-rules';
import { CountryLabel } from '@/components/CountryFlag';
import { phoneCodeOptions, searchPhoneCodes } from '@/domain/phone-code-options';
import { useI18n } from '@/i18n/context';
import { Field, minTouchTarget, useUi } from '@/ui';

export function RecipientPhoneField({ code, phone, countryId, formats, disabled, onCodeChange, onPhoneChange, codeError, phoneError }: { code: string; phone: string; countryId: string; formats: AddressFormats; disabled: boolean; onCodeChange: (value: string) => void; onPhoneChange: (value: string) => void; codeError?: string; phoneError?: string }) {
  const { t, language } = useI18n(); const { colors, s } = useUi();
  const phoneLabel = recipientFieldLabel(formats, countryId, 'shipping_phone') || t('field.phone');
  const codeLabel = recipientFieldLabel(formats, countryId, 'shipping_phone_code') || t('accountOps.phoneCode');
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const options = phoneCodeOptions(formats, language); const matches = searchPhoneCodes(options, search);
  const selected = options.find(option => option.callingCode === code && option.countryId === countryId) || options.find(option => option.callingCode === code);
  return <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={[s.field, { width: 100 }]}>
        <Text style={s.label}>{codeLabel}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t('accountOps.phoneCode')}: ${code || t('accountOps.choose')}${selected ? `, ${selected.title}` : ''}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setOpen(value => !value); setSearch(''); }} style={[s.input, { paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }, codeError ? { borderColor: colors.error } : undefined]}>
          <Text style={{ color: colors.text, fontSize: 16, flexShrink: 1 }}>{code || '+'}</Text><Text style={s.small}>{open ? '−' : '+'}</Text>
        </Pressable>
        {codeError && <Text accessibilityRole="alert" style={[s.small, { color: colors.error }]}>{t(codeError)}</Text>}
      </View>
      <View style={{ flex: 1 }}><Field label={phoneLabel} value={phone} onChangeText={onPhoneChange} keyboardType="phone-pad" autoComplete="tel-national" textContentType="telephoneNumber" editable={!disabled} error={phoneError ? t(phoneError) : undefined} /></View>
    </View>
    {open && <View style={s.card}>
      <Field label={t('accountSettings.phoneSearch')} value={search} onChangeText={setSearch} autoCorrect={false} editable={!disabled} autoCapitalize="none" />
      <ScrollView accessibilityRole="radiogroup" accessibilityLabel={t('accountOps.phoneCode')} style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {matches.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${option.title}, ${option.callingCode}`} accessibilityState={{ checked: option.id === selected?.id, disabled }} aria-checked={option.id === selected?.id} disabled={disabled} onPress={() => { onCodeChange(option.callingCode); setOpen(false); setSearch(''); }} style={{ minHeight: minTouchTarget, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, backgroundColor: option.id === selected?.id ? colors.soft : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1 }}><CountryLabel label={option.title} code={option.countryCode} textStyle={s.body} /></View><Text style={s.body}>{option.callingCode}</Text></Pressable>)}
        {matches.length === 0 && <Text style={s.small}>{t('accountOps.noOptions')}</Text>}
      </ScrollView>
    </View>}
  </View>;
}
