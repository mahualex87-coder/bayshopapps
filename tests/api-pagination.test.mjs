import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveAccountService, normalizeCountryCounts } from '../src/api/service.ts';
import { defaultParcelQuery, localParcelPage, updateParcelQuery } from '../src/api/parcel-pagination.ts';

const row = (id, status = 'received', storage = '901') => ({ id, codeNumber: `P-${id}`, status, currentStatus: status, storage_id: storage });
const countries = { us: '39', ro: '39', gb: '18', it: '9', de: '6' };
const received = code => Array.from({ length: Number(countries[code]) }, (_, index) => row(`${code}-${index}`));
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const storage = { read: async () => null, write: async () => {}, clear: async () => {} };
function baseline(path, options) {
  if (options?.login) return { id: '1', access_token: 'test-token', token_type: 'Bearer', expires_in: 3600 };
  if (path === '/api/auth') return { id: '1' };
  if (path === '/api/member/personal-data') return {};
  if (path === '/api/member/counters') return { awaiting: '0', incoming: '0', outgoing: '2', received: '39' };
  if (path === '/api/member/counters?parcelType=received') return countries;
  if (path === '/api/warehouse-list') return [{ id: '901', countryCode: 'US', countryTitle: 'USA' }, { id: '902', countryCode: 'RO', countryTitle: 'Romania' }];
  if (path.startsWith('/api/mf-list/')) return { list: [] };
  if (path === '/api/parcels/all') return [row('sent-1', 'sent'), row('sent-2', 'customs-held', '902')];
  const country = /^\/api\/parcels\/([a-z]{2})\/received$/.exec(path);
  if (country) return received(country[1]);
  return [];
}
async function boot(transport = baseline, openReceived = true) {
  const service = new LiveAccountService(transport, storage);
  await service.start(); await service.login('user@example.test', 'test-password'); await flush(); if (openReceived) { void service.refresh(['received']); await flush(); } return service;
}

test('a ten-thousand-record cache renders only its requested page and filters before pagination', () => {
  const rows = Array.from({ length: 10005 }, (_, index) => ({ id: String(index), stage: 'sent', countryCode: index % 2 ? 'RO' : 'US', status: index % 3 ? 'in-stock' : 'held-by-damage', title: `Item ${index}` }));
  const first = localParcelPage(rows, defaultParcelQuery(), 1);
  assert.equal(first.items.length, 20); assert.equal(first.loaded, 10005); assert.equal(first.overallTotal, 10005); assert.equal(first.pageCount, 501);
  const last = localParcelPage(rows, { ...first.query, page: 501 }, 1);
  assert.equal(last.items.length, 5); assert.equal(last.hasNext, false); assert.equal(last.items[0].id, '10000');
  const filter = localParcelPage(rows, { ...first.query, countryCode: 'RO', status: 'held-by-damage' }, 1);
  assert.equal(filter.total, rows.filter(r => r.countryCode === 'RO' && r.status === 'held-by-damage').length);
  assert.ok(filter.items.every(r => r.countryCode === 'RO' && r.status === 'held-by-damage'));
});

test('query validation rejects invalid pages and filter changes reset the page, including translated search', () => {
  const initial = { ...defaultParcelQuery(), page: 4 };
  assert.equal(updateParcelQuery(initial, { status: 'sent' }).page, 1);
  assert.equal(updateParcelQuery(initial, { search: 'transport' }).page, 1);
  for (const patch of [{ page: 0 }, { page: 1.5 }, { pageSize: 10000 }, { countryCode: '../auth' }, { status: 'a/b' }]) assert.equal(updateParcelQuery(initial, patch), null);
  const rows = [{ id: '1', stage: 'received', status: 'received' }, { id: '2', stage: 'sent', status: 'sent' }];
  assert.equal(localParcelPage(rows, { ...defaultParcelQuery(), search: 'Primit' }, 1, { language: 'ro' }).items[0].id, '1');
});

test('opening received fetches only its selected country, keeps the authoritative overall total and never loops fake server pages', async () => {
  const calls = [];
  const service = await boot(async (path, options) => { calls.push(path); return baseline(path, options); });
  const page = service.getSnapshot().parcelPages.received;
  assert.equal(page.overallTotal, 111, 'The generic summary39 is not the overall country-map111');
  assert.equal(page.total, 39); assert.equal(page.items.length, 20); assert.equal(page.loaded, 39); assert.equal(page.query.countryCode, 'US');
  assert.equal(page.mode, 'local'); assert.equal(page.searchScope, 'collection'); assert.equal(page.error, null);
  assert.deepEqual(calls.filter(path => /\/parcels\/.*received/.test(path)), ['/api/parcels/us/received']);
  assert.ok(!calls.some(path => /page=|perPage=/.test(path)));
});

test('next page, status and search use cached rows; changing received country fetches only the chosen country', async () => {
  const calls = []; const service = await boot(async (path, options) => { calls.push(path); return baseline(path, options); });
  const before = calls.length;
  service.loadParcelPage('received', 2);
  assert.equal(service.getSnapshot().parcelPages.received.items.length, 19);
  assert.equal(service.getSnapshot().parcelPages.received.items[0].id, 'us-20');
  service.setParcelQuery('received', { search: 'us-38' });
  assert.equal(service.getSnapshot().parcelPages.received.items.length, 1);
  assert.equal(calls.length, before);
  service.setParcelQuery('received', { countryCode: 'RO', search: '' }); await flush();
  const page = service.getSnapshot().parcelPages.received;
  assert.equal(page.query.countryCode, 'RO'); assert.equal(page.items[0].id, 'ro-0'); assert.equal(page.overallTotal, 111);
  assert.deepEqual(calls.slice(before), ['/api/member/counters?parcelType=received', '/api/parcels/ro/received']);
});

test('a changed country aborts its prior request and rejects late results from the old country', async () => {
  const late = deferred(); let oldSignal;
  const service = await boot(async (path, options) => { if (path === '/api/parcels/us/received') { oldSignal = options.signal; return late.promise; } return baseline(path, options); });
  service.setParcelQuery('received', { countryCode: 'RO' }); await flush();
  assert.equal(oldSignal.aborted, true);
  assert.equal(service.getSnapshot().parcelPages.received.query.countryCode, 'RO');
  late.resolve(received('us')); await flush();
  assert.equal(service.getSnapshot().parcelPages.received.items[0].id, 'ro-0');
});

test('logout clears page caches and totals and a late response cannot restore them', async () => {
  const late = deferred(); const service = await boot(async (path, options) => path === '/api/parcels/us/received' ? late.promise : baseline(path, options));
  await service.logout(); late.resolve(received('us')); await flush();
  const page = service.getSnapshot().parcelPages.received;
  assert.equal(page.items, null); assert.equal(page.overallTotal, null); assert.deepEqual(page.countries, []);
});

test('a partial country response reports unavailability and never pretends the first rows are the complete history', async () => {
  const service = await boot(async (path, options) => path === '/api/parcels/us/received' ? received('us').slice(0, 10) : baseline(path, options));
  const page = service.getSnapshot().parcelPages.received;
  assert.equal(page.error, 'errors.shipmentCompleteness'); assert.equal(page.items, null); assert.equal(page.overallTotal, 111); assert.equal(page.total, 39);
});

test('zero and malformed per-country counters remain distinct without relying on a capped summary', async () => {
  for (const value of [null, [], { us: false }, { us: '' }, { us: ' ' }, { us: '-1' }, { us: 1.5 }, { '../auth': '1' }]) assert.throws(() => normalizeCountryCounts(value));
  assert.deepEqual(normalizeCountryCounts({ us: '0', ro: 2 }), [{ code: 'US', total: 0 }, { code: 'RO', total: 2 }]);
  const calls = []; const service = await boot(async (path, options) => { calls.push(path); return path === '/api/member/counters?parcelType=received' ? { us: '0', ro: '0' } : baseline(path, options); });
  assert.equal(service.getSnapshot().parcelPages.received.overallTotal, 0);
  assert.deepEqual(service.getSnapshot().parcelPages.received.items, []);
  assert.ok(!calls.some(path => /\/parcels\/.*received/.test(path)));
});

test('sent filters preserve records with unknown countries in All and use only known warehouse mappings', async () => {
  const service = await boot(async (path, options) => path === '/api/parcels/all' ? [row('sent-1', 'sent'), row('sent-2', 'customs-held', '999')] : baseline(path, options));
  assert.equal(service.getSnapshot().parcelPages.sent.items.length, 2);
  assert.equal(service.getSnapshot().parcelPages.sent.items[1].countryCode, null);
  service.setParcelQuery('sent', { countryCode: 'US' });
  assert.equal(service.getSnapshot().parcelPages.sent.items.length, 1);
  service.setParcelQuery('sent', { countryCode: 'all', status: 'customs-held' });
  assert.equal(service.getSnapshot().parcelPages.sent.items[0].id, 'sent-2');
  assert.equal(service.getSnapshot().parcelPages.sent.overallTotal, 2);
});


test('login fetches received counters only; history remains lazy until its screen is opened', async () => {
  const calls = []; const service = await boot(async (path, options) => { calls.push(path); return baseline(path, options); }, false);
  const page = service.getSnapshot().parcelPages.received;
  assert.equal(page.overallTotal, 111); assert.equal(page.items, null); assert.equal(page.loaded, 0); assert.equal(page.loading, false);
  assert.ok(!calls.some(path => /\/parcels\/.*received/.test(path)));
  await service.refresh(['received']);
  assert.equal(service.getSnapshot().parcelPages.received.items.length, 20);
});


test('stock status filters derive only from explicit declaration and restriction flags', () => {
  const rows = [
    { id: '1', stage: 'warehouse', status: null, declared: true, restrictions: { heldByDamage: true, heldByProhibition: false, packingDenied: false } },
    { id: '2', stage: 'warehouse', status: null, declared: false, restrictions: { heldByDamage: false, heldByProhibition: false, packingDenied: true } },
    { id: '3', stage: 'warehouse', status: null, declared: null, restrictions: { heldByDamage: null, heldByProhibition: null, packingDenied: null } },
  ];
  const page = localParcelPage(rows, defaultParcelQuery(), 1);
  assert.deepEqual(page.statuses, [{ value: 'declared', total: 1 }, { value: 'held-by-damage', total: 1 }, { value: 'undeclared', total: 1 }, { value: 'packing-denied', total: 1 }]);
  assert.equal(localParcelPage(rows, { ...defaultParcelQuery(), status: 'undeclared' }, 1).items[0].id, '2');
  assert.equal(page.overallTotal, 3, 'Overlapping filter counts are never summed as the account total');
});

test('unavailable outgoing counters cannot turn an unverified aggregate into a complete list', async () => {
  const service = await boot(async (path, options) => path === '/api/member/counters' ? [] : baseline(path, options));
  const page = service.getSnapshot().parcelPages.sent;
  assert.equal(page.items, null); assert.equal(page.overallTotal, null); assert.equal(page.error, 'errors.shipmentCompleteness');
});

test('signed-out query changes cannot create a permanently loading account page', async () => {
  const service = new LiveAccountService(baseline, storage); await service.start();
  service.setParcelQuery('received', { countryCode: 'RO' });
  assert.equal(service.getSnapshot().parcelPages.received.loading, false);
  assert.equal(service.getSnapshot().parcelPages.received.query.countryCode, 'all');
});

test('a refreshed country map resets page one when the selected country is no longer available', async () => {
  let available = countries;
  const service = await boot(async (path, options) => path === '/api/member/counters?parcelType=received' ? available : baseline(path, options));
  service.setParcelQuery('received', { countryCode: 'RO' }); await flush();
  service.loadParcelPage('received', 2);
  assert.equal(service.getSnapshot().parcelPages.received.query.page, 2);
  available = { us: '39' };
  await service.refresh(['received']);
  const page = service.getSnapshot().parcelPages.received;
  assert.equal(page.query.countryCode, 'US'); assert.equal(page.query.page, 1);
  assert.equal(page.items[0].id, 'us-0'); assert.equal(page.items.length, 20);
  assert.equal(page.total, 39); assert.equal(page.overallTotal, 39);
});
