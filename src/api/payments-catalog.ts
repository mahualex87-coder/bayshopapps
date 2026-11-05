import { ApiContractError } from './normalize.ts';
import { normalizeCarrierLogo } from './carrier-assets.ts';
import { serverText } from '../domain/server-text.ts';
import { sortCurrencies } from '../domain/option-order.ts';

/** Decimal text is retained for later payment operations; never sum or round it
 * through a JS number. Numeric JSON values can only preserve their received value. */
export type PaymentDecimalText = string;
export type PaymentInvoice = { id: string; reference: string | null; amount: PaymentDecimalText; description: string | null; createdAt: string | null };
export type PaymentInvoiceGroup = {
  currencyId: string | null;
  currency: string;
  currencySign: string | null;
  /** Server-reported net debt, not the sum of this group's invoice rows. */
  maxSum: PaymentDecimalText | null;
  counter: number | null;
  invoices: PaymentInvoice[] | null;
};
export const paymentBillingFields = ['first_name', 'last_name', 'company_name', 'address1', 'city', 'state', 'email', 'phone', 'zip', 'country'] as const;
export type PaymentBillingFields = Record<typeof paymentBillingFields[number], string | null>;
export type PaymentBilling = { fields: PaymentBillingFields | null; isSet: boolean | null };
export type PaymentMethod = {
  /** Exact key from paymentTypes; no method is added or inferred locally. */
  id: string;
  title: string | null;
  description: string | null;
  logoUrl: string | null;
  currencies: string[] | null;
  maxSum: PaymentDecimalText | null;
  hideBilling: boolean | null;
  percent: PaymentDecimalText | null;
  additionalFixedCommission: PaymentDecimalText | null;
  minimalCommission: PaymentDecimalText | null;
  allowedPurposes: string | null;
};
export type PaymentCatalog = { invoiceGroups: PaymentInvoiceGroup[] | null; billing: PaymentBilling; methods: PaymentMethod[] | null };

type Row = Record<string, unknown>;
const fail = () => new ApiContractError('opțiunile de plată');
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail();
  return value as Row;
};
const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw fail();
};
const display = (value: unknown): string | null => { const result = text(value); return result === null ? null : serverText(result); };
const id = (value: unknown): string | null => {
  const result = text(value);
  if (result === null || result === '') return null;
  if (!/^\d+$/.test(result)) throw fail();
  return result;
};
const requiredId = (value: unknown): string => { const result = id(value); if (result === null) throw fail(); return result; };
const currency = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value)) throw fail();
  return value.toUpperCase();
};
const flag = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') return null;
  if (![true, false, 0, 1, '0', '1'].includes(value as never)) throw fail();
  return value === true || value === 1 || value === '1';
};
const count = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw fail();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw fail();
  return result;
};
function decimal(value: unknown): PaymentDecimalText | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw fail();
    return value; // Preserve scale, sign and every digit supplied as text.
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw fail();
  const result = String(value);
  if (!/[eE]/.test(result)) return result;
  // Small numeric JSON values stringify as scientific notation. Expand digits
  // textually instead of toFixed(), which rounds or loses significant digits.
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(result);
  if (!match) throw fail();
  const [, sign, integer, fraction = '', exponent] = match;
  const digits = integer + fraction; const point = integer.length + Number(exponent);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
const requiredDecimal = (value: unknown): PaymentDecimalText => { const result = decimal(value); if (result === null) throw fail(); return result; };
const list = <T>(value: unknown, normalize: (item: unknown) => T): T[] | null => {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw fail();
  return value.map(normalize);
};
function invoice(value: unknown): PaymentInvoice {
  const row = object(value);
  return { id: requiredId(row.id), reference: text(row.trid), amount: requiredDecimal(row.summ), description: display(row.comment), createdAt: text(row.created ?? row.ceated) };
}
function invoiceGroup(value: unknown): PaymentInvoiceGroup {
  const row = object(value);
  return { currencyId: id(row.currency_id), currency: currency(row.currency), currencySign: display(row.currency_sign), maxSum: decimal(row.max_sum), counter: count(row.counter), invoices: list(row.list, invoice) };
}
function methods(value: unknown): PaymentMethod[] | null {
  if (value === null || value === undefined) return null;
  // PHP serializes an empty associative map as [], while populated maps have keys.
  if (Array.isArray(value) && value.length === 0) return [];
  return Object.entries(object(value)).map(([key, value]) => {
    if (!key) throw fail();
    const row = object(value); const currencies = list(row.availableCurrency, currency);
    return {
      id: key, title: display(row.name), description: display(row.description), logoUrl: normalizeCarrierLogo(row.img),
      currencies: currencies === null ? null : sortCurrencies(currencies, value => value),
      maxSum: decimal(row.max_sum), hideBilling: flag(row.hide_billing), percent: decimal(row.percent),
      additionalFixedCommission: decimal(row.additionalFixedCommission), minimalCommission: decimal(row.minimalCommission), allowedPurposes: text(row.allowedPurposes),
    };
  });
}

/** The order checkout reads only the member's billing, independently of supply invoices. */
export function normalizePaymentBilling(value: unknown): PaymentBilling {
  const row = object(value);
  const billing = row.billingData == null ? null : object(row.billingData);
  return { fields: billing === null ? null : Object.fromEntries(paymentBillingFields.map(key => [key, text(billing[key])])) as PaymentBillingFields, isSet: flag(row.isBillingSet) };
}

/** Normalize the GET /api/payments data object only. It confers no write
 * capability and never supplies a missing fee, limit, method or billing flag. */
export function normalizePaymentCatalogData(value: unknown): PaymentCatalog {
  const row = object(value);
  const groups = list(row.unpaidInvoices, invoiceGroup);
  return {
    invoiceGroups: groups === null ? null : sortCurrencies(groups, group => group.currency),
    billing: normalizePaymentBilling(row),
    methods: methods(row.paymentTypes),
  };
}
