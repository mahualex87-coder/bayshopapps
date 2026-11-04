import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePurchasePage, normalizePurchaseDetail, planPurchasesRead } from '../src/api/member-purchases.ts';
import { planRead } from '../src/api/operations-contracts.ts';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';

const summary = (id = '1') => ({ id, uid: 'O1', createdAt: '2020-01-02 03:04:05', paidAt: '2020-01-03 04:05:06', paymentStatus: 'refund', paymentStatusLabel: 'Rambursată', processingStatus: 'canceled', processingStatusLabel: '<b>Anulată</b>', countryCode: 'it', countryTitle: 'Italia', currency: 'eur', totalPrice: '0.00', itemCount: 1, productTitles: ['<p>Produs &icirc;n stoc</p>'], trackingNumbers: ['TRACK001'], locations: [
  { kind: 'stock', id: '501', code: 'B501', status: 'not-sent', statusLabel: 'În stoc', route: 'warehouse', received: null, divideStatus: null },
  { kind: 'stock', id: '502', code: 'B502', status: 'sent', statusLabel: 'Trimis', route: null, received: null, divideStatus: 'requested' },
  { kind: 'shipment', id: '501', code: 'R501', status: 'received', statusLabel: 'Primit', route: 'shipment', received: true, divideStatus: null },
] });
const page = () => ({ items: [summary()], page: 1, perPage: 20, total: 1, pageCount: 1, filters: { countries: [{ value: 'IT', label: 'Italia' }], paymentStatuses: [{ value: 'refund', label: 'Rambursată' }], processingStatuses: [{ value: 'canceled', label: 'Anulată' }] } });
const detail = () => ({ ...summary(), invoiceUrl: null, cancelReason: null, amounts: [{ key: 'goods', amount: '-5.25' }, { key: 'localShipping', amount: null }, { key: 'commission', amount: '0.00' }, { key: 'total', amount: '0.00' }], items: [{ id: '101', uid: 'I101', title: 'Produs &icirc;n stoc', url: null, quantity: '2', price: '15.00', localShipping: '0.00', color: '<b>Roșu</b>', size: 'S', variations: 'A &amp; B', tracking: 'TRACK001', paymentStatus: 'paid', paymentStatusLabel: 'Achitat', processingStatus: 'inside', processingStatusLabel: 'În depozit' }] });

test('all-country historical list preserves separate order/item status, model IDs and unknown values', () => {
  const result = normalizePurchasePage(page());
  assert.equal(result.items[0].currency, 'EUR'); assert.equal(result.items[0].countryCode, 'IT');
  assert.equal(result.items[0].productTitles[0], 'Produs în stoc'); assert.equal(result.items[0].totalPrice, 0);
  assert.deepEqual(result.items[0].locations.map(value => [value.kind, value.id, value.route]), [['stock', '501', 'warehouse'], ['stock', '502', null], ['shipment', '501', 'shipment']]);
  assert.equal(normalizePurchasePage({ ...page(), items: [{ ...summary(), totalPrice: null, currency: null }] }).items[0].totalPrice, null);
  const resultDetail = normalizePurchaseDetail(detail());
  assert.equal(resultDetail.items[0].processingStatus, 'inside'); assert.equal(resultDetail.processingStatus, 'canceled');
  assert.equal(resultDetail.items[0].quantity, 2); assert.equal(resultDetail.items[0].price, 15);
  assert.deepEqual(resultDetail.amounts.map(value => value.amount), [-5.25, null, 0, 0]);
  assert.equal(resultDetail.items[0].color, 'Roșu'); assert.equal(resultDetail.items[0].variations, 'A & B');
});

test('large pagination stays server driven and refuses contradictory counts, identities and amounts', () => {
  const last = normalizePurchasePage({ ...page(), page: 1251, total: 25001, pageCount: 1251 });
  assert.equal(last.items.length, 1); assert.equal(last.total, 25001);
  assert.equal(normalizePurchasePage({ ...page(), items: [], total: 0, pageCount: 0 }).page, 1);
  for (const change of [{ page: 2 }, { pageCount: 2 }, { total: 2 }, { perPage: 51 }, { items: [] }]) assert.throws(() => normalizePurchasePage({ ...page(), ...change }));
  assert.throws(() => normalizePurchasePage({ ...page(), items: [{ ...summary(), totalPrice: 'unknown' }] }));
  assert.throws(() => normalizePurchaseDetail({ ...detail(), items: [] }));
  assert.throws(() => normalizePurchaseDetail({ ...detail(), amounts: [...detail().amounts, detail().amounts[0]] }));
  assert.throws(() => normalizePurchasePage({ ...page(), items: [{ ...summary(), locations: [...summary().locations, summary().locations[0]] }] }));
  assert.throws(() => normalizePurchasePage({ ...page(), items: [{ ...summary(), locations: [{ ...summary().locations[0], route: 'shipment' }] }] }));
});

test('new read commands default to all countries, use bound query fields, and never write or accept a member ID', () => {
  assert.equal(planRead({ kind: 'purchases.list' }).path, '/api/member-purchases?page=1&perPage=20');
  const query = new URL(planPurchasesRead({ kind: 'purchases.list', page: 3, perPage: 20, countryCode: 'IT', paymentStatus: 'refund', processingStatus: 'canceled', search: 'A&B #1' }).path, API_ORIGIN).searchParams;
  assert.equal(query.get('search'), 'A&B #1'); assert.equal(query.get('country'), 'IT'); assert.equal(query.get('processingStatus'), 'canceled');
  assert.equal(planRead({ kind: 'purchases.detail', id: '501' }).path, '/api/member-purchases?id=501');
  for (const change of [{ page: 0 }, { perPage: 100 }, { countryCode: 'it' }, { paymentStatus: 'a&member=9' }, { search: 'bad\nvalue' }]) assert.throws(() => planPurchasesRead({ kind: 'purchases.list', ...change }));
  assert.throws(() => planPurchasesRead({ kind: 'purchases.detail', id: '1&memberId=99' }));
});

test('missing new endpoint is explicit, genuine authentication/network errors are not disguised', async () => {
  const now = 1790000000000; let status = 404, cleared = false;
  const service = new LiveAccountService(async path => {
    if (path.startsWith('/api/member-purchases')) throw new ApiError(status, 'errors.network');
    if (path === '/api/member/me') return { member: { id: '7', email: 'test@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'First', surname: 'Last', countryId: '143', countries: [{ id: '143', title: 'Moldova' }], phoneCode: '+373', phone: '60000000' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-purchases', expiresAt: now + 3600000 }), write: async () => {}, clear: async () => { cleared = true; } }, () => now);
  await service.start();
  await assert.rejects(service.readView({ kind: 'purchases.list' }), error => error.key === 'purchases.serverUpdateRequired');
  status = 503; await assert.rejects(service.readView({ kind: 'purchases.list' }), error => error.status === 503 && error.key === 'errors.network');
  assert.equal(cleared, false);
  status = 401; await assert.rejects(service.readView({ kind: 'purchases.detail', id: '1' }), error => error.status === 401);
  assert.equal(cleared, true);
});


test('store grouping uses server IDs, retains unknown legacy merchants, and keeps labels distinct', () => {
  assert.deepEqual(normalizePurchasePage(page()).items[0].shops, []);
  const shops = [{ id: '21', title: '<b>Store</b> &amp; Co' }, { id: '22', title: null }];
  const result = normalizePurchasePage({ ...page(), items: [{ ...summary(), shops }] }).items[0];
  assert.deepEqual(result.shops, [{ id: '21', title: 'Store & Co' }, { id: '22', title: null }]);
  assert.throws(() => normalizePurchasePage({ ...page(), items: [{ ...summary(), shops: [shops[0], shops[0]] }] }));
  const data = normalizePurchaseDetail({ ...detail(), shops, items: [{ ...detail().items[0], shopId: '21', shopTitle: 'Store &amp; Co' }] });
  assert.equal(data.items[0].shopId, '21'); assert.equal(data.items[0].shopTitle, 'Store & Co');
  assert.equal(normalizePurchaseDetail(detail()).items[0].shopId, null);
});
