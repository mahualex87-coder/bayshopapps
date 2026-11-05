import assert from 'node:assert/strict';
import test from 'node:test';
import { shopBrowseReader } from '../src/features/shops/shop-browse-cache.ts';
import { shopCountries, shopOrderContext } from '../src/features/shops/shop-list.ts';

const rows = [{ id: '11', countryCode: 'US' }, { id: '22', countryCode: 'RO' }];
const directory = (shops, verified = true) => ({ shops, verified, matchedShopId: null });

test('country choices come from supported warehouses in the shared order, with active address fallback', () => {
  const warehouses = [{ code: 'RO', title: 'România' }, { code: 'US', title: 'SUA' }, { code: 'RO' }];
  const addresses = [{ countryCode: 'GB', active: false }, { countryCode: 'DE', countryTitle: 'Germania' }];
  assert.deepEqual(shopCountries(warehouses, addresses).map(row => row.id), ['US', 'RO']);
  assert.deepEqual(shopCountries([], addresses).map(row => row.id), ['DE']);
  assert.deepEqual(shopCountries(null, addresses).map(row => row.id), ['DE']);
  assert.deepEqual(shopCountries([], [], rows).map(row => row.id), ['US', 'RO']);
});

test('opening a country twice, details, and the order form share one in-flight country read', async () => {
  const requests = [];
  const read = async query => { requests.push(query); return directory(rows.slice(0, 1), false); };
  const browse = shopBrowseReader(read, 'scope');
  const us = { kind: 'shops.list', countryCode: 'US' };
  await Promise.all([browse(us), browse(us)]);
  const detail = { kind: 'shops.detail', id: '11', countryCode: 'US' };
  assert.equal((await browse(detail)).id, '11');
  assert.equal((await shopBrowseReader(read, 'scope')(detail)).id, '11');
  await browse(us);
  assert.deepEqual(requests, [us]);
});

test('only a complete versioned catalogue can satisfy country filters locally', async () => {
  for (const verified of [false, true]) {
    const requests = [];
    const read = async query => { requests.push(query); return directory(query.countryCode ? rows.slice(1) : rows, verified); };
    const browse = shopBrowseReader(read, 'scope');
    await browse({ kind: 'shops.list' });
    assert.deepEqual((await browse({ kind: 'shops.list', countryCode: 'RO' })).shops, rows.slice(1));
    assert.equal(requests.length, verified ? 1 : 2);
  }
});

test('failed requests can retry; expired entries and a new account, session, region or language reread the server', async t => {
  let now = 100, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const read = async () => { if (++calls === 1) throw Error('Offline'); return directory(rows); };
  const query = { kind: 'shops.list', countryCode: 'US' };
  const browse = shopBrowseReader(read, 'account-1:revision-0:session-1:ro');
  await assert.rejects(browse(query), /Offline/);
  await browse(query); await browse(query);
  assert.equal(calls, 2);
  now += 180_001;
  await browse(query);
  for (const scope of ['account-1:revision-0:session-1:ru','account-1:revision-1:session-1:ru','account-2:revision-1:session-2:ru']) await shopBrowseReader(read, scope)(query);
  assert.equal(calls, 6);
});

test('legacy shops use the general order form; versioned shops keep the verified match', () => {
  const shop = { id: '11', countryCode: 'US', storageId: '7' };
  assert.deepEqual(shopOrderContext({ ...shop, directoryVerified: false }), { initialStorageId: '7' });
  assert.deepEqual(shopOrderContext({ ...shop, directoryVerified: true }), { selectedShop: {id: '11', countryCode: 'US'}, initialStorageId: '7' });
});
