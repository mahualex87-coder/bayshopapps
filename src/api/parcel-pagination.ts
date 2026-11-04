import type { LiveParcel, LiveParcelStage } from './contracts.ts';
import { translate, type Language } from '../i18n/core.ts';

export type ParcelQuery = { countryCode: string; status: string; page: number; pageSize: number; search: string };
export type ParcelPageState = {
  query: ParcelQuery; items: LiveParcel[] | null; total: number | null; overallTotal: number | null; loaded: number;
  pageCount: number | null; hasNext: boolean; countries: { code: string; total: number }[];
  statuses: { value: string; total: number | null }[]; mode: 'server' | 'local'; searchScope: 'collection' | 'page';
  loading: boolean; error: string | null; updatedAt: number | null;
};
export type ParcelPages = Record<LiveParcelStage, ParcelPageState>;
export const parcelStages: LiveParcelStage[] = ['waiting', 'warehouse', 'sent', 'received'];
export const defaultParcelQuery = (): ParcelQuery => ({ countryCode: 'all', status: 'all', page: 1, pageSize: 20, search: '' });
export function emptyParcelPage(stage: LiveParcelStage, query = defaultParcelQuery()): ParcelPageState {
  const server = stage === 'sent' || stage === 'received';
  return { query, items: null, total: null, overallTotal: null, loaded: 0, pageCount: null, hasNext: false, countries: [], statuses: [], mode: server ? 'server' : 'local', searchScope: server ? 'page' : 'collection', loading: false, error: null, updatedAt: null };
}
export function emptyParcelPages(): ParcelPages { return Object.fromEntries(parcelStages.map(stage => [stage, emptyParcelPage(stage)])) as ParcelPages; }
export function updateParcelQuery(current: ParcelQuery, patch: Partial<ParcelQuery>): ParcelQuery | null {
  const query = { ...current, ...patch };
  if (query.countryCode !== 'all' && !/^[A-Z]{2}$/.test(query.countryCode) || query.status !== 'all' && !/^[a-z][a-z-]{0,50}$/.test(query.status) || !Number.isSafeInteger(query.page) || query.page < 1 || ![10, 20, 50].includes(query.pageSize) || typeof query.search !== 'string' || query.search.length > 200) return null;
  if (['countryCode', 'status', 'pageSize', 'search'].some(key => patch[key as keyof ParcelQuery] !== undefined && patch[key as keyof ParcelQuery] !== current[key as keyof ParcelQuery])) query.page = 1;
  return query;
}
export function matchesParcelSearch(parcel: LiveParcel, search: string, language: Language = 'ro'): boolean {
  const query = search.trim().toLocaleLowerCase(language);
  const statusKey = `status.${parcel.status}`;
  const translated = parcel.status === 'held-by-missing' ? parcel.statusLabel || translate(language, 'status.held') : translate(language, statusKey);
  const label = translated === statusKey ? parcel.statusLabel || parcel.status || translate(language, `stage.${parcel.stage}`) : translated;
  return !query || [parcel.id, parcel.uid, parcel.title, parcel.tracking, parcel.countryCode, parcel.countryTitle, parcel.status, parcel.statusLabel, label, parcel.shipperTitle, parcel.serviceName, ...parcelFilterStatuses(parcel).map(status => translate(language, `status.${status}`))].some(value => value?.toLocaleLowerCase(language).includes(query));
}
/** Stock-list responses omit a status string. These overlapping filter values
 * come from explicit declaration/restriction flags, without inventing a status
 * or converting an unknown flag to false. */
export function parcelFilterStatuses(parcel: LiveParcel): string[] {
  if (parcel.stage !== 'warehouse') return parcel.status ? [parcel.status] : [];
  return [...(parcel.declared === true ? ['declared'] : parcel.declared === false ? ['undeclared'] : []), ...(parcel.restrictions?.heldByDamage === true ? ['held-by-damage'] : []), ...(parcel.restrictions?.heldByProhibition === true ? ['held-by-prohibition'] : []), ...(parcel.restrictions?.packingDenied === true ? ['packing-denied'] : [])];
}
/** Endpoints without a paging contract keep one cached collection. Only the
 * requested slice is rendered; filtering happens before computing its pages. */
export function localParcelPage(rows: LiveParcel[], query: ParcelQuery, updatedAt: number | null, options: { overallTotal?: number; countries?: ParcelPageState['countries']; language?: Language } = {}): ParcelPageState {
  const countryCounts = new Map<string, number>();
  for (const row of rows) if (row.countryCode) countryCounts.set(row.countryCode, (countryCounts.get(row.countryCode) || 0) + 1);
  const countryRows = query.countryCode === 'all' ? rows : rows.filter(row => row.countryCode === query.countryCode);
  const statusCounts = new Map<string, number>();
  for (const row of countryRows) for (const status of parcelFilterStatuses(row)) statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  const filtered = countryRows.filter(row => (query.status === 'all' || parcelFilterStatuses(row).includes(query.status)) && matchesParcelSearch(row, query.search, options.language));
  const pageCount = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, pageCount);
  return { query: { ...query, page }, items: filtered.slice((page - 1) * query.pageSize, page * query.pageSize), total: filtered.length, overallTotal: options.overallTotal ?? rows.length, loaded: rows.length, pageCount, hasNext: page < pageCount, countries: options.countries ?? [...countryCounts].map(([code, total]) => ({ code, total })), statuses: [...statusCounts].map(([value, total]) => ({ value, total })), mode: 'local', searchScope: 'collection', loading: false, error: null, updatedAt };
}
