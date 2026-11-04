import type { DirectoryShop, ShopCategory } from '../../api/shop-directory.ts';

import type { LiveWarehouse, LiveWarehouseAddress } from '../../api/contracts.ts';
import { sortCountryOptions } from '../../domain/option-order.ts';

export function shopCountries(warehouses: readonly LiveWarehouse[] | null, addresses: readonly LiveWarehouseAddress[] | null, shops: readonly DirectoryShop[] = []) {
  const countries = new Map<string, { id: string; countryCode: string; title: string }>();
  const add = (code: string | null, title?: string | null) => {
    if (code && !countries.has(code)) countries.set(code, { id: code, countryCode: code, title: title || code });
  };
  if (warehouses?.length) for (const warehouse of warehouses) add(warehouse.code, warehouse.title);
  else for (const address of addresses || []) if (address.active !== false) add(address.countryCode, address.countryTitle);
  for (const shop of shops) add(shop.countryCode, shop.countryTitle);
  return sortCountryOptions([...countries.values()]);
}

export function shopOrderParams(shop: DirectoryShop) {
  return {
    ...(shop.directoryVerified ? { shopId: shop.id, ...(shop.countryCode ? { shopCountryCode: shop.countryCode } : {}) } : {}),
    ...(shop.storageId ? { storageId: shop.storageId } : {}),
  };
}

export function shopCategories(shops: readonly DirectoryShop[]): ShopCategory[] {
  const result = new Map<string, ShopCategory>();
  for (const shop of shops) for (const category of shop.categories) if (!result.has(category.id)) result.set(category.id, category);
  return [...result.values()];
}
export function shopPage(shops: readonly DirectoryShop[], search: string, categoryId: string, requestedPage: number) {
  const query = search.trim().toLocaleLowerCase();
  const matching = shops.filter(shop => (!categoryId || shop.categories.some(category => category.id === categoryId))
    && (!query || [shop.title, shop.url, ...shop.categories.map(category => category.title)].some(text => text?.toLocaleLowerCase().includes(query))));
  const pageCount = Math.ceil(matching.length / 20);
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, pageCount));
  return { items: matching.slice((page - 1) * 20, page * 20), total: matching.length, page, pageCount };
}
