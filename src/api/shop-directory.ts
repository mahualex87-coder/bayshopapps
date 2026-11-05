import { ApiContractError } from './normalize.ts';
import { MutationInputError, type ReadPlan } from './mutations.ts';
import { serverText } from '../domain/server-text.ts';

export type ShopCategory = { id: string; title: string };
export type DirectoryShop = {
  id: string; title: string; url: string | null; countryCode: string | null; countryTitle: string | null;
  storageId: string | null; currency: string | null; commissionPercent: number | null;
  publicCommissionPercent?: number | null; commissionMin: number | null; commissionMax: number | null; commissionCurrency: string | null;
  description: string | null; categories: ShopCategory[]; directoryVerified: boolean;
};
export type ShopDirectory = { shops: DirectoryShop[]; verified: boolean; matchedShopId: string | null };
export type ShopDirectoryReadCommand =
  | { kind: 'shops.list'; countryCode?: string }
  | { kind: 'shops.detail'; id: string; countryCode?: string }
  | { kind: 'shops.match'; id: string; countryCode?: string; url: string };
export type ShopDirectoryReadResult<Q extends ShopDirectoryReadCommand> = Q extends { kind: 'shops.detail' } ? DirectoryShop | null : ShopDirectory;
const fail = () => new ApiContractError('shops');
const record = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(); return value as Record<string, unknown>; };
const id = (value: unknown): string => { if (!/^[1-9]\d*$/.test(String(value)) || !['string', 'number'].includes(typeof value)) throw fail(); return String(value); };
const text = (value: unknown): string | null => { if (value == null || value === '') return null; if (typeof value !== 'string') throw fail(); return serverText(value).trim() || null; };
const code = (value: unknown, length: number): string | null => { const result = text(value)?.toUpperCase() ?? null; if (result !== null && !new RegExp(`^[A-Z]{${length}}$`).test(result)) throw fail(); return result; };
const number = (value: unknown): number | null => { if (value == null || value === '') return null; if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) throw fail(); const n = Number(value); if (!Number.isFinite(n) || n < 0) throw fail(); return n; };
export function publicShopUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || /[\u0000-\u0020\u007f\\]/.test(raw)) return null;
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.port && url.hostname.includes('.') ? url.href : null; } catch { return null; }
}
export function normalizeShopDirectory(raw: unknown, requestedCountry?: string): ShopDirectory {
  const envelope = Array.isArray(raw) ? null : record(raw);
  const verified = envelope?.version === 1;
  if (envelope && !verified) throw fail();
  const rows = envelope ? envelope.shops : raw;
  if (!Array.isArray(rows)) throw fail();
  const shops: DirectoryShop[] = [];
  for (const value of rows) {
    const row = record(value);
    const shopId = id(row.id);
    const title = text(row.title);
    // The legacy API left-joins the requested translation and includes unnamed rows.
    // Match the directory endpoint's omission of shops without a display title.
    if (!verified && Object.hasOwn(row, 'title') && !title) continue;
    if (!title || verified && row.active !== true) throw fail();
    const countryCode = code(row.countryCode, 2) ?? requestedCountry ?? null;
    if (requestedCountry && countryCode !== requestedCountry) throw fail();
    const categories = row.categories == null ? [] : row.categories;
    if (!Array.isArray(categories)) throw fail();
    const mapped = categories.map(value => { const c = record(value); const title = text(c.title); if (!title) throw fail(); return { id: id(c.id), title }; });
    if (new Set(mapped.map(c => c.id)).size !== mapped.length) throw fail();
    shops.push({ id: shopId, title, url: publicShopUrl(row.url), countryCode, countryTitle: text(row.countryTitle), storageId: row.storageId == null ? null : id(row.storageId), currency: code(row.currency, 3), commissionPercent: number(row.commissionPercent), publicCommissionPercent: verified ? number(row.publicCommissionPercent) : null, commissionMin: number(row.commissionMin), commissionMax: number(row.commissionMax), commissionCurrency: code(row.commissionCurrency, 3), description: text(row.shortDescription), categories: mapped, directoryVerified: verified });
  }
  if (new Set(shops.map(shop => shop.id)).size !== shops.length) throw fail();
  const matchedShopId = envelope?.matchedShopId == null ? null : id(envelope.matchedShopId);
  if (matchedShopId && !shops.some(shop => shop.id === matchedShopId)) throw fail();
  return { shops, verified, matchedShopId };
}
export function requireShopMatch(directory: ShopDirectory, shopId: string, storageId: string): void {
  const shop = directory.shops.find(shop => shop.id === shopId);
  if (!directory.verified) throw new MutationInputError('shops.matchUnavailable');
  if (directory.matchedShopId !== shopId || !shop || shop.storageId !== storageId) throw new MutationInputError('shops.urlMismatch');
}
export function planShopDirectoryRead<Q extends ShopDirectoryReadCommand>(command: Q): ReadPlan<ShopDirectoryReadResult<Q>> {
  if (command.countryCode && !/^[A-Z]{2}$/.test(command.countryCode)) throw new MutationInputError('errors.validation');
  const params = new URLSearchParams({ active: '1', directory: '1' });
  if (command.countryCode) params.set('countryCode', command.countryCode);
  if (command.kind !== 'shops.list') { if (!/^[1-9]\d*$/.test(command.id)) throw new MutationInputError('errors.validation'); params.set('id', command.id); }
  if (command.kind === 'shops.match') { if (!publicShopUrl(command.url)) throw new MutationInputError('errors.validation'); params.set('url', command.url); }
  return { path: `/api/shops?${params}`, normalize: raw => { const data = normalizeShopDirectory(raw, command.countryCode); return command.kind === 'shops.detail' ? data.shops.find(shop => shop.id === command.id) ?? null : data; } } as ReadPlan<ShopDirectoryReadResult<Q>>;
}
