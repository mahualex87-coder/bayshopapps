import { billingInputFields, type BillingInput } from './account-settings.ts';
import { ApiError } from './client.ts';
import { checkoutPaymentIssue, orderBillingMissing, type CheckoutPayments, type CreatedOrder } from './checkout-normalize.ts';
import { normalizeLegacyPaymentStart } from './payment-legacy.ts';
import type { MutationPlan } from './mutations.ts';
import { normalizeOrderDetail, type CartItem, type OrderDetail } from './operations-normalize.ts';

export type OrderPaymentStartInput = { created: CreatedOrder; quote: CheckoutPayments; billingInput?: BillingInput };

function changed(): never { throw new ApiError(0, 'payments.quoteChanged'); }
const cents = (amount: number) => Math.round(amount * 100);

export function orderQuoteRevision(quote: CheckoutPayments, methodKey: string): string {
  const method = quote.methods.find(item => item.key === methodKey);
  if (!method || checkoutPaymentIssue(method, quote.currency, quote)) return changed();
  const card = ['apple-pay','google-pay'].includes(methodKey) ? quote.methods.find(item => item.key === 'platescro') : null;
  return JSON.stringify([quote.currency, quote.lines, method, card, quote.orderAcknowledgementVersion ?? null]);
}

export function verifyOrderPaymentDetails(input: OrderPaymentStartInput, rows: OrderDetail[]): void {
  const {created, quote} = input;
  const method = quote.methods.find(item => item.key === created.type);
  if (!method || checkoutPaymentIssue(method, quote.currency, quote) || rows.length !== created.orders.length) return changed();
  let fullPrice = 0;
  for (const order of created.orders) {
    const row = rows.find(item => item.id === order.id);
    const total = row?.prices.find(price => price.key === 'totalPrice')?.amount;
    if (!row || row.uid !== order.uid || row.paymentStatus !== 'unpaid' || !['new','longterm'].includes(row.processingStatus ?? '') ||
        row.currency?.toUpperCase() !== quote.currency.toUpperCase() || total == null || total < 0) return changed();
    fullPrice += cents(total);
  }
  if (fullPrice !== cents(method.fullOrderPrice) - cents(method.commission) ||
      cents(created.amount) !== cents(method.totalToPay) - cents(method.commission)) return changed();
}

export function planOrderPaymentStart(input: OrderPaymentStartInput): MutationPlan {
  const {created, quote} = input;
  const method = quote.methods.find(candidate => candidate.key === created.type);
  if (!method || checkoutPaymentIssue(method, quote.currency, quote) || !['platescro','paypal','apple-pay','google-pay'].includes(created.type) ||
      !created.orders.length || new Set(created.orders.map(order => order.id)).size !== created.orders.length ||
      created.orders.some(order => !/^[1-9]\d*$/.test(order.id) || !order.uid || !/^[a-z0-9_-]{1,80}$/i.test(order.uid))) return changed();
  const provider = created.type === 'paypal' ? 'paypal' : 'platescro';
  const channel = created.type === 'apple-pay' ? 'APAY' : created.type === 'google-pay' ? 'GPAY' : undefined;
  const billing = input.billingInput ? orderPaymentBillingFields(created.type, input.billingInput) : undefined;
  return { path:'/api/payments', method:'POST', encoding:'form', fields:{ ...billing, paymentType:provider,
    orders:JSON.stringify(created.orders.map(({id,uid}) => ({ id,uid }))) }, invalidate:[],
    normalize:raw => {
      const result = normalizeLegacyPaymentStart(raw, provider, channel);
      if (result.action.kind === 'form') {
        const {amount,curr} = result.action.fields;
        if (curr?.toUpperCase() !== quote.currency.toUpperCase() || !/^\d+(?:\.\d{1,2}0*)?$/.test(amount) ||
            cents(Number(amount)) !== cents(method.totalToPay)) return changed();
      }
      return result;
    } };
}


export function orderPaymentBillingFields(methodKey: string, input: BillingInput): BillingInput {
  if (!['platescro','apple-pay','google-pay'].includes(methodKey)) return changed();
  const fields = billingInputFields(input);
  if (orderBillingMissing(methodKey, {fields,isSet:true})) throw new ApiError(0,'payments.billingMissing');
  return fields;
}

/** The legacy order endpoint pays from balance and returns the resulting paid orders.
 * It accepts cart UIDs instead of IDs. Both order controllers pass the same fulfilment fields to createOrder(). */
export function balanceOrderPlan(plan: MutationPlan, carts: CartItem[], quote: CheckoutPayments): MutationPlan {
  const uids = carts.map(item => item.uid);
  if (!uids.length || uids.some(uid => !uid || !/^[a-z0-9_-]{1,80}$/i.test(uid)) || new Set(uids).size !== uids.length) return changed();
  const {carts: _carts, paymentType: _method, ...fulfilment} = plan.fields;
  const method = quote.methods.find(item=>item.key==='balance');
  if (!method || checkoutPaymentIssue(method, quote.currency, quote)) return changed();
  return {...plan, path:'/api/order/', fields:{...fulfilment,items:uids}, normalize:raw=>{
    if (!raw || typeof raw !== 'object') return changed();
    const envelope=raw as Record<string,unknown>;
    if (![false,0,'0'].includes(envelope.error as never) || Number(envelope.code)!==200 || envelope.message!=='Ok') return changed();
    const details=normalizeOrderDetail(envelope.data);
    const savedUids=details.flatMap(row=>row.items.map(item=>item.uid)).sort();
    if (!details.length || JSON.stringify(savedUids)!==JSON.stringify([...uids].sort()) ||
        details.some(row=>!row.uid || row.paymentStatus!=='paid' || row.currency?.toUpperCase()!==quote.currency.toUpperCase())) return changed();
    const paidAmounts=details.map(row=>row.prices.find(line=>line.key==='totalPrice')?.amount);
    if (paidAmounts.some(amount=>amount===undefined) || paidAmounts.reduce<number>((sum,amount)=>sum+cents(amount!),0)!==cents(method.fullOrderPrice)) return changed();
    return {type:'balance',amount:method.totalToPay,currencyId:null,balance:null,orders:details.map(({id,uid})=>({id,uid}))} satisfies CreatedOrder;
  }};
}
