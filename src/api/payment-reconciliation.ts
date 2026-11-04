import { ApiContractError } from './normalize.ts';
import { MutationInputError, type ReadPlan } from './mutations.ts';
import type { PaymentCatalog } from './payments-catalog.ts';

export type InvoicePaymentScope = { currency: string; invoices: { id: string; reference: string; amount: string }[] };
export type InvoicePaymentRecord = { id: string | null; reference: string | null; amount: string | null; type: string | null; status: string | null; paymentId: string | null; created: string | null };
export type InvoicePaymentHistory = { currency: string; record: InvoicePaymentRecord }[];
export type PaymentReconciliationRead = { kind: 'payments.invoice.read'; id: string } | { kind: 'payments.invoice.history'; days: number };
export type PaymentReconciliationResult<Q extends PaymentReconciliationRead> = Q extends { kind: 'payments.invoice.read' } ? InvoicePaymentRecord | null : InvoicePaymentHistory;
export type PaymentReconciliationReader = <Q extends PaymentReconciliationRead>(query: Q) => Promise<PaymentReconciliationResult<Q>>;

const fail = (): never => { throw new ApiContractError('confirmarea facturilor'); };
const object = (raw: unknown): Record<string, unknown> => raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : fail();
const text = (raw: unknown): string | null => raw == null ? null : typeof raw === 'string' && raw.length <= 128 && !/[\u0000-\u001f\u007f]/.test(raw) ? raw : fail();
const id = (raw: unknown): string | null => {
  if (raw == null || raw === '') return null;
  const value = typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : text(raw);
  return value && /^[1-9]\d{0,30}$/.test(value) ? value : fail();
};
const amount = (raw: unknown): string | null => {
  if (raw == null) return null;
  const value = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : text(raw);
  return value && /^\d+(?:\.\d+)?$/.test(value) && value.length <= 64 ? value : fail();
};
function decimalKey(value: string | null): string | null {
  if (value === null) return null;
  const [whole, fraction = ''] = value.split('.');
  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.replace(/0+$/, '')}`;
}
export function normalizeInvoicePaymentRecord(raw: unknown): InvoicePaymentRecord | null {
  if (raw === null || Array.isArray(raw) && raw.length === 0) return null;
  const row = object(raw);
  if (!Object.keys(row).length) return null;
  return { id: id(row.id), reference: text(row.trid), amount: amount(row.summ), type: text(row.type), status: text(row.status), paymentId: id(row.payment_id), created: text(row.created) };
}
export function normalizeInvoicePaymentHistory(raw: unknown): InvoicePaymentHistory {
  const groups = object(raw).balanceList;
  if (Array.isArray(groups) && groups.length === 0) return [];
  return Object.entries(object(groups)).flatMap(([currency, entries]) => {
    if (!/^[A-Za-z]{3}$/.test(currency) || !Array.isArray(entries)) return fail();
    return entries.map(value => { const record = normalizeInvoicePaymentRecord(value); return record ? { currency: currency.toUpperCase(), record } : fail(); });
  });
}
export function planPaymentReconciliationRead<Q extends PaymentReconciliationRead>(query: Q): ReadPlan<PaymentReconciliationResult<Q>> {
  if (query.kind === 'payments.invoice.read') {
    if (!/^[1-9]\d{0,30}$/.test(query.id)) throw new MutationInputError();
    return { path: `/api/balance?transaction=${query.id}`, normalize: normalizeInvoicePaymentRecord } as ReadPlan<PaymentReconciliationResult<Q>>;
  }
  // BalanceController interprets numbers >6 as days; never invent pagination
  // or request all history on every provider return.
  if (!Number.isSafeInteger(query.days) || query.days < 7 || query.days > 36500) throw new MutationInputError();
  return { path: `/api/balance?period=${query.days}`, normalize: normalizeInvoicePaymentHistory } as ReadPlan<PaymentReconciliationResult<Q>>;
}
function calendarTime(raw: string | null): number | null {
  const m = raw && /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  const values = m.slice(1).map(Number), [y, mo, d, h, mi, s] = values;
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return y >= 1970 && date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && date.getUTCHours() === h && date.getUTCMinutes() === mi && date.getUTCSeconds() === s ? date.getTime() : null;
}
const paidMatch = (row: InvoicePaymentRecord, invoice: InvoicePaymentScope['invoices'][number]) => row.type === 'minus' && row.status === 'paid' && row.reference === invoice.reference && (row.id === null || row.id === invoice.id) && decimalKey(row.amount) === decimalKey(invoice.amount);

/** False from paid reconciliation is inconclusive, never permission to resume
 * an old full-amount order. Require every exact scoped invoice to still be in
 * the freshly authenticated unpaid catalog; partial payment blocks resume. */
export function invoiceScopeIsUnpaid(scope: InvoicePaymentScope, catalog: PaymentCatalog): boolean {
  if (!scope.invoices.length || !catalog.invoiceGroups || scope.invoices.some(invoice => !invoice.reference)) return false;
  const rows = catalog.invoiceGroups.flatMap(group => (group.invoices ?? []).map(invoice => ({ currency: group.currency, invoice })));
  return scope.invoices.every(invoice => {
    const matches = rows.filter(row => row.invoice.id === invoice.id);
    return matches.length === 1 && matches[0].currency === scope.currency && matches[0].invoice.reference === invoice.reference
      && decimalKey(matches[0].invoice.amount) === decimalKey(invoice.amount);
  });
}

/** Detail GET is scoped by the authenticated member and requested invoice ID,
 * but strips ISO currency. Require a unique matching grouped history row for
 * that proof; never infer a currency from "$" or a payment method. No result
 * here asserts which payment attempt settled the invoices. */
export async function reconcilePaymentInvoices(scope: InvoicePaymentScope, read: PaymentReconciliationReader, now = Date.now()): Promise<boolean> {
  if (!/^[A-Z]{3}$/.test(scope.currency) || !scope.invoices.length || scope.invoices.length > 100
    || new Set(scope.invoices.map(row => row.id)).size !== scope.invoices.length
    || new Set(scope.invoices.map(row => row.reference)).size !== scope.invoices.length
    || scope.invoices.some(row => !/^[1-9]\d{0,30}$/.test(row.id) || !row.reference || !/^\d+(?:\.\d+)?$/.test(row.amount))) return false;
  const details: InvoicePaymentRecord[] = [];
  let oldest = now;
  for (const invoice of scope.invoices) {
    const row = await read({ kind: 'payments.invoice.read', id: invoice.id });
    if (!row || !paidMatch(row, invoice)) return false;
    const created = calendarTime(row.created);
    if (created === null || created > now + 86400000) return false;
    oldest = Math.min(oldest, created); details.push(row);
  }
  // SQL wall-clock dates have no offset. Three days of margin covers timezone
  // boundaries without claiming a timezone or changing any transaction date.
  const days = Math.max(7, Math.ceil((now - oldest) / 86400000) + 3);
  if (days > 36500) return false;
  const history = await read({ kind: 'payments.invoice.history', days });
  return scope.invoices.every((invoice, index) => {
    const matches = history.filter(({ record }) => record.reference === invoice.reference);
    return matches.length === 1 && matches[0].currency === scope.currency && paidMatch(matches[0].record, invoice)
      && matches[0].record.paymentId === details[index].paymentId && matches[0].record.created === details[index].created;
  });
}
