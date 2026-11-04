import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { useEffect, useState, type ComponentProps } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { loyaltyData, type LoyaltyProgram, type LoyaltyTier, type LoyaltyValidity } from '@/api/account-operations';
import { loyaltyCountdown, loyaltySpecialRate, loyaltySummary, loyaltyTierRate, type LoyaltySummaryValidity } from '@/domain/loyalty-summary';
import { CountryLabel } from '@/components/CountryFlag';
import { ServiceIdentity } from '@/components/ServiceIdentity';
import { useI18n } from '@/i18n/context';
import { GlassSurface } from '@/navigation/GlassSurface';
import { displayMoney, ResourceStatus } from '@/features/live/shared';
import { Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { useAccountView } from './shared';
import { sortCountries } from '@/domain/option-order';

function Icon({ name, size = 20, color }: { name: ComponentProps<typeof Ionicons>['name']; size?: number; color?: string }) {
  const { colors } = useUi();
  color ??= colors.accent;
  return <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Ionicons accessible={false} aria-hidden name={name} size={size} color={color} /></View>;
}

function Disclosure({ open, onPress, children }: { open: boolean; onPress: () => void; children: string }) {
  const { s } = useUi();
  const styles = useThemeStyles(makeStyles);
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} onPress={onPress} style={({ pressed }) => [styles.disclosure, pressed && s.pressed]}><Text style={styles.link}>{children}</Text><Icon name={open ? 'chevron-up' : 'chevron-down'} size={17} /></Pressable>;
}

function LoyaltyIntroduction() {
  const { s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t } = useI18n(); const [open, setOpen] = useState(false);
  return <GlassSurface style={styles.intro}>
    <View style={styles.inline}><View style={styles.smallMedal}><Icon name="sparkles-outline" /></View><Text style={[s.body, styles.flex]}>{t('loyaltyUi.intro')}</Text></View>
    <Disclosure open={open} onPress={() => setOpen(!open)}>{t(open ? 'loyaltyUi.closeRules' : 'loyaltyUi.how')}</Disclosure>
    {open && <View style={styles.rules}>
      {([
        ['cube-outline', 'loyaltyUi.earn', 'loyalty.pointsRule'],
        ['trending-up-outline', 'loyaltyUi.advance', 'loyaltyUi.advanceBody'],
        ['time-outline', 'loyaltyUi.keep', 'loyalty.temporaryRule'],
      ] as const).map(([icon, title, body]) => <View key={title} style={styles.rule}><Icon name={icon} size={22} /><View style={styles.flex}><Text style={styles.label}>{t(title)}</Text><Text style={s.small}>{t(body)}</Text></View></View>)}
      <Text style={s.small}>{t('loyalty.exclusions')}</Text>
    </View>}
  </GlassSurface>;
}

function useElapsed(snapshot: number | null, enabled: boolean) {
  const [clock, setClock] = useState<{ snapshot: number | null; elapsedMs: number }>({ snapshot: null, elapsedMs: 0 });
  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const interval = setInterval(() => setClock({ snapshot, elapsedMs: Math.max(0, performance.now() - start) }), 30_000);
    return () => clearInterval(interval);
  }, [snapshot, enabled]);
  return clock.snapshot === snapshot ? clock.elapsedMs : 0;
}

function ValidityCard({ validity, explicit, individual, elapsedMs }: { validity: LoyaltySummaryValidity | null; explicit?: LoyaltyValidity | null; individual: boolean; elapsedMs: number }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, countt, formatDate, formatTime, formatNumber } = useI18n();
  const countdown = loyaltyCountdown(explicit, elapsedMs);
  const urgent = countdown !== null && !countdown.expired && countdown.remainingMs < 3 * 86_400_000;
  const period = validity?.days;
  return <View style={[styles.validity, urgent && styles.urgent]}>
    <View style={styles.inline}><View style={styles.clock}><Icon name={countdown?.expired ? 'refresh-outline' : 'time-outline'} size={23} color={urgent ? colors.warning : colors.muted} /></View><View style={styles.flex}>
      <Text style={styles.caption}>{t(individual ? 'loyaltyUi.individualValidity' : 'loyaltyUi.levelValidity')}</Text>
      {countdown ? <>
        <Text style={styles.label}>{t(countdown.expired ? 'loyaltyUi.elapsed' : 'loyaltyUi.remainingTime')}</Text>
        {!countdown.expired && <View style={styles.timer}>
          {([[countdown.days, 'loyaltyUi.daysUnit'], [countdown.hours, 'loyaltyUi.hoursUnit'], [countdown.minutes, 'loyaltyUi.minutesUnit']] as const).map(([amount, key]) => <View key={key} style={styles.timeUnit}><Text style={styles.timeValue}>{formatNumber(amount, { minimumIntegerDigits: 2 })}</Text><Text style={styles.caption}>{t(key)}</Text></View>)}
        </View>}
        {countdown.remainingMs > 0 && countdown.remainingMs < 60_000 && <Text style={s.small}>{t('loyaltyUi.lessMinute')}</Text>}
      </> : <Text style={styles.label}>{period !== null && period !== undefined ? countt('loyalty.days', period) : t('loyaltyUi.noExpiry')}</Text>}
    </View></View>
    <Text style={styles.note}>{countdown ? countdown.expired ? t('loyaltyUi.elapsedHint') : t('loyaltyUi.expiresOn', { date: formatDate(explicit!.expiresAt) || '', time: formatTime(explicit!.expiresAt) || '' }) : validity?.kind === 'reported' ? t(period === 0 ? 'loyaltyUi.validityZeroHint' : 'loyalty.expiryNote') : validity?.kind === 'configured' ? t('loyaltyUi.configuredHint') : t('loyaltyUi.noExpiryHint')}</Text>
    {!countdown && period !== null && period !== undefined && <Text style={styles.caption}>{t(validity?.kind === 'configured' ? 'loyaltyUi.configuredPeriod' : 'loyaltyUi.reportedPeriod')}</Text>}
  </View>;
}

function TierStep({ tier, program, current, next, last }: { tier: LoyaltyTier; program: LoyaltyProgram; current: boolean; next: boolean; last: boolean }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, countt, formatNumber } = useI18n();
  const reached = tier.level !== null && program.currentLevel !== null && tier.level <= program.currentLevel;
  const rate = loyaltyTierRate(tier, program.currency);
  return <View style={styles.step}>
    <View style={styles.stepTrack}>{!last && <View style={styles.stepLine} />}<View style={[styles.stepDot, reached && styles.stepDotReached, current && styles.stepDotCurrent]}>{reached && !current ? <Icon name="checkmark" size={16} color={colors.success} /> : <Text style={[styles.stepNumber, current && { color: colors.onAccent }]}>{tier.level === null ? '·' : formatNumber(tier.level)}</Text>}</View></View>
    <View style={[styles.stepBody, current && styles.currentStep]}>
      <View style={styles.wrapRow}><Text style={styles.label}>{tier.level === null ? t('loyalty.levelUnknown') : t('loyalty.level', { level: tier.level })}</Text>{(current || next || reached) && <Text style={[styles.badge, current && styles.currentBadge]}>{t(current ? 'loyaltyUi.youAreHere' : next ? 'loyaltyUi.next' : 'loyaltyUi.reached')}</Text>}</View>
      <Text style={s.small}>{tier.threshold === null ? t('common.unavailable') : t('loyaltyUi.unlockAt', { points: formatNumber(tier.threshold, { maximumFractionDigits: 2 }) })}</Text>
      <View style={styles.wrapRow}>{tier.discount !== null && <Text style={styles.benefit}>{t('loyaltyUi.tierDiscount', { percent: formatNumber(tier.discount, { maximumFractionDigits: 2 }) })}</Text>}{rate.kind === 'perKg' && rate.amount !== null && !!program.currency && <Text style={styles.label}>{t('loyalty.perKg', { price: displayMoney(rate.amount, program.currency, formatNumber) })}</Text>}</View>
      {!current && tier.durationDays !== null && <Text style={styles.caption}>{t('loyaltyUi.configuredPeriod')}: {countt('loyalty.days', tier.durationDays)}</Text>}
    </View>
  </View>;
}

function LoyaltyProgramCard({ program, elapsedMs }: { program: LoyaltyProgram; elapsedMs: number }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, formatNumber } = useI18n(); const [expanded, setExpanded] = useState(false);
  const summary = loyaltySummary(program); const individual = summary.specialState === 'applied';
  const specialRate = loyaltySpecialRate(program.specialPrice, program.currency);
  const validity = individual ? summary.validity.special : summary.validity.current;
  const explicit = individual ? program.specialPrice?.validity : program.currentValidity;
  const number = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });
  const next = summary.next; const progress = summary.progress;
  const sorted = program.levels?.slice().sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity)) || [];
  const focused = sorted.filter(tier => tier.id === summary.current?.id || tier.id === next?.id);
  const steps = expanded || focused.length === 0 ? sorted : focused;
  const remaining = progress.remaining === null || !next ? '' : t('loyaltyUi.remainingToLevel', { points: number(progress.remaining), level: next.level! });
  const nextRate = next && loyaltyTierRate(next, program.currency);
  const countryKey = `live.country.${program.countryCode}`; const countryName = t(countryKey) === countryKey ? program.countryCode : t(countryKey);
  return <GlassSurface style={styles.program}>
    <View style={styles.carrier}>
      <CountryLabel code={program.countryCode} label={countryName || t('loyalty.carrier')} size="regular" textStyle={styles.label} />
      <View accessibilityRole="header"><ServiceIdentity title={program.title || t('loyalty.carrier')} logoUrl={program.iconUrl} textStyle={styles.carrierName} /></View>
      {program.destination && <CountryLabel label={program.destination} textStyle={s.small} />}
    </View>
    <View style={styles.hero}>
      <LinearGradient pointerEvents="none" colors={[colors.loyaltyTop, colors.loyaltyMiddle, colors.loyaltyBottom]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.heroTop}><View style={styles.flex}><Text style={styles.eyebrow}>{t('loyaltyUi.yourDiscount')}</Text><Text selectable style={styles.discount}>{number(program.discount)}<Text style={styles.percent}>%</Text></Text></View><View style={styles.medalOuter}><View style={styles.medal}><Icon name={individual ? 'shield-checkmark-outline' : 'ribbon-outline'} size={32} color={colors.accentText} /></View></View></View>
      <View style={styles.heroFoot}><Icon name={individual ? 'checkmark-circle' : 'pricetag-outline'} size={17} /><View style={styles.flex}><Text style={styles.label}>{t(individual ? 'loyaltyUi.individualApplied' : 'loyaltyUi.accountBenefit')}</Text>{individual && specialRate.kind === 'perKg' && specialRate.amount !== null && !!program.currency && <Text selectable style={styles.appliedRate}>{t('loyalty.perKg', { price: displayMoney(specialRate.amount, program.currency, formatNumber) })}</Text>}</View></View>
    </View>
    <Text style={styles.note}>{t(individual ? 'loyaltyUi.individualHint' : 'loyaltyUi.pricingHint')}</Text>
    <View style={styles.progressSection}>
      <View style={styles.wrapRow}><View style={styles.inline}><Icon name="trending-up-outline" /><Text accessibilityRole="header" style={styles.label}>{t('loyaltyUi.progressTitle')}</Text></View><Text style={styles.badge}>{program.currentLevel === null ? t('common.unavailable') : program.currentLevel === 0 ? t('loyaltyUi.base') : t('loyalty.level', { level: program.currentLevel })}</Text></View>
      {program.points !== null && <Text style={styles.points}>{t('loyaltyUi.pointsShort', { points: number(program.points) })}</Text>}
      {progress.fraction !== null && <View accessibilityRole="progressbar" accessibilityLabel={t('loyaltyUi.progressTitle')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)} aria-valuetext={t('loyaltyUi.progressA11y', { percent: Math.round(progress.fraction * 100), remaining })} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100), text: t('loyaltyUi.progressA11y', { percent: Math.round(progress.fraction * 100), remaining }) }} style={styles.progressTrack}><LinearGradient colors={[colors.progressStart, colors.progressEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${progress.fraction * 100}%` }]} /></View>}
      {progress.state === 'maximum' ? <View style={styles.inline}><Icon name="trophy-outline" size={20} color={colors.warning} /><Text style={[styles.label, styles.flex]}>{t('loyaltyUi.maximum')}</Text></View> : progress.state === 'unavailable' ? <Text style={s.small}>{t('loyaltyUi.progressUnknown')}</Text> : <>
        <Text style={styles.label}>{progress.state === 'thresholdReached' ? t('loyaltyUi.reachedPending') : remaining}</Text>
        {progress.earned !== null && progress.from !== null && progress.to !== null && <Text style={styles.caption}>{t('loyaltyUi.interval', { earned: number(progress.earned), total: number(progress.to - progress.from) })}</Text>}
        {next && <View style={styles.nextBenefit}><Text style={s.small}>{t('loyaltyUi.nextBenefit')}</Text><View style={styles.wrapRow}>{next.discount !== null && <Text style={styles.benefit}>{t('loyaltyUi.tierDiscount', { percent: number(next.discount) })}</Text>}{nextRate?.kind === 'perKg' && nextRate.amount !== null && !!program.currency && <Text style={styles.label}>{t('loyalty.perKg', { price: displayMoney(nextRate.amount, program.currency, formatNumber) })}</Text>}</View></View>}
      </>}
    </View>
    <ValidityCard validity={validity} explicit={explicit} individual={individual} elapsedMs={elapsedMs} />
    {program.levels === null ? <Text style={s.small}>{t('loyalty.levelsUnavailable')}</Text> : sorted.length === 0 ? <Text style={s.small}>{t('loyalty.noLevels')}</Text> : <View style={styles.journey}>
      <Text accessibilityRole="header" style={styles.label}>{t('loyaltyUi.journey')}</Text>
      <View>{steps.map((tier, index) => <TierStep key={tier.id} tier={tier} program={program} current={tier.id === summary.current?.id} next={tier.id === next?.id} last={index === steps.length - 1} />)}</View>
      {sorted.length > focused.length && focused.length > 0 && <Disclosure open={expanded} onPress={() => setExpanded(!expanded)}>{t(expanded ? 'loyaltyUi.showLess' : 'loyaltyUi.showAll', { count: sorted.length })}</Disclosure>}
    </View>}
  </GlassSurface>;
}

export function LiveLoyalty() {
  const styles = useThemeStyles(makeStyles);
  const { t } = useI18n(); const { resource, reload } = useAccountView({ kind: 'loyalty.read' }, loyaltyData); const [country, setCountry] = useState<string | null>(null);
  const hasCountdown = !!resource.data?.some(item => item.currentValidity?.validityKind === 'remaining' || item.specialPrice?.validity?.validityKind === 'remaining');
  const elapsedMs = useElapsed(resource.updatedAt, hasCountdown);
  useEffect(() => {
    if (!hasCountdown) return;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && (previous === 'background' || previous === 'inactive')) reload();
      previous = state;
    });
    return () => subscription.remove();
  }, [hasCountdown, reload]);
  const countries = sortCountries([...new Set(resource.data?.map(item => item.countryCode).filter(Boolean) || [])], code => ({ code }));
  const selected = country !== null && countries.includes(country) ? country : countries[0];
  const programs = resource.data?.filter(item => !selected || item.countryCode === selected || !item.countryCode);
  return <Screen title={t('loyalty.title')}>
    <LoyaltyIntroduction />
    <ResourceStatus resource={resource} onRefresh={reload} />
    {countries.length > 1 && <View style={{ gap: 6 }}><Text style={styles.caption}>{t('loyalty.filterWarehouse')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryList} accessibilityRole="radiogroup" accessibilityLabel={t('loyalty.filterWarehouse')}>
      {countries.map(code => { const key = `live.country.${code}`; const title = t(key) === key ? code : t(key); return <GlassSurface key={code} style={[styles.countryChip, code === selected && styles.countryChipSelected]}><Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: code === selected }} aria-checked={code === selected} onPress={() => setCountry(code)} style={styles.countryButton}><CountryLabel code={code} label={title} textStyle={styles.label} /></Pressable></GlassSurface>; })}
    </ScrollView></View>}
    {programs?.map(program => <LoyaltyProgramCard key={`${program.countryCode}:${program.id}`} program={program} elapsedMs={elapsedMs} />)}
    {resource.data?.length === 0 && <Notice>{t('accountOps.noLoyalty')}</Notice>}
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, inline: { flexDirection: 'row', alignItems: 'center', gap: 9 }, wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  intro: { paddingHorizontal: 14, paddingTop: 13, borderRadius: 21, backgroundColor: colors.glass }, smallMedal: { width: 35, height: 35, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  disclosure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: minTouchTarget, paddingVertical: 9 }, link: { flex: 1, color: colors.accentText, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  rules: { gap: 14, paddingBottom: 16, paddingTop: 4 }, rule: { flexDirection: 'row', gap: 10 },
  program: { padding: 15, gap: 14, borderRadius: 26, backgroundColor: colors.glass }, carrier: { gap: 6 }, carrierName: { fontSize: 18, fontWeight: '700', lineHeight: 24, color: colors.text },
  label: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 19 }, caption: { color: colors.muted, fontSize: 11, lineHeight: 17 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  hero: { overflow: 'hidden', padding: 16, gap: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.accentBorder }, heroTop: { flexDirection: 'row', gap: 12, alignItems: 'center' }, eyebrow: { color: colors.accentText, fontSize: 13, fontWeight: '600' }, discount: { fontSize: 44, fontWeight: '700', letterSpacing: -1.6, color: colors.accentText, fontVariant: ['tabular-nums'] }, percent: { fontSize: 25, fontWeight: '500' },
  medalOuter: { height: 78, width: 78, borderRadius: 39, borderWidth: 1, borderColor: colors.glassHighlight, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center' }, medal: { height: 60, width: 60, borderRadius: 30, borderWidth: 1, borderColor: colors.accentBorder, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(151,68,49,.08)' },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.accentBorder }, appliedRate: { fontSize: 19, lineHeight: 26, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  progressSection: { gap: 9, paddingTop: 2 }, points: { fontSize: 22, fontWeight: '600', lineHeight: 29, color: colors.text, fontVariant: ['tabular-nums'] }, badge: { fontSize: 10, fontWeight: '600', lineHeight: 16, color: colors.muted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.soft, overflow: 'hidden' }, currentBadge: { backgroundColor: colors.accentSoft, color: colors.accentText },
  progressTrack: { height: 11, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border }, progressFill: { height: '100%', borderRadius: 8 }, nextBenefit: { padding: 11, gap: 3, backgroundColor: colors.soft, borderRadius: 12 }, benefit: { color: colors.accentText, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  validity: { padding: 12, gap: 8, borderRadius: 17, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border }, urgent: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder }, clock: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.glassStrong }, timer: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 }, timeUnit: { alignItems: 'center', minWidth: 32 }, timeValue: { color: colors.text, fontWeight: '600', fontSize: 24, lineHeight: 29, fontVariant: ['tabular-nums'] },
  journey: { gap: 10 }, step: { flexDirection: 'row', gap: 10 }, stepTrack: { width: 27, alignItems: 'center' }, stepLine: { position: 'absolute', width: 2, backgroundColor: colors.border, top: 20, bottom: -10 }, stepDot: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft, marginTop: 10 }, stepDotReached: { backgroundColor: colors.successSoft, borderColor: colors.successBorder }, stepDotCurrent: { backgroundColor: colors.primaryButton, borderColor: colors.primaryButton }, stepNumber: { fontSize: 12, fontWeight: '700', color: colors.muted }, stepBody: { flex: 1, minWidth: 0, borderRadius: 13, padding: 10, gap: 3, marginBottom: 7 }, currentStep: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder },
  countryList: { gap: 8, paddingBottom: 2 }, countryChip: { borderRadius: 16, backgroundColor: colors.glass }, countryChipSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }, countryButton: { minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 8 },
});
