import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiContractError, normalizeAuthData, normalizeBalanceHistoryData, normalizeCalculatorWarehousesData, normalizeCountersData, normalizeCurrentBalancesData, normalizeLegacyWarehouseAddressData, normalizePersonalBalancesData, normalizePersonalProfileData, normalizeProfileData, normalizeRecipientAddressesData, normalizeShipmentDetailData, normalizeShipmentsData, normalizeStockData, normalizeWaitingData, normalizeWarehouseAddressesData, normalizeWarehousesData } from '../src/api/normalize.ts';

test('auth enforces a usable bearer lifetime and never includes unrelated secret fields in profile', () => {
  const result = normalizeAuthData({ id: '7', uid: 'M1000007', name: 'Bay', surname: 'Shop', access_token: 'test-only-token', token_type: 'Bearer', expires_in: 3600, password: 'not-retained', intercom: { intercom_user_jwt: 'not-retained' } });
  assert.equal(result.profile.clientCode, 'M1000007');
  assert.equal(result.expiresInSeconds, 3600);
  assert.deepEqual(Object.keys(result.profile).sort(), ['clientCode', 'email', 'firstName', 'id', 'lastName', 'phone']);
  for (const override of [{ expires_in: 0 }, { expires_in: -1 }, { expires_in: '3600s' }, { access_token: 'test\r\nheader' }, { access_token: 'test\u0000token' }, { token_type: 'Basic' }]) {
    assert.throws(() => normalizeAuthData({ id: '7', access_token: 'test-only-token', token_type: 'Bearer', expires_in: 3600, ...override }), ApiContractError);
  }
  assert.throws(() => normalizeProfileData({ data: { id: '7' } }), ApiContractError, 'an envelope must not be mistaken for a user');
});

test('current balances use explicit memberBalance and preserve real zero or negative amounts', () => {
  const balances = normalizeCurrentBalancesData({ memberBalance: [
    { currency_id: '1', currency_code: 'usd', currency_sign: '$', amount: '0.00' },
    { currency_id: '2', currency_code: 'eur', currency_sign: '€', amount: '-1.25' },
    { currency_id: '5', currency_code: 'ron', currency_sign: 'RON', amount: '100.50' },
  ], requestsList: [{ sum: '9999.99' }] });
  assert.deepEqual(balances, [{ currency: 'USD', amount: 0 }, { currency: 'EUR', amount: -1.25 }, { currency: 'RON', amount: 100.5 }]);
  assert.throws(() => normalizeCurrentBalancesData({ memberBalance: [{ currency_code: 'usd' }] }), ApiContractError);
  assert.throws(() => normalizeCurrentBalancesData({ balanceList: { usd: [] } }), ApiContractError);
  assert.throws(() => normalizeCurrentBalancesData({ memberBalance: [{ currency_code: 'usd', amount: '1' }, { currency_code: 'USD', amount: '2' }] }), ApiContractError);
});

test('calculator warehouse metadata keeps numeric-looking string IDs separate from country codes', () => {
  assert.deepEqual(normalizeCalculatorWarehousesData({ storageList: [{ id: '14', code: 'US', title: 'SUA', activeCountries: ['143'] }] }), [{ id: '14', code: 'US', title: 'SUA' }]);
  assert.throws(() => normalizeCalculatorWarehousesData({ storageList: [{ id: 14, code: 'US', title: 'SUA' }] }), ApiContractError, 'the documented ID type is string');
  assert.throws(() => normalizeProfileData({ id: 7, name: 'Bay' }), ApiContractError, 'profile numeric IDs need observed contract evidence before acceptance');
});

test('stock normalizer honors documented grams and declaration strings without fabricated prices', () => {
  const [parcel] = normalizeStockData({ list: [{ id: '1294056', uid: 'BS123456', storageId: '14', tracking: null, title: 'Parcel', weight: '850', isDeclarationFilled: '0', createdDate: '2026-06-20 14:32:11', currency: '$' }], consolidation: {} });
  assert.equal(parcel.weightKg, 0.85);
  assert.equal(parcel.declared, false);
  assert.equal(parcel.amount, null);
  assert.equal(parcel.tracking, null);
  assert.equal(parcel.countryCode, null, 'numeric storage ID must not be guessed as a country');
  assert.deepEqual(normalizeStockData({ list: [] }), []);
  assert.throws(() => normalizeStockData({ items: [] }), ApiContractError);
  assert.throws(() => normalizeStockData({ list: [{ id: '1', weight: '850g' }] }), ApiContractError);
  assert.throws(() => normalizeStockData({ list: [{ id: '1' }, { id: '1' }] }), ApiContractError);
});

test('historical balances never become current balance and debits preserve their sign', () => {
  const result = normalizeBalanceHistoryData({ balanceList: { usd: [{ trid: 'T1', type: 'minus', summ: '109.24', total_amount: '99257.82', created: '2016-08-01 19:13:25', comment: 'Delivery' }], eur: [{ trid: 'T1', type: 'plus', summ: '0.00', total_amount: '0.00' }] } });
  assert.equal(result.balances, null);
  assert.equal(result.transactions[0].amount, -109.24);
  assert.equal(result.transactions[0].balanceAfter, 99257.82);
  assert.equal(result.transactions[1].amount, 0);
  assert.equal(result.transactions[1].balanceAfter, 0);
  assert.throws(() => normalizeBalanceHistoryData({ balanceList: { usd: [{ trid: 'T2', type: 'refund', summ: '15' }] } }), ApiContractError);
  assert.throws(() => normalizeBalanceHistoryData({ balanceList: { usd: [{ trid: 'T2', type: 'minus', summ: '-15' }] } }), ApiContractError);
  assert.throws(() => normalizeBalanceHistoryData({ balanceList: { usd: [{ trid: 'T2', type: 'plus', summ: '1,000' }] } }), ApiContractError);
});

test('history preserves every financial row with missing or repeated legacy transaction references', () => {
  const row = (trid, summ, extra = {}) => ({ trid, type: 'plus', summ, ...extra });
  const result = normalizeBalanceHistoryData({ balanceList: {
    usd: [row(undefined, '1.01'), row(null, '2.02'), row('', '3.03'), row('shared', '4.04'), row('shared', '5.05', { type: 'minus' })],
    eur: [row('shared', '6.06')],
  } });
  assert.deepEqual(result.transactions.map(transaction => transaction.id), [null, null, null, 'shared', 'shared', 'shared']);
  assert.deepEqual(result.transactions.map(transaction => transaction.amount), [1.01, 2.02, 3.03, 4.04, -5.05, 6.06]);
  assert.deepEqual(result.transactions.map(transaction => transaction.currency), ['USD', 'USD', 'USD', 'USD', 'USD', 'EUR']);
  assert.equal(result.balances, null);
});

test('PHP empty associative history is accepted but missing or malformed collections remain errors', () => {
  for (const balanceList of [[], {}, { usd: [] }]) assert.deepEqual(normalizeBalanceHistoryData({ balanceList }), { balances: null, transactions: [] });
  for (const balanceList of [undefined, null, '', [{ type: 'plus', summ: '1' }], { usd: null }]) assert.throws(() => normalizeBalanceHistoryData({ balanceList }), ApiContractError);
});

test('history decodes visible HTML comments without changing references, dates or financial values', () => {
  const source = { balanceList: { ron: [{ trid: 'T&123', type: 'minus', summ: '12.3456', total_amount: '-0.50', created: '2026-11-02 11:22:33', comment: '<p>Plat&abreve; &amp; comision <strong>0,8%</strong></p><script>hidden()</script>', status: 'unpaid' }] } };
  const before = structuredClone(source);
  const [transaction] = normalizeBalanceHistoryData(source).transactions;
  assert.deepEqual(transaction, { id: 'T&123', date: '2026-11-02 11:22:33', label: 'Plată & comision 0,8%', amount: -12.3456, currency: 'RON', balanceAfter: -0.5, status: 'unpaid' });
  assert.deepEqual(source, before);
});

test('history stays strict about amounts and direction even when transaction identity is absent', () => {
  for (const summ of [undefined, null, '', '1,25', '1 000.00', '12 USD', '-1', NaN, Infinity]) {
    assert.throws(() => normalizeBalanceHistoryData({ balanceList: { usd: [{ type: 'plus', summ }] } }), ApiContractError);
  }
  for (const extra of [{ type: 'refund' }, { total_amount: '2,50' }, { trid: 123 }]) {
    assert.throws(() => normalizeBalanceHistoryData({ balanceList: { usd: [{ type: 'plus', summ: '0.00', ...extra }] } }), ApiContractError);
  }
  assert.equal(normalizeBalanceHistoryData({ balanceList: { usd: [{ type: 'plus', summ: '0.00' }] } }).transactions[0].amount, 0);
});

test('documented legacy addresses retain leading zero postal codes and exact personal lines', () => {
  const [address] = normalizeLegacyWarehouseAddressData([{ fullName: 'BAY SHOP', countryTitle: 'Italy', countryCode: 'IT', state: 'Roma', city: 'Roma', zipCode: '00198', address1: 'Via Test 1', address2: 'M1000007', phone: '+39 000 000' }]);
  assert.equal(address.fields.find(field => field.label === 'Cod poștal').value, '00198');
  assert.equal(address.fields.find(field => field.label === 'Adresa, linia 2').value, 'M1000007');
  assert.equal(address.fields.find(field => field.label === 'Nume / Prenume').personal, true);
  assert.throws(() => normalizeWarehouseAddressesData([{ fullName: 'BAY SHOP' }]), ApiContractError, 'new endpoint must not be guessed from the old endpoint');
});

test('shipment detail preserves server status, grams, dates and zero costs', () => {
  const result = normalizeShipmentDetailData({ id: '8', uid: 'R123', status: 'sent', currentStatus: 'customs-held', realWeight: '2680', created: '2026-07-21 18:04:11', receivedTime: null, customsHeldTime: '2026-08-04 22:00:06', currency: '$', price_total: '0.00', price_import_taxes: '0.00', shipping: { title: 'Air Post' }, address: { first_name: 'Bay', zip: '00198' }, progressData: { label: 'Customs-held' }, boxes: [] });
  assert.equal(result.status, 'customs-held');
  assert.equal(result.weightKg, 2.68);
  assert.equal(result.amount, 0);
  assert.equal(result.events.some(event => event.label === 'Primit'), false);
  assert.equal(result.costs.find(cost => cost.label === 'Taxe de import').amount, 0);
  assert.equal(result.recipientFields.find(field => field.label === 'Cod poștal').value, '00198');
});

test('unknown nonempty list formats report unavailable instead of silently claiming no parcels', () => {
  for (const normalizer of [normalizeWaitingData, data => normalizeShipmentsData(data, 'sent'), normalizeWarehouseAddressesData]) {
    assert.deepEqual(normalizer([]), []);
    for (const input of [null, {}, { items: [] }, [{ id: '123' }]]) assert.throws(() => normalizer(input), ApiContractError);
  }
});

test('official legacy warehouse list maps numeric string IDs without confusing title and country code', () => {
  assert.deepEqual(normalizeWarehousesData([{ id: '14', title: 'USA', countryTitle: 'SUA', countryCode: 'US' }, { id: '12', title: 'RO', countryTitle: 'România', countryCode: 'RO' }]), [
    { id: '14', code: 'US', title: 'SUA', sourceTitle: 'USA', currencyId: null, availableCurrencies: [], requireInvoiceUpload: null }, { id: '12', code: 'RO', title: 'România', sourceTitle: 'RO', currencyId: null, availableCurrencies: [], requireInvoiceUpload: null },
  ]);
  assert.throws(() => normalizeWarehousesData([{ id: '14', title: 'USA' }]), ApiContractError);
});

test('current warehouse addresses keep private notices, ordering metadata and exact personal fields', () => {
  const addresses = normalizeWarehouseAddressesData([{ countryTitle: 'United States', countriesCode: 'US', addresses: {
    storage: [{ id: '2', storageId: '14', city: 'City', userName: 'BAY SHOP', address1: 'Street 1', address2: 'ST M1000007', country: 'USA', state: 'State', zipCode: '00198', phone: '+1 000 000', rank: '1', notifications: [] }],
    private: [{ id: '5', storageId: '14', userName: 'BAY SHOP', address1: 'Street 2', address2: 'ST M1000007', rank: '2', notifications: [[{ type: 'danger', text: '20 USD suplimentar pentru fiecare colet' }]] }],
  } }]);
  assert.equal(addresses.length, 2);
  assert.equal(addresses[0].kind, 'storage');
  assert.equal(addresses[1].kind, 'private');
  assert.equal(addresses[1].rank, 2);
  assert.equal(addresses[1].storageId, '14');
  assert.equal(addresses[0].fields.find(field => field.label === 'Cod poștal').value, '00198');
  assert.deepEqual(addresses[1].notifications, [{ type: 'danger', text: '20 USD suplimentar pentru fiecare colet' }]);
  assert.equal(addresses[1].fields.some(field => field.value.includes('20 USD')), false, 'surcharge text must not enter copied postal fields');
  assert.equal(addresses[1].title, 'United States', 'server country text is separate from the localized private/storage label');
  assert.equal(addresses[1].countryTitle, 'United States');
  assert.throws(() => normalizeWarehouseAddressesData([{ countryTitle: 'USA', countriesCode: 'US', addresses: { invented: [] } }]), ApiContractError);
});

test('legacy recipient addresses retain company, leading postal zero and phone without fixture identity', () => {
  const [address] = normalizeRecipientAddressesData([{ id: '11630', first_name: 'Bay', last_name: 'Shop', company_name: 'Example SRL', country_id: '143', country_title: 'Moldova', city: 'Chișinău', address: 'Street 1', zip: '0001', phone: '+37300000000', isLegal: '1' }]);
  assert.equal(address.name, 'Bay Shop');
  assert.equal(address.fields.find(field => field.label === 'Companie').value, 'Example SRL');
  assert.equal(address.fields.find(field => field.label === 'Cod poștal').value, '0001');
  assert.equal(address.fields.find(field => field.label === 'Țară').value, 'Moldova');
});

test('legacy waiting parcels do not fabricate weight, declaration or warehouse absent from response', () => {
  const [parcel] = normalizeWaitingData([{ id: '281', uid: 'WMF123', tracking: '00123', title: 'Parcel', status: 'not-taken', createdDate: '2026-11-01 10:00:00', price: '1.78', currency: 'usd', currency_sign: '$' }]);
  assert.equal(parcel.stage, 'waiting');
  assert.equal(parcel.currency, 'USD');
  assert.equal(parcel.tracking, '00123');
  assert.equal(parcel.weightKg, null);
  assert.equal(parcel.declared, null);
  assert.equal(parcel.storageId, null);
});

test('legacy grouped and flat outgoing lists preserve held/received state and gram units', () => {
  const held = { id: '65018', codeNumber: 'R123', realWeight: '2300', fieldTime: '2026-11-01 10:00:00', description: 'Parcel', status: 'sent', currentStatus: 'customs-held', storage_id: '12', currency: 'RON', totalPrice: '2.00' };
  const received = { id: '65019', codeNumber: 'R124', realWeight: '3000.00', status: 'received', currentStatus: 'received', totalPrice: '0.00' };
  const grouped = normalizeShipmentsData({ 'customs-held': [held], received: [received], packed: [] }, 'sent');
  assert.equal(grouped[0].status, 'customs-held');
  assert.equal(grouped[0].weightKg, 2.3);
  assert.equal(grouped[0].createdAt, null);
  assert.equal(grouped[0].updatedAt, held.fieldTime);
  assert.equal(grouped[1].stage, 'received');
  assert.equal(grouped[1].weightKg, 3);
  assert.equal(grouped[1].amount, 0);
  assert.deepEqual(normalizeShipmentsData([held], 'sent'), grouped.slice(0, 1));
  assert.deepEqual(normalizeShipmentsData({ sent: [], received: [] }, 'sent'), []);
  assert.throws(() => normalizeShipmentsData({ unexpected: [] }, 'sent'), ApiContractError);
  assert.throws(() => normalizeShipmentsData({ sent: [held], 'customs-held': [held] }, 'sent'), ApiContractError, 'duplicate bucket records must not double-count parcels');
});

test('personal-data enriches an authenticated profile without replacing the authenticated identity', () => {
  const profile = normalizeProfileData({ id: '7', uid: 'M1000007', name: 'Old', surname: 'Name' });
  const updated = normalizePersonalProfileData({ name: 'Bay', surname: 'Shop', phoneCode: '+373', phone: '00000000', countryId: '143' }, { ...profile, email: 'user@example.test' });
  assert.equal(updated.id, '7');
  assert.equal(updated.clientCode, 'M1000007');
  assert.equal(updated.firstName, 'Bay');
  assert.equal(updated.phone, '+37300000000');
  assert.equal(updated.email, 'user@example.test');
  assert.deepEqual(normalizePersonalBalancesData({ balance: { usd: '-78.31', eur: '0.00', gbp: '4.25' } }), [{ currency: 'USD', amount: -78.31 }, { currency: 'EUR', amount: 0 }, { currency: 'GBP', amount: 4.25 }]);
  assert.throws(() => normalizePersonalBalancesData({ balanceList: { usd: [] } }), ApiContractError);
});

test('authenticated address schema retains company and numeric activity without adding inactive postal details', () => {
  const [active, inactive] = normalizeWarehouseAddressesData([{ countryTitle: 'Poland', countriesCode: 'PL', addresses: { storage: [
    { id: '50', storageId: '20', userName: 'SYNTHETIC USER', companyName: 'Example Company', address1: 'Example Street', zipCode: '00-001', isActive: 1, rank: '1', notifications: [] },
    { id: '51', storageId: '20', userName: 'SYNTHETIC USER', companyName: null, address1: 'Old Street', isActive: 0, rank: '2', notifications: [{ type: 'danger', text: 'Adresă inactivă' }] },
  ], private: [] } }]);
  assert.equal(active.active, true);
  assert.equal(active.fields.find(field => field.label === 'Companie').value, 'Example Company');
  assert.equal(inactive.active, false);
  assert.equal(inactive.fields.some(field => field.label === 'Companie'), false);
  assert.deepEqual(inactive.notifications, [{ type: 'danger', text: 'Adresă inactivă' }]);
  const [companyRecipient] = normalizeRecipientAddressesData([{ id: '80', first_name: null, last_name: null, company_name: 'Example Company', address: 'Example Street' }]);
  assert.equal(companyRecipient.name, 'Example Company');
});

test('authenticated all-waiting response and extra outgoing groups do not discard valid records', () => {
  const [waiting] = normalizeWaitingData([{ id: '81', uid: 'TEST81', storageId: '14', status: 'not-taken', currency: 'usd' }]);
  assert.equal(waiting.storageId, '14');
  const parcels = normalizeShipmentsData({ 'held-by-missing': [], 'ready-to-pickup': [{ id: '82', codeNumber: 'TEST82', status: 'sent', currentStatus: 'ready-to-pickup', storage_id: '14', realWeight: '1250' }], sent: [], 'customs-held': [] }, 'sent');
  assert.equal(parcels.length, 1);
  assert.equal(parcels[0].status, 'ready-to-pickup');
  assert.equal(parcels[0].stage, 'sent', 'ready for pickup is not received');
  assert.equal(parcels[0].weightKg, 1.25);
});

test('authenticated financial history preserves unpaid state independently of signed amount', () => {
  const balance = normalizeBalanceHistoryData({ balanceList: { ron: [{ trid: 'TEST83', type: 'minus', status: 'unpaid', summ: '15.25', total_amount: '22.00' }], usd: [{ trid: 'TEST84', type: 'plus', status: 'paid', summ: '7.00', total_amount: '12.00' }] } });
  assert.equal(balance.transactions[0].amount, -15.25);
  assert.equal(balance.transactions[0].status, 'unpaid');
  assert.equal(balance.transactions[1].status, 'paid');
  assert.equal(balance.balances, null);
});

test('authenticated counters distinguish explicit zero from malformed or missing counts', () => {
  const counters = { awaiting: '1', incoming: '3', outgoing: '21', received: '0', cart: '0', orders: '0' };
  assert.deepEqual(normalizeCountersData(counters), { awaiting: 1, incoming: 3, outgoing: 21, received: 0 });
  assert.deepEqual(normalizeCountersData({ awaiting: 0, incoming: 0, outgoing: 0, received: 0 }), { awaiting: 0, incoming: 0, outgoing: 0, received: 0 });
  for (const outgoing of [undefined, null, '', '-1', '1.5', '1,000', '1e3', Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, -1, 1.5]) {
    assert.throws(() => normalizeCountersData({ ...counters, outgoing }), ApiContractError);
  }
});

test('profile language metadata is retained without guessing an account-language mapping', () => {
  const auth = normalizeProfileData({ id: '7', uid: 'M1000007' });
  const updated = normalizePersonalProfileData({ name: 'Иван', surname: 'Test', countryId: '143', languageId: '2', languageCode: 'ru', languages: { 1: 'Romanian', 2: 'Russian', 3: 'English' } }, auth);
  assert.equal(updated.firstName, 'Иван');
  assert.equal(updated.countryId, '143');
  assert.equal(updated.languageId, '2');
  assert.equal(updated.languageCode, 'ru');
  assert.deepEqual(updated.languages, { 1: 'Romanian', 2: 'Russian', 3: 'English' });
  assert.equal(normalizePersonalProfileData({ name: 'Bay' }, auth).languageCode, undefined);
  assert.equal(normalizePersonalProfileData({ languageCode: 'future-code' }, auth).languageCode, 'future-code', 'do not replace an unknown server preference with Romanian');
  assert.throws(() => normalizePersonalProfileData({ languages: { 1: 3 } }, auth), ApiContractError);
  assert.equal(new ApiContractError('unrecognized-field').key, 'errors.contract');
});

test('public shop catalogue uses the account country matched by ID, independent of display language', () => {
  const profile = normalizeProfileData({ id: '7' });
  const countries = [{ id: '10', code: 'MD' }, { id: '20', code: 'ro' }];
  const updated = normalizePersonalProfileData({ countryId: '20', countries, languageCode: 'ru' }, profile);
  assert.equal(updated.countryCode, 'RO');
  assert.equal(normalizePersonalProfileData({ countryId: '11', countries }, updated).countryCode, null);
  assert.equal(normalizePersonalProfileData({ countryId: '10', countries: [{ id: '10', code: 'rus' }] }, updated).countryCode, null);
});

test('address semantic keys never replace or translate exact postal values', () => {
  const [address] = normalizeWarehouseAddressesData([{ countriesCode: 'US', countryTitle: 'США', addresses: { storage: [{ id: '1', userName: 'Иван Test', companyName: 'Example Inc.', address1: '  1 Parcel Street ', address2: 'ST M0007', city: 'Newark', state: 'DE', zipCode: '00198', country: 'United States', phone: '+1 000 000' }], private: [] } }]);
  assert.equal(address.title, 'США');
  assert.equal(address.countryTitle, 'США');
  assert.equal(address.kind, 'storage');
  assert.equal(address.fields.find(field => field.labelKey === 'field.fullName').value, 'Иван Test');
  assert.equal(address.fields.find(field => field.labelKey === 'field.addressLine1').value, '  1 Parcel Street ');
  assert.equal(address.fields.find(field => field.labelKey === 'field.postalCode').value, '00198');
  assert.equal(address.fields.find(field => field.labelKey === 'field.country').value, 'United States');
  assert.ok(address.fields.every(field => field.labelKey));
});

test('stock restrictions distinguish false from unknown and preserve server comments', () => {
  const [parcel] = normalizeStockData({ list: [{ id: '1', price: '12.50', currency: '$', isHeldByProhibition: '1', heldByProhibitionComment: 'Проверка содержимого', isHeldByDamage: '0', heldByDamageComment: '', packingDenied: true }] });
  assert.equal(parcel.status, null, 'flags do not fabricate a parcel lifecycle status');
  assert.equal(parcel.amountKind, 'productValue');
  assert.deepEqual(parcel.restrictions, { heldByProhibition: true, prohibitionComment: 'Проверка содержимого', heldByDamage: false, damageComment: null, packingDenied: true });
  assert.deepEqual(normalizeStockData({ list: [{ id: '2' }] })[0].restrictions, { heldByProhibition: null, prohibitionComment: null, heldByDamage: null, damageComment: null, packingDenied: null });
  assert.equal(normalizeStockData({ list: [{ id: '3', packingDenied: false }] })[0].restrictions.packingDenied, false);
  for (const invalid of [{ isHeldByDamage: 'false' }, { isHeldByProhibition: '2' }, { packingDenied: 'false' }]) assert.throws(() => normalizeStockData({ list: [{ id: '4', ...invalid }] }), ApiContractError);
});

test('parcel amount meaning, carrier and country server text remain separate from labels', () => {
  const [waiting] = normalizeWaitingData([{ id: '1', uid: 'WMF1', storageId: '14', title: 'My parcel', tracking_status: 'DELIVERED', service_name: 'Carrier name', price: '15.00', currency: 'usd' }]);
  assert.equal(waiting.amountKind, 'productValue');
  assert.equal(waiting.storageId, '14');
  assert.equal(waiting.trackingStatus, 'DELIVERED');
  assert.equal(waiting.serviceName, 'Carrier name');
  const [sent] = normalizeShipmentsData([{ id: '2', codeNumber: 'R2', status: 'sent', countryTitle: 'Румыния', shipperTitle: 'Air Post', totalPrice: '2.00' }], 'sent');
  assert.equal(sent.countryTitle, 'Румыния');
  assert.equal(sent.shipperTitle, 'Air Post');
  assert.equal(sent.amountKind, 'productValue');
  assert.equal(sent.amount, 2);
});

test('history is chronological across currencies with stable unknown dates and no timezone assumptions', () => {
  const row = (trid, created) => ({ trid, type: 'plus', summ: '1.00', created });
  const result = normalizeBalanceHistoryData({ balanceList: {
    usd: [row('unknown-1', null), row('old', '2024-02-29 23:59:59'), row('tie-usd', '2026-01-01 00:00:00'), row('invalid-calendar', '2026-02-30 12:00:00')],
    eur: [row('new', '2026-11-01 23:59:59'), row('tie-eur', '2026-01-01 00:00:00'), row('unknown-2', 'not a date'), row('unknown-zone', '2026-01-01T00:00:00Z')],
  } });
  assert.deepEqual(result.transactions.map(item => item.id), ['new', 'tie-usd', 'tie-eur', 'old', 'unknown-1', 'invalid-calendar', 'unknown-2', 'unknown-zone']);
  assert.equal(result.transactions.find(item => item.id === 'unknown-zone').date, '2026-01-01T00:00:00Z', 'unknown format is retained intact, never reinterpreted');
});


test('warehouse invoice policy and currency choices come from server metadata, including new warehouses', () => {
  const result = normalizeWarehousesData([
    { id: '20', title: 'PL', countryCode: 'PL', requireInvoiceUpload: '1', currencyId: '8', availableCurrencies: [{ id: 8, title: 'pln', currency_sign: 'zł' }, { id: 2, title: 'eur', currency_sign: '€' }] },
    { id: '14', title: 'USA', countryCode: 'US', requireInvoiceUpload: '0' },
    { id: '12', title: 'RO', countryCode: 'RO' },
  ]);
  assert.equal(result[0].requireInvoiceUpload, true, 'required follows the server, not a Romania-only rule');
  assert.equal(result[1].requireInvoiceUpload, false);
  assert.equal(result[2].requireInvoiceUpload, null, 'missing metadata is unknown');
  assert.equal(result[0].currencyId, '8');
  assert.deepEqual(result[0].availableCurrencies, [{ id: '8', title: 'pln', sign: 'zł' }, { id: '2', title: 'eur', sign: '€' }]);
  assert.throws(() => normalizeWarehousesData([{ id: '1', title: 'US', countryCode: 'US', requireInvoiceUpload: 'maybe' }]), ApiContractError);
});
