import { accountCurrencyChoices, visibleCurrencySelection } from '@/domain/account-currency-visibility';
import { currencyDisplayLabel } from '@/domain/presentation-labels';
import { sortCurrencies } from '@/domain/option-order';
import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native';
import type { LiveBalance, LiveTransaction } from '@/api/contracts';
import type { BalanceHistoryPeriod } from '@/api/operations-contracts';
import { TRANSACTION_HISTORY_PAGE_SIZE, transactionDirection, transactionHistoryPage, type TransactionHistoryDirection } from '@/domain/transaction-history';
import { OptionPicker } from '@/features/accountops/shared';
import { GlassSurface } from '@/navigation/GlassSurface';
import { Button, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { useI18n } from '@/i18n/context';
import { EmptyState, displayMoney, type LiveResourceProps } from './shared';
import { useBalanceHistory } from './useBalanceHistory';

const periods: BalanceHistoryPeriod[] = ['one', '7', '1', '3', '6', 'all'];
const directions: TransactionHistoryDirection[] = ['all', 'debit', 'credit'];
function statusLabel(status: string, t: (key: string) => string) {
  return status === 'paid' || status === 'unpaid' ? t(`status.${status}`) : status;
}

function Transaction({ transaction }: { transaction: LiveTransaction }) {
  const { s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, formatDate, formatTime, formatNumber } = useI18n();
  const direction = transactionDirection(transaction.amount);
  // A settled credit is money added to the account, not an invoice paid by
  // the customer. Keep other server statuses, including unsettled credits.
  const status = transaction.status && !(direction === 'credit' && transaction.status === 'paid') ? statusLabel(transaction.status, t) : null;
  const date = formatDate(transaction.date);
  // Date-only records do not acquire a fabricated midnight time.
  const time = transaction.date && /[T ]\d{2}:\d{2}/.test(transaction.date) ? formatTime(transaction.date) : null;
  return <View style={styles.transaction}>
    <View style={styles.transactionTop}>
      <Text selectable style={[styles.amount, direction === 'credit' && styles.credit, direction === 'debit' && styles.debit]}>{transaction.amount > 0 ? '+' : ''}{displayMoney(transaction.amount, null, formatNumber)}{transaction.currency ? <Text style={styles.currency}>{` ${currencyDisplayLabel(transaction.currency)}`}</Text> : null}</Text>
      {status && <Text style={[s.status, styles.transactionStatus, transaction.status === 'unpaid' && styles.unpaid]}>{status}</Text>}
    </View>
    <Text selectable style={styles.transactionLabel}>{transaction.label || t('live.balance.transaction')}</Text>
    <View style={styles.transactionMeta}>
      {date && <Text style={s.small}>{time && time !== date ? `${date} · ${time}` : date}</Text>}
      {transaction.id && <Text selectable style={s.small}>{t('balanceHistory.reference', { reference: transaction.id })}</Text>}
    </View>
  </View>;
}

function HistoryPager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, formatNumber } = useI18n();
  if (pageCount <= 1) return null;
  return <View style={styles.pagination}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('balanceHistory.previous')} accessibilityState={{ disabled: page <= 1 }} disabled={page <= 1} onPress={() => onPage(page - 1)} style={({ pressed }) => [styles.pageButton, page <= 1 && styles.disabled, pressed && s.pressed]}><Ionicons name="chevron-back" size={19} color={colors.accent} accessible={false} aria-hidden /></Pressable>
    <Text accessibilityLiveRegion="polite" style={[s.small, styles.pageText]}>{t('balanceHistory.page', { page: formatNumber(page), pages: formatNumber(pageCount) })}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={t('balanceHistory.next')} accessibilityState={{ disabled: page >= pageCount }} disabled={page >= pageCount} onPress={() => onPage(page + 1)} style={({ pressed }) => [styles.pageButton, page >= pageCount && styles.disabled, pressed && s.pressed]}><Ionicons name="chevron-forward" size={19} color={colors.accent} accessible={false} aria-hidden /></Pressable>
  </View>;
}

export function LiveBalanceScreen({ resource }: LiveResourceProps<LiveBalance>) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, countt, formatNumber, formatUpdatedAt } = useI18n();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const historyOffset = useRef(0);
  const [period, setPeriod] = useState<BalanceHistoryPeriod>('1');
  const history = useBalanceHistory(period);
  const [filters, setFilters] = useState({ scope: history.scope, currency: 'all', status: 'all', direction: 'all' as TransactionHistoryDirection, page: 1 });
  const data = resource.data;
  const historyData = history.resource.data;
  const confirmedBalances = !resource.loading && !resource.error && !data?.balancesError ? data?.balances ?? null : null;
  const currencyChoices = useMemo(() => sortCurrencies(accountCurrencyChoices([...new Set(historyData?.transactions.map(item => item.currency) || [])], confirmedBalances), code => code), [historyData?.transactions, confirmedBalances]);
  const scoped = filters.scope === history.scope ? filters : { scope: history.scope, currency: 'all', status: 'all', direction: 'all' as TransactionHistoryDirection, page: 1 };
  const currency = visibleCurrencySelection(scoped.currency, currencyChoices);
  const active = currency === scoped.currency ? scoped : { ...scoped, currency, page: 1 };
  // A new account, locale, period or confirmed currency scope cannot revive
  // a former filter. The All view always keeps every returned ledger row.
  if (filters.scope !== history.scope || filters.currency !== currency) setFilters(active);
  const historyError = history.resource.error || historyData?.historyError;
  const page = useMemo(() => transactionHistoryPage(historyData?.transactions || [], { currency: active.currency, status: active.status, direction: active.direction, page: active.page }), [historyData?.transactions, active.currency, active.status, active.direction, active.page]);
  const setFilter = (field: 'currency' | 'status', value: string) => setFilters({ ...active, [field]: value, page: 1 });
  const setDirection = (direction: TransactionHistoryDirection) => setFilters({ ...active, direction, page: 1 });
  const setPage = (value: number) => { setFilters({ ...active, page: value }); scrollRef.current?.scrollTo({ y: historyOffset.current, animated: false }); };
  const resetFilters = () => setFilters({ scope: history.scope, currency: 'all', status: 'all', direction: 'all', page: 1 });
  const changePeriod = (value: BalanceHistoryPeriod) => { setFilters({ scope: '', currency: 'all', status: 'all', direction: 'all', page: 1 }); setPeriod(value); };
  const hasFilter = active.currency !== 'all' || active.status !== 'all' || active.direction !== 'all';
  const hasEmptyResult = historyData !== null && !history.resource.loading && !historyError && page.total === 0;

  return <Screen scrollRef={scrollRef} title={t('live.balance.title')} subtitle={t('live.balance.subtitle')}>
    <Button secondary onPress={() => router.push('/payments')}>{t('accountOps.payments')}</Button>
    <View onLayout={event => { historyOffset.current = event.nativeEvent.layout.y; }}>
      <OptionPicker label={t('balanceHistory.period')} value={period} options={periods.map(value => ({ id: value, title: t(`balanceHistory.period.${value}`) }))} onChange={value => changePeriod(value as BalanceHistoryPeriod)} />
    </View>
    {historyData && page.currencies.length > 0 && <View style={styles.filters}>
      <View style={styles.filter}><OptionPicker currency label={t('live.balance.currency')} value={active.currency} options={[{ id: 'all', title: t('balanceHistory.allCurrencies') }, ...currencyChoices.map(value => ({ id: value, title: value }))]} onChange={value => setFilter('currency', value)} /></View>
      {page.statuses.length > 0 && <View style={styles.filter}><OptionPicker label={t('balanceHistory.status')} value={active.status} options={[{ id: 'all', title: t('balanceHistory.allStatuses') }, ...page.statuses.map(value => ({ id: value, title: statusLabel(value, t) }))]} onChange={value => setFilter('status', value)} /></View>}
    </View>}
    {confirmedBalances !== null && page.currencies.some(code => !currencyChoices.includes(code)) && <Text style={s.small}>{t('balanceHistory.currencyScope')}</Text>}
    {historyData && page.currencies.length > 0 && <View accessibilityRole="radiogroup" accessibilityLabel={t('balanceHistory.directionFilter')} style={styles.directionFilters}>
      {directions.map(direction => <Pressable key={direction} accessibilityRole="radio" aria-checked={active.direction === direction} accessibilityState={{ checked: active.direction === direction }} accessibilityLabel={`${t(`balanceHistory.filter.${direction}`)}, ${countt('balanceHistory.count', page.directionCounts[direction])}`} onPress={() => setDirection(direction)} style={({ pressed }) => [styles.directionFilter, active.direction === direction && styles.selectedDirectionFilter, pressed && s.pressed]}>
        <Text style={[styles.directionFilterLabel, active.direction === direction && styles.selectedDirectionText]}>{t(`balanceHistory.filter.${direction}`)}</Text><Text style={[styles.directionCount, active.direction === direction && styles.selectedDirectionText]}>{formatNumber(page.directionCounts[direction])}</Text>
      </Pressable>)}
    </View>}
    {history.resource.loading && <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={[s.small, styles.loadingText]}>{t(period === 'all' ? 'balanceHistory.loadingAll' : 'balanceHistory.loading')}</Text></View>}
    {historyError && <><Notice error>{t('live.balance.historyError', { error: t(historyError) })}{historyData !== null ? `\n${t('live.stale')}` : ''}</Notice><Button secondary disabled={history.resource.loading} onPress={() => { void history.refresh(); }}>{t('balanceHistory.retry')}</Button></>}
    {history.resource.updatedAt !== null && <Text style={s.small}>{formatUpdatedAt(history.resource.updatedAt)}</Text>}
    {historyData && page.total > 0 && <>
      <View style={styles.resultSummary}><Text accessibilityLiveRegion="polite" style={s.small}>{countt('balanceHistory.count', page.total)}</Text><Text style={s.small}>{t('balanceHistory.shown', { first: formatNumber((page.page - 1) * TRANSACTION_HISTORY_PAGE_SIZE + 1), last: formatNumber((page.page - 1) * TRANSACTION_HISTORY_PAGE_SIZE + page.items.length) })}</Text></View>
      <HistoryPager page={page.page} pageCount={page.pageCount} onPage={setPage} />
      <GlassSurface style={styles.transactions}>{page.items.map((transaction, index) => <Transaction key={page.itemKeys[index]} transaction={transaction} />)}</GlassSurface>
      <HistoryPager page={page.page} pageCount={page.pageCount} onPage={setPage} />
    </>}
    {hasEmptyResult && <>
      <EmptyState icon="receipt-outline" title={t('balanceHistory.emptyTitle')} text={t(hasFilter ? 'balanceHistory.emptyFilters' : period === 'all' ? 'balanceHistory.emptyAll' : 'balanceHistory.emptyPeriod')} />
      {hasFilter && <Button secondary onPress={resetFilters}>{t('balanceHistory.resetFilters')}</Button>}
      {period !== 'all' && <Button secondary onPress={() => changePeriod('all')}>{t('balanceHistory.showAll')}</Button>}
    </>}
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  currency: { color: colors.muted, fontSize: 12, lineHeight: 20, fontWeight: '400' },
  filters: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, filter: { flex: 1, minWidth: 125 },
  directionFilters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  directionFilter: { flex: 1, minWidth: 80, minHeight: minTouchTarget, paddingHorizontal: 6, paddingVertical: 8, gap: 3, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft },
  selectedDirectionFilter: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  directionFilterLabel: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '500', textAlign: 'center' },
  directionCount: { color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  selectedDirectionText: { color: colors.accent },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }, loadingText: { flex: 1 },
  resultSummary: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  transactions: { borderColor: colors.glassBorder }, transaction: { gap: 6, padding: 14, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  transactionTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  transactionLabel: { color: colors.text, fontSize: 14, lineHeight: 21 }, transactionMeta: { gap: 2 },
  amount: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600', fontVariant: ['tabular-nums'], flexShrink: 1 },
  credit: { color: colors.success }, debit: { color: colors.accent },
  transactionStatus: { alignSelf: 'flex-start', flexShrink: 1 }, unpaid: { color: colors.warning, backgroundColor: colors.warningSoft },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }, pageText: { flex: 1, textAlign: 'center' },
  pageButton: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.soft }, disabled: { opacity: 0.5 },
});
