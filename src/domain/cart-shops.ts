import type { CartItem } from '../api/operations-normalize.ts';

export type CartShopGroup = { key: string; shopId: string | null; title: string | null; currency: string | null; isComplex: boolean | null; items: CartItem[] };

/** Only a server shop identity may combine products. Unknown shops stay separate. */
export function groupCartByShop(items: readonly CartItem[]): CartShopGroup[] {
  const groups = new Map<string, CartShopGroup>();
  for (const item of items) {
    const key = item.shopId ? JSON.stringify([item.shopId, item.storageId ?? null, item.currency?.toUpperCase() ?? null]) : `unidentified:${item.id}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
      if (group.isComplex !== item.isComplex) group.isComplex = null;
    } else groups.set(key, { key, shopId: item.shopId, title: item.shopTitle, currency: item.currency?.toUpperCase() ?? null, isComplex: item.isComplex, items: [item] });
  }
  return [...groups.values()];
}

export function cartSelectionIssue(group: CartShopGroup, selected: readonly string[]): string | null {
  if (!selected.length) return 'cartLink.chooseProducts';
  if (!group.shopId) return 'cartLink.shopPending';
  if (new Set(selected).size !== selected.length || selected.some(id => !group.items.some(item => item.id === id))) return 'cartLink.selectionChanged';
  if (group.items.some(item => selected.includes(item.id) && item.status != null && item.status !== 'unpaid')) return 'cartLink.shopPending';
  if (selected.length > 1 && group.isComplex !== true) return 'cartLink.singleOnly';
  return null;
}
