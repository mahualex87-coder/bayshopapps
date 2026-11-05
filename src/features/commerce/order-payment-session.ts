import type { CheckoutPayments, CreatedOrder } from '../../api/checkout-normalize.ts';
import type { OrderDetail } from '../../api/operations-normalize.ts';
import type { BillingInput } from '../../api/account-settings.ts';

type OrderIdentity = Pick<CreatedOrder['orders'][number], 'id' | 'uid'>;
export type OrderPaymentState = 'paid' | 'payable' | 'unavailable';
export type OrderPaymentReceipt = { created: CreatedOrder; quote: CheckoutPayments; billingInput?: BillingInput };
export type OrderPaymentIntent = OrderPaymentReceipt & { attempted: boolean };
let currentOwner = '';
const receipts = new Map<string, OrderPaymentIntent>();

/** Only checkout receipts obtained in this account session are eligible for a gateway POST.
 * Share one attempt across all orders from the same checkout. Provider secrets stay outside this cache. */
export function orderPaymentIntent(owner: string, orderId: string, receipt?: OrderPaymentReceipt): OrderPaymentIntent | undefined {
  if (owner !== currentOwner) { receipts.clear(); currentOwner = owner; }
  const existing = receipts.get(orderId);
  if (!receipt) return undefined;
  if (existing) return existing;
  const intent = { ...receipt, attempted: false };
  for (const { id } of receipt.created.orders) receipts.set(id, intent);
  return intent;
}

export function orderPaymentState(orders: OrderIdentity[], details: OrderDetail[]): OrderPaymentState {
  if (!orders.length || orders.length !== details.length) return 'unavailable';
  for (const order of orders) {
    const row = details.find(item => item.id === order.id);
    if (!row || order.uid !== null && row.uid !== order.uid) return 'unavailable';
  }
  if (details.every(order => order.paymentStatus === 'paid')) return 'paid';
  return details.every(order => order.paymentStatus === 'unpaid' && ['new', 'longterm'].includes(order.processingStatus ?? ''))
    ? 'payable' : 'unavailable';
}
