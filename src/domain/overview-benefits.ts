import type { LoyaltyProgram, LoyaltyValidity } from '../api/account-operations.ts';
import type { OverviewBonus, OverviewSummary } from '../api/overview-summary.ts';
import { loyaltyCountdown, loyaltySpecialRate, loyaltySummary, type LoyaltyDisplayRate } from './loyalty-summary.ts';

/** A points tier is not proof of the tariff actually applied. Only an explicitly
 * selected special per-kg tariff is available in the current loyalty contract. */
export function overviewBenefit(program: LoyaltyProgram): { discount: number; rate: (LoyaltyDisplayRate & { amount: number; currency: string }) | null; validity: LoyaltyValidity | null } {
  const summary = loyaltySummary(program);
  const special = summary.specialState === 'applied';
  const rate = special ? loyaltySpecialRate(program.specialPrice, program.currency) : null;
  return {
    discount: program.discount,
    rate: rate?.kind === 'perKg' && rate.amount !== null && !!rate.currency ? { ...rate, amount: rate.amount, currency: rate.currency } : null,
    // Progressive points expiry is not necessarily the account discount expiry.
    validity: special ? program.specialPrice?.validity ?? null : null,
  };
}

export function overviewBonusCountdown(bonus: OverviewBonus, summary: OverviewSummary, elapsedMs = 0) {
  if (!bonus.expiresAt || !summary.serverNow) return null;
  return loyaltyCountdown({ validityKind: 'remaining', serverNow: summary.serverNow, expiresAt: bonus.expiresAt, remainingDays: null, configuredDurationDays: null }, elapsedMs);
}

/** An expired snapshot must never keep advertising an available credit. */
export function visibleOverviewBonuses(summary: OverviewSummary | null, elapsedMs = 0): OverviewBonus[] {
  if (!summary?.availableBonuses) return [];
  return summary.availableBonuses.filter(bonus => bonus.amount > 0 && !overviewBonusCountdown(bonus, summary, elapsedMs)?.expired);
}
