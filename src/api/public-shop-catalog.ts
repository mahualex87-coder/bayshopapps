import { DomUtils, parseDocument } from 'htmlparser2';
import { serverText } from '../domain/server-text.ts';
import type { Language } from '../i18n/core.ts';
import { publicShopUrl } from './shop-directory.ts';

export type PublicShopContext = { sourceCountry: string; destinationCountry: string; language: Language };
export type PublicShopCatalogQuery = PublicShopContext & { category?: string; page?: number };
export type PublicShopDetailQuery = PublicShopContext & { shopSlug: string };
export type PublicShopCategory = { slug: string; title: string };
export type PublicShopSummary = { slug: string; title: string; description: string | null };
export type PublicShopCatalogPage = { categories: PublicShopCategory[]; shops: PublicShopSummary[]; page: number; hasNext: boolean; hasPrevious: boolean };
export type PublicShopDetail = { publicCommissionPercent: number | null; title: string; description: string | null; url: string | null; categories: PublicShopCategory[] };

const origin = 'https://bayshop.com';
const maxHtml = 1_500_000;
const categorySlug = /^(?!store_|[0-9]+$)[a-z0-9][a-z0-9_-]{0,159}$/;
const storeSlug = /^store_[a-z0-9][a-z0-9_-]{0,159}$/;
const unavailable = () => new Error('shops.publicUnavailable');
type HtmlElement = ReturnType<typeof DomUtils.findAll>[number];
const hasClass = (element: HtmlElement, name: string) => element.attribs.class?.split(/\s+/).includes(name) ?? false;
const plain = (element: HtmlElement | undefined | null, max: number) => element ? serverText(DomUtils.getOuterHTML(element)).replace(/\s+/g, ' ').trim().slice(0, max) : '';

function basePath(q: PublicShopContext): string {
  if (!/^[A-Z]{2}$/.test(q.destinationCountry) || !/^[A-Z]{2}$/.test(q.sourceCountry) || !['ro', 'ru', 'en'].includes(q.language)) throw unavailable();
  // BayShop's canonical default region has no country prefix. Other default
  // languages may redirect once to /cc/; the parsed country & language must match.
  const locale = q.destinationCountry === 'MD'
    ? (q.language === 'ro' ? '' : q.language.toUpperCase() + '/')
    : (q.destinationCountry === 'RO' && q.language === 'ro' ? 'ro/' : q.destinationCountry.toLowerCase() + '_' + q.language.toUpperCase() + '/');
  return '/' + locale + 'shop-' + q.sourceCountry.toLowerCase() + '/';
}
function suffix(q: PublicShopCatalogQuery | PublicShopDetailQuery): string {
  if ('shopSlug' in q) { if (!storeSlug.test(q.shopSlug)) throw unavailable(); return q.shopSlug + '/'; }
  const page = q.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || q.category && !categorySlug.test(q.category)) throw unavailable();
  return (q.category ? q.category + '/' : '') + (page === 1 ? '' : page + '/');
}
function checkedUrl(href: string, base = origin): URL | null {
  if (!href || /[\\\u0000-\u0020\u007f]/.test(href)) return null;
  try {
    const url = new URL(href, base);
    return url.origin === origin && !url.username && !url.password && !url.search && !url.hash ? url : null;
  } catch { return null; }
}
function allowedBase(path: string, q: PublicShopContext): boolean {
  return path === basePath(q) || (q.destinationCountry !== 'MD' && path === '/' + q.destinationCountry.toLowerCase() + '/shop-' + q.sourceCountry.toLowerCase() + '/');
}

function pageDocument(html: string, q: PublicShopCatalogQuery | PublicShopDetailQuery, actualUrl: string) {
  const url = checkedUrl(actualUrl);
  const tail = suffix(q);
  if (!url || html.length > maxHtml || !url.pathname.endsWith(tail)) throw unavailable();
  const base = url.pathname.slice(0, url.pathname.length - tail.length);
  if (!allowedBase(base, q)) throw unavailable();
  const document = parseDocument(html);
  const root = DomUtils.findOne(e => e.name === 'html', document.children);
  const head = root && DomUtils.findOne(e => e.name === 'head', root.children);
  const canonical = head && DomUtils.findOne(e => e.name === 'link' && e.attribs.rel === 'canonical', head.children);
  const canonicalUrl = canonical && checkedUrl(canonical.attribs.href, url.href);
  const path = 'shopSlug' in q ? base + q.shopSlug + '/' : base + (q.category ? q.category + '/' : '');
  // Paginated pages canonicalize to the first page. Their selected page is checked below.
  if (!root || root.attribs.lang?.toLowerCase() !== (q.language + '-' + q.destinationCountry).toLowerCase()
      || !canonicalUrl || canonicalUrl.pathname !== path) throw unavailable();
  return { root, url, base };
}
function linkedSlug(e: HtmlElement, url: URL, base: string, valid: RegExp, page = 1): string | null {
  const path = checkedUrl(e.attribs.href, url.href)?.pathname;
  if (!path || !path.startsWith(base)) return null;
  let slug = path.slice(base.length).replace(/\/$/, '');
  // On later pages the site's sidebar preserves the current page, e.g. /electronics/2.
  if (page > 1 && slug.endsWith('/' + page)) slug = slug.slice(0, -(String(page).length + 1));
  return valid.test(slug) ? slug : null;
}

export function parsePublicShopCatalog(html: string, q: PublicShopCatalogQuery, actualUrl: string): PublicShopCatalogPage {
  const { root, url, base } = pageDocument(html, q, actualUrl);
  const aside = DomUtils.findOne(e => e.name === 'aside' && hasClass(e, 'subcategory-list'), root.children);
  const selectedCountry = DomUtils.findOne(e => e.name === 'option' && 'selected' in e.attribs && e.attribs['data-country']?.toUpperCase() === q.sourceCountry, root.children);
  if (!aside || !selectedCountry) throw unavailable();
  const categories = new Map<string, PublicShopCategory>();
  let selected: string | null = null;
  for (const link of DomUtils.getElementsByTagName('a', aside.children)) {
    const slug = linkedSlug(link, url, base, categorySlug, q.page ?? 1);
    const title = plain(link, 180);
    if (!slug || !title) continue;
    categories.set(slug, { slug, title });
    if (hasClass(link, 'is-active')) selected = slug;
  }
  if (selected !== (q.category || null)) throw unavailable();
  const page = q.page ?? 1;
  const pager = DomUtils.findOne(e => hasClass(e, 'store-pagination'), root.children);
  const current = pager && DomUtils.findOne(e => e.name === 'li' && hasClass(e, 'is-active'), pager.children);
  if ((current && DomUtils.textContent(current).trim() !== String(page)) || (page > 1 && !current)) throw unavailable();
  const shops = new Map<string, PublicShopSummary>();
  for (const link of DomUtils.findAll(e => e.name === 'a' && (hasClass(e, 'store-card-list-content') || hasClass(e, 'store-card-content')), root.children)) {
    const slug = linkedSlug(link, url, base, storeSlug);
    const title = plain(DomUtils.findOne(e => hasClass(e, 'store-card-title'), link.children), 200);
    if (!slug || !title || shops.has(slug)) continue;
    const description = DomUtils.findOne(e => hasClass(e, 'store-card-desc'), link.children);
    const paragraph = description && DomUtils.findOne(e => e.name === 'p', description.children);
    shops.set(slug, { slug, title, description: plain(paragraph, 600) || null });
  }
  const hasPage = (n: number) => !!pager && DomUtils.getElementsByTagName('a', pager.children).some(e =>
    n > 0 && checkedUrl(e.attribs.href, url.href)?.pathname === base + suffix({ ...q, page: n }));
  return { categories: [...categories.values()], shops: [...shops.values()], page, hasNext: hasPage(page + 1), hasPrevious: hasPage(page - 1) };
}

// Read only the current percentage in the localized buyback commission tile.
// Previous promotional rates use <sup><del>; delivery discounts are separate tiles.
function publicCommissionPercent(root: HtmlElement, language: Language): number | null {
  const labels = { ro: 'Comisionul nostru de achiziție a comenzii', ru: 'Наша комиссия за выкуп заказа', en: 'Our commission for the buyback of the order' };
  const tiles = DomUtils.findAll(el => hasClass(el, 'statistics-item'), root.children);
  const firstText = (el: HtmlElement | null) => el?.children.flatMap(node => node.type === 'text' ? node.data.trim() : []).find(Boolean);
  for (const tile of tiles) {
    const heading = DomUtils.findOne(el => hasClass(el, 'h4'), tile.children);
    if (firstText(heading) !== labels[language]) continue;
    const current = firstText(DomUtils.findOne(el => hasClass(el, 'h2'), tile.children));
    const match = current?.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
    if (match) {
      const rate = Number(match[1].replace(',', '.'));
      if (Number.isFinite(rate)) return rate;
    }
  }
  return null;
}

export function parsePublicShopDetail(html: string, q: PublicShopDetailQuery, actualUrl: string): PublicShopDetail {
  const { root } = pageDocument(html, q, actualUrl);
  const steps = DomUtils.findOne(e => hasClass(e, 'store-slide-steps'), root.children);
  const merchant = steps && DomUtils.findOne(e => e.name === 'a' && e.attribs.rel?.split(/\s+/).includes('nofollow'), steps.children);
  const title = plain(merchant, 200);
  if (!merchant || !title) throw unavailable();
  const about = DomUtils.findOne(e => hasClass(e, 'store-detail-desc'), root.children);
  const box = about && DomUtils.findOne(e => hasClass(e, 'store-desc-box'), about.children);
  // The public detail template does not expose the shop/category relation.
  return { title, publicCommissionPercent: publicCommissionPercent(root, q.language), url: publicShopUrl(merchant.attribs.href), description: plain(box, 2400) || null, categories: [] };
}

async function readPublicPage(fetcher: typeof fetch, q: PublicShopCatalogQuery | PublicShopDetailQuery, signal: AbortSignal) {
  const tail = suffix(q);
  let url = origin + basePath(q) + tail;
  for (let i = 0; i < 2; i++) {
    const response = await fetcher(url, { method: 'GET', credentials: 'omit', redirect: 'manual', referrerPolicy: 'no-referrer', signal, headers: { Accept: 'text/html', 'Accept-Language': q.language } });
    if (signal.aborted) throw unavailable();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = checkedUrl(response.headers.get('location') || '', url);
      if (!next || !next.pathname.endsWith(tail) || !allowedBase(next.pathname.slice(0, next.pathname.length - tail.length), q)) throw unavailable();
      url = next.href; continue;
    }
    if (!response.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length')) > maxHtml) throw unavailable();
    const html = await response.text();
    if (signal.aborted || html.length > maxHtml) throw unavailable();
    return { html, url: response.url || url };
  }
  throw unavailable();
}
export async function readPublicShopCatalog(fetcher: typeof fetch, q: PublicShopCatalogQuery, signal: AbortSignal) {
  const page = await readPublicPage(fetcher, q, signal);
  return parsePublicShopCatalog(page.html, q, page.url);
}
export async function readPublicShopDetail(fetcher: typeof fetch, q: PublicShopDetailQuery, signal: AbortSignal) {
  const page = await readPublicPage(fetcher, q, signal);
  return parsePublicShopDetail(page.html, q, page.url);
}
