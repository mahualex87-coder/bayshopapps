import { currencyDisplayLabel } from '@/domain/presentation-labels';
import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { CountryLabel } from '@/components/CountryFlag';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button, Notice, useUi } from '@/ui';
import { useI18n } from '@/i18n/context';
import { usePageLoad } from '@/navigation/PageLoading';

export type LiveResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
};

export type LiveResourceProps<T> = {
  resource: LiveResource<T>;
  onRefresh: () => void;
};

export function displayMoney(amount: number, currency: string | null, formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string): string {
  const value = formatNumber(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${value} ${currencyDisplayLabel(currency)}` : value;
}

export function ResourceStatus<T>({ resource, onRefresh }: LiveResourceProps<T>) {
  usePageLoad(resource.loading, resource.loading && resource.data === null);
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, formatUpdatedAt } = useI18n();
  return <>
    <View style={styles.statusRow}>
      <View style={styles.statusCopy}>
        {resource.loading ? <View style={styles.loadingRow}><ActivityIndicator color={colors.accent} size="small" /><Text style={s.small}>{t('live.refresh.loading')}</Text></View> : <Text style={s.small}>{resource.updatedAt !== null ? formatUpdatedAt(resource.updatedAt) : t('live.source')}</Text>}
      </View>
    </View>
    {resource.error && <><Notice error>{t(resource.error)}{resource.data !== null ? `\n${t('live.stale')}` : ''}</Notice><Button secondary disabled={resource.loading} onPress={onRefresh}>{t('live.retry')}</Button></>}
    {resource.data === null && resource.loading && <View accessibilityLiveRegion="polite" style={styles.loadingCard}><ActivityIndicator color={colors.accent} /><Text style={s.body}>{t('live.loading')}</Text></View>}
    {resource.data === null && !resource.loading && !resource.error && <Notice>{t('live.unloaded')}</Notice>}
  </>;
}

export function EmptyState({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  return <View style={[s.card, styles.empty]}><Ionicons name={icon} size={30} color={colors.muted} /><Text style={s.heading}>{title}</Text><Text style={[s.small, styles.center]}>{text}</Text></View>;
}

export function DetailRow({ label, value, country = false, countryCode, countryName }: { label: string; value: string | null; country?: boolean; countryCode?: string | null; countryName?: string | null }) {
  const styles = useThemeStyles(makeStyles);
  const { t } = useI18n();
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><>{country && value ? <CountryLabel label={value} code={countryCode} name={countryName} selectable textStyle={styles.detailValue} /> : <Text selectable style={[styles.detailValue, !value && styles.muted]}>{value || t('live.unavailable')}</Text>}</></View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  statusCopy: { flexGrow: 1 }, loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingCard: { padding: 26, gap: 12, alignItems: 'center' }, empty: { paddingVertical: 24, alignItems: 'center' }, center: { textAlign: 'center' },
  detailRow: { paddingVertical: 10, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  detailLabel: { color: colors.muted, fontSize: 12 }, detailValue: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '500' }, muted: { color: colors.muted },
});
