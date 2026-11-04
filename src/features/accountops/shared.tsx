import { ServiceIdentity } from '@/components/ServiceIdentity';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CountryLabel } from '@/components/CountryFlag';
import { localizeCountryOptions, sortCountryOptions, sortCurrencies } from '@/domain/option-order';
import { currencyDisplayLabel } from '@/domain/presentation-labels';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import type { ReadCommand } from '@/api/operations-contracts';
import type { ServerOption } from '@/api/account-operations';
import type { Resource } from '@/api/service';
import { useI18n } from '@/i18n/context';
import { usePageLoad } from '@/navigation/PageLoading';
import { Button, Field, Notice, minTouchTarget, useUi } from '@/ui';

export function useAccountView<T>(query: ReadCommand, decode: (raw: unknown) => T, options: { preserveOnAccountRevision?: boolean } = {}) {
  const { readView, language, authenticated, accountId, accountRevision } = useLiveAccount();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; resource: Resource<T> } | null>(null);
  const args = useRef({ query, decode });
  useLayoutEffect(() => { args.current = { query, decode }; }, [query, decode]);
  const queryKey = JSON.stringify(query);
  // Only the active region editor opts out: its own explicit readback keeps
  // the pending form mounted. Other views must discard the old country scope.
  const requestKey = JSON.stringify([queryKey, language, authenticated, accountId, options.preserveOnAccountRevision ? 0 : accountRevision, revision]);
  useEffect(() => {
    const controller = new AbortController();
    if (!authenticated) return () => controller.abort();
    const current = args.current;
    void readView(current.query, { signal: controller.signal }).then(raw => {
      if (!controller.signal.aborted) setResult({ key: requestKey, resource: { data: current.decode(raw), loading: false, error: null, updatedAt: Date.now() } });
    }).catch(error => { if (!controller.signal.aborted) setResult({ key: requestKey, resource: { data: null, loading: false, error: errorMessage(error), updatedAt: null } }); });
    return () => controller.abort();
  }, [requestKey, readView, authenticated]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const resource: Resource<T> = result?.key === requestKey ? result.resource : { data: null, loading: authenticated, error: null, updatedAt: null };
  const pending = authenticated && (resource.loading || (resource.data === null && resource.error === null && resource.updatedAt === null));
  usePageLoad(pending, pending && resource.data === null);
  return { resource, reload };
}

export function OptionPicker({ label, value, options, onChange, disabled = false, error, country = false, service = false, currency = false }: { label: string; value: string; options: (ServerOption & { countryCode?: string | null; logoUrl?: string | null })[]; onChange: (value: string) => void; disabled?: boolean; error?: string; country?: boolean; service?: boolean; currency?: boolean }) {
  const { colors, s } = useUi();
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ordered = country ? sortCountryOptions(localizeCountryOptions(options, language)) : currency ? [...options.filter(option => option.id === 'all' || option.id === ''), ...sortCurrencies(options.filter(option => option.id !== 'all' && option.id !== ''), option => option.title).map(option => ({ ...option, title: currencyDisplayLabel(option.title) }))] : options;
  const selected = ordered.find(option => option.id === value);
  const matches = ordered.filter(option => option.title.toLocaleLowerCase(language).includes(search.trim().toLocaleLowerCase(language)));
  return <View style={s.field}><Text style={s.label}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.title || t('accountOps.choose')}`} aria-expanded={open} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setOpen(!open); setSearch(''); }} style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' }]}><View style={{ flex: 1 }}>{country && selected ? <CountryLabel label={selected.title} code={selected.countryCode || selected.code || (/^[A-Za-z]{2}$/.test(selected.id) ? selected.id : undefined)} textStyle={s.body} /> : service && selected ? <ServiceIdentity title={selected.title} logoUrl={selected.logoUrl} /> : <Text style={s.body}>{selected?.title || t('accountOps.choose')}</Text>}</View><Text style={s.small}>{open ? '−' : '+'}</Text></Pressable>
    {open && <View style={s.card}>{options.length > 7 && <Field label={t('accountOps.search')} value={search} onChangeText={setSearch} autoCorrect={false} editable={!disabled} />}
      <ScrollView accessibilityRole="radiogroup" accessibilityLabel={label} style={{ maxHeight: 230 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">{matches.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.title} aria-checked={option.id === value} accessibilityState={{ checked: option.id === value, disabled }} disabled={disabled} onPress={() => { onChange(option.id); setOpen(false); setSearch(''); }} style={{ minHeight: minTouchTarget, padding: 12, backgroundColor: option.id === value ? colors.soft : 'transparent', borderRadius: 8 }}><>{country ? <CountryLabel label={option.title} code={option.countryCode || option.code || (/^[A-Za-z]{2}$/.test(option.id) ? option.id : undefined)} textStyle={s.body} /> : service ? <ServiceIdentity title={option.title} logoUrl={option.logoUrl} /> : <Text style={s.body}>{option.title}</Text>}</></Pressable>)}{matches.length === 0 && <Text style={s.small}>{t('accountOps.noOptions')}</Text>}</ScrollView></View>}
    {error && <Text accessibilityRole="alert" style={[s.small, { color: colors.error }]}>{t(error)}</Text>}
  </View>;
}
export function MutationFeedback({ error, saved, unknown, onCheck }: { error: string | null; saved?: boolean; unknown?: boolean; onCheck?: () => void }) {
  const { t } = useI18n();
  return <>{error && <Notice error>{t(error)}</Notice>}{unknown && <><Notice error>{t('accountOps.unknown')}</Notice>{onCheck && <Button secondary onPress={onCheck}>{t('accountOps.check')}</Button>}</>}{saved && <Notice>{t('accountOps.saved')}</Notice>}</>;
}
