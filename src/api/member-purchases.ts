import { ApiContractError } from './normalize.ts';
import { MutationInputError, type ReadPlan } from './mutations.ts';
import { serverText } from '../domain/server-text.ts';

export type PurchaseShop = { id: string; title: string | null };
export type PurchaseChoice = { value: string; label: string };
export type PurchaseLocation = { kind: 'stock' | 'shipment'; id: string; code: string | null; status: string | null; statusLabel: string | null; route: 'warehouse' | 'shipment' | null; received: boolean | null; divideStatus: string | null };
export type PurchaseSummary = {
  id: string; uid: string | null; createdAt: string | null; paidAt: string | null;
  paymentStatus: string | null; paymentStatusLabel: string | null; processingStatus: string | null; processingStatusLabel: string | null;
  countryCode: string | null; countryTitle: string | null; currency: string | null; totalPrice: number | null;
  itemCount: number; shops: PurchaseShop[]; productTitles: string[]; trackingNumbers: string[]; locations: PurchaseLocation[];
};
export type PurchaseItem = { shopId: string | null; shopTitle: string | null; id: string; uid: string | null; title: string; url: string | null; quantity: number | null; price: number | null; localShipping: number | null; color: string | null; size: string | null; variations: string | null; tracking: string | null; paymentStatus: string | null; paymentStatusLabel: string | null; processingStatus: string | null; processingStatusLabel: string | null };
export type PurchasePage = { items: PurchaseSummary[]; page: number; perPage: number; total: number; pageCount: number; filters: { countries: PurchaseChoice[]; paymentStatuses: PurchaseChoice[]; processingStatuses: PurchaseChoice[] } };
export type PurchaseDetail = PurchaseSummary & { invoiceUrl: string | null; cancelReason: string | null; amounts: { key: 'goods' | 'localShipping' | 'commission' | 'total'; amount: number | null }[]; items: PurchaseItem[] };
export type PurchasesReadCommand =
  | { kind: 'purchases.list'; page?: number; perPage?: number; search?: string; countryCode?: string; paymentStatus?: string; processingStatus?: string }
  | { kind: 'purchases.detail'; id: string };
export type PurchasesReadResult<Q extends PurchasesReadCommand> = Q extends { kind: 'purchases.detail' } ? PurchaseDetail : PurchasePage;
const fail = () => new ApiContractError('cumpărăturile contului');
const record = (raw: unknown): Record<string, unknown> => { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail(); return raw as Record<string, unknown>; };
const list = (raw: unknown): unknown[] => { if (!Array.isArray(raw)) throw fail(); return raw; };
const text = (raw: unknown): string | null => { if (raw == null || raw === '') return null; if (typeof raw !== 'string') throw fail(); return raw; };
const label = (raw: unknown): string | null => { const value = text(raw); return value === null ? null : serverText(value); };
const id = (raw: unknown): string => { if (typeof raw !== 'string' && typeof raw !== 'number' || !/^[1-9]\d*$/.test(String(raw))) throw fail(); return String(raw); };
const amount = (raw: unknown): number | null => { if (raw == null || raw === '') return null; if (typeof raw !== 'number' && (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw))) throw fail(); const value = Number(raw); if (!Number.isFinite(value)) throw fail(); return value; };
const integer = (raw: unknown, minimum = 0): number => { const value = amount(raw); if (value === null || !Number.isSafeInteger(value) || value < minimum) throw fail(); return value; };
const texts = (raw: unknown): string[] => list(raw).map(value => { const result = text(value); if (result === null) throw fail(); return result; });
function locations(raw: unknown): PurchaseLocation[] {
  const result = list(raw).map(value => {
    const row = record(value);
    if (!['stock', 'shipment'].includes(row.kind as string) || row.route !== null && !['warehouse', 'shipment'].includes(row.route as string) || row.received !== null && typeof row.received !== 'boolean') throw fail();
    if (row.route === 'warehouse' && row.kind !== 'stock' || row.route === 'shipment' && row.kind !== 'shipment') throw fail();
    return { kind: row.kind as PurchaseLocation['kind'], id: id(row.id), code: text(row.code), status: text(row.status), statusLabel: label(row.statusLabel), route: row.route as PurchaseLocation['route'], received: row.received as boolean | null, divideStatus: text(row.divideStatus) };
  });
  if (new Set(result.map(item => `${item.kind}:${item.id}`)).size !== result.length) throw fail();
  return result;
}
function shops(raw: unknown): PurchaseShop[] {
  if (raw === undefined) return [];
  const result = list(raw).map(value => { const row = record(value); return { id: id(row.id), title: label(row.title) }; });
  if (new Set(result.map(value => value.id)).size !== result.length) throw fail();
  return result;
}
function summary(raw: unknown): PurchaseSummary {
  const row = record(raw); const currency = text(row.currency)?.toUpperCase() ?? null; const countryCode = text(row.countryCode)?.toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency) || countryCode !== null && !/^[A-Z]{2}$/.test(countryCode)) throw fail();
  return { id: id(row.id), uid: text(row.uid), createdAt: text(row.createdAt), paidAt: text(row.paidAt), paymentStatus: text(row.paymentStatus), paymentStatusLabel: label(row.paymentStatusLabel), processingStatus: text(row.processingStatus), processingStatusLabel: label(row.processingStatusLabel), countryCode, countryTitle: label(row.countryTitle), currency, totalPrice: amount(row.totalPrice), itemCount: integer(row.itemCount), shops: shops(row.shops), productTitles: texts(row.productTitles).map(serverText), trackingNumbers: texts(row.trackingNumbers), locations: locations(row.locations) };
}
export function normalizePurchasePage(raw: unknown): PurchasePage {
  const row = record(raw); const filters = record(row.filters);
  const choice = (raw: unknown) => list(raw).map(value => { const entry = record(value); const code = text(entry.value), title = label(entry.label); if (!code || !title) throw fail(); return { value: code, label: title }; });
  const items = list(row.items).map(summary); const page = integer(row.page, 1), perPage = integer(row.perPage, 1), total = integer(row.total), pageCount = integer(row.pageCount);
  if (perPage > 50 || items.length > perPage || new Set(items.map(item => item.id)).size !== items.length || pageCount !== Math.ceil(total / perPage) || page > Math.max(1, pageCount) || items.length !== Math.min(perPage, Math.max(0, total - (page - 1) * perPage))) throw fail();
  return { items, page, perPage, total, pageCount, filters: { countries: choice(filters.countries), paymentStatuses: choice(filters.paymentStatuses), processingStatuses: choice(filters.processingStatuses) } };
}
export function normalizePurchaseDetail(raw: unknown): PurchaseDetail {
  const row = record(raw); const base = summary(row);
  const amounts = list(row.amounts).map(value => { const entry = record(value); if (!['goods', 'localShipping', 'commission', 'total'].includes(entry.key as string)) throw fail(); return { key: entry.key as PurchaseDetail['amounts'][number]['key'], amount: amount(entry.amount) }; });
  if (new Set(amounts.map(item => item.key)).size !== amounts.length) throw fail();
  const items = list(row.items).map(value => { const item = record(value); const title = label(item.title); if (title === null) throw fail(); return { shopId: item.shopId == null ? null : id(item.shopId), shopTitle: label(item.shopTitle), id: id(item.id), uid: text(item.uid), title, url: text(item.url), quantity: amount(item.quantity), price: amount(item.price), localShipping: amount(item.localShipping), color: label(item.color), size: label(item.size), variations: label(item.variations), tracking: text(item.tracking), paymentStatus: text(item.paymentStatus), paymentStatusLabel: label(item.paymentStatusLabel), processingStatus: text(item.processingStatus), processingStatusLabel: label(item.processingStatusLabel) }; });
  if (items.length !== base.itemCount || new Set(items.map(item => item.id)).size !== items.length) throw fail();
  return { ...base, invoiceUrl: text(row.invoiceUrl), cancelReason: label(row.cancelReason), amounts, items };
}
export function planPurchasesRead<Q extends PurchasesReadCommand>(command: Q): ReadPlan<PurchasesReadResult<Q>> {
  const params = new URLSearchParams();
  if (command.kind === 'purchases.detail') {
    if (!/^[1-9]\d*$/.test(command.id)) throw new MutationInputError('errors.validation');
    params.set('id', command.id);
    return { path: `/api/member-purchases?${params}`, normalize: normalizePurchaseDetail } as ReadPlan<PurchasesReadResult<Q>>;
  }
  const page = command.page ?? 1, perPage = command.perPage ?? 20;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 50) throw new MutationInputError('errors.validation');
  params.set('page', String(page)); params.set('perPage', String(perPage));
  if (command.search !== undefined) { if (typeof command.search !== 'string' || command.search.length > 150 || /[\x00-\x1f]/.test(command.search)) throw new MutationInputError('errors.validation'); if (command.search.trim()) params.set('search', command.search.trim()); }
  if (command.countryCode) { if (!/^[A-Z]{2}$/.test(command.countryCode)) throw new MutationInputError('errors.validation'); params.set('country', command.countryCode); }
  for (const key of ['paymentStatus', 'processingStatus'] as const) if (command[key]) { if (!/^[a-zA-Z0-9_-]{1,50}$/.test(command[key]!)) throw new MutationInputError('errors.validation'); params.set(key, command[key]!); }
  return { path: `/api/member-purchases?${params}`, normalize: normalizePurchasePage } as ReadPlan<PurchasesReadResult<Q>>;
}
