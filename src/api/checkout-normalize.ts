import type { CartItem } from './operations-normalize.ts';
import type { PaymentBilling } from './payments-catalog.ts';
import { ApiContractError } from './normalize.ts';
import { packingAddresses, packingInsurance, packingLocal, packingText, type PackingLocal, type PackingAddress } from './packing-normalize.ts';
import { normalizeCarrierLogo } from './carrier-assets.ts';

type Row = Record<string, unknown>;
const row = (raw: unknown): Row => { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiContractError('pregătirea comenzii'); return raw as Row; };
const text = (raw: unknown): string | null => typeof raw === 'string' && raw.trim() ? raw : null;
const required = (raw: unknown): string => { const value = text(raw); if (!value) throw new ApiContractError('opțiunea comenzii'); return value; };
const number = (raw: unknown): number => { if (typeof raw !== 'number' && (typeof raw !== 'string' || !/^\d+(?:\.\d+)?$/.test(raw))) throw new ApiContractError('costul comenzii'); const value = Number(raw); if (!Number.isFinite(value) || value < 0) throw new ApiContractError('costul comenzii'); return value; };
const boolean = (raw: unknown): boolean => { if ([true, 1, '1'].includes(raw as never)) return true; if ([false, 0, '0'].includes(raw as never)) return false; throw new ApiContractError('disponibilitatea opțiunii'); };
const id = (raw: unknown): string => { const value = String(raw); if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ApiContractError('identificatorul opțiunii'); return value; };
const array = (raw: unknown): unknown[] => { if (!Array.isArray(raw)) throw new ApiContractError('opțiunile comenzii'); return raw; };

// The address, local-delivery and insurance documents have the same response
// shapes as parcel creation. Their request routes and write fields differ.
export const checkoutAddresses = packingAddresses;
export type CheckoutLocal = PackingLocal & { methodKey: string | null; methodType: string | null };
export type CheckoutLocalSelection = { methodKey: string; optionKey: string; optionId: string };
export function checkoutLocal(raw: unknown): CheckoutLocal[] {
  const originals = array(row(raw).items).map(row);
  return packingLocal(raw).map((item, index) => {
    const source = originals[index];
    const methodKey = source.key == null ? null : required(source.key);
    const methodType = source.type == null ? null : required(source.type);
    if (methodKey !== null && !/^[a-zA-Z0-9_-]+$/.test(methodKey)) throw new ApiContractError('metoda livrării locale');
    return { ...item, methodKey, methodType };
  });
}
/** Checkout uses a method KEY; parcel packing uses an ID. Never substitute one. */
export function checkoutLocalMethodKey(local: CheckoutLocal): string | null {
  const storageKey = /^localStorage-([a-zA-Z0-9_-]+)$/.exec(local.optionsKey)?.[1];
  if (storageKey) return (!local.methodKey || local.methodKey === storageKey) && (!local.methodType || local.methodType === 'storage') ? storageKey : null;
  if (!local.methodKey) return null;
  if (local.optionsKey === 'terminal' && local.methodType === 'terminal') return local.methodKey;
  if (local.optionsKey === 'localAddressId' && local.methodType === 'courier') return local.methodKey;
  return null;
}
export function checkoutLocalSelection(local: CheckoutLocal, optionId: string, address: PackingAddress | null): CheckoutLocalSelection | null {
  const methodKey = checkoutLocalMethodKey(local);
  if (!methodKey) return null;
  if (local.optionsKey === 'localAddressId') return address?.completed ? { methodKey, optionKey: 'localAddressId', optionId: address.id } : null;
  return local.options.some(option => option.id === optionId) ? { methodKey, optionKey: local.optionsKey, optionId } : null;
}
export function checkoutInsurance(raw: unknown): ReturnType<typeof packingInsurance> & { freeLimit: number | null } { const data = row(raw); return { ...packingInsurance(raw), freeLimit: data.insurance_free_limit == null ? null : number(data.insurance_free_limit) }; }
export type CheckoutCarrier = { id: string; title: string; logoUrl?: string | null; description: string | null; time: string | null; selfSend: boolean; localDelivery: boolean; insurance: boolean; consolidation: boolean; forceWaitAllItems?: boolean };
export function checkoutCarriers(raw: unknown): CheckoutCarrier[] {
  return array(row(raw).items).map(raw => { const item = row(raw); return { id: id(item.id), title: required(item.title), ...(item.flag === undefined ? {} : { logoUrl: normalizeCarrierLogo(item.flag) }), ...(item.forceWaitAllItems === undefined ? {} : { forceWaitAllItems: boolean(item.forceWaitAllItems) }), description: packingText(item.description), time: text(item.time), selfSend: boolean(item.self_send), localDelivery: boolean(item.local_delivery), insurance: boolean(item.insurance), consolidation: boolean(item.consolidation) }; });
}
export type CheckoutPayment = { key: string; title: string; description: string | null; availableCurrencies: string[] | null; hideBilling: boolean; percent: number; maxAmount: number; totalToPay: number; commission: number; fullOrderPrice: number };
export type CheckoutPayments = { currency: string; lines: { key: string; amount: number }[]; methods: CheckoutPayment[]; orderAcknowledgementVersion?: 1 };
export function checkoutPayments(raw: unknown): CheckoutPayments {
  const data = row(raw), general = row(data.general); const currency = required(general.currencyCode);
  const lines = [['itemsPrice', 'itemsPrice'], ['localDelivery', 'localDelivery'], ['serviceComission', 'serviceCommission'], ['countCommission', 'countCommission'], ['fromBalance', 'fromBalance']].map(([field, key]) => ({ key, amount: number(general[field]) }));
  const methods = Object.entries(Array.isArray(data.paymentData) && !data.paymentData.length ? {} : row(data.paymentData)).map(([key, raw]) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new ApiContractError('metoda de plată');
    const item = row(raw), amounts = row(item.amounts);
    return { key, title: required(item.name), description: packingText(item.description), availableCurrencies: item.availableCurrency === undefined ? null : array(item.availableCurrency).map(required), hideBilling: boolean(item.hide_billing), percent: number(item.percent), maxAmount: number(item.max_sum), totalToPay: number(amounts.totalToPay), commission: number(amounts.comission), fullOrderPrice: number(amounts.fullOrderPrice) };
  });
  return { currency: currency.toUpperCase(), lines, methods, ...(data.orderAcknowledgementVersion === 1 ? { orderAcknowledgementVersion: 1 as const } : {}) };
}
export type CreatedOrder = { type: string; amount: number; currencyId: string | null; balance: number | null; orders: { id: string; uid: string | null; terminalCode?: string | null }[] };
/** Creation confirms order IDs. It does not prove that an external payment ran. */
export function checkoutCreated(raw: unknown): CreatedOrder {
  const envelope = row(raw);
  if (![false, 0, '0'].includes(envelope.error as never) || Number(envelope.code) !== 200 || envelope.message !== 'Ok') throw new ApiContractError('confirmarea comenzii');
  const item = row(envelope.paymentParams); const orders = array(item.orders).map(raw => { const order = row(raw); return { id: id(order.id), uid: text(order.uid), ...(order.terminalKey == null ? {} : { terminalCode: id(order.terminalKey) }) }; });
  if (!orders.length || new Set(orders.map(item => item.id)).size !== orders.length) throw new ApiContractError('confirmarea comenzii');
  return { type: required(item.type), amount: number(item.amount), currencyId: id(item.currency), balance: item.balance == null ? null : number(item.balance), orders };
}

/** Use exact item identity/order and reject partial cart reads before review. */
export function checkoutItems(ids: string[], items: CartItem[]): CartItem[] {
  if (ids.length !== items.length || new Set(ids).size !== ids.length || new Set(items.map(item => item.id)).size !== items.length) throw new ApiContractError('produsele comenzii');
  if (items.some(item => item.status != null && item.status !== 'unpaid')) throw new ApiContractError('disponibilitatea produselor');
  const knownShops = new Set(items.map(item => item.shopId).filter(Boolean));
  if (knownShops.size > 1 || items.length > 1 && items.some(item => item.isComplex === false)) throw new ApiContractError('magazinul comenzii');
  const byId = new Map(items.map(item => [item.id, item]));
  return ids.map(id => { const item = byId.get(id); if (!item) throw new ApiContractError('produsele comenzii'); return item; });
}
/** A same-total product/quantity/variant change still invalidates approval. */
export function checkoutItemFingerprint(items: CartItem[]): string {
  return JSON.stringify(items.map(item => ({ id: item.id, title: item.title, quantity: item.quantity, price: item.price, shipping: item.shipping, color: item.color, size: item.size, comment: item.comment, url: item.url, currency: item.currency, shopId: item.shopId, storageId: item.storageId, isComplex: item.isComplex, status: item.status })));
}
export function orderBillingMissing(methodKey: string, billing: PaymentBilling | null | undefined): boolean {
  if (!['platescro', 'apple-pay', 'google-pay'].includes(methodKey)) return false;
  const fields = billing?.fields;
  return billing?.isSet !== true || !fields ||
    ![fields.address1, fields.city, fields.state, fields.email, fields.phone, fields.zip, fields.country].every(value => value?.trim());
}

export function checkoutPaymentIssue(method: CheckoutPayment, currency: string, quote?: CheckoutPayments): string | null {
  if (method.availableCurrencies !== null && !method.availableCurrencies.some(code => code.toUpperCase() === currency.toUpperCase())) return 'commerce.paymentCurrencyUnavailable';
  // OrderCreateController applies the ceiling BEFORE adding the processor fee.
  if (method.maxAmount > 0 && Math.round((method.totalToPay - method.commission) * 100) > Math.round(method.maxAmount * 100)) return 'commerce.paymentLimitExceeded';
  if (method.key === 'terminals' && quote?.orderAcknowledgementVersion !== 1) return 'commerce.paymentServerUpdate';
  if (method.key === 'apple-pay' || method.key === 'google-pay') {
    const card = quote?.methods.find(candidate => candidate.key === 'platescro');
    if (!card || checkoutPaymentIssue(card, currency) || card.totalToPay !== method.totalToPay ||
        card.commission !== method.commission || card.fullOrderPrice !== method.fullOrderPrice) return 'commerce.paymentUnsupported';
  }
  return ['balance', 'terminals', 'platescro', 'paypal', 'apple-pay', 'google-pay'].includes(method.key) ? null : 'commerce.paymentUnsupported';
}
