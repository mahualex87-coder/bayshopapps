import { normalizeUserUrl } from './user-url.ts';

type ParcelTitleItem = { title: string; url: string | null };

/** Match BayShop's declaration naming: one row uses its product title;
 * multiple rows use the most frequent shop host, with the first host winning
 * ties. Quantity does not change the number of declaration rows. This is a
 * display value, not a separate editable or persisted parcel-name field. */
export function declarationParcelTitle(items: readonly ParcelTitleItem[]): string | null {
  if (items.length === 1) return items[0].title.trim() || null;
  const hosts = new Map<string, number>();
  for (const item of items) {
    const link = normalizeUserUrl(item.url || '');
    if (!link || /[\s\\\u0000-\u001f\u007f]/u.test(link)) continue;
    try {
      const url = new URL(link);
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) continue;
      hosts.set(url.hostname, (hosts.get(url.hostname) || 0) + 1);
    } catch { /* Incomplete links are validated by their product field. */ }
  }
  let dominantHost: string | null = null;
  let highestCount = 0;
  for (const [host, count] of hosts) {
    if (count > highestCount) { dominantHost = host; highestCount = count; }
  }
  return dominantHost?.replace(/^www\./, '') || null;
}
