import type { CartItem, OrderSummary } from '../../api/operations-normalize.ts';

export const COMMERCE_PAGE_SIZE = 20;

/** These endpoints return complete lists; bound rendering without claiming server pagination. */
export function commercePage<T>(items: readonly T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / COMMERCE_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const offset = (page - 1) * COMMERCE_PAGE_SIZE;
  return { items: items.slice(offset, offset + COMMERCE_PAGE_SIZE), page, pages, total: items.length, from: items.length ? offset + 1 : 0, to: Math.min(offset + COMMERCE_PAGE_SIZE, items.length) };
}

const matches = (values: (string | null | undefined)[], search: string, language: string) => {
  const query = search.trim().toLocaleLowerCase(language);
  return !query || values.some(value => value?.toLocaleLowerCase(language).includes(query));
};

export function filterCart(items: readonly CartItem[], search: string, language: string): CartItem[] {
  return items.filter(item => matches([item.id, item.uid, item.title, item.shopTitle, item.color, item.size, item.comment], search, language));
}

export function filterOrders(items: readonly OrderSummary[], search: string, status: string, language: string): OrderSummary[] {
  return items.filter(item => (!status || item.status === status) && matches([item.id, item.uid, item.status, item.statusLabel, ...item.items.flatMap(product => [product.id, product.uid, product.title, product.statusLabel])], search, language));
}
