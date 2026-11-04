import { AccountSettingsHub } from './AccountSettingsHub';
import { AccountPickupQrAction } from '@/features/accountops/AccountPickupQr';
import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { router, useIsFocused, type Href } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveAccount } from '@/api/context';
import type { ParcelQuery } from '@/api/parcel-pagination';
import type { LiveParcel, LiveParcelStage } from '@/api/contracts';
import { Button, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { LiveAccount, LiveAddresses, LiveBalanceScreen, LiveParcelList, LiveRecipientAddresses } from './index';
import { displayMoney } from './shared';
import { useI18n } from '@/i18n/context';
import { CompactLink, useCompactStyles } from '@/features/dashboard/components';
import { OverviewBenefits, OverviewFinancialSummary, OverviewReceived } from '@/features/dashboard/AccountOverview';
import { GlassSurface } from '@/navigation/GlassSurface';
import { sortCurrencies } from '@/domain/option-order';
import { parcelFilterCountries } from './parcel-filter-countries';
import { useShellNavigation } from '@/navigation/context';
import { usePageLoad } from '@/navigation/PageLoading';

export function LiveParcelsRoute({ stage }: { stage: LiveParcelStage }) {
  const { parcelPages, resources, setParcelQuery, loadParcelPage, refresh, canMutate, mutationPending, authenticated } = useLiveAccount();
  const focused = useIsFocused();
  const page = parcelPages[stage];
  const pending = focused && authenticated && (page.loading || (page.items === null && page.error === null && page.updatedAt === null));
  usePageLoad(pending, pending && page.items === null);
  const displayPage = { ...page, countries: parcelFilterCountries(stage, page.countries, resources.addresses.data || []) };
  useEffect(() => { if (focused && page.items === null && !page.loading && !page.error) void refresh([stage]); }, [focused, stage, page.items, page.loading, page.error, refresh]);
  const onQueryChange = useCallback((query: Partial<ParcelQuery>) => setParcelQuery(stage, query), [stage, setParcelQuery]);
  const onPageChange = useCallback((number: number) => loadParcelPage(stage, number), [stage, loadParcelPage]);
  const openParcel = (parcel: LiveParcel) => {
    if (stage === 'waiting') router.push({ pathname: '/incoming/[id]', params: { id: parcel.id } });
    else if (stage === 'warehouse') router.push({ pathname: '/warehouse/[id]', params: { id: parcel.id } });
    else router.push({ pathname: '/shipment/[id]', params: { id: parcel.id, section: stage === 'received' ? 'received' : 'shipments' } });
  };
  return <LiveParcelList key={`${resources.profile.data?.id || 'anonymous'}:${stage}`} shipment={stage === 'warehouse' ? { stock: resources.warehouse, canCreate: canMutate && !mutationPending, onCreate: ids => router.push({ pathname: '/shipment/new', params: { ids: ids.join(',') } }) } : undefined} stage={stage} page={displayPage} onQueryChange={onQueryChange} onPageChange={onPageChange} onRefresh={() => { void refresh([stage]); }} onOpen={openParcel} onCreate={stage === 'waiting' ? () => router.push('/incoming/new') : undefined} />;
}
export function LiveAddressesRoute() {
  const { resources, refresh } = useLiveAccount();
  return <LiveAddresses resource={resources.addresses} onRefresh={() => { void refresh(['addresses']); }} />;
}
export function LiveRecipientsRoute() {
  const { resources, refresh } = useLiveAccount();
  return <LiveRecipientAddresses resource={resources.recipients} onRefresh={() => { void refresh(['recipients']); }} />;
}
export function LiveBalanceRoute() {
  const { resources, refresh } = useLiveAccount();
  return <LiveBalanceScreen resource={resources.balance} onRefresh={() => { void refresh(['balance']); }} />;
}
export function LiveAccountRoute() {
  const { resources, refresh, logout } = useLiveAccount();
  return <LiveAccount resource={resources.profile} onRefresh={() => { void refresh(['profile']); }} onLogout={() => { void logout(); }} />;
}
export function LiveOverviewRoute() {
  const compact = useCompactStyles();
  const { colors, s } = useUi();
  const overview = useThemeStyles(makeOverview);
  const { resources, refresh, notice } = useLiveAccount();
  const { t, formatNumber, formatUpdatedAt } = useI18n();
  const shell = useShellNavigation();
  const open = (href: Href) => { if (shell) shell.navigate(href); else router.navigate(href); };
  const currentBalances = resources.balance.data?.balances;
  const balances = currentBalances ? sortCurrencies(currentBalances, item => item.currency) : currentBalances;
  const failedStages = (['waiting', 'warehouse', 'sent', 'received'] as const).filter(stage => resources[stage].error).map(stage => t(`stage.${stage}`));
  const name = resources.profile.data?.firstName;
  return <Screen title={name ? t('live.overview.greeting', { name }) : t('live.overview.title')} titleAction={<AccountPickupQrAction />} subtitle={t('live.overview.subtitle')}>
    {notice && <Notice>{t(notice)}</Notice>}
    {resources.profile.error && <Notice error>{t(resources.profile.error)}</Notice>}
    <GlassSurface style={overview.card}>
      <View style={overview.balanceHeader}>
        <View style={overview.heading}><Ionicons name="wallet-outline" size={20} color={colors.muted} accessible={false} /><Text accessibilityRole="header" style={overview.headingText}>{t('live.overview.accountBalance')}</Text></View>
        {resources.balance.loading && <ActivityIndicator size="small" color={colors.muted} />}
      </View>
      {!!balances?.length ? <View style={overview.balances}>{balances.map(balance => <View key={balance.currency} style={overview.balanceRow}>
        <Text style={overview.currency}>{balance.currency || t('common.unavailable')}</Text><Text selectable style={overview.amount}>{displayMoney(balance.amount, null, formatNumber)}</Text>
      </View>)}</View> : <Text style={overview.unavailable}>{t(resources.balance.loading ? 'live.loadingShort' : balances?.length === 0 ? 'live.balance.noBalances' : 'live.temporarilyUnavailable')}</Text>}
      {resources.balance.updatedAt !== null && <Text style={overview.updated}>{formatUpdatedAt(resources.balance.updatedAt)}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={t('live.overview.balanceLink')} onPress={() => open('/balance')} style={({ pressed }) => [overview.balanceLink, pressed && s.pressed]}><Text style={overview.linkText}>{t('navigation.balance')}</Text><Ionicons name="chevron-forward" size={17} color={colors.muted} accessible={false} /></Pressable>
    </GlassSurface>
    {resources.balance.error && <Notice error>{t(resources.balance.error)}{resources.balance.data ? `\n${t('live.stale')}` : ''}</Notice>}
    {resources.balance.data?.balancesError && <Notice error>{t('live.balance.currentError', { error: t(resources.balance.data.balancesError) })}</Notice>}
    {(resources.profile.error || resources.balance.error || resources.balance.data?.balancesError) && <Button secondary disabled={resources.profile.loading || resources.balance.loading} onPress={() => { void refresh(['profile', 'balance']); }}>{t('live.retry')}</Button>}
    <OverviewFinancialSummary />
    <OverviewReceived open={open} />
    <OverviewBenefits open={open} />
    <Text accessibilityRole="header" style={overview.sectionTitle}>{t('live.overview.quickActions')}</Text>
    <GlassSurface style={[overview.card, compact.group]}>
      <CompactLink icon="receipt-outline" title={t('accountOps.payments')} detail={t('live.overview.invoicesHint')} onPress={() => open('/payments')} />
      <CompactLink icon="business-outline" title={t('live.addresses.title')} detail={t('live.overview.addressesHint')} onPress={() => open('/warehouse-addresses')} />
      <CompactLink icon="add-circle-outline" title={t('live.overview.addParcel')} detail={t('live.overview.addParcelHint')} onPress={() => router.push('/incoming/new')} last />
    </GlassSurface>
    {failedStages.length > 0 && <Notice error>{t('live.overview.parcelsError', { stages: failedStages.join(', ') })}</Notice>}
  </Screen>;
}

const makeOverview = (colors: ThemeColors) => StyleSheet.create({
  card: { borderColor: colors.glassBorder },
  balanceHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headingText: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '600', flexShrink: 1 },
  balances: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8, gap: 2 },
  balanceRow: { minHeight: 32, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  currency: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  amount: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600', fontVariant: ['tabular-nums'], flexShrink: 1 },
  unavailable: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 12 },
  updated: { color: colors.muted, fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingBottom: 10 },
  balanceLink: { minHeight: Math.max(46, minTouchTarget), paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  linkText: { color: colors.text, fontSize: 13, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
  sectionTitle: { color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '600', paddingHorizontal: 2, paddingTop: 2 },
});
export function LiveSettingsRoute() { return <AccountSettingsHub />; }
