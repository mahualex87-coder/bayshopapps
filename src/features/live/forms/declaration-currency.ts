import type { DeclarationItem } from '../../../api/operations-normalize.ts';

export type DeclarationCurrencyMetadata = { currencyId?: string | null; availableCurrencies?: { id: string; title: string; sign: string | null }[] };
type CurrencyRow = { price: string; currency?: string | null; currencyId?: string | null };
export const currencyCode = (value: string | null | undefined): string | null => value && /^[a-z]{3}$/i.test(value) ? value.toLowerCase() : null;
export function codeForCurrencyId(metadata: DeclarationCurrencyMetadata | undefined, id: string | null | undefined): string | null {
  return id ? currencyCode(metadata?.availableCurrencies?.find(item => item.id === id)?.title) : null;
}
function originalCode(item: CurrencyRow, metadata?: DeclarationCurrencyMetadata): string | null {
  return item.currencyId ? codeForCurrencyId(metadata, item.currencyId) : currencyCode(item.currency) || codeForCurrencyId(metadata, metadata?.currencyId);
}
/** Read values keep their own monetary basis. Never label a converted value
 * with the original foreign currency merely because currencyId is present. */
export function declarationForDisplay(item: DeclarationItem, metadata?: DeclarationCurrencyMetadata): DeclarationItem {
  const code = item.priceBasis === 'warehouse' ? codeForCurrencyId(metadata, metadata?.currencyId) : originalCode(item, metadata);
  return { ...item, currency: code };
}
/** Without the original foreign value, asking the user to enter it is safer
 * than reconverting an already converted amount during an unrelated edit. */
export function declarationForEditing(item: DeclarationItem, metadata?: DeclarationCurrencyMetadata): DeclarationItem & { requiresPriceEntry: boolean } {
  const warehouseCode = codeForCurrencyId(metadata, metadata?.currencyId);
  const differentCurrency = item.currencyId ? item.currencyId !== metadata?.currencyId : !!currencyCode(item.currency) && currencyCode(item.currency) !== warehouseCode;
  const requiresPriceEntry = item.priceBasis === 'warehouse' && differentCurrency;
  const code = originalCode(item, metadata);
  const resolvedId = metadata?.availableCurrencies?.find(option => currencyCode(option.title) === code)?.id;
  return { ...item, price: requiresPriceEntry ? '' : item.price, currency: code, currencyId: item.currencyId || resolvedId || null, requiresPriceEntry };
}
export function applyDeclarationCurrency<T extends CurrencyRow>(items: T[], id: string, code: string): T[] {
  return items.map(item => ({ ...item, currencyId: id, currency: code.toLowerCase() }));
}
export function commonDeclarationCurrency(items: CurrencyRow[]): string | null {
  const codes = new Set(items.map(item => currencyCode(item.currency)));
  return codes.size === 1 && !codes.has(null) ? [...codes][0] : null;
}
/** Waiting edits preserve row currencies unless the user explicitly selects
 * an override. Stock's backend accepts only one effective row currency. */
export function declarationCurrencySubmission(items: CurrencyRow[], mode: 'waiting-new' | 'waiting-edit' | 'stock' | 'shipment', metadata: DeclarationCurrencyMetadata | undefined, overrideId: string | null): { currencyCode: string | null; error: string | null } {
  if (items.some(item => !currencyCode(item.currency) || !metadata?.availableCurrencies?.some(option => currencyCode(option.title) === currencyCode(item.currency)))) return { currencyCode: null, error: 'declarationCurrency.unavailable' };
  const common = commonDeclarationCurrency(items);
  const overrideCode = codeForCurrencyId(metadata, overrideId);
  if (overrideId && (!overrideCode || common !== overrideCode)) return { currencyCode: null, error: 'declarationCurrency.unavailable' };
  if ((mode === 'stock' || mode === 'shipment') && !common) return { currencyCode: null, error: mode === 'stock' ? 'declarationCurrency.stockMixed' : 'declarationCurrency.shipmentMixed' };
  return { currencyCode: overrideCode || (mode === 'waiting-edit' ? null : common), error: null };
}
