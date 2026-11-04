import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Href } from 'expo-router';
import { loyaltyData } from '@/api/account-operations';
import { useAccountView } from '@/features/accountops/shared';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { displayMoney } from '@/features/live/shared';
import { CountryLabel } from '@/components/CountryFlag';
import { ServiceIdentity } from '@/components/ServiceIdentity';
import { countryDisplayName } from '@/domain/presentation-labels';
import { sortCountries } from '@/domain/option-order';
import { overviewBenefit, overviewBonusCountdown, visibleOverviewBonuses } from '@/domain/overview-benefits';
import { loyaltyCountdown } from '@/domain/loyalty-summary';
import { useI18n } from '@/i18n/context';
import { GlassSurface } from '@/navigation/GlassSurface';
import { useThemeStyles } from '@/theme/context';
import type { ThemeColors } from '@/theme/palette';
import { minTouchTarget, useUi } from '@/ui';

// The aggregate is an additive server proposal, not currently deployed. Do not
// probe a known unsupported route or substitute funding/history for expenditure.
const summaryEnabled = process.env.EXPO_PUBLIC_BAYSHOP_OVERVIEW_SUMMARY === '1';

function useElapsed(snapshot: number | null, enabled: boolean) {
  const [clock, setClock] = useState<{ snapshot: number | null; elapsed: number }>({ snapshot: null, elapsed: 0 });
  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const timer = setInterval(() => setClock({ snapshot, elapsed: Math.max(0, performance.now() - start) }), 30_000);
    return () => clearInterval(timer);
  }, [snapshot, enabled]);
  return clock.snapshot === snapshot ? clock.elapsed : 0;
}

export function OverviewReceived({ open }: { open: (href: Href) => void }) {
  const { resource } = useOperationView({ kind: 'dashboard.counters' });
  const { t, formatNumber } = useI18n();
  const styles = useThemeStyles(makeStyles); const { colors, s } = useUi();
  return <GlassSurface style={styles.card}><Pressable accessibilityRole="button" onPress={() => open('/received')} style={({ pressed }) => [styles.received, pressed && s.pressed]}>
    <Ionicons name="checkmark-circle-outline" size={21} color={colors.muted} accessible={false} />
    <Text style={styles.label}>{t('overview.received')}</Text>
    {resource.loading && !resource.data ? <ActivityIndicator size="small" color={colors.muted} /> : <Text style={styles.receivedCount}>{resource.data ? formatNumber(resource.data.received, { maximumFractionDigits: 0 }) : '—'}</Text>}
    <Ionicons name="chevron-forward" size={16} color={colors.muted} accessible={false} />
  </Pressable></GlassSurface>;
}

export function OverviewFinancialSummary() {
  const { resource } = useOperationView(summaryEnabled ? { kind: 'dashboard.summary' } : null);
  const { t, formatNumber, formatDate } = useI18n();
  const styles = useThemeStyles(makeStyles);
  const elapsed = useElapsed(resource.updatedAt, !!resource.data?.availableBonuses?.some(item => item.expiresAt));
  const data = !resource.error ? resource.data : null;
  const spent = data?.lifetimeSettledCharges;
  const bonuses = visibleOverviewBonuses(data, elapsed);
  // Omit unavailable aggregates. A missing server metric is not a zero account.
  if (!spent?.length && !bonuses.length) return null;
  return <GlassSurface style={styles.card}>
    {!!spent?.length && <View style={styles.section}>
      <View style={styles.heading}><Text accessibilityRole="header" style={styles.headingText}>{t('overview.spent')}</Text><Text style={styles.caption}>{t('overview.spentPeriod')}</Text></View>
      <View style={styles.moneyGrid}>{spent.map(item => <View key={item.currency} style={styles.moneyCell}><Text style={styles.caption}>{item.currency}</Text><Text selectable style={styles.amount}>{displayMoney(item.amount, null, formatNumber)}</Text></View>)}</View>
    </View>}
    {!!bonuses.length && <View style={[styles.section, !!spent?.length && styles.divider]}>
      <Text accessibilityRole="header" style={styles.headingText}>{t('overview.bonuses')}</Text>
      {bonuses.map(bonus => { const countdown = overviewBonusCountdown(bonus, data!, elapsed); const expiryDate = bonus.expiresAt ? formatDate(bonus.expiresAt) : null; return <View key={bonus.currency} style={styles.bonusRow}>
        <View style={styles.row}><Text style={styles.caption}>{bonus.currency}</Text><Text selectable style={styles.amount}>{displayMoney(bonus.amount, null, formatNumber)}</Text></View>
        {expiryDate && <Text style={styles.caption}>{t('overview.bonusValidUntil', { date: expiryDate })}</Text>}
        {countdown && !countdown.expired && <Text style={styles.caption}>{t('overview.expiry', { days: countdown.days, hours: countdown.hours, minutes: countdown.minutes })}</Text>}
      </View>; })}
    </View>}
  </GlassSurface>;
}

export function OverviewBenefits({ open }: { open: (href: Href) => void }) {
  const { resource } = useAccountView({ kind: 'loyalty.read' }, loyaltyData);
  const { t, language, formatNumber } = useI18n();
  const styles = useThemeStyles(makeStyles); const { colors, s } = useUi();
  const programs = !resource.error && resource.data ? sortCountries(resource.data, item => ({ code: item.countryCode, id: item.id })) : [];
  const elapsed = useElapsed(resource.updatedAt, programs.some(item => !!overviewBenefit(item).validity?.expiresAt));
  const groups = new Map<string, typeof programs>();
  programs.forEach(program => { const key = program.countryCode.toUpperCase(); groups.set(key, [...groups.get(key) || [], program]); });
  return <GlassSurface style={styles.card}>
    {!!programs.length && <>
      <Text accessibilityRole="header" style={[styles.headingText, styles.benefitsTitle]}>{t('overview.benefits')}</Text>
      {[...groups].map(([code, countryPrograms]) => <View key={code} style={styles.countryGroup}>
        <CountryLabel code={code} label={countryDisplayName(code, code, language)} size="small" textStyle={styles.country} />
        {countryPrograms.map(program => { const benefit = overviewBenefit(program); const countdown = loyaltyCountdown(benefit.validity, elapsed); return <View key={program.id} style={styles.service}>
          <View style={styles.serviceName}><ServiceIdentity title={program.title || t('loyalty.carrier')} logoUrl={program.iconUrl} textStyle={styles.serviceText} /></View>
          <View style={styles.benefitValues}>
            {!countdown?.expired && <Text style={styles.discount}>{t('overview.discount', { percent: formatNumber(benefit.discount, { maximumFractionDigits: 2 }) })}</Text>}
            {benefit.rate && !countdown?.expired && <Text style={styles.caption}>{t('loyalty.perKg', { price: displayMoney(benefit.rate.amount, benefit.rate.currency, formatNumber) })}</Text>}
            {countdown && <Text style={styles.caption}>{t(countdown.expired ? 'overview.expired' : 'overview.expiry', { days: countdown.days, hours: countdown.hours, minutes: countdown.minutes })}</Text>}
          </View>
        </View>; })}
      </View>)}
    </>}
    <Pressable accessibilityRole="button" onPress={() => open('/loyalty')} style={({ pressed }) => [styles.link, !!programs.length && styles.divider, pressed && s.pressed]}><Text style={styles.label}>{t(programs.length ? 'accountOps.loyalty' : 'overview.benefitsUnavailable')}</Text>{resource.loading && !programs.length ? <ActivityIndicator size="small" color={colors.muted} /> : <Ionicons name="chevron-forward" size={16} color={colors.muted} accessible={false} />}</Pressable>
  </GlassSurface>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { borderColor: colors.glassBorder },
  received: { minHeight: minTouchTarget, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  label: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '500', minWidth: 0 },
  receivedCount: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  section: { padding: 16, gap: 9 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  headingText: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  moneyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  moneyCell: { minWidth: '42%', flexGrow: 1, gap: 2 },
  amount: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600', fontVariant: ['tabular-nums'] },
  caption: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  bonusRow: { gap: 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  benefitsTitle: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 4 },
  countryGroup: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 11, gap: 5 },
  country: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  service: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 10, rowGap: 2 },
  serviceName: { flex: 1, minWidth: 110 },
  serviceText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  benefitValues: { flex: 1, minWidth: 120, alignItems: 'flex-end', gap: 1 },
  discount: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'right' },
  link: { minHeight: minTouchTarget, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, gap: 10 },
});
