import type { LoyaltyProgram, LoyaltySpecialPrice, LoyaltyTier, LoyaltyValidity } from '../api/account-operations.ts';
import { parseDisplayDate } from '../i18n/core.ts';

export type LoyaltyDisplayRate = { kind: 'perKg' | 'percent' | 'unavailable'; amount: number | null; currency: string | null };
export type LoyaltySummaryValidity = {
  kind: 'reported' | 'remaining' | 'configured' | 'none' | 'unknown';
  days: number | null;
  serverNow: string | null;
  expiresAt: string | null;
};
export type LoyaltyProgressSummary = {
  state: 'interval' | 'thresholdReached' | 'maximum' | 'unavailable';
  fraction: number | null;
  from: number | null;
  to: number | null;
  earned: number | null;
  remaining: number | null;
  remainingSource: 'server' | 'calculated' | null;
};
export type LoyaltySummary = {
  current: LoyaltyTier | null;
  next: LoyaltyTier | null;
  progress: LoyaltyProgressSummary;
  specialState: 'applied' | 'notApplied' | 'unknown' | 'none';
  validity: { current: LoyaltySummaryValidity | null; special: LoyaltySummaryValidity | null };
};

const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const days = (value: unknown): number | null => amount(value) && Number.isSafeInteger(value) ? value : null;
const noRate = (): LoyaltyDisplayRate => ({ kind: 'unavailable', amount: null, currency: null });

/** Backend tier result is a price for 1 kg even when loyaltyType is percent.
 * The original percentage remains separately available in tier.discount. */
export function loyaltyTierRate(tier: LoyaltyTier | null, currency: string | null): LoyaltyDisplayRate {
  return tier && amount(tier.rate) && (tier.priceType === 'perKg' || tier.priceType === 'percent')
    ? { kind: 'perKg', amount: tier.rate, currency }
    : noRate();
}

/** Special-price result has a different contract from tier result: discount
 * stores the configured percentage; only perKg is a monetary amount per kg. */
export function loyaltySpecialRate(special: LoyaltySpecialPrice | null, currency: string | null): LoyaltyDisplayRate {
  if (!special || !amount(special.rate)) return noRate();
  if (special.priceType === 'perKg') return { kind: 'perKg', amount: special.rate, currency };
  if (special.priceType === 'discount' && special.rate <= 100) return { kind: 'percent', amount: special.rate, currency: null };
  return noRate();
}

function validity(explicit: LoyaltyValidity | null | undefined, legacyDays: number | null | undefined): LoyaltySummaryValidity | null {
  if (explicit) return {
    kind: explicit.validityKind,
    days: explicit.validityKind === 'remaining' ? days(explicit.remainingDays) : explicit.validityKind === 'configured' ? days(explicit.configuredDurationDays) : null,
    serverNow: explicit.serverNow,
    expiresAt: explicit.validityKind === 'remaining' ? explicit.expiresAt : null,
  };
  const reported = days(legacyDays);
  return reported === null ? null : { kind: 'reported', days: reported, serverNow: null, expiresAt: null };
}

const unavailableProgress = (): LoyaltyProgressSummary => ({ state: 'unavailable', fraction: null, from: null, to: null, earned: null, remaining: null, remainingSource: null });

/** Progress describes points inside the current-to-next threshold interval.
 * It never promotes currentLevel or confirms progressive pricing activation. */
export function loyaltySummary(program: LoyaltyProgram): LoyaltySummary {
  const levels = program.levels || [];
  const matches = levels.filter(tier => tier.level === program.currentLevel);
  const current = program.currentLevel !== null && program.currentLevel > 0 && matches.length === 1 ? matches[0] : null;
  const validLevel = amount(program.currentLevel) && Number.isSafeInteger(program.currentLevel);
  const catalogKnown = levels.length > 0
    && levels.every(tier => amount(tier.level) && Number.isSafeInteger(tier.level) && tier.level > 0)
    && new Set(levels.map(tier => tier.level)).size === levels.length;
  const next = validLevel && catalogKnown
    ? [...levels].filter(tier => tier.level! > program.currentLevel!).sort((a, b) => a.level! - b.level!)[0] || null
    : null;
  let progress = unavailableProgress();
  if (validLevel && catalogKnown && amount(program.points) && (program.currentLevel === 0 || current)) {
    const from = program.currentLevel === 0 ? 0 : current?.threshold;
    if (amount(from)) {
      if (next && amount(next.threshold) && next.threshold > from) {
        const span = next.threshold - from;
        const earned = Math.min(span, Math.max(0, program.points - from));
        const serverRemaining = amount(next.remainingPoints) ? next.remainingPoints : null;
        progress = {
          state: program.points >= next.threshold ? 'thresholdReached' : 'interval',
          fraction: earned / span,
          from,
          to: next.threshold,
          earned,
          remaining: serverRemaining ?? Math.max(0, next.threshold - program.points),
          remainingSource: serverRemaining === null ? 'calculated' : 'server',
        };
      } else if (!next && current && program.currentLevel === Math.max(...levels.map(tier => tier.level!))) {
        progress = { ...unavailableProgress(), state: 'maximum', fraction: 1 };
      }
    }
  }
  const special = program.specialPrice;
  return {
    current,
    next,
    progress,
    specialState: !special ? 'none' : special.selected === true ? 'applied' : special.selected === false ? 'notApplied' : 'unknown',
    validity: { current: validity(program.currentValidity, current?.durationDays), special: validity(special?.validity, special?.durationDays) },
  };
}

export type LoyaltyCountdown = { days: number; hours: number; minutes: number; remainingMs: number; expired: boolean };

/** Use server time plus monotonic elapsed time supplied by the caller. Device
 * wall-clock settings, configured durations and legacy fixedTime are excluded. */
export function loyaltyCountdown(explicit: LoyaltyValidity | null | undefined, elapsedMs = 0): LoyaltyCountdown | null {
  if (explicit?.validityKind !== 'remaining' || !amount(elapsedMs) || !explicit.expiresAt) return null;
  const server = parseDisplayDate(explicit.serverNow);
  const expiry = parseDisplayDate(explicit.expiresAt);
  if (!server || server.wallClock || !expiry || expiry.wallClock) return null;
  const difference = expiry.date.getTime() - server.date.getTime() - elapsedMs;
  if (!Number.isFinite(difference)) return null;
  const remainingMs = Math.max(0, difference);
  const minutes = Math.floor(remainingMs / 60000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor(minutes / 60) % 24, minutes: minutes % 60, remainingMs, expired: difference <= 0 };
}
