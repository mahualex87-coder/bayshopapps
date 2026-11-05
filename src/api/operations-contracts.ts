import { normalizeLegacyStockServiceStates, type LegacyServiceStatus } from './stock-service-status.ts';
import { planShopDirectoryRead, type ShopDirectoryReadCommand, type ShopDirectoryReadResult } from './shop-directory.ts';
import { planFinancialRead, planFinancialMutation, type FinancialReadCommand, type FinancialReadResult, type FinancialMutationCommand } from './account-financial-actions.ts';
import { planOutgoingServicesRead, planOutgoingServiceMutation, type OutgoingServicesReadCommand, type OutgoingServicesData, type OutgoingServiceMutationCommand } from './outgoing-services.ts';
import { normalizeStockDivision, divisionFields, type StockDivision } from './stock-division.ts';
import { recipientFields, recipientScanPath, recipientMaxScanBytes, type RecipientScan } from './recipient-fields.ts';
import { normalizeIntercomIdentityData } from './intercom-identity.ts';
import { normalizeParcelReview, planParcelReviewSave, type ParcelReviewInput } from './parcel-review.ts';
import { planPurchasesRead, type PurchasesReadCommand, type PurchasesReadResult } from './member-purchases.ts';
import { planPaymentRead, planPaymentStart, type PaymentReadCommand, type PaymentReadResult, type PaymentStartInput } from './payments.ts';
import { planLegacyPaymentRead, planLegacyPaymentStart, type LegacyPaymentReadCommand, type LegacyPaymentReadResult, type LegacyPaymentStartInput } from './payment-legacy.ts';
import { planPaymentReconciliationRead, type PaymentReconciliationRead, type PaymentReconciliationResult } from './payment-reconciliation.ts';
import { normalizeCartLinkData, normalizeCartSavedData, type CartLinkData } from './cart-link.ts';
import { normalizeAccountPickupQr } from './account-qr.ts';
import { normalizeOverviewSummary } from './overview-summary.ts';
import { normalizeShipmentTracking } from './shipment-tracking.ts';
import { planAutoPackingRead, planAutoPackingSave, type AutoPackingReadCommand, type AutoPackingReadResult, type AutoPackingSaveInput } from './account-auto-packing.ts';
import { billingInputFields, normalizeAccountSettings, passwordChangeFields, validBirthday, type SettingsMutationCommand } from './account-settings.ts';
import type { ReadPlan, MutationPlan } from './mutations.ts';
import { normalizeUserUrl } from '../domain/user-url.ts';
import { isWaitingStorageTitle } from '../domain/waiting-warehouse-options.ts';
import { normalizeDeliveryMethods, normalizeDeliveryAddresses, type DeliverySelection } from './local-delivery.ts';
import { planOrderPaymentStart, type OrderPaymentStartInput } from './order-payment.ts';
import { normalizePaymentBilling, type PaymentBilling } from './payments-catalog.ts';
import { checkoutAddresses, checkoutCarriers, checkoutCreated, checkoutInsurance, checkoutLocal, checkoutPayments, type CheckoutPayments } from './checkout-normalize.ts';
import { ApiContractError, normalizeBalanceHistoryData, normalizeCountersData, normalizeRecipientAddressesData, normalizeStockData, normalizeWarehousesData } from './normalize.ts';
import { normalizeCartItem, normalizeCartList, normalizeCartPrices, normalizeOrderDetail, normalizeOrdersList, normalizeOutgoingDeclaration, normalizeShipmentOperationDetail, normalizeStockDeclaration, normalizeStockDetail, normalizeStockServicePrices, normalizeUploadCollection, normalizeWaitingDetail, type CartItem, type CartPrices, type DeclarationDocument, type OrderDetail, type OrderSummary, type ShipmentOperationDetail, type StockDetail, type StockServicePrices, type UploadCollection, type WaitingDetail } from './operations-normalize.ts';

/** Narrow request contracts from the official MF v2 Apiary/OpenAPI documents.
 * These helpers validate and serialize user input. They never perform requests.
 * Dynamic IDs/options must come from the signed-in account's API responses. */
export type OperationFields = Record<string, string | string[]>;
export type BinaryFlag = 0 | 1;
export type DeclarationItemInput = {
  id?: string;
  title: string;
  url?: string;
  quantity: string | number;
  price: string;
  currency?: string;
  productType?: string;
  orderNumber?: string;
};
export type LocalUploadFile = { uri: string; name: string; mimeType: string; size?: number };
export type OperationUpload = LocalUploadFile & { field: string };
export type AttachmentChanges = {
  /** Existing identifiers/URLs retained by a replacement-style save. */
  invoiceList?: string[];
  customsDocsList?: string[];
  invoices?: LocalUploadFile[];
  customsDocuments?: LocalUploadFile[];
};
export type WaitingParcelInput = AttachmentChanges & {
  storage: string;
  tracking: string;
  declarations: DeclarationItemInput[];
  currency?: string;
  dimensions?: { weight?: number; x: number; y: number; z: number };
  photosPackageRequested?: BinaryFlag;
  verificationPackageRequested?: BinaryFlag;
};
export type StockDeclarationInput = AttachmentChanges & { declarationItems: DeclarationItemInput[]; currency?: string };
export type OutgoingDeclarationInput = { currencyId: string; declarationItems: DeclarationItemInput[] };
export type CartItemInput = { storage_id: string; url: string; price: string; quantity: string | number; shipping: string; title: string; color?: string; size?: string; comment?: string; expectedMarket?: { countryCode: 'RO'; currency: 'RON' }; selectedShop?: { id: string; countryCode?: string } };
export type SerializedOperation = { fields: OperationFields; files: OperationUpload[]; encoding: 'form' | 'multipart' };

export class OperationValidationError extends Error {
  readonly key = 'errors.validation';
  readonly field: string;
  readonly fieldErrors: Record<string, string>;
  constructor(field: string) { super('Invalid operation input'); this.name = 'OperationValidationError'; this.field = field; this.fieldErrors = { [field]: 'errors.invalidField' }; }
}

/** File byte-size limits are not specified in the public contract. maxImages
 * comes from each attachment-list response and includes already saved files. */
export const DOCUMENT_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const CUSTOMS_PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;
export const NOTIFICATION_OPTION_KEYS = ['alertOnSystem', 'obtainSms', 'obtainGcm', 'obtainMails', 'obtainViber', 'obtainTelegram', 'obtainMass'] as const;
export type NotificationOptionKey = typeof NOTIFICATION_OPTION_KEYS[number];
export type NotificationOptionsInput = Partial<Record<NotificationOptionKey, BinaryFlag>>;

/** Invoice policy is supplied by warehouse-list, never inferred from a country. */
export function invoiceRequirementError(required: boolean | null | undefined, existingCount: number, uploadCount: number): string | null {
  if (required == null) return 'parcelForm.invoiceRuleUnknown';
  return required && existingCount + uploadCount < 1 ? 'parcelForm.invoiceRequired' : null;
}

export function operationId(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new OperationValidationError(field);
  return value;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000\r]/.test(value)) throw new OperationValidationError(field);
  return value;
}
function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined || value === '' ? undefined : text(value, field);
}
function decimal(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new OperationValidationError(field);
  return value;
}
function quantity(value: unknown): string {
  const result = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(result) || result <= 0) throw new OperationValidationError('quantity');
  return String(result);
}
function currency(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^[a-z]{3}$/.test(value)) throw new OperationValidationError('currency');
  return value;
}
export function absoluteHttpUrl(value: unknown, field = 'url'): string {
  const raw = text(value, field);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new OperationValidationError(field); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new OperationValidationError(field);
  return raw;
}

/** User-entered product links may omit a protocol. Retained attachment URLs
 * still use absoluteHttpUrl directly and keep their exact server identity. */
export function userHttpUrl(value: unknown, field = 'url'): string {
  return absoluteHttpUrl(normalizeUserUrl(text(value, field)), field);
}

/** Legacy cart saveCart only matches a merchant when PHP parse_url has a
 * nonempty path. Canonical root links must therefore keep their trailing '/'. */
export function cartProductUrl(value: unknown): string {
  return new URL(userHttpUrl(value)).href;
}

/** Forms_AddMfPackageItem is reused by waiting, stock and outgoing writes. */
const declarationPunctuation = "_,@#=~`'\";:&!‑%-/\\.+?*|(){}[]$^";
export function declarationTitle(value: unknown): string {
  const title = text(value, 'title').trim();
  if (Array.from(title).length < 2 || Array.from(title).length > 255 || !Array.from(title).every(character => /^[0-9a-zA-ZăîșțâĂÎȘȚÂşţŞŢ\s]$/u.test(character) || declarationPunctuation.includes(character))) throw new OperationValidationError('title');
  return title;
}
export function waitingTracking(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-zA-Z-]{5,100}$/.test(value)) throw new OperationValidationError('tracking');
  return value;
}
export function declarationItems(input: DeclarationItemInput[], options: { outgoing?: boolean; stock?: boolean } = {}): Record<string, string>[] {
  if (!Array.isArray(input) || input.length === 0) throw new OperationValidationError('declarationItems');
  const ids = new Set<string>();
  return input.map(item => {
    if (!item || typeof item !== 'object') throw new OperationValidationError('declarationItems');
    const result: Record<string, string> = { title: declarationTitle(item.title), quantity: quantity(item.quantity), price: decimal(item.price, 'price'), url: userHttpUrl(item.url) };
    if (Number(result.quantity) > 9_999_999) throw new OperationValidationError('quantity');
    if (Number(result.price) > 9_999_999) throw new OperationValidationError('price');
    if (options.stock && result.url.includes('bayshop.com')) throw new OperationValidationError('url');
    if (item.id !== undefined) {
      result.id = operationId(item.id);
      if (ids.has(result.id)) throw new OperationValidationError('id');
      ids.add(result.id);
    }
    if (!options.outgoing) {
      const code = currency(item.currency);
      if (code) result.currency = code;
      for (const key of ['productType', 'orderNumber'] as const) { const value = optionalText(item[key], key); if (value !== undefined) result[key] = value; }
    }
    return result;
  });
}

export function validateUpload(file: LocalUploadFile, kind: 'document' | 'customsPhoto' = 'document'): LocalUploadFile {
  if (!file || typeof file !== 'object') throw new OperationValidationError('file');
  const allowed: readonly string[] = kind === 'customsPhoto' ? CUSTOMS_PHOTO_TYPES : DOCUMENT_FILE_TYPES;
  if (!allowed.includes(file.mimeType)) throw new OperationValidationError('mimeType');
  if (!/^file:\/\/|^content:\/\//.test(file.uri) || /[\r\n\u0000]/.test(file.uri)) throw new OperationValidationError('uri');
  const name = text(file.name, 'name');
  if (/[\/\\\n]/.test(name)) throw new OperationValidationError('name');
  const extension = name.split('.').at(-1)?.toLowerCase();
  const validExtension = file.mimeType === 'image/jpeg' ? extension === 'jpg' || extension === 'jpeg' : file.mimeType === 'image/png' ? extension === 'png' : extension === 'pdf';
  if (!validExtension) throw new OperationValidationError('name');
  if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size <= 0)) throw new OperationValidationError('size');
  return { uri: file.uri, name, mimeType: file.mimeType, ...(file.size !== undefined ? { size: file.size } : {}) };
}
export function validateAttachmentCount(existing: number, added: number, maximum: number | null): void {
  if (![existing, added].every(value => Number.isSafeInteger(value) && value >= 0) || maximum !== null && (!Number.isSafeInteger(maximum) || maximum < 0 || existing + added > maximum)) throw new OperationValidationError('maxImages');
}
function attachmentFields(input: AttachmentChanges): SerializedOperation {
  const fields: OperationFields = {};
  const files: OperationUpload[] = [];
  for (const key of ['invoiceList', 'customsDocsList'] as const) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key])) throw new OperationValidationError(key);
    fields[`${key}[]`] = input[key].map(value => key === 'customsDocsList' || /^\d+$/.test(value) ? operationId(value, key) : absoluteHttpUrl(value, key));
  }
  for (const [key, field] of [['invoices', 'invoice[]'], ['customsDocuments', 'customsDocs[]']] as const) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key])) throw new OperationValidationError(key);
    files.push(...input[key].map(file => ({ ...validateUpload(file), field })));
  }
  return { fields, files, encoding: files.length ? 'multipart' : 'form' };
}

/** Basic waiting flow. Service flags are explicit; existing values must be
 * carried forward on edit rather than inventing new service selections. */
export function waitingParcelFields(input: WaitingParcelInput, options: { replaceDeclarations?: boolean } = {}): SerializedOperation {
  const result = attachmentFields(input);
  if (!isWaitingStorageTitle(input.storage)) throw new OperationValidationError('storage');
  const declarations = declarationItems(input.declarations);
  // WaitingMfListController replaces the collection before inserting it. Sending
  // old row IDs asks Zend to update rows it just deleted, which rolls back the edit.
  // Validate identities first; only declaration IDs are omitted, never document IDs.
  if (options.replaceDeclarations) for (const item of declarations) delete item.id;
  Object.assign(result.fields, { storage: input.storage, tracking: waitingTracking(input.tracking), declarations: JSON.stringify(declarations) });
  const code = currency(input.currency); if (code) result.fields.currency = code;
  for (const key of ['photosPackageRequested', 'verificationPackageRequested'] as const) {
    if (input[key] !== undefined) {
      if (input[key] !== 0 && input[key] !== 1) throw new OperationValidationError(key);
      result.fields[key] = String(input[key]);
    }
  }
  if (input.dimensions) {
    const { weight, x, y, z } = input.dimensions;
    if (![x, y, z, ...(weight === undefined ? [] : [weight])].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new OperationValidationError('dimensions');
    result.fields.dimensions = JSON.stringify({ ...(weight !== undefined ? { weight } : {}), x, y, z });
  }
  return result;
}
export function stockDeclarationFields(input: StockDeclarationInput): SerializedOperation {
  const result = attachmentFields(input);
  // MfStorageDeclarationController derives the parcel name from its rows;
  // it does not read a separate top-level title.
  Object.assign(result.fields, { declarationItems: JSON.stringify(declarationItems(input.declarationItems, { stock: true })) });
  const code = currency(input.currency); if (code) result.fields.currency = code;
  return result;
}
export function outgoingDeclarationFields(input: OutgoingDeclarationInput): SerializedOperation {
  return { fields: { currencyId: operationId(input.currencyId, 'currencyId'), declarationItems: JSON.stringify(declarationItems(input.declarationItems, { outgoing: true })) }, files: [], encoding: 'form' };
}
export function cartItemFields(input: CartItemInput): OperationFields {
  const result: OperationFields = { storage_id: operationId(input.storage_id, 'storage_id'), url: cartProductUrl(input.url), title: text(input.title, 'title'), price: decimal(input.price, 'price'), quantity: quantity(input.quantity), shipping: decimal(input.shipping, 'shipping') };
  for (const key of ['color', 'size', 'comment'] as const) if (input[key] !== undefined) {
    if (typeof input[key] !== 'string' || /[\u0000\r]/.test(input[key])) throw new OperationValidationError(key);
    result[key] = input[key];
  }
  return result;
}
export function notificationOptionFields(input: NotificationOptionsInput): OperationFields {
  const result: OperationFields = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(NOTIFICATION_OPTION_KEYS as readonly string[]).includes(key) || value !== 0 && value !== 1) throw new OperationValidationError(key);
    result[key] = String(value);
  }
  if (Object.keys(result).length === 0) throw new OperationValidationError('options');
  return result;
}

/** Source references use frozen work/api-auth-docs/legacy-source.txt line numbers.
 * Methods are explicit so no GET-name heuristic can activate a write. */
export const OPERATIONS = {
  waitingCreate: { method: 'POST', path: '/api/waiting-mf/', sourceLine: 1523 },
  waitingEdit: { method: 'POST', path: '/api/waiting-mf/{id}', sourceLine: 1635 },
  waitingDelete: { method: 'DELETE', path: '/api/waiting-mf/{id}', sourceLine: 1783 },
  stockDeclaration: { method: 'POST', path: '/api/mf-storage-declaration/{id}', sourceLine: 3339 },
  shipmentDeclaration: { method: 'POST', path: '/api/package-declaration/{id}/', sourceLine: 4331 },
  invoiceUpload: { method: 'POST', path: '/api/package-invoice/{id}', field: 'file', sourceLine: 5300 },
  invoiceDelete: { method: 'DELETE', path: '/api/package-invoice/{id}/{fileId}', sourceLine: 5322 },
  customsUpload: { method: 'POST', path: '/api/customs-photos/{id}', field: 'customsPhotos[]', sourceLine: 5455 },
  customsDelete: { method: 'DELETE', path: '/api/customs-photos-delete/{id}/{fileId}', sourceLine: 5479 },
  packingCreate: { method: 'PUT', path: '/api/parcel-create', sourceLine: 4254 },
  cartCreate: { method: 'POST', path: '/api/cart', sourceLine: 2073 },
  cartEdit: { method: 'POST', path: '/api/cart/{id}', sourceLine: 2111 },
  cartDelete: { method: 'DELETE', path: '/api/cart', sourceLine: 2153 },
  orderCreate: { method: 'POST', path: '/api/order-create/', sourceLine: 2952 },
  profileEdit: { method: 'POST', path: '/api/member/personal-data', sourceLine: 6497 },
  notificationsEdit: { method: 'POST', path: '/api/member/mail-options/', sourceLine: 6025 },
  calculator: { method: 'POST', path: '/api/calculator', sourceLine: 7045 },
} as const;

export type BalanceHistoryPeriod = 'one' | '7' | '1' | '3' | '6' | 'all';
export type ReadCommand =
  | ShopDirectoryReadCommand
  | FinancialReadCommand
  | OutgoingServicesReadCommand
  | PaymentReconciliationRead
  | LegacyPaymentReadCommand
  | PaymentReadCommand
  | PurchasesReadCommand
  | AutoPackingReadCommand
  | { kind: 'settings.read' }
  | { kind: 'account.qr' }
  | { kind: 'dashboard.counters' | 'dashboard.summary' }
  | { kind: 'support.identity' }
  | { kind: 'shipment.review.read'; id: string }
  | { kind: 'shipment.tracking.read'; uid: string }
  | { kind: 'balance.history'; period: BalanceHistoryPeriod }
  | { kind: 'shipment.localDelivery.read'; id: string }
  | { kind: 'shipment.localDelivery.addresses'; id: string; localDeliveryId: string; page: number; search: string }
  | { kind: 'warehouses.read' }
  | { kind: 'recipients.read' }
  | { kind: 'waiting.detail' | 'stock.detail' | 'stock.declaration.read' | 'shipment.detail' | 'shipment.declaration.read' | 'shipment.invoices.read' | 'shipment.customs.read' | 'cart.detail' | 'order.detail' | 'recipient.detail'; id: string }
  | { kind: 'orders.payment.billing' }
  | { kind: 'cart.list' | 'orders.list'; countryCode: string }
  | { kind: 'cart.prices'; ids: string[] }
  | { kind: 'cart.link'; url: string; storageId?: string }
  | { kind: 'profile.read' | 'recipient.formats' | 'preferences.read' | 'calculator.options' | 'news.read' | 'loyalty.read' | 'payments.read' }
  | { kind: 'stock.services'; storageId: string }
  | { kind: 'stock.division.read'; id: string }
  | { kind: 'stock.current'; id: string; storageId: string }
  | { kind: 'stock.legacyStates'; countryCode?: string }
  | { kind: 'checkout.addresses' | 'checkout.shipping' | 'checkout.localShipping' | 'checkout.insurance' | 'checkout.payments'; carts: string[]; addressId?: string; shipperId?: string; localDeliveryId?: string; page?: number; search?: string }
  | { kind: 'packing.addresses' | 'packing.shipping' | 'packing.localShipping' | 'packing.insurance'; boxes: string[]; addressId?: string; shipperId?: string; localDeliveryId?: string; page?: number; search?: string };

export type ReadResult<Q extends ReadCommand> =
  Q extends ShopDirectoryReadCommand ? ShopDirectoryReadResult<Q> :
  Q extends FinancialReadCommand ? FinancialReadResult<Q> :
  Q extends OutgoingServicesReadCommand ? OutgoingServicesData :
  Q extends PaymentReconciliationRead ? PaymentReconciliationResult<Q> :
  Q extends LegacyPaymentReadCommand ? LegacyPaymentReadResult<Q> :
  Q extends PaymentReadCommand ? PaymentReadResult<Q> :
  Q extends PurchasesReadCommand ? PurchasesReadResult<Q> :
  Q extends AutoPackingReadCommand ? AutoPackingReadResult<Q> :
  Q extends { kind: 'settings.read' } ? ReturnType<typeof normalizeAccountSettings> :
  Q extends { kind: 'account.qr' } ? ReturnType<typeof normalizeAccountPickupQr> :
  Q extends { kind: 'dashboard.counters' } ? ReturnType<typeof normalizeCountersData> :
  Q extends { kind: 'dashboard.summary' } ? ReturnType<typeof normalizeOverviewSummary> :
  Q extends { kind: 'support.identity' } ? ReturnType<typeof normalizeIntercomIdentityData> :
  Q extends { kind: 'shipment.review.read' } ? ReturnType<typeof normalizeParcelReview> :
  Q extends { kind: 'shipment.tracking.read' } ? ReturnType<typeof normalizeShipmentTracking> :
  Q extends { kind: 'balance.history' } ? ReturnType<typeof normalizeBalanceHistoryData> :
  Q extends { kind: 'shipment.localDelivery.read' } ? ReturnType<typeof normalizeDeliveryMethods> :
  Q extends { kind: 'shipment.localDelivery.addresses' } ? ReturnType<typeof normalizeDeliveryAddresses> :
  Q extends { kind: 'recipients.read' } ? ReturnType<typeof normalizeRecipientAddressesData> :
  Q extends { kind: 'waiting.detail' } ? WaitingDetail :
  Q extends { kind: 'stock.detail' } ? StockDetail :
  Q extends { kind: 'stock.services' } ? StockServicePrices :
  Q extends { kind: 'stock.division.read' } ? StockDivision :
  Q extends { kind: 'stock.current' } ? ReturnType<typeof normalizeStockData> :
  Q extends { kind: 'stock.legacyStates' } ? LegacyServiceStatus[] :
  Q extends { kind: 'stock.declaration.read' | 'shipment.declaration.read' } ? DeclarationDocument :
  Q extends { kind: 'shipment.detail' } ? ShipmentOperationDetail :
  Q extends { kind: 'shipment.invoices.read' | 'shipment.customs.read' } ? UploadCollection :
  Q extends { kind: 'cart.list' } ? CartItem[] :
  Q extends { kind: 'cart.detail' } ? CartItem :
  Q extends { kind: 'cart.link' } ? CartLinkData :
  Q extends { kind: 'cart.prices' } ? CartPrices :
  Q extends { kind: 'orders.payment.billing' } ? PaymentBilling :
  Q extends { kind: 'orders.list' } ? OrderSummary[] :
  Q extends { kind: 'order.detail' } ? OrderDetail[] :
  Q extends { kind: 'checkout.addresses' } ? ReturnType<typeof checkoutAddresses> :
  Q extends { kind: 'checkout.shipping' } ? ReturnType<typeof checkoutCarriers> :
  Q extends { kind: 'checkout.localShipping' } ? ReturnType<typeof checkoutLocal> :
  Q extends { kind: 'checkout.insurance' } ? ReturnType<typeof checkoutInsurance> :
  Q extends { kind: 'checkout.payments' } ? ReturnType<typeof checkoutPayments> :
  Q extends { kind: 'warehouses.read' } ? ReturnType<typeof normalizeWarehousesData> : unknown;

function ids(values: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) throw new OperationValidationError('ids');
  const result = values.map(value => operationId(value));
  if (new Set(result).size !== result.length) throw new OperationValidationError('ids');
  return result;
}
function countryCode(value: string): string { if (!/^[A-Z]{2}$/.test(value)) throw new OperationValidationError('countryCode'); return value; }
function query(path: string, fields: OperationFields): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
  return `${path}?${params.toString()}`;
}
export function planRead<Q extends ReadCommand>(command: Q): ReadPlan<ReadResult<Q>> {
  let plan: ReadPlan;
  switch (command.kind) {
    case 'shops.list': case 'shops.detail': case 'shops.match': plan = planShopDirectoryRead(command); break;
    case 'refunds.read': case 'order.cancellation': plan = planFinancialRead(command); break;
    case 'outgoing.services': plan = planOutgoingServicesRead(command); break;
    case 'payments.invoice.read': case 'payments.invoice.history': plan = planPaymentReconciliationRead(command); break;
    case 'payments.legacy.catalog': case 'payments.legacy.status': plan = planLegacyPaymentRead(command); break;
    case 'payments.catalog': case 'payments.quote': case 'payments.status': plan = planPaymentRead(command); break;
    case 'purchases.list': case 'purchases.detail': plan = planPurchasesRead(command); break;
    case 'autoPacking.settings': case 'autoPacking.addresses': case 'autoPacking.shipping': case 'autoPacking.localShipping': case 'autoPacking.insurance': plan = planAutoPackingRead(command); break;
    case 'settings.read': plan = { path: '/api/member-settings', normalize: normalizeAccountSettings }; break;
    case 'account.qr': plan = { path: '/api/qr/member', normalize: normalizeAccountPickupQr }; break;
    case 'dashboard.counters': plan = { path: '/api/member/counters', normalize: normalizeCountersData }; break;
    case 'dashboard.summary': plan = { path: '/api/member/dashboard', normalize: normalizeOverviewSummary }; break;
    case 'support.identity': plan = { path: '/api/auth', normalize: normalizeIntercomIdentityData }; break;
    case 'shipment.review.read': plan = { path: `/api/parcels/view/${operationId(command.id)}`, normalize: normalizeParcelReview }; break;
    case 'shipment.tracking.read': {
      // Use this account's parcel UID, not its numeric ID or carrier AWB.
      if (typeof command.uid !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(command.uid)) throw new OperationValidationError('uid');
      plan = { path: `/api/parcel-tracking/${encodeURIComponent(command.uid)}`, normalize: normalizeShipmentTracking }; break;
    }
    case 'balance.history': {
      if (!['one', '7', '1', '3', '6', 'all'].includes(command.period)) throw new OperationValidationError('period');
      // Only period is read by MFv2. Paging/currency/status are not server parameters.
      plan = { path: query('/api/balance', { period: command.period }), ...(command.period === 'all' ? { timeoutMs: 60_000 } : {}), normalize: normalizeBalanceHistoryData }; break;
    }
    case 'shipment.localDelivery.read': plan = { path: `/api/parcel-local-delivery/${operationId(command.id)}`, normalize: normalizeDeliveryMethods }; break;
    case 'shipment.localDelivery.addresses': {
      if (!Number.isSafeInteger(command.page) || command.page < 1 || typeof command.search !== 'string') throw new OperationValidationError('page');
      plan = { path: query(`/api/parcel-local-delivery/${operationId(command.id)}/address`, { local_delivery_id: operationId(command.localDeliveryId), perPage: '20', page: String(command.page), search: command.search }), normalize: normalizeDeliveryAddresses }; break;
    }
    case 'warehouses.read': plan = { path: '/api/warehouse-list', normalize: normalizeWarehousesData }; break;
    case 'recipients.read': plan = { path: '/api/member-address', normalize: normalizeRecipientAddressesData }; break;
    case 'waiting.detail': plan = { path: `/api/waiting-mf/${operationId(command.id)}`, normalize: normalizeWaitingDetail }; break;
    case 'stock.detail': plan = { path: `/api/mf-list/${operationId(command.id)}`, normalize: normalizeStockDetail }; break;
    case 'stock.declaration.read': plan = { path: `/api/mf-storage-declaration/${operationId(command.id)}`, normalize: normalizeStockDeclaration }; break;
    case 'shipment.detail': plan = { path: `/api/parcels/view/${operationId(command.id)}`, normalize: normalizeShipmentOperationDetail }; break;
    case 'shipment.declaration.read': plan = { path: `/api/package-declaration/${operationId(command.id)}/`, normalize: normalizeOutgoingDeclaration }; break;
    case 'shipment.invoices.read': plan = { path: `/api/package-invoice/${operationId(command.id)}`, responseMode: 'envelope', normalize: raw => normalizeUploadCollection(raw, 'invoice') }; break;
    case 'shipment.customs.read': plan = { path: `/api/customs-photos/${operationId(command.id)}`, responseMode: 'envelope', normalize: raw => normalizeUploadCollection(raw, 'customs') }; break;
    case 'cart.list': plan = { path: `/api/cart-list/${countryCode(command.countryCode)}`, normalize: normalizeCartList }; break;
    case 'cart.detail': plan = { path: `/api/cart/${operationId(command.id)}`, normalize: raw => normalizeCartItem(raw) }; break;
    case 'cart.prices': plan = { path: query('/api/cart-prices', { 'carts[]': ids(command.ids) }), normalize: normalizeCartPrices }; break;
    case 'cart.link': plan = { path: query('/api/cart-link/', { url: cartProductUrl(command.url), ...(command.storageId ? { storage_id: operationId(command.storageId, 'storage_id') } : {}) }), normalize: normalizeCartLinkData }; break;
    case 'orders.payment.billing': plan = {path:'/api/payments',normalize:normalizePaymentBilling};break;
    case 'orders.list': plan = { path: `/api/order-list/${countryCode(command.countryCode)}`, normalize: normalizeOrdersList }; break;
    case 'order.detail': plan = { path: `/api/order/${operationId(command.id)}`, normalize: normalizeOrderDetail }; break;
    case 'recipient.detail': plan = { path: `/api/member-address/${operationId(command.id)}`, normalize: raw => raw }; break;
    case 'stock.legacyStates': plan = { path: query('/api/storage', command.countryCode && /^[a-z]{2}$/i.test(command.countryCode) ? { country: command.countryCode.toUpperCase() } : {}), normalize: normalizeLegacyStockServiceStates }; break;
    case 'stock.current': plan = { path: query('/api/mf-list', { type: 'in-stock', storage: operationId(command.storageId), ids: operationId(command.id) }), normalize: normalizeStockData }; break;
    case 'stock.division.read': plan = { path: query('/api/request-divide', { id: operationId(command.id) }), responseMode: 'envelope', normalize: normalizeStockDivision }; break;
    case 'stock.services': plan = { path: query('/api/additional-services/', { storageId: operationId(command.storageId) }), normalize: normalizeStockServicePrices }; break;
    case 'checkout.addresses': case 'checkout.shipping': case 'checkout.localShipping': case 'checkout.insurance': case 'checkout.payments': {
      const fields: OperationFields = { 'carts[]': ids(command.carts) };
      if (command.addressId) fields.address_id = operationId(command.addressId);
      if (command.shipperId) fields.shipper_id = operationId(command.shipperId);
      if (command.localDeliveryId) fields.local_delivery_id = operationId(command.localDeliveryId);
      if (command.page !== undefined) { if (!Number.isSafeInteger(command.page) || command.page < 1) throw new OperationValidationError('page'); fields.page = String(command.page); }
      if (command.search) fields.search = text(command.search, 'search');
      if (['checkout.shipping', 'checkout.localShipping', 'checkout.insurance'].includes(command.kind) && !fields.address_id || ['checkout.localShipping', 'checkout.insurance'].includes(command.kind) && !fields.shipper_id) throw new OperationValidationError('shipping');
      const routes = { 'checkout.addresses': ['address', checkoutAddresses], 'checkout.shipping': ['shipping', checkoutCarriers], 'checkout.localShipping': ['local-shipping', checkoutLocal], 'checkout.insurance': ['insurance', checkoutInsurance], 'checkout.payments': ['payments', checkoutPayments] } as const;
      const [route, normalize] = routes[command.kind];
      plan = { path: query(`/api/order-create/${route}/`, fields), normalize }; break;
    }
    case 'packing.addresses': case 'packing.shipping': case 'packing.localShipping': case 'packing.insurance': {
      // GET steps iterate a PHP array directly; only the final PUT JSON-decodes boxes.
      const fields: OperationFields = { 'boxes[]': ids(command.boxes) };
      if (command.addressId) fields.address_id = operationId(command.addressId);
      if (command.shipperId) fields.shipper_id = operationId(command.shipperId);
      if (command.localDeliveryId) fields.local_delivery_id = operationId(command.localDeliveryId);
      if (command.page !== undefined) { if (!Number.isSafeInteger(command.page) || command.page < 1) throw new OperationValidationError('page'); fields.page = String(command.page); }
      if (command.search) fields.search = command.search;
      if (command.kind !== 'packing.addresses' && !fields.address_id || ['packing.localShipping', 'packing.insurance'].includes(command.kind) && !fields.shipper_id) throw new OperationValidationError('shipping');
      const route = { 'packing.addresses': 'address', 'packing.shipping': 'shipping', 'packing.localShipping': 'local-shipping', 'packing.insurance': 'insurance' }[command.kind];
      plan = { path: query(`/api/parcel-create/${route}/`, fields), normalize: raw => raw }; break;
    }
    default: {
      const paths = { 'profile.read': '/api/member/personal-data', 'recipient.formats': '/api/member-address/phone-formats?full-data=1', 'preferences.read': '/api/member/mail-options/', 'calculator.options': '/api/calculator', 'news.read': '/api/news', 'loyalty.read': '/api/shipping-loyalty/', 'payments.read': '/api/payments' };
      const path = paths[command.kind];
      if (!path) throw new OperationValidationError('kind');
      // Secondary-domain components apply their dedicated account-operations
      // normalizers; unknown response data is not presented as an empty account.
      plan = { path, normalize: raw => raw };
    }
  }
  return plan as ReadPlan<ReadResult<Q>>;
}

export type CheckoutInput = { carts: string[]; addressId: string; shipperId: string; localPickup?: { methodKey?: string; optionKey: string; optionId: string }; additionServices: string[]; waitAllItems: boolean; allowLowerQuantity: boolean; allowOverpricing: boolean; insurance: boolean; paymentType: string; reviewedPayments?: CheckoutPayments };
export type PackingInput = { boxes: string[]; addressId: string; shipperId: string; insurance: boolean; sentOnUserAlert: boolean; local_delivery?: string; terminal?: string; localStorage?: string; localAddressId?: string; additionServices?: string[] };
export type MutationCommand =
  | FinancialMutationCommand
  | OutgoingServiceMutationCommand
  | { kind: 'orders.payment.start'; input: OrderPaymentStartInput }
  | { kind: 'payments.legacy.start'; input: LegacyPaymentStartInput }
  | { kind: 'payments.start'; input: PaymentStartInput }
  | { kind: 'shipment.review.save'; id: string; input: ParcelReviewInput }
  | { kind: 'autoPacking.save'; input: AutoPackingSaveInput }
  | SettingsMutationCommand
  | { kind: 'waiting.passcode.save'; id: string; passcode: string }
  | { kind: 'shipment.localDelivery.save'; id: string; input: DeliverySelection }
  | { kind: 'waiting.create'; input: WaitingParcelInput }
  | { kind: 'waiting.edit'; id: string; input: WaitingParcelInput }
  | { kind: 'waiting.delete' | 'shipment.invoice.delete' | 'shipment.customs.delete' | 'recipient.delete'; id: string; fileId?: string }
  | { kind: 'stock.declaration.save'; id: string; input: StockDeclarationInput }
  | { kind: 'shipment.declaration.save'; id: string; input: OutgoingDeclarationInput }
  | { kind: 'shipment.invoice.upload'; id: string; file: LocalUploadFile }
  | { kind: 'shipment.customs.upload'; id: string; files: LocalUploadFile[] }
  | { kind: 'cart.create'; input: CartItemInput }
  | { kind: 'cart.edit'; id: string; input: CartItemInput }
  | { kind: 'cart.delete'; ids: string[] }
  | { kind: 'profile.save' | 'calculator.calculate'; input: OperationFields }
  | { kind: 'recipient.save'; id?: string; input: OperationFields; scans?: Partial<Record<RecipientScan, LocalUploadFile>> }
  | { kind: 'preferences.save'; input: NotificationOptionsInput }
  | { kind: 'stock.division.save'; id: string; data: StockDivision; assignments: Record<string, string>; comment: string }
  | { kind: 'stock.service.save'; id: string; photo?: BinaryFlag; verification?: BinaryFlag; declaration?: BinaryFlag; comment?: string }
  | { kind: 'stock.label.request'; id: string }
  | { kind: 'stock.service.cancel'; id: string; service: 'photos' | 'verification' | 'declaration' | 'division' | 'label' }
  | { kind: 'packing.create'; input: PackingInput }
  | { kind: 'order.create'; input: CheckoutInput };

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError('confirmarea operațiunii'); return value as Record<string, unknown>; }
function acknowledge(raw: unknown): { success: true } {
  const body = object(raw);
  if (![false, 0, '0'].includes(body.error as never) || body.code !== undefined && Number(body.code) !== 200 || body.message !== 'Ok' && body.status !== 'Ok') throw new ApiContractError('confirmarea operațiunii');
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data) && (body.data as Record<string, unknown>).success === false) throw new ApiContractError('confirmarea operațiunii');
  return { success: true };
}
function savedWaiting(raw: unknown): { id: string; uid: string | null } {
  acknowledge(raw); const data = object(object(raw).data);
  return { id: operationId(String(data.id)), uid: typeof data.uid === 'string' ? data.uid : null };
}
function allowedFields(input: OperationFields, allowed: string[], required: string[] = []): OperationFields {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new OperationValidationError('fields');
  for (const key of required) if (typeof input[key] !== 'string' || !(input[key] as string).trim()) throw new OperationValidationError(key);
  return { ...input };
}
function serializedPlan(path: string, body: SerializedOperation, invalidate: MutationPlan['invalidate'], normalize: NonNullable<MutationPlan['normalize']> = acknowledge): MutationPlan {
  return { path, method: 'POST', encoding: body.encoding, fields: body.fields, files: body.files.map(({ field, ...file }) => ({ field, file })), invalidate, responseMode: 'envelope', normalize };
}
export function planMutation(command: MutationCommand): MutationPlan {
  const ack = (path: string, method: MutationPlan['method'], fields: OperationFields, invalidate: MutationPlan['invalidate']): MutationPlan => ({ path, method, fields, encoding: 'form', responseMode: 'envelope', invalidate, normalize: acknowledge });
  switch (command.kind) {
    case 'refund.create': case 'refund.cancel': case 'order.cancel': return planFinancialMutation(command);
    case 'outgoing.service.set': return planOutgoingServiceMutation(command);
    case 'orders.payment.start': return planOrderPaymentStart(command.input);
    case 'payments.legacy.start': return planLegacyPaymentStart(command.input);
    case 'payments.start': return planPaymentStart(command.input);
    case 'shipment.review.save': return planParcelReviewSave(command.id, command.input);
    case 'autoPacking.save': return planAutoPackingSave(command.input);
    case 'password.change': return ack('/api/member/new-password', 'POST', passwordChangeFields(command.input), []);
    case 'settings.birthday.save': {
      if (!validBirthday(command.birthday)) throw new OperationValidationError('birthday');
      return ack('/api/member-settings', 'POST', { setting: 'birthday', birthday: command.birthday }, []);
    }
    case 'settings.language.save': return ack('/api/member-settings', 'POST', { setting: 'language', languageId: operationId(command.languageId, 'languageId') }, []);
    case 'settings.region.save': return ack('/api/member-settings', 'POST', { setting: 'region', countryId: operationId(command.countryId, 'countryId'), languageId: operationId(command.languageId, 'languageId') }, ['profile', 'waiting', 'warehouse', 'sent', 'received', 'addresses', 'recipients', 'balance']);
    case 'settings.billing.save': return ack('/api/member-settings', 'POST', { setting: 'billing', ...billingInputFields(command.input) }, []);
    case 'settings.identity.save': {
      if (typeof command.revision !== 'string' || !/^[a-f0-9]{64}$/.test(command.revision)) throw new OperationValidationError('revision');
      if (!Array.isArray(command.retainedIds) || new Set(command.retainedIds).size !== command.retainedIds.length || command.retainedIds.some(id => !/^scan[1-3]$/.test(id)) || !Array.isArray(command.files)) throw new OperationValidationError('files');
      return { ...ack('/api/member-settings', 'POST', { setting: 'identity', revision: command.revision, retainedIds: JSON.stringify(command.retainedIds) }, []), encoding: 'multipart', files: command.files.map(file => ({ field: 'documents[]', file })) };
    }
    case 'waiting.passcode.save': {
      // WaitingMfPasscodeController.php:56-59 uses PHP empty(): '' removes
      // the code, and '0' would also remove it instead of saving that value.
      if (typeof command.passcode !== 'string' || command.passcode === '0' || command.passcode !== '' && !command.passcode.trim() || /[\u0000-\u001f\u007f]/.test(command.passcode)) throw new OperationValidationError('passcode');
      return ack(`/api/waiting-mf-passcode/${operationId(command.id)}`, 'POST', { passcode: command.passcode }, ['waiting']);
    }
    case 'shipment.localDelivery.save': {
      const fields = allowedFields(command.input as OperationFields, ['local_delivery', 'localStorage', 'terminal', 'localAddressId'], ['local_delivery']);
      const options = ['localStorage', 'terminal', 'localAddressId'].filter(key => fields[key] !== undefined);
      if (options.length !== 1) throw new OperationValidationError('local_delivery');
      for (const key of Object.keys(fields)) fields[key] = operationId(fields[key], key);
      return ack(`/api/parcel-local-delivery/${operationId(command.id)}`, 'POST', fields, ['sent', 'received', 'balance']);
    }
    case 'waiting.create': return serializedPlan('/api/waiting-mf/', waitingParcelFields(command.input), ['waiting'], savedWaiting);
    case 'waiting.edit': return serializedPlan(`/api/waiting-mf/${operationId(command.id)}`, waitingParcelFields(command.input, { replaceDeclarations: true }), ['waiting'], savedWaiting);
    case 'waiting.delete': return ack(`/api/waiting-mf/${operationId(command.id)}`, 'DELETE', {}, ['waiting']);
    case 'stock.declaration.save': return serializedPlan(`/api/mf-storage-declaration/${operationId(command.id)}`, stockDeclarationFields(command.input), ['warehouse'], raw => { acknowledge(raw); if (object(object(raw).data).success !== true) throw new ApiContractError('declarația coletului'); return { success: true }; });
    case 'shipment.declaration.save': return serializedPlan(`/api/package-declaration/${operationId(command.id)}/`, outgoingDeclarationFields(command.input), ['sent', 'received']);
    case 'shipment.invoice.upload': return serializedPlan(`/api/package-invoice/${operationId(command.id)}`, { fields: {}, files: [{ field: 'file', ...validateUpload(command.file) }], encoding: 'multipart' }, ['sent', 'received']);
    case 'shipment.invoice.delete': return ack(`/api/package-invoice/${operationId(command.id)}/${operationId(command.fileId, 'fileId')}`, 'DELETE', {}, ['sent', 'received']);
    case 'shipment.customs.upload': {
      if (!Array.isArray(command.files) || command.files.length === 0) throw new OperationValidationError('files');
      return serializedPlan(`/api/customs-photos/${operationId(command.id)}`, { fields: {}, files: command.files.map(file => ({ field: 'customsPhotos[]', ...validateUpload(file, 'customsPhoto') })), encoding: 'multipart' }, ['sent', 'received']);
    }
    case 'shipment.customs.delete': return ack(`/api/customs-photos-delete/${operationId(command.id)}/${operationId(command.fileId, 'fileId')}`, 'DELETE', {}, ['sent', 'received']);
    case 'cart.create': case 'cart.edit': return {
      ...ack(command.kind === 'cart.create' ? '/api/cart' : `/api/cart/${operationId(command.id)}`, 'POST', cartItemFields(command.input), []),
      encoding: 'json',
      normalize: raw => {
        acknowledge(raw);
        const saved = normalizeCartSavedData(object(raw).data);
        if (command.kind === 'cart.edit' && (saved.id !== command.id || saved.storageId !== command.input.storage_id)) {
          throw new ApiContractError('confirmarea produsului din coș');
        }
        return saved;
      },
    };
    case 'cart.delete': return ack(query('/api/cart', { 'items[]': ids(command.ids) }), 'DELETE', {}, []);
    case 'recipient.delete': return ack(`/api/member-address/${operationId(command.id)}/`, 'DELETE', {}, ['recipients']);
    case 'recipient.save': {
      const fields = allowedFields(command.input, [...recipientFields, 'agree']);
      for (const name of ['scan1', 'scan2'] as const) {
        if (fields[name] !== undefined) { const retained = recipientScanPath(String(fields[name])); if (retained === null) throw new OperationValidationError(name); fields[name] = retained; }
      }
      const files = Object.entries(command.scans || {}).map(([field, candidate]) => {
        if (field !== 'scan1' && field !== 'scan2') throw new OperationValidationError('scans');
        const file = validateUpload(candidate);
        if (file.size === undefined || file.size > recipientMaxScanBytes) throw new OperationValidationError('size');
        const extension = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType === 'image/png' ? 'png' : 'jpg';
        return { field, ...file, name: `identity-${field}.${extension}` };
      });
      return serializedPlan(`/api/member-address/${command.id ? `${operationId(command.id)}/` : ''}`, { fields, files, encoding: files.length ? 'multipart' : 'form' }, ['recipients']);
    }
    case 'profile.save': {
      const fields = allowedFields(command.input, ['phone_code', 'phone', 'country_id']);
      if (!Object.keys(fields).length) throw new OperationValidationError('profile');
      return ack('/api/member/personal-data', 'POST', fields, ['profile']);
    }
    case 'preferences.save': return ack('/api/member/mail-options/', 'POST', notificationOptionFields(command.input), []);
    case 'stock.division.save': return ack('/api/request-divide', 'POST', { id: operationId(command.id), ...divisionFields(command.data, command.assignments, command.comment) }, ['warehouse', 'balance']);
    case 'stock.service.save': {
      const fields: OperationFields = { id: operationId(command.id) };
      for (const key of ['photo', 'verification', 'declaration'] as const) if (command[key] !== undefined) { if (command[key] !== 0 && command[key] !== 1) throw new OperationValidationError(key); fields[key] = String(command[key]); }
      if (['photo', 'verification', 'declaration'].filter(key => key in fields).length !== 1) throw new OperationValidationError('service');
      if (command.comment) fields.comment = text(command.comment, 'comment');
      return ack('/api/storage/', 'POST', fields, ['warehouse', 'balance']);
    }
    case 'stock.label.request': return ack('/api/label-request/', 'POST', { id: operationId(command.id), enable: '1' }, ['warehouse', 'balance']);
    case 'stock.service.cancel': {
      const id = operationId(command.id);
      if (command.service === 'division') return ack(query('/api/request-divide', { id }), 'DELETE', {}, ['warehouse', 'balance']);
      if (command.service === 'label') return ack('/api/label-request/', 'POST', { id, enable: '0' }, ['warehouse', 'balance']);
      const field = command.service === 'photos' ? 'photo' : command.service;
      if (!['photo', 'verification', 'declaration'].includes(field)) throw new OperationValidationError('service');
      return ack('/api/storage/', 'POST', { id, [field]: '0' }, ['warehouse', 'balance']);
    }
    case 'calculator.calculate': return { ...ack('/api/calculator', 'POST', allowedFields(command.input, ['storage_id', 'country_id', 'weightUnit', 'weight', 'price', 'sizeUnit', 'volume[x]', 'volume[y]', 'volume[z]'], ['storage_id', 'country_id', 'weight']), []), normalize: raw => { acknowledge(raw); return object(raw).data; } };
    case 'order.create': {
      const input = command.input;
      const flags = ['waitAllItems', 'allowLowerQuantity', 'allowOverpricing', 'insurance'] as const;
      if (flags.some(key => typeof input[key] !== 'boolean') || !/^[a-zA-Z0-9_-]+$/.test(input.paymentType)) throw new OperationValidationError('checkout');
      const fields: MutationPlan['fields'] = { carts: ids(input.carts), useAutoPacking: '1', addressId: operationId(input.addressId), shipperId: operationId(input.shipperId), additionServices: input.additionServices.map(value => { if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new OperationValidationError('additionServices'); return value; }), paymentType: input.paymentType };
      for (const key of flags) fields[key] = input[key] ? 1 : 0;
      if (input.localPickup) {
        const { optionKey, optionId } = input.localPickup;
        const storageKey = /^localStorage-([a-zA-Z0-9_-]+)$/.exec(optionKey)?.[1];
        const methodKey = input.localPickup.methodKey || storageKey;
        if (!methodKey || !/^[a-zA-Z0-9_-]+$/.test(methodKey) || (storageKey ? storageKey !== methodKey : optionKey !== 'terminal' && optionKey !== 'localAddressId')) throw new OperationValidationError('local_delivery');
        fields.local_delivery = methodKey; fields[optionKey] = operationId(optionId);
      }
      return { path: '/api/order-create/', method: 'POST', encoding: 'json', fields, responseMode: 'envelope', invalidate: ['balance'], normalize: raw=>{ const order=checkoutCreated(raw); if (order.type!==input.paymentType || order.type==='terminals' && order.orders.some(item=>!item.terminalCode)) throw new ApiContractError('confirmarea plății comenzii'); return order; } };
    }
    case 'packing.create': {
      const input = command.input;
      if (typeof input.insurance !== 'boolean' || typeof input.sentOnUserAlert !== 'boolean') throw new OperationValidationError('packing');
      const fields: OperationFields = { boxes: JSON.stringify(ids(input.boxes).map(Number)), addressId: operationId(input.addressId), shipperId: operationId(input.shipperId), insurance: input.insurance ? '1' : '0', sentOnUserAlert: input.sentOnUserAlert ? '1' : '0' };
      for (const key of ['local_delivery', 'terminal', 'localStorage', 'localAddressId'] as const) if (input[key]) fields[key] = text(input[key], key);
      if (input.additionServices) fields['additionServices[]'] = input.additionServices.map(value => text(value, 'additionServices'));
      return { ...ack('/api/parcel-create', 'PUT', fields, ['warehouse', 'sent', 'balance']), normalize: raw => { acknowledge(raw); const data = object(raw).data; if (!Array.isArray(data) || data.length === 0) throw new ApiContractError('expedierea creată'); return data.map(value => { const item = object(value); return { id: operationId(String(item.id)), codeNumber: text(item.codeNumber, 'codeNumber') }; }); } };
    }
    default: throw new OperationValidationError('kind');
  }
}
