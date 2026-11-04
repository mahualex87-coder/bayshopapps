import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeShopDirectory, planShopDirectoryRead, publicShopUrl, requireShopMatch } from '../src/api/shop-directory.ts';
import { shopCategories, shopPage } from '../src/features/shops/shop-list.ts';

const shop = { id: '43', title: 'A &amp; B', url: 'https://shop.example/ro/', active: true, storageId: '12', countryCode: 'RO', countryTitle: 'România', currency: 'ron', commissionPercent: '0', commissionMin: '0.00', commissionMax: '30.25', commissionCurrency: 'ron', shortDescription: '<p>Condiții &icirc;n RON</p>', categories: [{ id: '8', title: 'Casă &amp; grădină' }] };
const directory = (rows = [shop], matchedShopId = null) => ({ version: 1, shops: rows, matchedShopId });
test('a missing translation in the legacy catalogue does not hide the other shops', () => {
  const missing = { id: '12', title: null, url: '', commissionPercent: '1', commissionMin: '1.25', commissionMax: '1' };
  const named = { ...missing, id: '13', title: '24', url: 'https://shop.example' };
  for (const countryCode of ['US', 'RO', 'GB', 'IT', 'DE', 'PL']) {
    const list = planShopDirectoryRead({ kind: 'shops.list', countryCode });
    assert.deepEqual(list.normalize([missing, named]).shops.map(s => s.title), ['24']);
    assert.deepEqual(list.normalize([missing]).shops, []);
    assert.equal(planShopDirectoryRead({ kind: 'shops.detail', id: '13', countryCode }).normalize([missing, named]).title, '24');
  }
  assert.throws(() => normalizeShopDirectory([{ id: '12' }]));
  assert.throws(() => normalizeShopDirectory(directory([{ ...shop, title: null }])));
});
test('legacy active shop response stays usable without guessing commission currency, categories or match', () => {
  const result = normalizeShopDirectory([{ id: '43', title: 'A &amp; B', url: shop.url, commissionPercent: '5', commissionMin: '1', commissionMax: '50' }], 'RO');
  assert.equal(result.verified, false); assert.equal(result.shops[0].countryCode, 'RO');
  assert.equal(result.shops[0].commissionCurrency, null); assert.equal(result.shops[0].currency, null);
  assert.deepEqual(result.shops[0].categories, []); assert.equal(result.shops[0].title, 'A & B');
  assert.throws(() => requireShopMatch(result, '43', '12'), /shops.matchUnavailable/);
});
test('directory preserves server zero/decimals/ISO and decodes only display text', () => {
  const result = normalizeShopDirectory(directory(), 'RO'); const value = result.shops[0];
  assert.deepEqual([value.id, value.storageId, value.currency, value.commissionCurrency, value.commissionPercent, value.commissionMin, value.commissionMax], ['43', '12', 'RON', 'RON', 0, 0, 30.25]);
  assert.equal(value.description, 'Condiții în RON'); assert.equal(value.url, shop.url);
  assert.equal(value.categories[0].title, 'Casă & grădină');
  assert.deepEqual(normalizeShopDirectory(directory([])).shops, []);
});
test('inconsistent active/country/money/IDs cannot be rendered as verified conditions', () => {
  for (const changed of [{ active: false }, { countryCode: 'US' }, { commissionMin: '-1' }, { commissionMax: 'unknown' }, { categories: [...shop.categories, ...shop.categories] }]) assert.throws(() => normalizeShopDirectory(directory([{ ...shop, ...changed }]), 'RO'));
  assert.throws(() => normalizeShopDirectory(directory([shop, shop])));
  assert.throws(() => normalizeShopDirectory({ version: 2, shops: [shop] }));
  assert.throws(() => normalizeShopDirectory(directory([shop], '9')));
});
test('chosen shop uses explicit server match and same storage; identical host is not evidence', () => {
  requireShopMatch(normalizeShopDirectory(directory([shop], '43')), '43', '12');
  assert.throws(() => requireShopMatch(normalizeShopDirectory(directory()), '43', '12'), /shops.urlMismatch/);
  assert.throws(() => requireShopMatch(normalizeShopDirectory(directory([shop], '43')), '43', '14'), /shops.urlMismatch/);
  const sibling = { ...shop, id: '44', url: 'https://shop.example/us/' };
  assert.throws(() => requireShopMatch(normalizeShopDirectory(directory([shop, sibling], '44')), '43', '12'), /shops.urlMismatch/);
});
test('read plans always request active shops, encode exact product URL and do not modify an order', () => {
  const list = planShopDirectoryRead({ kind: 'shops.list', countryCode: 'RO' });
  const params = new URL(list.path, 'https://bayshop.com').searchParams;
  assert.equal(params.get('active'), '1'); assert.equal(params.get('directory'), '1'); assert.equal(params.get('countryCode'), 'RO');
  const url = 'https://shop.example/ro/item?q=x&variant=2';
  const match = planShopDirectoryRead({ kind: 'shops.match', id: '43', url });
  assert.equal(new URL(match.path, 'https://bayshop.com').searchParams.get('url'), url);
  assert.equal(planShopDirectoryRead({ kind: 'shops.detail', id: '43' }).normalize(directory()).id, '43');
  assert.equal(planShopDirectoryRead({ kind: 'shops.detail', id: '99' }).normalize(directory()), null);
  for (const url of ['javascript:alert(1)', 'https://name:password@shop.example/', 'https://shop.example:8443/', 'https://shop.example/\nsecret', 'https://shop.example\\evil']) assert.equal(publicShopUrl(url), null);
  assert.throws(() => planShopDirectoryRead({ kind: 'shops.list', countryCode: 'romanian' }));
  assert.throws(() => planShopDirectoryRead({ kind: 'shops.match', id: '0', url }));
});
test('shop filters intersect categories/search, preserve source order and clamp after refresh', () => {
  const rows = normalizeShopDirectory(directory(Array.from({ length: 53 }, (_, index) => ({ ...shop, id: String(index + 1), title: `Shop ${index}`, categories: index % 2 ? [] : shop.categories })))).shops;
  assert.equal(shopPage(rows, '', '', 3).items.length, 13);
  assert.equal(shopPage(rows, '', '8', 5).page, 2); assert.equal(shopPage(rows, '', '8', 5).total, 27);
  assert.equal(shopPage(rows, 'shop 4', '8', 1).total, 6);
  assert.equal(shopPage([], '', '', 9).page, 1);
  assert.equal(shopPage(rows, '', '', Number.NaN).page, 1);
  assert.deepEqual(shopCategories(rows), [{ id: '8', title: 'Casă & grădină' }]);
  assert.equal(rows[0].id, '1');
});

test('selected-shop service preflight rechecks matching before any cart write and never serializes selection metadata', async () => {
  const { LiveAccountService } = await import('../src/api/service.ts');
  const { API_ORIGIN } = await import('../src/api/client.ts');
  const { cartItemFields } = await import('../src/api/operations-contracts.ts');
  const now = 1790000000000; let matched = null; let reads = 0; let writes = 0;
  const input = { storage_id: '12', url: 'https://shop.example/ro/item', title: 'Product', price: '10.00', quantity: 1, shipping: '0', selectedShop: { id: '43', countryCode: 'RO' } };
  assert.equal(Object.hasOwn(cartItemFields(input), 'selectedShop'), false);
  const service = new LiveAccountService(async (path, options) => {
    if (path.startsWith('/api/cart-link/')) return { storageList: [{ storage_id: '12', countryCode: 'RO', countryTitle: 'România', currency: 'RON' }], storage_id: '12', shipping: '0' };
    if (path.startsWith('/api/shops?')) { reads++; const params = new URL(path, API_ORIGIN).searchParams; assert.equal(params.get('id'), '43'); assert.equal(params.get('active'), '1'); return directory([shop], matched); }
    if (options.write) { writes++; assert.equal(Object.hasOwn(options.body || {}, 'selectedShop'), false); return { code: 200, error: false, message: 'Ok' }; }
    if (path === '/api/auth') return { id: '7', name: 'Synthetic' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'test@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'Synthetic', countryId: '143', countries: [] };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-shop', expiresAt: now + 3600000 }), write: async () => {}, clear: async () => {} }, () => now);
  await service.start();
  const rejected = await service.mutate({ kind: 'cart.create', input });
  assert.equal(rejected.ok, false); assert.equal(rejected.error, 'shops.urlMismatch'); assert.equal(writes, 0);
  matched = '43'; const saved = await service.mutate({ kind: 'cart.create', input });
  assert.equal(saved.ok, true); assert.equal(reads, 2); assert.equal(writes, 1);
});
