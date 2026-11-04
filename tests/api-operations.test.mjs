import assert from 'node:assert/strict';
import test from 'node:test';
import { OperationValidationError, invoiceRequirementError, declarationItems, operationId, planMutation, planRead, validateAttachmentCount, validateUpload, waitingParcelFields } from '../src/api/operations-contracts.ts';
import { warehouseForStorage, warehouseCurrencyCode, normalizeCartList, normalizeOrdersList, normalizeOutgoingDeclaration, normalizeShipmentOperationDetail, normalizeStockDeclaration, normalizeStockDetail, normalizeUploadCollection, normalizeWaitingDetail } from '../src/api/operations-normalize.ts';
import { ApiContractError } from '../src/api/normalize.ts';

const input = { storage: 'usa', tracking: 'TRACK-001', declarations: [{ id: '19', title: 'Produs / cămașă', quantity: '2', price: '1.25', url: 'https://example.test/product' }] };
const file = { uri: 'file:///selected/invoice.pdf', name: 'invoice.pdf', mimeType: 'application/pdf', size: 1234 };
const ack = { code: 200, error: false, message: 'Ok' };

test('operation IDs and the discriminated read registry cannot inject arbitrary API routes', () => {
  assert.equal(planRead({ kind: 'waiting.detail', id: '123' }).path, '/api/waiting-mf/123');
  assert.equal(planRead({ kind: 'shipment.customs.read', id: '123' }).responseMode, 'envelope');
  for (const id of ['../auth', '1?role=admin', '0', '-1', '1.5', '9007199254740993']) assert.throws(() => operationId(id), OperationValidationError);
  assert.throws(() => planRead({ kind: 'invented', path: 'https://example.test/' }), OperationValidationError);
  assert.throws(() => planRead({ kind: 'cart.list', countryCode: '../US' }), OperationValidationError);
});

test('waiting form retains declaration identifiers and explicit existing service flags', () => {
  const body = waitingParcelFields({ ...input, photosPackageRequested: 1, verificationPackageRequested: 0, invoiceList: ['21'], customsDocsList: ['22'] });
  assert.equal(body.encoding, 'form');
  assert.equal(body.fields.photosPackageRequested, '1');
  assert.equal(body.fields.verificationPackageRequested, '0');
  assert.equal(JSON.parse(body.fields.declarations)[0].id, '19');
  assert.equal(JSON.parse(body.fields.declarations)[0].title, input.declarations[0].title);
  assert.deepEqual(body.fields['invoiceList[]'], ['21']);
  assert.deepEqual(body.fields['customsDocsList[]'], ['22']);
  assert.equal('useAutoPacking' in body.fields, false);
  assert.throws(() => waitingParcelFields({ ...input, tracking: 'with space' }), OperationValidationError);
  assert.throws(() => waitingParcelFields({ ...input, customsDocsList: ['https://example.test/file.pdf'] }), OperationValidationError, 'customsDocsList is IDs only');
});

test('declaration validation preserves exact decimal text and rejects accidental replacement IDs', () => {
  const values = declarationItems(input.declarations, { outgoing: true });
  assert.equal(values[0].price, '1.25');
  assert.equal(values[0].id, '19');
  for (const item of [{ quantity: 0 }, { quantity: 1.5 }, { price: '-1' }, { price: '1,25' }, { url: 'javascript:alert(1)' }]) assert.throws(() => declarationItems([{ ...input.declarations[0], ...item }]), OperationValidationError);
  assert.throws(() => declarationItems([input.declarations[0], input.declarations[0]]), OperationValidationError);
  const body = planMutation({ kind: 'shipment.declaration.save', id: '7', input: { currencyId: '1', declarationItems: input.declarations } });
  assert.equal(JSON.parse(body.fields.declarationItems)[0].id, '19');
});

test('waiting edit replaces deleted declaration rows while retaining invoice identities', () => {
  const original = { ...input, invoiceList: ['21'], customsDocsList: ['22'] };
  const plan = planMutation({ kind: 'waiting.edit', id: '7', input: original });
  const rows = JSON.parse(plan.fields.declarations);
  assert.equal(plan.path, '/api/waiting-mf/7');
  assert.deepEqual(rows, [{ title: input.declarations[0].title, quantity: '2', price: '1.25', url: input.declarations[0].url }]);
  assert.equal(original.declarations[0].id, '19', 'editing must not mutate the loaded detail');
  assert.deepEqual(plan.fields['invoiceList[]'], ['21']);
  assert.deepEqual(plan.fields['customsDocsList[]'], ['22']);
  const stock = planMutation({ kind: 'stock.declaration.save', id: '7', input: { title: 'Parcel', declarationItems: input.declarations } });
  assert.equal(JSON.parse(stock.fields.declarationItems)[0].id, '19', 'other endpoint semantics remain distinct');
  assert.throws(() => planMutation({ kind: 'waiting.edit', id: '7', input: { ...input, declarations: [...input.declarations, ...input.declarations] } }), OperationValidationError);
});

test('uploads validate selected local file kind and server-provided collection limits', () => {
  assert.equal(validateUpload(file).name, 'invoice.pdf');
  assert.throws(() => validateUpload(file, 'customsPhoto'), OperationValidationError);
  assert.throws(() => validateUpload({ ...file, uri: 'https://example.test/secret.pdf' }), OperationValidationError);
  assert.throws(() => validateUpload({ ...file, name: 'invoice.png' }), OperationValidationError);
  assert.throws(() => validateUpload({ ...file, name: 'name\nheader.pdf' }), OperationValidationError);
  assert.throws(() => validateUpload({ ...file, size: 0 }), OperationValidationError);
  assert.doesNotThrow(() => validateAttachmentCount(2, 1, 3));
  assert.throws(() => validateAttachmentCount(2, 2, 3), OperationValidationError);
  assert.doesNotThrow(() => validateAttachmentCount(2, 1, null), 'missing server maximum is unknown, not an invented limit');
  const plan = planMutation({ kind: 'shipment.invoice.upload', id: '7', file });
  assert.equal(plan.encoding, 'multipart'); assert.equal(plan.files[0].field, 'file');
  assert.deepEqual(plan.files[0].file, file);
});

test('write acknowledgement rejects HTTP-success validation and contradictory success bodies', () => {
  const waiting = planMutation({ kind: 'waiting.create', input });
  assert.deepEqual(waiting.normalize({ ...ack, data: { id: '91', uid: 'WMF91' } }), { id: '91', uid: 'WMF91' });
  for (const raw of [{ ...ack, message: 'Error', data: { tracking: { trackingNumberExists: 'duplicate' } } }, { ...ack, data: {} }, { ...ack, error: true, data: { id: '91' } }]) assert.throws(() => waiting.normalize(raw));
  const upload = planMutation({ kind: 'shipment.invoice.upload', id: '7', file });
  assert.deepEqual(upload.normalize(ack), { success: true });
  assert.throws(() => upload.normalize({ ...ack, data: { success: false } }), ApiContractError);
  const stock = planMutation({ kind: 'stock.declaration.save', id: '7', input: { title: 'Parcel', declarationItems: input.declarations } });
  assert.throws(() => stock.normalize(ack), ApiContractError);
  assert.deepEqual(stock.normalize({ ...ack, data: { success: true } }), { success: true });
});

test('actual waiting detail preserves auto-packing state and attachment identity', () => {
  const data = normalizeWaitingDetail({ id: '1', uid: 'WMF1', storage: 'USA', trackingNumber: 'TRACK1', currency: '$', price: '1', declarations: [{ id: '9', title: 'Original title', quantity: '2', price: '1.20', currencyId: '1' }], invoices: [{ id: 21, url: '/upload/invoice.pdf' }], customsDocs: [], dimensions: null, photosPackageRequested: '1', verificationPackageRequested: '0', autoPackingData: { autoPacking: '1', autoPackingAddressId: '55' }, passcodeAllowed: true });
  assert.equal(data.currencyCode, null, 'currency symbol must not become an invented ISO code');
  assert.equal(data.currency, '$');
  assert.equal(data.photosPackageRequested, true);
  assert.equal(data.verificationPackageRequested, false);
  assert.deepEqual(data.autoPackingData, { autoPacking: '1', autoPackingAddressId: '55' });
  assert.equal(data.invoices[0].id, '21');
});

test('stock declaration and detail preserve actual empty/customs structures and kilogram units', () => {
  const declaration = normalizeStockDeclaration({ title: 'Parcel', currency: null, declarationItems: [], invoiceFiles: [], customsFiles: [] });
  assert.deepEqual(declaration.items, []);
  assert.equal(declaration.currencyCode, null);
  const detail = normalizeStockDetail({ id: '1', weight: '1.25', freeDaysStorage: 'Server storage text', declarationFilled: false, photos: [{ url: '/upload/image.jpg', thumbnail: '/thumb/image.jpg' }], invoices: [], isHeldByDamage: false, packingDenied: true });
  assert.equal(detail.weightKg, 1.25, 'stock-detail weight already uses kilograms');
  assert.equal(detail.freeDaysStorage, 'Server storage text');
  assert.equal(detail.packingDenied, true);
});

test('attachment collections and outgoing declarations are endpoint-specific', () => {
  assert.deepEqual(normalizeUploadCollection({ ...ack, maxImages: '10', images: [{ imageId: '4', img: '/upload/photo.jpg', thumb: '/thumb/photo.jpg' }] }, 'customs'), { maxFiles: 10, files: [{ id: '4', url: 'https://bayshop.com/upload/photo.jpg', thumbnail: 'https://bayshop.com/thumb/photo.jpg' }] });
  assert.throws(() => normalizeUploadCollection({ ...ack, error: true, images: [] }, 'customs'), ApiContractError);
  assert.throws(() => normalizeUploadCollection({ ...ack, data: { invoiceFiles: [] } }, 'invoice'), ApiContractError);
  const declaration = normalizeOutgoingDeclaration({ items: [{ id: 9, title: 'Existing', quantity: 1, price: '51.00', url: 'https://example.test/' }], availableStorageCurrencies: { 1: 'usd' }, declarationCurrency: 1 });
  assert.equal(declaration.items[0].id, '9'); assert.equal(declaration.currencyId, '1');
  assert.deepEqual(declaration.availableCurrencies, { 1: 'usd' });
});

test('shipment detail respects explicit capabilities and retains box documents/products', () => {
  const detail = normalizeShipmentOperationDetail({ id: '7', status: 'received', currentStatus: 'received', enableCustomsDocUpload: false, isAllowedLocalDeliveryChange: false, boxes: [{ id: '3', title: 'Box', photos: [{ original: '/upload/photo.jpg' }], declarationItems: [{ title: 'Product', url: 'https://example.test/', price: '2.00' }] }], taxesInvoice: '/upload/taxes.pdf' });
  assert.equal(detail.permissions.uploadCustomsDocuments, false);
  assert.equal(detail.boxes[0].declarationItems[0].quantity, null);
  assert.equal(detail.boxes[0].declarationItems[0].price, '2.00');
  assert.equal(detail.documents[0].kind, 'taxesInvoice');
});

test('empty real commerce lists differ from unsupported payloads and cart totals are not fabricated', () => {
  assert.deepEqual(normalizeCartList([]), []);
  assert.deepEqual(normalizeOrdersList({ paid: [], unpaid: [] }), []);
  assert.throws(() => normalizeCartList({ items: [] }), ApiContractError);
  assert.throws(() => normalizeOrdersList({}), ApiContractError);
  const [cart] = normalizeCartList([{ shopId: '4', shopTitle: 'Example shop', isComplex: false, list: [{ id: '1', title: 'Product', quantity: '2', price: '3.50', localShipping: '1.00', currency: 'USD' }] }]);
  assert.equal(cart.price, 3.5); assert.equal(cart.quantity, 2); assert.equal(cart.isComplex, false);
  assert.equal('totalToPay' in cart, false, 'checkout totals come from cart-prices');
});

test('account operations restrict fields and keep identity changes outside profile saves', () => {
  assert.throws(() => planMutation({ kind: 'profile.save', input: { surname: 'Test', name: 'User', phone_code: '+373', phone: '12345678', languageId: '2' } }), OperationValidationError);
  assert.throws(() => planMutation({ kind: 'profile.save', input: { surname: 'Test', name: 'User', phone_code: '+373', phone: '12345678', role: 'admin' } }), OperationValidationError);
  assert.throws(() => planMutation({ kind: 'preferences.save', input: { obtainSms: 2 } }), OperationValidationError);
});

test('waiting edit retains returned zero dimensions and resolves same-origin attachment paths', () => {
  assert.deepEqual(JSON.parse(waitingParcelFields({ ...input, dimensions: { x: 0, y: 0, z: 0, weight: 0 } }).fields.dimensions), { x: 0, y: 0, z: 0, weight: 0 });
  const detail = normalizeWaitingDetail({ id: '1', declarations: [], invoices: ['/upload/invoice.pdf'], customsDocs: [] });
  assert.equal(detail.invoices[0].url, 'https://bayshop.com/upload/invoice.pdf');
});

test('checkout uses documented carts query, JSON flags and exact local-pickup field', () => {
  const query = planRead({ kind: 'checkout.shipping', carts: ['1', '2'], addressId: '3' });
  assert.equal(query.path, '/api/order-create/shipping/?carts%5B%5D=1&carts%5B%5D=2&address_id=3');
  assert.throws(() => planRead({ kind: 'checkout.insurance', carts: ['1'] }), OperationValidationError);
  const plan = planMutation({ kind: 'order.create', input: { carts: ['1'], addressId: '3', shipperId: '4', localPickup: { optionKey: 'localStorage-storage', optionId: '7' }, additionServices: ['repacking'], waitAllItems: true, allowLowerQuantity: false, allowOverpricing: false, insurance: false, paymentType: 'balance' } });
  assert.equal(plan.path, '/api/order-create/'); assert.equal(plan.encoding, 'json');
  assert.deepEqual(plan.fields.carts, ['1']); assert.equal(plan.fields.waitAllItems, 1);
  assert.equal(plan.fields.local_delivery, 'storage'); assert.equal(plan.fields['localStorage-storage'], '7');
  assert.equal('localStorage' in plan.fields, false);
  assert.throws(() => plan.normalize(ack), ApiContractError);
  const result = plan.normalize({ ...ack, paymentParams: { type: 'balance', amount: '20.00', currency: '1', balance: '0', orders: [{ id: '8', uid: 'US8' }] } });
  assert.deepEqual(result.orders, [{ id: '8', uid: 'US8' }]); assert.equal('paid' in result, false); assert.equal(result.currencyId, '1');
});

test('checkout payment amounts and currency come only from the quoted method', () => {
  const read = planRead({ kind: 'checkout.payments', carts: ['1'] });
  const raw = { general: { itemsPrice: '10', localDelivery: '2', serviceComission: '3', currencyCode: 'eur', countCommission: '0', fromBalance: '0' }, paymentData: { balance: { name: 'Account', description: 'Balance', percent: '0', availableCurrency: ['eur'], max_sum: '0', hide_billing: '1', amounts: { totalToPay: '15', comission: '0', fullOrderPrice: '15' } } } };
  const value = read.normalize(raw);
  assert.equal(value.currency, 'eur'); assert.equal(value.methods[0].totalToPay, 15); assert.equal(value.methods[0].hideBilling, true);
  assert.throws(() => read.normalize({ ...raw, general: { ...raw.general, currencyCode: undefined } }), ApiContractError);
  assert.throws(() => read.normalize({ ...raw, paymentData: { balance: { ...raw.paymentData.balance, amounts: {} } } }), ApiContractError);
});


test('required seller invoices accept retained or staged invoices and never treat unknown rules as optional', () => {
  assert.equal(invoiceRequirementError(true, 0, 0), 'parcelForm.invoiceRequired');
  assert.equal(invoiceRequirementError(true, 1, 0), null);
  assert.equal(invoiceRequirementError(true, 0, 1), null);
  assert.equal(invoiceRequirementError(false, 0, 0), null);
  assert.equal(invoiceRequirementError(null, 0, 0), 'parcelForm.invoiceRuleUnknown');
  assert.equal(invoiceRequirementError(undefined, 1, 0), 'parcelForm.invoiceRuleUnknown');
});


test('waiting aliases resolve server invoice metadata without a loaded list and currency IDs preserve nondefault choices', () => {
  const us = { id: '14', code: 'US', title: 'United States', sourceTitle: 'United States', requireInvoiceUpload: false };
  const gb = { id: '7', code: 'GB', title: 'United Kingdom', sourceTitle: 'United Kingdom', requireInvoiceUpload: false };
  const ro = { id: '12', code: 'RO', title: 'Romania', requireInvoiceUpload: true, currencyId: '5', availableCurrencies: [{ id: '5', title: 'ron', sign: 'RON' }, { id: '2', title: 'eur', sign: '€' }, { id: '1', title: 'US dollars', sign: '$' }] };
  assert.equal(warehouseForStorage([us, gb, ro], 'usa'), us);
  assert.equal(warehouseForStorage([us, gb, ro], 'uk'), gb);
  assert.equal(warehouseForStorage([us, gb, ro], 'ro'), ro);
  assert.equal(warehouseForStorage([us, gb, ro], 'unknown', '12'), ro);
  assert.equal(warehouseForStorage([ro, { ...ro, id: '99' }], 'ro'), undefined, 'ambiguous warehouse must not select an arbitrary invoice policy');
  assert.equal(warehouseCurrencyCode(ro, '2'), 'eur', 'existing EUR is not replaced by warehouse default RON');
  assert.equal(warehouseCurrencyCode(ro, '1'), null, 'currency symbols or translated names do not invent ISO codes');
});


test('stock photo request uses documented integer states including completed, not a boolean or image count', () => {
  for (const state of [0, 1, 2]) assert.equal(normalizeStockDetail({ id: '1', photosInProgress: state }).photosInProgress, state);
  assert.equal(normalizeStockDetail({ id: '1', photosInProgress: null }).photosInProgress, null);
  assert.throws(() => normalizeStockDetail({ id: '1', photosInProgress: 3 }), ApiContractError);
  assert.throws(() => normalizeStockDetail({ id: '1', photosInProgress: true }), ApiContractError);
});
