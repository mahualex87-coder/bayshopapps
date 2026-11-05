import { ApiContractError } from './normalize.ts';
import { serverText } from '../domain/server-text.ts';

export type CartLinkStorage = { id: string; countryCode: string; countryTitle: string; currency: string | null; currencySign: string | null };
export type CartLinkShop = { id: string; title: string; storageId: string; isComplex: boolean };
export type CartLinkWriteMode = 'verified' | 'legacy-matched' | 'unavailable';
export type CartLinkData = { canSave: boolean; writeMode: CartLinkWriteMode; storages: CartLinkStorage[]; storageId: string | null; shipping: number | null; shop: CartLinkShop | null; resolution: 'identified' | 'unregistered' | 'unknown' };
export function cartMarketMatches(lookup: CartLinkData, storageId: string, market: { countryCode: string; currency: string }): boolean {
  const storage = lookup.storages.find(item => item.id === storageId);
  if (!storage || lookup.storageId !== storageId || storage.countryCode !== market.countryCode) return false;
  if (storage.currency !== null) return storage.currency === market.currency;
  // The legacy Romanian shop lookup returns the ISO code only in currency_sign.
  return lookup.writeMode === 'legacy-matched' && market.countryCode === 'RO' && market.currency === 'RON'
    && storage.currencySign?.trim().toUpperCase() === 'RON';
}
export type CartSaved = { id: string | null; uid: string | null; shopId: string | null; storageId: string | null; countryCode: string | null; status: string | null };
const fail = () => new ApiContractError('produsul din link');
const row = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(); return value as Record<string, unknown>; };
const text = (value: unknown): string | null => { if (value == null || value === '') return null; if (typeof value !== 'string') throw fail(); return value; };
const id = (value: unknown): string | null => { if (value == null || value === '') return null; if ((typeof value !== 'string' && typeof value !== 'number') || !/^[1-9]\d*$/.test(String(value))) throw fail(); return String(value); };
const requiredId = (value: unknown): string => { const result = id(value); if (result === null) throw fail(); return result; };
const flag = (value: unknown): boolean => { if (![true, false, 0, 1, '0', '1'].includes(value as never)) throw fail(); return value === true || value === 1 || value === '1'; };
const country = (value: unknown): string | null => { const result = text(value)?.toUpperCase() ?? null; if (result !== null && !/^[A-Z]{2}$/.test(result)) throw fail(); return result; };
export function normalizeCartLinkData(value: unknown): CartLinkData {
  const data = row(value);
  if (!Array.isArray(data.storageList)) throw fail();
  const storages = data.storageList.map(value => {
    const item = row(value), code = country(item.countryCode), title = text(item.countryTitle), currency = text(item.currency)?.toUpperCase() ?? null;
    if (!code || !title || currency !== null && !/^[A-Z]{3}$/.test(currency)) throw fail();
    return { id: requiredId(item.storage_id), countryCode: code, countryTitle: serverText(title), currency, currencySign: text(item.currency_sign)?.trim() || null };
  });
  if (new Set(storages.map(value => value.id)).size !== storages.length) throw fail();
  const storageId = id(data.storage_id);
  if (storageId !== null && !storages.some(value => value.id === storageId)) throw fail();
  let shipping: number | null = null;
  if (data.shipping != null && data.shipping !== '') {
    if (typeof data.shipping !== 'number' && (typeof data.shipping !== 'string' || !/^\d+(?:\.\d+)?$/.test(data.shipping))) throw fail();
    shipping = Number(data.shipping); if (!Number.isFinite(shipping) || shipping < 0) throw fail();
  }
  let shop: CartLinkShop | null = null;
  if (data.shop != null) {
    const item = row(data.shop), title = text(item.title);
    if (!title) throw fail();
    shop = { id: requiredId(item.id), title: serverText(title), storageId: requiredId(item.storageId), isComplex: flag(item.isComplex) };
    if (shop.storageId !== storageId) throw fail();
  }
  const resolution = data.resolution ?? 'unknown';
  if (!['identified', 'unregistered', 'unknown'].includes(resolution as string) || resolution === 'identified' && !shop || resolution === 'unregistered' && shop) throw fail();
  // The documented legacy GET sets storage_id only after finding an active
  // shop for the URL. It cannot register unknown shops or safely edit items.
  // An explicit capability=false must never fall back to the legacy route.
  const legacyMatched = !Object.hasOwn(data, 'cartWriteSupported') && data.resolution === undefined && data.shop == null && storageId !== null;
  const writeMode: CartLinkWriteMode = data.cartWriteSupported === true ? 'verified' : legacyMatched ? 'legacy-matched' : 'unavailable';
  return { canSave: writeMode !== 'unavailable', writeMode, storages, storageId, shipping, shop, resolution: resolution as CartLinkData['resolution'] };
}
/** Envelope acknowledgement is verified by the registry first. A legacy ack
 * can confirm saving, but cannot identify a product for immediate checkout. */
export function normalizeCartSavedData(value: unknown): CartSaved {
  if (value == null) return { id: null, uid: null, shopId: null, storageId: null, countryCode: null, status: null };
  const data = row(value);
  return { id: requiredId(data.id), uid: text(data.uid), shopId: id(data.shopId), storageId: id(data.storageId), countryCode: country(data.countryCode), status: text(data.status) };
}
