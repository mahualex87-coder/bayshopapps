import type { LiveParcel } from './contracts.ts';
import { ApiContractError } from './normalize.ts';

type States = NonNullable<LiveParcel['serviceStates']>;
export type LegacyServiceStatus = { id: string; states: States };
const fields = { verification: 'verificationPackageRequestStatus', division: 'divideRequestedStatus', label: 'labelRequestStatus' } as const;
/** Existing /api/storage returns current raw storage rows grouped by country.
 * Its controller removes photo status; that remains sourced from mf-list. */
export function normalizeLegacyStockServiceStates(raw: unknown): LegacyServiceStatus[] {
  const data = raw as { storage?: unknown };
  if (!data || typeof data !== 'object' || !data.storage || typeof data.storage !== 'object') throw new ApiContractError('starea serviciilor');
  const groups = Array.isArray(data.storage) ? [data.storage] : Object.values(data.storage);
  const result: LegacyServiceStatus[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) throw new ApiContractError('starea serviciilor');
    for (const value of group) {
      if (!value || typeof value !== 'object') throw new ApiContractError('starea serviciilor');
      const row = value as Record<string, unknown>;
      if (!/^[1-9]\d*$/.test(String(row.id ?? ''))) throw new ApiContractError('starea serviciilor');
      const states: States = {};
      for (const [key, field] of Object.entries(fields)) if (Object.prototype.hasOwnProperty.call(row, field)) {
        if (row[field] != null && typeof row[field] !== 'string') throw new ApiContractError('starea serviciilor');
        states[key as keyof States] = row[field] as string | null;
      }
      result.push({ id: String(row.id), states });
    }
  }
  if (new Set(result.map(row => row.id)).size !== result.length) throw new ApiContractError('starea serviciilor');
  return result;
}
export function needsLegacyStockStates(current?: LiveParcel): boolean {
  return !!current && Object.keys(fields).some(key => !Object.prototype.hasOwnProperty.call(current.serviceStates || {}, key));
}
export function mergeStockServiceStates(current: LiveParcel | undefined, legacy: LegacyServiceStatus[] | null): LiveParcel | undefined {
  if (!current) return undefined;
  const fallback = legacy?.find(row => row.id === current.id);
  return fallback ? { ...current, serviceStates: { ...fallback.states, ...current.serviceStates } } : current;
}
