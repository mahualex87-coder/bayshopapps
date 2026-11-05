import { ApiContractError } from './normalize.ts';

export type DivisionItem = { id: string; title: string; quantity: number; price: string; url: string; partNumber: number; currencyId: string | null; productType: string | null; orderNumber: string | null };
export type StockDivision = { verified: boolean; currency: string | null; comment: string; items: DivisionItem[]; basePrice: number | null; extraPrice: number | null };
const fail = () => { throw new ApiContractError('divizarea coletului'); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const string = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : fail();
const price = (value: unknown): number | null => value == null || value === '' ? null : /^\d+(?:\.\d+)?$/.test(string(value)) && Number.isFinite(Number(value)) ? Number(value) : fail();
export function normalizeStockDivision(raw: unknown): StockDivision {
  const envelope = record(raw);
  if (envelope.error === true) return fail();
  const data = envelope.declarationItems ? envelope : record(envelope.data);
  if (!Array.isArray(data.declarationItems)) return fail();
  const items = data.declarationItems.map(value => {
    const item = record(value);
    const declaredPrice = data.declarationPriceBasis === 'original-line-total' ? item.originalPrice : item.price;
    const quantity = Number(item.quantity), part = Number(item.partNumber || 1);
    if (!/^\d+$/.test(string(item.id)) || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(part) || part < 1 || price(declaredPrice) === null) return fail();
    return { id: string(item.id), title: string(item.title), quantity, price: string(declaredPrice), url: item.url == null ? '' : string(item.url), partNumber: part, currencyId: item.currencyId == null ? null : string(item.currencyId), productType: item.productType == null ? null : string(item.productType), orderNumber: item.orderNumber == null ? null : string(item.orderNumber) };
  });
  if (new Set(items.map(item => item.id)).size !== items.length) return fail();
  return { verified: data.declarationPriceBasis === 'original-line-total', currency: data.currency == null ? null : string(data.currency), comment: data.comment == null ? '' : string(data.comment), items, basePrice: price(data.dividePrice), extraPrice: price(data.additionalDividePrice) };
}
export function divisionParts(items: DivisionItem[], assignments: Record<string, string>): number | null {
  if (items.length < 2 || Object.keys(assignments).length !== items.length) return null;
  const parts = items.map(item => assignments[item.id]);
  if (parts.some(part => !/^[1-9]\d*$/.test(part || '') || Number(part) > items.length)) return null;
  const unique = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  return unique.length >= 2 && unique.every((part, index) => part === index + 1) ? unique.length : null;
}
export function divisionQuote(data: StockDivision, assignments: Record<string, string>): number | null {
  const count = divisionParts(data.items, assignments);
  if (count === null || data.basePrice === null || count > 2 && data.extraPrice === null) return null;
  return Math.round((data.basePrice + Math.max(0, count - 2) * (data.extraPrice ?? 0)) * 100) / 100;
}
export function divisionFields(data: StockDivision, assignments: Record<string, string>, comment: string) {
  if (!data.verified || !data.currency || divisionQuote(data, assignments) === null) return fail();
  const items = data.items.map(({ id }) => ({ id, partNumber: Number(assignments[id]) })).sort((a, b) => a.partNumber - b.partNumber);
  return { declarationItems: JSON.stringify(items), priceSemantics: 'original-line-total', comment: comment.trim() };
}
