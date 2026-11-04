import { ApiContractError } from './normalize.ts';
import { parseDisplayDate } from '../i18n/core.ts';
import { sortCurrencies } from '../domain/option-order.ts';

export type OverviewMoney = { currency: string; amount: number };
export type OverviewBonus = OverviewMoney & { expiresAt: string | null };
export type OverviewSummary = { serverNow: string | null; lifetimeSettledCharges: OverviewMoney[] | null; availableBonuses: OverviewBonus[] | null };

const supportedCurrencies = new Set(['USD', 'EUR', 'RON', 'GBP']);
function timestamp(raw: unknown): string | null {
  const parsed = typeof raw === 'string' ? parseDisplayDate(raw) : null;
  if (!parsed || parsed.wallClock) return null;
  return raw as string;
}
function money(raw: unknown): OverviewMoney {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiContractError('overview');
  const row = raw as Record<string, unknown>;
  const currency = typeof row.currency === 'string' ? row.currency.toUpperCase() : '';
  const value = row.amount;
  if (!supportedCurrencies.has(currency) || (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)))) throw new ApiContractError('overview');
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER / 100) throw new ApiContractError('overview');
  return { currency, amount };
}
function collection<T extends OverviewMoney>(raw: unknown, decode: (row: unknown) => T): T[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new ApiContractError('overview');
  const values = raw.map(decode);
  if (new Set(values.map(item => item.currency)).size !== values.length) throw new ApiContractError('overview');
  return sortCurrencies(values, item => item.currency);
}

/** Additive authenticated aggregate contract. Missing metrics are unknown, never
 * reconstructed from balance, payment funding, grants or one page of history. */
export function normalizeOverviewSummary(raw: unknown): OverviewSummary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiContractError('overview');
  const row = raw as Record<string, unknown>;
  if (row.version !== 1) throw new ApiContractError('overview');
  return {
    serverNow: timestamp(row.serverNow),
    lifetimeSettledCharges: collection(row.lifetimeSettledCharges, money),
    availableBonuses: collection(row.availableBonuses, item => {
      const value = money(item);
      const expiresAt = (item as Record<string, unknown>).expiresAt;
      return { ...value, expiresAt: expiresAt == null ? null : timestamp(expiresAt) };
    }),
  };
}
