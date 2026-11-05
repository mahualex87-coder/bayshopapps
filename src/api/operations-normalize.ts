import type { LiveParcelDetail, LiveParcelDimensions, LiveWarehouse } from './contracts';
import { ApiContractError, normalizeShipmentDetailData, normalizeLocalDeliveryData, normalizeParcelDimensions } from './normalize.ts';

type Row = Record<string, unknown>;
const resource = 'operațiunile contului';
function row(value: unknown): Row { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError(resource); return value as Row; }
function list(value: unknown): unknown[] { if (!Array.isArray(value)) throw new ApiContractError(resource); return value; }
function text(value: unknown): string | null { if (value == null || value === '') return null; if (typeof value !== 'string') throw new ApiContractError(resource); return value; }
function requiredText(value: unknown): string { const result = text(value); if (result === null) throw new ApiContractError(resource); return result; }
function id(value: unknown): string { if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value); const result = requiredText(value); if (!/^\d+$/.test(result)) throw new ApiContractError(resource); return result; }
function number(value: unknown): number | null { if (value == null || value === '') return null; if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) throw new ApiContractError(resource); const result = Number(value); if (!Number.isFinite(result)) throw new ApiContractError(resource); return result; }
function decimal(value: unknown): string { const parsed = number(value); if (parsed === null || parsed < 0) throw new ApiContractError(resource); return typeof value === 'string' ? value : String(value); }
function flag(value: unknown): boolean | null { if (value == null) return null; if ([false, 0, '0'].includes(value as never)) return false; if ([true, 1, '1'].includes(value as never)) return true; throw new ApiContractError(resource); }
/** OpenAPI mf-list detail: 0 not requested, 1 waiting, 2 completed. */
function photoRequestState(value: unknown): 0 | 1 | 2 | null {
  if (value == null) return null;
  if (value === 0 || value === 1 || value === 2) return value;
  throw new ApiContractError('starea fotografierii coletului');
}
function optionalList(value: unknown): unknown[] { return value == null ? [] : list(value); }
function unique<T extends { id: string }>(values: T[]): T[] { if (new Set(values.map(value => value.id)).size !== values.length) throw new ApiContractError(resource); return values; }

export type DeclarationItem = { id: string | null; title: string; url: string | null; quantity: number; price: string; currency?: string | null; currencyId?: string | null; productType?: string | null; orderNumber?: string | null; warehousePrice?: string; originalPrice?: string | null; priceBasis?: 'original' | 'warehouse' };
export type Attachment = { id: string | null; url: string; thumbnail: string | null };
export type DeclarationDocument = { title: string | null; currencyCode: string | null; currencyId: string | null; availableCurrencies: Record<string, string>; items: DeclarationItem[]; invoices: Attachment[]; customsDocuments: Attachment[]; amountsVerified?: boolean; warehouseCurrencyId?: string | null };
export type UploadCollection = { maxFiles: number | null; files: Attachment[] };
export type WaitingDetail = DeclarationDocument & {
  id: string; uid: string | null; storage: string | null; tracking: string | null; createdAt: string | null; currency: string | null; amount: number | null;
  serviceName: string | null; trackingStatus: string | null; dimensions: { weight?: number; x: number; y: number; z: number } | null;
  photosPackageRequestedComments?: string | null; verificationPackageRequestedComments?: string | null;
  localDelivery?: LiveParcelDetail['localDelivery']; autoPacking?: { enabled: boolean | null; insurance: boolean | null } | null;
  photosPackageRequested: boolean | null; verificationPackageRequested: boolean | null; autoPackingData: Record<string, unknown> | null; passcodeAllowed: boolean | null; passcode: string | null;
};
export type StockDetail = {
  id: string; uid: string | null; storage: string | null; countryCode: string | null; title: string | null; tracking: string | null; additionalTracking: string | null; createdAt: string | null;
  weightKg: number | null; volumeWeight: number | null; amount: number | null; currency: string | null; declared: boolean | null; freeDaysStorage: string | number | null;
  status: string | null; photos: Attachment[]; invoices: Attachment[]; heldByDamage: boolean | null; damageComment: string | null; heldByProhibition: boolean | null; prohibitionComment: string | null;
  packingDenied: boolean | null; allowedDivideRequest: boolean | null; divideRequestStatus: string | null;
  declarationRequestStatus?: string | null; declarationItemCount?: number | null; verificationRequestStatus?: string | null; declarationSupported?: boolean | null; dimensionsCm?: LiveParcelDimensions | null;
  additionalPhotosRequested: boolean | null; checkProductInProgress: boolean | null; photosInProgress: 0 | 1 | 2 | null; labelRequestStatus: string | null;
};
export type ShipmentOperationDetail = LiveParcelDetail & {
  isPaid: boolean | null;
  permissions: { disband: boolean | null; changeLocalDelivery: boolean | null; uploadCustomsDocuments: boolean | null; hold: boolean | null };
  documents: { kind: 'awb' | 'commercialInvoice' | 'deliveryInvoice' | 'orderInvoice' | 'taxesInvoice'; url: string }[];
  trackingUrl: string | null;
  boxes: {
    id: string; uid: string | null; title: string | null; tracking: string | null; additionalTracking: string | null;
    quantity: number | null; weightKg: number | null;
    heldByDamage: boolean | null; damageComment: string | null; damageHeldAt: string | null;
    heldByProhibition: boolean | null; prohibitionComment: string | null; prohibitionHeldAt: string | null;
    photos: Attachment[]; declarationItems: { title: string; url: string | null; quantity: number | null; price: string | null; currency: string | null }[];
  }[];
};

function declarationItem(value: unknown, stock = false, preserveOriginalPrice = false): DeclarationItem {
  const item = row(value); const quantity = number(item.quantity);
  if (quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0) throw new ApiContractError(resource);
  const itemId = stock ? item.declarationItemId ?? item.id : item.id;
  const warehousePrice = decimal(item.price);
  // WaitingMfListController and Rows_WpOrderStorage store `price` converted
  // into the warehouse currency. `currencyPrice` is the original row value.
  const originalPrice = preserveOriginalPrice && item.currencyPrice != null && item.currencyPrice !== '' ? decimal(item.currencyPrice) : null;
  return { id: itemId == null ? null : id(itemId), title: requiredText(item.title), url: text(item.url), quantity, price: originalPrice ?? warehousePrice, currency: text(item.currency), currencyId: item.currencyId == null ? null : id(item.currencyId), productType: text(item.productType), orderNumber: text(item.orderNumber), ...(preserveOriginalPrice ? { warehousePrice, originalPrice, priceBasis: originalPrice === null ? 'warehouse' as const : 'original' as const } : {}) };
}
function assetUrl(value: unknown): string | null { const result = text(value); return result && /^\/(?!\/)/.test(result) ? `https://bayshop.com${result}` : result; }
function attachment(value: unknown): Attachment {
  if (typeof value === 'string') return { id: null, url: assetUrl(requiredText(value))!, thumbnail: null };
  const item = row(value); const itemId = item.id ?? item.imageId;
  return { id: itemId == null ? null : id(itemId), url: assetUrl(requiredText(item.url ?? item.img ?? item.original))!, thumbnail: assetUrl(item.thumb ?? item.thumbnail) };
}
function attachments(value: unknown): Attachment[] { return optionalList(value).map(attachment); }
function currencyChoices(value: unknown): Record<string, string> {
  if (value == null) return {};
  return Object.fromEntries(Object.entries(row(value)).map(([key, value]) => [id(key), requiredText(value)]));
}
export function normalizeWaitingDetail(data: unknown): WaitingDetail {
  const item = row(data); const dimensions = item.dimensions == null ? null : row(item.dimensions);
  const autoPackingData = item.autoPackingData == null ? null : row(item.autoPackingData);
  let normalizedDimensions: WaitingDetail['dimensions'] = null;
  if (dimensions) {
    const x = number(dimensions.x), y = number(dimensions.y), z = number(dimensions.z), weight = number(dimensions.weight);
    if (x === null || y === null || z === null || x < 0 || y < 0 || z < 0 || weight !== null && weight < 0) throw new ApiContractError(resource);
    normalizedDimensions = { x, y, z, ...(weight !== null ? { weight } : {}) };
  }
  return {
    id: id(item.id), uid: text(item.uid), storage: text(item.storage), tracking: text(item.trackingNumber), createdAt: text(item.createdDate), title: text(item.title), currency: text(item.currency), amount: number(item.price),
    currencyCode: null, currencyId: null, availableCurrencies: {}, items: list(item.declarations).map(value => declarationItem(value, false, true)), invoices: attachments(item.invoices), customsDocuments: attachments(item.customsDocs),
    serviceName: text(item.service_name), trackingStatus: text(item.tracking_status), dimensions: normalizedDimensions,
    photosPackageRequestedComments: text(item.photosPackageRequestedComments), verificationPackageRequestedComments: text(item.verificationPackageRequestedComments),
    localDelivery: normalizeLocalDeliveryData(item.local_delivery), autoPacking: autoPackingData ? { enabled: flag(autoPackingData.autoPacking), insurance: flag(autoPackingData.autoInsurance) } : null,
    photosPackageRequested: flag(item.photosPackageRequested), verificationPackageRequested: flag(item.verificationPackageRequested), autoPackingData, passcodeAllowed: flag(item.passcodeAllowed), passcode: text(item.passcode),
  };
}
export function normalizeStockDeclaration(data: unknown): DeclarationDocument {
  const item = row(data);
  return { title: text(item.title), currencyCode: text(item.currency), currencyId: null, availableCurrencies: {}, items: list(item.declarationItems).map(value => declarationItem(value, true, true)), invoices: attachments(item.invoiceFiles), customsDocuments: attachments(item.customsFiles) };
}
export function normalizeOutgoingDeclaration(data: unknown): DeclarationDocument {
  const item = row(data);
  const availableCurrencies = currencyChoices(item.availableStorageCurrencies);
  const warehouseCurrencyId = item.warehouseCurrencyId == null ? null : id(item.warehouseCurrencyId);
  const explicitContract = item.priceSemantics === 'line-total';
  const items = list(item.items).map(value => {
    const product = declarationItem(value, false, explicitContract);
    // The additive contract explicitly identifies original and warehouse
    // monetary bases. Without an original value, edit the warehouse value
    // in its documented currency; never convert it locally.
    const amountCurrencyId = explicitContract ? product.originalPrice !== null ? product.currencyId : warehouseCurrencyId : null;
    const code = amountCurrencyId ? availableCurrencies[amountCurrencyId] : null;
    return { ...product, currencyId: amountCurrencyId, currency: code && /^[a-z]{3}$/i.test(code) ? code.toLowerCase() : null };
  });
  // PackageDeclarationController GET returns converted `price`, but chooses
  // declarationCurrency from the first row's original currency. No warehouse
  // currency or original row values are returned: existing edits are unsafe.
  return { title: null, currencyCode: null, currencyId: item.declarationCurrency == null ? null : id(item.declarationCurrency), availableCurrencies, items, invoices: [], customsDocuments: [], warehouseCurrencyId, amountsVerified: items.length === 0 || explicitContract && items.every(product => product.currency !== null) };
}
/** These two endpoints put collections at the envelope root, not response.data. */
export function normalizeUploadCollection(envelope: unknown, kind: 'invoice' | 'customs'): UploadCollection {
  const item = row(envelope); const maxFiles = number(item.maxImages);
  if (flag(item.error) === true || (number(item.code) ?? 200) >= 400) throw new ApiContractError(resource);
  if (maxFiles !== null && (!Number.isSafeInteger(maxFiles) || maxFiles < 0)) throw new ApiContractError(resource);
  return { maxFiles, files: list(kind === 'invoice' ? item.invoiceFiles : item.images).map(attachment) };
}
export function normalizeStockDetail(data: unknown): StockDetail {
  const item = row(data); const freeDays = item.freeDaysStorage;
  const weightKg = number(item.weight), volumeWeight = number(item.volume_weight);
  if (weightKg !== null && weightKg < 0 || volumeWeight !== null && volumeWeight < 0) throw new ApiContractError(resource);
  if (freeDays != null && typeof freeDays !== 'string' && typeof freeDays !== 'number') throw new ApiContractError(resource);
  return {
    id: id(item.id), uid: text(item.uid), storage: text(item.storage), countryCode: text(item.countryCode), title: text(item.title), tracking: text(item.trackingNumber), additionalTracking: text(item.additionalTracking), createdAt: text(item.createdDate),
    // This detail endpoint uses kilograms; the stock-list endpoint uses grams.
    weightKg, volumeWeight, amount: number(item.price), currency: text(item.currency), declared: flag(item.declarationFilled), freeDaysStorage: freeDays == null ? null : freeDays,
    status: text(item.status), photos: attachments(item.photos), invoices: attachments(item.invoices), heldByDamage: flag(item.isHeldByDamage), damageComment: text(item.heldByDamageComment), heldByProhibition: flag(item.isHeldByProhibition), prohibitionComment: text(item.heldByProhibitionComment),
    packingDenied: flag(item.packingDenied), allowedDivideRequest: flag(item.allowedDivideRequest), divideRequestStatus: text(item.divideRequestStatus),
    declarationRequestStatus: text(item.declarationRequestStatus), declarationItemCount: number(item.declarationItemCount), verificationRequestStatus: text(item.verificationRequestStatus), declarationSupported: flag(item.declarationSupported), dimensionsCm: normalizeParcelDimensions(item),
    additionalPhotosRequested: flag(item.additionalPhotosRequested), checkProductInProgress: flag(item.checkProductInProgress), photosInProgress: photoRequestState(item.photosInProgress), labelRequestStatus: text(item.labelRequestStatus),
  };
}
export function normalizeShipmentOperationDetail(data: unknown): ShipmentOperationDetail {
  const item = row(data);
  const documents = (['awb', 'commercialInvoice', 'deliveryInvoice', 'orderInvoice', 'taxesInvoice'] as const).flatMap(kind => { const url = assetUrl(item[kind]); return url ? [{ kind, url }] : []; });
  const boxes = optionalList(item.boxes).map(value => {
    const box = row(value);
    const quantity = number(box.quantity), weight = number(box.weight);
    if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 0) || weight !== null && weight < 0) throw new ApiContractError(resource);
    return {
      // ParcelsController.getBoxesArray returns raw Rows_WpOrderStorage.weight.
      // MfListController:229 converts this same field via grToKg: stored grams.
      id: id(box.id), uid: text(box.uid), title: text(box.title), tracking: text(box.tracking), additionalTracking: text(box.additionalTracking), quantity, weightKg: weight === null ? null : weight / 1000,
      heldByDamage: flag(box.isHeldByDamage), damageComment: text(box.heldByDamageComment), damageHeldAt: text(box.heldByDamageTime),
      heldByProhibition: flag(box.isHeldByProhibition), prohibitionComment: text(box.heldByProhibitionComment), prohibitionHeldAt: text(box.heldByProhibitionTime),
      photos: attachments(box.photos),
      // Embedded declarations do not document a currency. Preserve an explicit
      // item value if supplied; never infer it from shipment/warehouse signs.
      declarationItems: optionalList(box.declarationItems).map(value => { const product = row(value); return { title: requiredText(product.title), url: text(product.url), quantity: number(product.quantity), price: product.price == null ? null : decimal(product.price), currency: text(product.currency) }; }),
    };
  });
  return { ...normalizeShipmentDetailData(data), isPaid: flag(item.isPaid), permissions: { disband: flag(item.isAllowedDisbandByUser), changeLocalDelivery: flag(item.isAllowedLocalDeliveryChange), uploadCustomsDocuments: flag(item.enableCustomsDocUpload), hold: flag(item.isAllowedHoldParcel) }, documents, trackingUrl: text(item.trackingUrl), boxes };
}

export type StockServiceMetadata = { title: string | null; description: string | null };
export type StockServicePrices = { currency: string | null; photos: number | null; verification: number | null; declaration: number | null; details: Partial<Record<'photos' | 'verification' | 'declaration' | 'division', StockServiceMetadata>> };
export function normalizeStockServicePrices(data: unknown): StockServicePrices {
  const item = row(data);
  const details: StockServicePrices['details'] = {};
  // Earlier servers encoded an empty PHP map as []; named service entries are an object.
  const rawDetails = item.serviceDetails;
  const metadata = rawDetails == null || (Array.isArray(rawDetails) && rawDetails.length === 0) ? {} : row(rawDetails);
  for (const [kind, key] of Object.entries({ photos: 'order_photo', verification: 'order_verification', declaration: 'order_declaration', division: 'order_divide' })) {
    if (metadata[key] == null) continue;
    const service = row(metadata[key]);
    details[kind as keyof typeof details] = { title: text(service.title), description: text(service.description) };
  }
  const prices = { photos: number(item.order_photo), verification: number(item.order_verification), declaration: number(item.order_declaration) };
  if (Object.values(prices).some(price => price !== null && price < 0)) throw new ApiContractError('tarifele serviciilor');
  return { currency: text(item.currency), ...prices, details };
}

export type CartItem = { id: string; uid: string | null; title: string; price: number; quantity: number; shipping: number | null; color: string | null; size: string | null; comment: string | null; url: string | null; createdAt: string | null; currency: string | null; shopTitle: string | null; shopId: string | null; storageId?: string | null; status?: string | null; storageTitle: string | null; isComplex: boolean | null };
export type CartPrices = { currency: string | null; shopId: string | null; isComplex: boolean | null; lines: { key: string; amount: number }[] };
export type OrderItem = { id: string; uid: string | null; title: string; url: string | null; quantity: number | null; price: number | null; color: string | null; size: string | null; statusLabel: string | null };
export type OrderSummary = { id: string; uid: string | null; status: string; statusLabel: string | null; canPay: boolean | null; createdAt: string | null; currency: string | null; items: OrderItem[]; prices: { title: string; amount: number | null; currency: string | null }[] };
export function normalizeCartItem(data: unknown, group: Row = {}): CartItem {
  const item = row(data); const price = number(item.price), quantity = number(item.quantity);
  if (price === null || price < 0 || quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0) throw new ApiContractError(resource);
  return { id: id(item.id), uid: text(item.uniqueId), title: requiredText(item.title), price, quantity, shipping: number(item.localShipping), color: text(item.color), size: text(item.size), comment: text(item.comment), url: text(item.customUrl), createdAt: text(item.created), currency: text(item.currency) ?? text(item.currency_sign), shopTitle: text(item.shopTitle) ?? text(group.shopTitle), shopId: item.shopId || group.shopId ? id(item.shopId || group.shopId) : null, storageId: item.storageId || group.storageId ? id(item.storageId || group.storageId) : null, status: text(item.status), storageTitle: text(item.storageTitle), isComplex: flag(item.isComplex ?? group.isComplex) };
}
export function normalizeCartList(data: unknown): CartItem[] {
  return unique(list(data).flatMap(value => { const group = row(value); return list(group.list).map(item => normalizeCartItem(item, group)); }));
}
export function normalizeCartPrices(data: unknown): CartPrices {
  const item = row(data), prices = row(item.prices);
  const lines = ['itemsPrice', 'localDelivery', 'serviceCommission', 'countCommission', 'totalToPay'].flatMap(key => { const amount = number(prices[key]); return amount === null ? [] : [{ key, amount }]; });
  if (!lines.some(item => item.key === 'totalToPay')) throw new ApiContractError(resource);
  return { currency: text(item.currency_sign), shopId: item.shopId == null ? null : id(item.shopId), isComplex: flag(item.isComplex), lines };
}
export function normalizeOrdersList(data: unknown): OrderSummary[] {
  const groups = row(data);
  if (Object.keys(groups).some(key => key !== 'paid' && key !== 'unpaid') || !('paid' in groups) || !('unpaid' in groups)) throw new ApiContractError(resource);
  return unique(['unpaid', 'paid'].flatMap(status => list(groups[status]).map(value => {
    const item = row(value); const progress = item.progressData == null ? null : row(item.progressData);
    return { id: id(item.id), uid: text(item.uid), status: text(item.paymentStatus) ?? status, statusLabel: progress ? text(progress.label) : null, canPay: flag(item.canBePayed), createdAt: text(item.created), currency: text(item.currency_sign),
      items: list(item.items).map(value => { const product = row(value); const progress = product.progressData == null ? null : row(product.progressData); return { id: id(product.id), uid: text(product.uniqueId), title: requiredText(product.title), url: text(product.customUrl), quantity: number(product.quantity), price: number(product.price), color: text(product.color), size: text(product.size), statusLabel: progress ? text(progress.label) : null }; }),
      prices: list(item.priceDetails).map(value => { const price = row(value); return { title: requiredText(price.title), amount: number(price.price), currency: text(price.currency_sign) }; }),
    };
  })));
}

export type OrderDetail = { id: string; uid: string | null; paymentStatus: string | null; processingStatus: string | null; cancelReason: string | null; createdAt: string | null; paidAt: string | null; currency: string | null; countryTitle: string | null; invoiceUrl: string | null; prices: { key: string; amount: number }[]; items: (OrderItem & { tracking: string | null; paymentStatus: string | null; processingStatus: string | null; cancelReason: string | null; shipping: number | null })[] };
/** The official order-detail example is an array even for one order. */
export function normalizeOrderDetail(data: unknown): OrderDetail[] {
  return unique(list(data).map(value => {
    const item = row(value);
    return { id: id(item.id), uid: text(item.uid), paymentStatus: text(item.paymentStatus), processingStatus: text(item.processingStatus), cancelReason: text(item.cancelReason), createdAt: text(item.created), paidAt: text(item.payed), currency: text(item.currency) ?? text(item.currency_sign), countryTitle: text(item.countryTitle), invoiceUrl: text(item.invoice),
      prices: ['realPrice', 'localShipping', 'commission', 'totalPrice'].flatMap(key => { const amount = number(item[key]); return amount === null ? [] : [{ key, amount }]; }),
      items: list(item.items).map(value => { const product = row(value); return { id: id(product.orderItemId ?? product.id), uid: text(product.uniqueId), title: requiredText(product.title), url: text(product.customUrl), quantity: number(product.quantity), price: number(product.price), color: text(product.color), size: text(product.size), statusLabel: null, tracking: text(product.tracking), paymentStatus: text(product.orderItemPaymentStatus), processingStatus: text(product.orderItemProcessingStatus), cancelReason: text(product.orderItemCancelReason), shipping: number(product.localShipping) }; }),
    };
  }));
}

/** Link read-only warehouse metadata using explicit IDs, documented waiting
 * aliases or the exact source title. Ambiguous country matches stay unknown. */
export function warehouseForStorage(warehouses: LiveWarehouse[] | null, storage: string | null | undefined, storageId?: string | null): LiveWarehouse | undefined {
  const byId = storageId ? warehouses?.find(item => item.id === storageId) : undefined;
  if (byId) return byId;
  if (!storage) return undefined;
  const value = storage.toLowerCase();
  const aliases: Record<string, string> = { usa: 'US', uk: 'GB', de: 'DE', ro: 'RO' };
  const code = aliases[value] || storage.toUpperCase();
  const matches = warehouses?.filter(item => item.id === storage || item.code === code || item.sourceTitle?.toLowerCase() === value) || [];
  return matches.length === 1 ? matches[0] : undefined;
}
export function warehouseCurrencyCode(warehouse: Pick<LiveWarehouse, 'availableCurrencies'> | undefined, currencyId: string | null | undefined): string | null {
  const title = warehouse?.availableCurrencies?.find(item => item.id === currencyId)?.title;
  return title && /^[a-z]{3}$/i.test(title) ? title.toLowerCase() : null;
}
