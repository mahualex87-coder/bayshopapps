import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCartLinkData, normalizeCartSavedData } from '../src/api/cart-link.ts';
import { normalizeCartList, normalizeCartItem } from '../src/api/operations-normalize.ts';
import { planRead, planMutation, cartProductUrl } from '../src/api/operations-contracts.ts';
const storage = { storage_id: '14', countryCode: 'US', countryTitle: 'United States', currency_sign: '$', currency: 'usd' };
const fixture = () => ({ cartWriteSupported: true, storageList: [storage], storage_id: '14', shipping: '0.00', resolution: 'identified', shop: { id: '82', title: 'A &amp; B', storageId: '14', isComplex: 1 } });
const item = { id: '7', title: 'Exact product', price: '12.50', quantity: '2', localShipping: '0', currency: 'USD', customUrl: 'https://shop.example/item' };
test('link lookup preserves only server shop identity, exact shipping and storage currency', () => {
  const result = normalizeCartLinkData(fixture());
  assert.equal(result.canSave, true); assert.equal(result.shop.id, '82'); assert.equal(result.shop.title, 'A & B'); assert.equal(result.shop.isComplex, true);
  assert.equal(result.shipping, 0); assert.equal(result.storages[0].currency, 'USD');
  const legacy = normalizeCartLinkData({ storageList: [storage], storage_id: null, shipping: null });
  assert.equal(legacy.canSave, false); assert.equal(legacy.resolution, 'unknown'); assert.equal(legacy.shop, null);
  assert.equal(normalizeCartLinkData({ ...fixture(), shop: null, resolution: 'unregistered' }).shop, null);
  assert.equal(normalizeCartLinkData({ storageList: [{ ...storage, currency: undefined }], storage_id: null, shipping: null }).storages[0].currency, null);
  assert.throws(() => normalizeCartLinkData({ ...fixture(), shop: { ...fixture().shop, storageId: '20' } }));
  assert.throws(() => normalizeCartLinkData({ ...fixture(), storage_id: '20' }));
  assert.throws(() => normalizeCartLinkData({ ...fixture(), shipping: 'unknown' }));
  assert.throws(() => normalizeCartLinkData({ ...fixture(), shop: null }));
});
test('lookup URL and selected storage are encoded; acknowledged ID is never inferred from list order', () => {
  const query = new URL(planRead({ kind: 'cart.link', url: 'shop.example/item?q=a&b=2', storageId: '14' }).path, 'https://bayshop.com').searchParams;
  assert.equal(query.get('url'), 'https://shop.example/item?q=a&b=2'); assert.equal(query.get('storage_id'), '14');
  const plan = planMutation({ kind: 'cart.create', input: { storage_id: '14', url: 'shop.example/item', title: 'Product', price: '12.50', quantity: 2, shipping: '0' } });
  const raw = { id: '987', uid: 'US987', shopId: '82', storageId: '14', countryCode: 'us', status: 'unpaid' };
  assert.deepEqual(plan.normalize({ code: 200, error: false, message: 'Ok', data: raw }), { ...raw, countryCode: 'US' });
  assert.equal(plan.normalize({ code: 200, error: false, message: 'Ok' }).id, null);
  assert.throws(() => plan.normalize({ code: 200, error: true, message: 'Error', data: raw }));
  assert.throws(() => normalizeCartSavedData({ ...raw, id: null }));
  assert.equal(normalizeCartSavedData({ ...raw, shopId: null, status: 'unverified' }).shopId, null);
});
test('list and detail retain server grouping; unregistered products remain visible without a fabricated shop', () => {
  const grouped = normalizeCartList([{ shopId: '82', storageId: '14', shopTitle: 'Shop A', isComplex: true, list: [{ ...item, status: 'unpaid' }] }]);
  assert.equal(grouped[0].shopId, '82'); assert.equal(grouped[0].storageId, '14'); assert.equal(grouped[0].isComplex, true);
  const detail = normalizeCartItem({ ...item, shopId: '82', storageId: '14', shopTitle: 'Shop A', isComplex: true, status: 'unpaid' });
  assert.deepEqual([detail.shopId, detail.storageId, detail.shopTitle, detail.isComplex], ['82', '14', 'Shop A', true]);
  const pending = normalizeCartList([{ shopId: null, shopTitle: null, storageId: null, isComplex: false, list: [{ ...item, status: 'unverified' }] }]);
  assert.equal(pending[0].shopId, null); assert.equal(pending[0].shopTitle, null); assert.equal(pending[0].status, 'unverified');
});

test('cart writes require fresh safe-server metadata and never dispatch on the legacy/session fallback path', async () => {
  const { LiveAccountService } = await import('../src/api/service.ts');
  const { API_ORIGIN } = await import('../src/api/client.ts');
  const now = 1790000000000; let supported = false; let reads = 0; let writes = 0;
  const service = new LiveAccountService(async (path, options) => {
    if (path.startsWith('/api/cart-link/')) { reads++; return { ...fixture(), cartWriteSupported: supported }; }
    if (options.write) { writes++; return { code: 200, error: false, message: 'Ok', data: { id: '987', shopId: '82', storageId: '14', status: 'unpaid' } }; }
    if (path === '/api/auth') return { id: '7', name: 'Synthetic' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'test@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'Synthetic', countryId: '143', countries: [] };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-cart', expiresAt: now + 3600000 }), write: async () => {}, clear: async () => {} }, () => now);
  await service.start();
  const command = { kind: 'cart.create', input: { storage_id: '14', url: 'https://shop.example/item', title: 'Product', price: '12.50', quantity: 2, shipping: '0' } };
  const rejected = await service.mutate(command);
  assert.equal(rejected.error, 'cartLink.serverUpdateRequired'); assert.equal(rejected.outcome, 'rejected'); assert.equal(writes, 0);
  supported = true;
  assert.equal((await service.mutate(command)).data.id, '987'); assert.equal(reads, 2); assert.equal(writes, 1);
  supported = false;
  assert.equal((await service.mutate({ ...command, kind: 'cart.edit', id: '987' })).outcome, 'rejected'); assert.equal(writes, 1);
});


test('legacy matched Altex-style lookup enables create without inventing a merchant or currency', () => {
  const ro = { storage_id: 12, countryCode: 'RO', countryTitle: 'România', currency_sign: 'RON' };
  const legacy = normalizeCartLinkData({ storageList: [ro], storage_id: 12, shipping: '0' });
  assert.equal(legacy.canSave, true);
  assert.equal(legacy.writeMode, 'legacy-matched');
  assert.equal(legacy.storageId, '12');
  assert.equal(legacy.shop, null);
  assert.equal(legacy.storages[0].currency, null);
  assert.equal(legacy.storages[0].currencySign, 'RON');
  assert.equal(normalizeCartLinkData({ storageList: [ro], storage_id: null, shipping: null }).canSave, false);
  assert.equal(normalizeCartLinkData({ storageList: [ro], storage_id: 12, shipping: 0, cartWriteSupported: false }).canSave, false);
});

test('root product links retain a path for the legacy PHP shop matcher in both lookup and create', () => {
  assert.equal(cartProductUrl('altex.ro'), 'https://altex.ro/');
  assert.equal(cartProductUrl('https://altex.ro?campaign=qa'), 'https://altex.ro/?campaign=qa');
  assert.equal(cartProductUrl('https://altex.ro/produs/abc?size=M'), 'https://altex.ro/produs/abc?size=M');
  const lookup = new URL(planRead({ kind: 'cart.link', url: 'altex.ro' }).path, 'https://bayshop.com');
  assert.equal(lookup.searchParams.get('url'), 'https://altex.ro/');
  const plan = planMutation({ kind: 'cart.create', input: { storage_id: '12', url: 'altex.ro', title: 'Synthetic product', price: '12.50', quantity: 1, shipping: '0' } });
  assert.equal(plan.fields.url, 'https://altex.ro/');
});

test('legacy create rechecks the matched warehouse and never permits edit or unknown-shop writes', async () => {
  const { LiveAccountService } = await import('../src/api/service.ts');
  const { API_ORIGIN } = await import('../src/api/client.ts');
  const now = 1790000000000; let matched = '12'; const writes = []; const lookups = [];
  const storageList = [{ storage_id: 12, countryCode: 'RO', countryTitle: 'România', currency_sign: 'RON' }, storage];
  const service = new LiveAccountService(async (path, options) => {
    if (path.startsWith('/api/cart-link/')) { lookups.push(path); return { storageList, storage_id: matched, shipping: 0 }; }
    if (options.write) { writes.push({ path, ...options }); return { code: 200, error: false, message: 'Ok' }; }
    if (path === '/api/auth') return { id: '7', name: 'Synthetic' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'test@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'Synthetic', countryId: '143', countries: [] };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-cart-only', expiresAt: now + 3600000 }), write: async () => {}, clear: async () => {} }, () => now);
  await service.start();
  const command = { kind: 'cart.create', input: { storage_id: '12', url: 'altex.ro', title: 'Synthetic product', price: '12.50', quantity: 1, shipping: '0' } };
  const created = await service.mutate(command);
  assert.equal(created.ok, true); assert.equal(created.data.id, null);
  assert.equal(writes.length, 1); assert.equal(writes[0].path, '/api/cart');
  assert.equal(writes[0].write.fields.url, 'https://altex.ro/');
  assert.equal(new URL(lookups[0], API_ORIGIN).searchParams.get('url'), 'https://altex.ro/');
  assert.equal((await service.mutate({ ...command, kind: 'cart.edit', id: '987' })).outcome, 'rejected');
  matched = '14'; assert.equal((await service.mutate(command)).outcome, 'rejected');
  matched = null; assert.equal((await service.mutate(command)).outcome, 'rejected');
  assert.equal(writes.length, 1);
  await service.logout();
});
