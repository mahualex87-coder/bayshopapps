/** A capture from the merchant is an editable order draft. BayShop validates it again. */
export type ZaraProductDraft = { url: string; title: string; price: string; currency: 'RON'; color: string; size: string; sku: string | null };
export type ZaraSizeChoice = { label: string; sku: string | null; price?: string };
type Failure = 'product' | 'price' | 'color' | 'unavailable' | 'changed';
export type ZaraCaptureResult =
  | { ok: true; draft: ZaraProductDraft }
  | { ok: false; reason: Failure }
  | { ok: false; reason: 'size'; choices?: ZaraSizeChoice[]; draft?: Omit<ZaraProductDraft, 'size' | 'sku'> };

function zaraUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && !u.username && !u.password && !u.port && ['www.zara.com', 'zara.com'].includes(u.hostname)) return u;
  } catch { /* An incomplete or unrelated URL cannot be imported. */ }
  return null;
}
export function isZaraBrowseUrl(raw: string): boolean {
  const u = zaraUrl(raw);
  if (!u || !/^\/ro\/(?:$|(?:ro|en)(?:\/|$))/.test(u.pathname) || /%(?:2f|5c|2e|00)/i.test(u.pathname)) return false;
  // Only the storefront is used by the embedded browser.
  return !/(?:\/|^)(?:log[ -]?in|logonform|sign[ -]?in|register|account|user|checkout|cart|basket|order|wallet|payment|my-account|cos|coș|comanda|comandă|autentificare|inregistrare)(?:[/.?#_-]|$)/i.test(decodePath(u.pathname));
}
function decodePath(path: string): string {
  try { return decodeURIComponent(path); } catch { return '/checkout'; }
}
export function zaraRomaniaShopStart(countryCode: string | null, shopUrl: string | null): string | null {
  if (countryCode !== 'RO' || !shopUrl) return null;
  const incoming = shopUrl.trim();
  const url = zaraUrl(incoming.replace(/^http:\/\//i, 'https://'));
  return url && (url.pathname === '/' || isZaraBrowseUrl(url.href)) ? 'https://www.zara.com/ro/ro/' : null;
}
export function zaraProductUrl(raw: string): string | null {
  if (!isZaraBrowseUrl(raw)) return null;
  const u = new URL(raw);
  if (!/^\/ro\/(ro|en)\/[a-z0-9%_.~-]+-p\d{7,12}\.html$/i.test(u.pathname)) return null;
  const result = new URL(u.pathname, 'https://www.zara.com');
  for (const key of ['v1', 'v2']) {
    const values = u.searchParams.getAll(key);
    if (values.length > 1 || (values.length && !/^\d{1,18}$/.test(values[0]))) return null;
    if (values.length) result.searchParams.set(key, values[0]);
  }
  return result.href;
}
const boundedText = (v: unknown, limit: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= limit && !/[<>\u0000-\u001f\u007f]/.test(v);
const validSku = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$/.test(v);
const validPrice = (v: unknown): v is string => typeof v === 'string' && /^\d{1,7}(?:\.\d{1,2})?$/.test(v) && Number(v) > 0;

export function readZaraCapture(message: string, requestId: string, currentUrl: string): ZaraCaptureResult {
  if (!message || message.length > 12000 || !requestId) return { ok: false, reason: 'changed' };
  let m;
  try { m = JSON.parse(message); } catch { return { ok: false, reason: 'changed' }; }
  if (!m || m.type !== 'bayshop.zara.capture.v1' || m.requestId !== requestId) return { ok: false, reason: 'changed' };
  const url = zaraProductUrl(currentUrl);
  if (!url) return { ok: false, reason: 'product' };
  if (typeof m.url !== 'string' || zaraProductUrl(m.url) !== url) return { ok: false, reason: 'changed' };
  if (m.reason === 'unavailable' || m.reason === 'changed') return { ok: false, reason: m.reason };
  if (!boundedText(m.title, 250)) return { ok: false, reason: 'product' };
  if (m.currency !== 'RON' || !validPrice(m.price)) return { ok: false, reason: 'price' };
  if (!boundedText(m.color, 80)) return { ok: false, reason: 'color' };
  const variantUrl = m.variantUrl == null ? url : zaraProductUrl(m.variantUrl);
  if (!variantUrl || new URL(variantUrl).pathname !== new URL(url).pathname ||
      (new URL(url).searchParams.has('v1') && new URL(url).searchParams.get('v1') !== new URL(variantUrl).searchParams.get('v1'))) return { ok: false, reason: 'changed' };
  const draft = { url: variantUrl, title: m.title.trim(), price: m.price, currency: 'RON' as const, color: m.color.trim() };
  if (!boundedText(m.size, 60)) {
    const choices: ZaraSizeChoice[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(m.choices) && m.choices.length <= 80 ? m.choices : []) {
      if (!item || !boundedText(item.label, 60) || seen.has(item.label)) return { ok: false, reason: 'size' };
      seen.add(item.label);
      if (item.price != null && !validPrice(item.price)) return { ok: false, reason: 'price' };
      choices.push({ label: item.label, sku: validSku(item.sku) ? item.sku : null, ...(item.price == null ? {} : {price:item.price}) });
    }
    return choices.length ? { ok: false, reason: 'size', choices, draft } : { ok: false, reason: 'size' };
  }
  return { ok: true, draft: { ...draft, size: m.size.trim(), sku: validSku(m.sku) ? m.sku : null } };
}

// A literal script is needed here: Hermes does not preserve executable function
// source for toString(). This runs inside Zara's storefront and reads only the
// displayed product. It does not call merchant APIs or change their basket.
export const zaraSelectionObserverScript = String.raw`
(function () {
  if (window !== window.top || location.protocol !== 'https:' || !/^(?:www\.)?zara\.com$/i.test(location.hostname) ||
      !/^\/ro\/(?:ro|en)\//.test(location.pathname) || window.__bayShopZaraPdpV1) return;
  const simplify = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const shown = el => el && el.getClientRects().length > 0 && !el.closest('[hidden],[aria-hidden="true"]') &&
    getComputedStyle(el).visibility !== 'hidden';
  const visible = (root, selector) => Array.from(root.querySelectorAll(selector)).filter(shown);
  const label = el => el ? simplify(el.textContent) : '';
  const productPage = () => /-p\d{7,12}\.html$/i.test(location.pathname);
  function context() {
    if (!productPage()) return null;
    // Zara keeps adjacent product cards rendered offscreen. Their titles, sizes
    // and sale prices must not be read as part of the current article.
    const slideSelector = '.product-detail-view-base-mob__carousel-item';
    const cards = visible(document, slideSelector + ' article.product-detail-card__article');
    if (cards.length) {
      const middle = document.documentElement.clientWidth / 2;
      const active = cards.filter(card => {
        const frame = card.closest(slideSelector).getBoundingClientRect();
        return frame.left <= middle && middle < frame.right;
      });
      if (active.length !== 1) return null;
      const heading = visible(active[0], 'h1')[0];
      return heading ? { heading, root: active[0], mobileCard: true } : null;
    }
    const heading = visible(document, 'h1[data-qa-qualifier="product-detail-info-name"]')[0] ||
      visible(document, '.product-detail-info h1')[0];
    const root = heading && heading.closest('.product-detail-info, .product-detail-view, [data-qa-qualifier="product-detail-view"]');
    return root ? { heading, root, mobileCard: false } : null;
  }
  const refPattern = /\b\d{4}\/\d{3}\/\d{3}\b/;
  function variant(ctx) {
    const exactColor = visible(ctx.root, '[data-qa-qualifier="product-detail-info-color"] .product-color-extended-name__name')[0];
    const swatch = visible(ctx.root, 'button[data-qa-action="select-color"].product-detail-color-item__color-button--is-selected')[0];
    const nodes = visible(ctx.root, '.product-detail-selected-color, .product-detail-info__color, [data-qa-qualifier="product-detail-color"], .product-detail-selected-color__name, [data-product-color]');
    const entry = nodes[0];
    const reference = visible(ctx.root, 'button, [data-qa-action*="reference"]').find(e => refPattern.test(label(e)));
    const sku = (label(reference).match(refPattern) || [])[0] || null;
    // The reference is often nested inside the color label or immediately beside it.
    const source = entry || (reference && reference.parentElement);
    const color = label(exactColor) || label(swatch) || (source ? simplify((source.getAttribute('data-product-color') || label(source)).split(refPattern)[0]).replace(/[\s|·:–-]+$/, '') : '');
    return { color: color.length <= 80 ? color : '', sku };
  }
  function key(ctx) {
    const v = variant(ctx);
    return [location.pathname, new URL(location.href).searchParams.get('v1'), label(ctx.heading), v.color, v.sku].join('|');
  }
  const sizeButtons = '.size-selector-sizes__size, .size-selector-sizes-size, [data-qa-action^="size-"], [data-qa-qualifier="product-size"], [data-product-size], [role="option"][data-size]';
  const readSize = el => {
    const name = el.querySelector('.size-selector-sizes-size__label, .size-selector-sizes__size-label, [data-qa-qualifier="size-selector-sizes-size-label"]');
    return simplify(el.getAttribute('data-product-size') || el.getAttribute('data-size-name') || el.getAttribute('data-size') ||
      (name ? name.textContent : (el.innerText || '').split('\n')[0]));
  };
  const unavailable = el => el.matches(':disabled,[aria-disabled="true"]') || Boolean(el.closest('[aria-disabled="true"], [disabled]')) ||
    /out.of.stock|sold.out|coming.soon|disabled|back.soon|notify|epuizat|indisponibil/i.test([el.className, el.getAttribute('data-qa-action'), el.getAttribute('aria-label'), el.innerText].join(' '));
  let chosen = null;
  function sizeItem(target) {
    const option = target && target.closest && target.closest(sizeButtons);
    return option && !(option.closest('.product-recommendations, .product-grid, [data-qa-qualifier="product-grid"]')) ? option : null;
  }
  document.addEventListener('click', function (ev) {
    if (!ev.isTrusted || !ev.target || !ev.target.closest) return;
    const item = sizeItem(ev.target);
    if (!item) {
      if (ev.target.closest('a[href], [data-qa-action*="color"], .product-detail-color-selector')) chosen = null;
      return;
    }
    const ctx = context();
    chosen = ctx && (!ctx.mobileCard || ctx.root.contains(item)) && shown(item) && !unavailable(item) ? { key: key(ctx), label: readSize(item) } : null;
  }, true);
  window.addEventListener('popstate', () => { chosen = null; });
  window.addEventListener('pagehide', () => { chosen = null; });

  function displayedPrice(raw) {
    const match = simplify(raw).match(/^([\d.,\s]+)\s*(?:RON|lei)$/i);
    if (!match) return null;
    const local = match[1].replace(/\s/g, '');
    if (!/^(?:\d{1,7}|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(local)) return null;
    return local.replace(/\./g, '').replace(',', '.');
  }

  function schemaVariants(heading, color) {
    const variants = [];
    let hasMatchingGroup = false;
    const current = new URL(location.href);
    const article = current.pathname.match(/-p(\d+)\.html$/i)?.[1];
    function matches(raw) {
      if (typeof raw !== 'string') return false;
      try {
        const u = new URL(raw, current);
        return /^(?:www\.)?zara\.com$/.test(u.hostname) && u.protocol === 'https:' && !u.username && !u.password &&
          u.pathname === current.pathname && (!current.searchParams.has('v1') || !u.searchParams.has('v1') || u.searchParams.get('v1') === current.searchParams.get('v1'));
      } catch { return false; }
    }
    const types = (node, type) => [node?.['@type']].flat().some(t => typeof t === 'string' && t.split('/').pop() === type);
    const values = x => Array.isArray(x) ? x : x ? [x] : [];
    function product(p, parentMatched) {
      if (!types(p, 'Product') || !article || (p.url ? !matches(p.url) : !parentMatched && simplify(p.name).toLowerCase() !== heading.toLowerCase())) return;
      const productColor = simplify(p.color);
      if (color && productColor && productColor.toLowerCase() !== color.toLowerCase()) return;
      for (const offer of values(p.offers)) {
        if (!types(offer, 'Offer') || offer.priceCurrency !== 'RON' || offer.url && !matches(offer.url)) continue;
        const price = String(offer.price ?? '');
        if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0) continue;
        const status = String(offer.availability || '').split('/').pop();
        variants.push({ url: offer.url || p.url || null, price, color: productColor, size: simplify(p.size || offer.itemOffered?.size), sku: simplify(p.sku || offer.sku),
          inventory: status, available: ['InStock','LimitedAvailability'].includes(status) });
      }
    }
    for (const el of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0,16)) {
      if (el.textContent.length > 500000) continue;
      let data;
      try { data = JSON.parse(el.textContent); } catch { continue; }
      for (const top of values(data)) {
        for (const node of (top?.['@graph'] ? values(top['@graph']) : [top]).slice(0,300)) {
          if (types(node, 'ProductGroup')) {
            const groupMatches = node.productGroupID != null ? String(node.productGroupID) === article :
              node.url ? matches(node.url) : simplify(node.name).toLowerCase() === heading.toLowerCase();
            if (groupMatches && Array.isArray(node.hasVariant) && node.hasVariant.length) {
              hasMatchingGroup = true;
              for (const v of node.hasVariant.slice(0,300)) product(v, true);
            }
          } else product(node, false);
        }
      }
    }
    return { variants, hasMatchingGroup };
  }
  function capture() {
    const ctx = context();
    if (!ctx) return { reason: 'product' };
    const { color, sku } = variant(ctx);
    if (ctx.mobileCard && sku && /^0\d{7}$/.test(location.pathname.match(/-p(\d+)\.html$/i)?.[1] || '')) {
      const baseRef = sku.split('/').slice(0,2).join('');
      if (!location.pathname.toLowerCase().endsWith('-p0' + baseRef + '.html')) return { reason: 'changed' };
    }
    const allSizes = visible(ctx.mobileCard ? ctx.root : document, sizeButtons).filter(el => sizeItem(el) === el);
    const liveSizes = allSizes.filter(el => !unavailable(el));
    const selected = liveSizes.find(el => el.matches('[aria-selected="true"],[aria-checked="true"],[aria-pressed="true"],.size-selector-sizes-size--selected,.size-selector-sizes__size--selected'));
    const selectedText = selected ? readSize(selected) : chosen && chosen.key === key(ctx) ? chosen.label : '';
    const salePrices = visible(ctx.root, '.price-current__amount, .price__amount-current, [data-qa-qualifier="price-amount-current"]');
    const prices = Array.from(new Set(salePrices.filter(el => !el.closest('s,del,.price-old,.price-original,.product-grid,.product-recommendations')).map(label).map(displayedPrice).filter(Boolean)));
    const sold = visible(ctx.root, '.product-detail-info__out-of-stock, [data-qa-qualifier="product-out-of-stock"]').length ||
      visible(ctx.root, 'button').some(el => /^(?:stoc epuizat|out of stock|sold out)$/i.test(label(el)));
    if (sold) return { reason: 'unavailable' };
    const title = label(ctx.heading);
    const { variants: offers, hasMatchingGroup } = schemaVariants(title, color);
    if (hasMatchingGroup && !offers.length) return {reason:'changed'};
    const unique = xs => Array.from(new Set(xs.filter(Boolean)));
    const colors = unique(offers.map(o => o.color));
    const currentColor = color || (colors.length === 1 ? colors[0] : '');
    const availableOffers = offers.filter(o => !o.color || o.color.toLowerCase() === currentColor.toLowerCase());
    const selectedOffers = availableOffers.filter(o => !o.size || o.size === selectedText);
    const isSold = o => ['OutOfStock','SoldOut','Discontinued'].includes(o.inventory);
    if ((selectedOffers.length && selectedOffers.every(isSold)) ||
        (availableOffers.length && availableOffers.every(isSold))) return {reason:'unavailable'};
    const urls = unique(availableOffers.map(o => o.url));
    if (urls.length > 1) return {reason:'changed'};
    const offerPrices = unique((selectedText ? selectedOffers : availableOffers).map(o => o.price));
    // Only a concrete current price is eligible. Never import an aggregate "from"
    // price, the original price, a financing installment, or a different variant.
    const price = prices.length ? (prices.length === 1 ? prices[0] : null) : offerPrices.length === 1 ? offerPrices[0] : null;
    if (prices.length > 1 || (price && offerPrices.length && !offerPrices.some(value => Number(value) === Number(price)))) return {reason:'changed'};
    // The v1 URL identifies a colour, not a size. Only publish sizes offered
    // for that exact colour. Neither the SKU prefix nor variant order identifies it.
    const choices = [];
    const labels = unique(availableOffers.map(o => o.size));
    for (const size of labels) {
      const sizeOffers = availableOffers.filter(o => o.size === size && o.available);
      const skus = unique(sizeOffers.map(o => o.sku));
      const amounts = unique(sizeOffers.map(o => o.price));
      if (sizeOffers.length && skus.length <= 1 && amounts.length === 1) choices.push({label:size,sku:skus[0] || null,price:amounts[0]});
    }
    if (!labels.length) for (const size of unique(liveSizes.map(readSize))) choices.push({label:size,sku:null});
    const selectedOffer = choices.find(c => c.label === selectedText);
    const size = !labels.length || selectedOffer ? selectedText : '';
    const selectedSkus = unique(selectedOffers.filter(o => o.size === selectedText).map(o => o.sku));
    return { title, color:currentColor, sku:selectedSkus.length === 1 ? selectedSkus[0] : sku,
      variantUrl:urls[0] || null, size, choices:choices.slice(0,80), currency:'RON', price:selectedOffer?.price || price };
  }
  window.__bayShopZaraPdpV1 = { capture };
})(); true;
`;

export function zaraCaptureScript(requestId: string): string {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) throw new Error('Invalid Zara capture identifier');
  return zaraSelectionObserverScript + `
(function () {
  if (window !== window.top || !window.__bayShopZaraPdpV1 || !window.ReactNativeWebView) return;
  // On a client-side transition the address bar can update before the new card
  // and its offers are mounted. Re-read the same page, with no merchant writes.
  const url = location.href;
  const delays = [120, 250, 450, 750];
  function capture(attempt) {
    if (location.href !== url) return;
    let product = { reason: 'product' };
    try { product = window.__bayShopZaraPdpV1.capture(); } catch { /* Layout is not readable yet. */ }
    if (attempt < delays.length && (product.reason === 'product' || product.reason === 'changed')) {
      setTimeout(() => capture(attempt + 1), delays[attempt]);
      return;
    }
    window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({}, product,
      { type: 'bayshop.zara.capture.v1', requestId: ${JSON.stringify(requestId)}, url })));
  }
  capture(0);
})(); true;`;
}

