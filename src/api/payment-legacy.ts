import { API_ORIGIN, ApiError } from './client.ts';
import { ApiContractError } from './normalize.ts';
import { MutationInputError, type MutationPlan, type ReadPlan } from './mutations.ts';
import { normalizePaymentCatalogData, type PaymentCatalog, type PaymentMethod } from './payments-catalog.ts';
import { validatePaymentProviderUrl, type PaymentAction } from './payments.ts';
import { hostedWalletMethod, isHostedPaymentChannel, withHostedPaymentChannel, type HostedPaymentChannel } from './payment-hosted-channel.ts';

export type { HostedPaymentChannel } from './payment-hosted-channel.ts';

export type LegacyPaymentType = 'platescro' | 'paypal' | 'terminals';
export type LegacyPaymentsData = { catalog: PaymentCatalog };
export type LegacyPaymentSelection = { paymentType: LegacyPaymentType; billIds: string[]; hostedChannel?: HostedPaymentChannel };
export type LegacyPaymentStartInput = LegacyPaymentSelection & {
  /** Exact local snapshot, memory only; never sent to the API or persisted. */
  selectionRevision: string;
};
export type LegacyPaymentAction = Exclude<PaymentAction, { kind: 'terminal' | 'pending' }>
  | { kind: 'terminal'; paymentCode: string; amount: string; currency: null; currencySign: string | null; expiresAt: null };
export type LegacyPaymentStartResult = { paymentId: string | null; paymentType: LegacyPaymentType; action: LegacyPaymentAction };
export type LegacyPaymentStatus = { paymentId: string; state: 'paid' | 'unconfirmed'; amount: string | null; currencySign: string | null };
export type LegacyPaymentReadCommand = { kind: 'payments.legacy.catalog' } | { kind: 'payments.legacy.status'; paymentId: string };
export type LegacyPaymentReadResult<Q extends LegacyPaymentReadCommand> = Q extends { kind: 'payments.legacy.catalog' } ? LegacyPaymentsData : LegacyPaymentStatus;

const fail = (): never => { throw new ApiContractError('plățile facturilor'); };
const inputError = (): never => { throw new MutationInputError('errors.invalidRequest'); };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const text = (value: unknown, max = 16384): string => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : fail();
const scalar = (value: unknown): string => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? String(value) : text(value);
const id = (value: unknown): string => { const result = scalar(value); return /^[1-9]\d*$/.test(result) ? result : fail(); };
const decimal = (value: unknown): string => { const result = scalar(value); return /^\d+(?:\.\d+)?$/.test(result) ? result : fail(); };
const positive = (value: string) => /[1-9]/.test(value);
type ExactDecimal = { units: bigint; scale: number };
function exactDecimal(value: string): ExactDecimal {
  const [whole, fraction = ''] = decimal(value).split('.');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}
function unitsAt(value: ExactDecimal, scale: number): bigint { return value.units * 10n ** BigInt(scale - value.scale); }
function compareDecimal(a: ExactDecimal, b: ExactDecimal): number {
  const scale = Math.max(a.scale, b.scale); const left = unitsAt(a, scale); const right = unitsAt(b, scale);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Informational invoice base only, using the same positive net-debt cap as
 * the existing server flow. This is never sent as an authorized payment total. */
export function legacyPaymentDisplayBase(amounts: readonly string[], netDebt: string | null): string | null {
  if (!amounts.length || amounts.some(value => !/^\d+(?:\.\d+)?$/.test(value) || !positive(value))) return null;
  if (netDebt === null || !/^\d+(?:\.\d+)?$/.test(netDebt)) return null; // Unknown cap cannot imply an uncapped base.
  const values = amounts.map(exactDecimal); const scale = values.reduce((maximum, value) => Math.max(maximum, value.scale), 0);
  const base: ExactDecimal = { units: values.reduce((sum, value) => sum + unitsAt(value, scale), 0n), scale };
  if (netDebt !== null) {
    const cap = exactDecimal(netDebt);
    if (cap.units > 0n && compareDecimal(cap, base) < 0) return netDebt;
  }
  const digits = base.units.toString().padStart(scale + 1, '0');
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
}
/** The website limits the invoice base, before commission. The API applies a
 * positive net-debt cap; zero means no cap. This comparison authorizes no
 * amount and never sends a calculated total to the payment processor. */
function validateMethodLimit(amounts: string[], netDebt: string | null, methodLimit: string | null) {
  if (methodLimit === null) return; // Missing metadata stays unknown, not zero.
  const limit = exactDecimal(methodLimit);
  if (limit.units === 0n) return;
  const values = amounts.map(exactDecimal); const scale = values.reduce((maximum, value) => Math.max(maximum, value.scale), 0);
  let base: ExactDecimal = { units: values.reduce((sum, value) => sum + unitsAt(value, scale), 0n), scale };
  if (netDebt !== null) {
    const cap = exactDecimal(netDebt);
    if (cap.units > 0n && compareDecimal(cap, base) < 0) base = cap;
  }
  if (compareDecimal(base, limit) > 0) throw new ApiError(0, 'payments.methodUnavailable');
}
const method = (value: unknown): LegacyPaymentType => ['platescro', 'paypal', 'terminals'].includes(value as string) ? value as LegacyPaymentType : inputError();
function selection(input: LegacyPaymentSelection): LegacyPaymentSelection {
  const paymentType = method(input.paymentType);
  if (input.hostedChannel !== undefined && (paymentType !== 'platescro' || !isHostedPaymentChannel(input.hostedChannel))) return inputError();
  if (!Array.isArray(input.billIds) || !input.billIds.length || input.billIds.some(value => typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) return inputError();
  if (new Set(input.billIds).size !== input.billIds.length) return inputError();
  return { paymentType, billIds: [...input.billIds], ...(input.hostedChannel === undefined ? {} : { hostedChannel: input.hostedChannel }) };
}

export function normalizeLegacyPaymentsData(raw: unknown): LegacyPaymentsData {
  return { catalog: normalizePaymentCatalogData(raw) };
}

/** GET already applies member/country/supply eligibility. Preserve that list;
 * reject any explicit contradictory purpose instead of inventing a method. */
export function validateLegacyPaymentSelection(input: LegacyPaymentSelection, data: LegacyPaymentsData) {
  const selected = selection(input);
  const matches = data.catalog.methods?.filter(value => value.id === selected.paymentType) ?? [];
  const paymentMethod = matches[0];
  if (matches.length !== 1 || !paymentMethod.currencies?.length || (paymentMethod.allowedPurposes !== null && !['all', 'supply'].includes(paymentMethod.allowedPurposes))) throw new ApiError(0, 'payments.methodUnavailable');
  const selectedIds = new Set(selected.billIds);
  const invoices = (data.catalog.invoiceGroups ?? []).flatMap(group => (group.invoices ?? []).filter(invoice => selectedIds.has(invoice.id)).map(invoice => ({ group, invoice })));
  if (invoices.length !== selectedIds.size || new Set(invoices.map(value => value.invoice.id)).size !== selectedIds.size || invoices.some(value => value.group !== invoices[0]?.group)) throw new ApiError(0, 'payments.quoteChanged');
  const group = invoices[0].group;
  if (!group.currencyId || !paymentMethod.currencies.includes(group.currency)) throw new ApiError(0, 'payments.methodUnavailable');
  for (const { invoice } of invoices) if (!positive(decimal(invoice.amount))) throw new ApiError(0, 'payments.quoteChanged');
  validateMethodLimit(invoices.map(value => value.invoice.amount), group.maxSum, paymentMethod.maxSum);
  // This is still a platescro payment. The wallet's catalog entry supplies
  // additional eligibility only; its fees must never replace the signed card
  // checkout total or be guessed locally as a native authorization amount.
  const walletId = hostedWalletMethod(selected.hostedChannel);
  const walletMatches = walletId === null ? [] : data.catalog.methods?.filter(value => value.id === walletId) ?? [];
  const hostedMethod = walletMatches[0] ?? null;
  if (walletId !== null) {
    if (walletMatches.length !== 1 || !hostedMethod?.currencies?.includes(group.currency)
      || (hostedMethod.allowedPurposes !== null && !['all', 'supply'].includes(hostedMethod.allowedPurposes))) throw new ApiError(0, 'payments.methodUnavailable');
    validateMethodLimit(invoices.map(value => value.invoice.amount), group.maxSum, hostedMethod.maxSum);
  }
  // The stored row is required by platescroData even when hide_billing hides
  // the web editor. PayPal and terminal handlers do not read billing at all.
  if (selected.paymentType === 'platescro') {
    const billing = data.catalog.billing;
    const fields = billing.fields;
    if (billing.isSet !== true || !fields || !['address1', 'city', 'state', 'email', 'phone', 'zip', 'country'].every(key => fields[key as keyof typeof fields]?.trim())) throw new ApiError(0, 'payments.billingMissing');
  }
  return { group, method: paymentMethod, hostedMethod };
}

const methodRevision = (value: PaymentMethod) => ({ id: value.id, currencies: [...(value.currencies ?? [])].sort(), maxSum: value.maxSum,
  hideBilling: value.hideBilling, percent: value.percent, additionalFixedCommission: value.additionalFixedCommission,
  minimalCommission: value.minimalCommission, allowedPurposes: value.allowedPurposes });

/** This is a comparison marker, NOT a server quote or idempotency key. It
 * includes no recalculated amount and is not sent or written to storage. */
export function legacyPaymentSelectionRevision(input: LegacyPaymentSelection, data: LegacyPaymentsData): string {
  const { group, method: paymentMethod, hostedMethod } = validateLegacyPaymentSelection(input, data);
  const selected = new Set(input.billIds);
  return JSON.stringify({ hostedChannel: input.hostedChannel ?? null, currencyId: group.currencyId, currency: group.currency, maxSum: group.maxSum,
    invoices: (group.invoices ?? []).filter(row => selected.has(row.id)).map(row => [row.id, row.amount]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    method: methodRevision(paymentMethod), hostedMethod: hostedMethod === null ? null : methodRevision(hostedMethod),
    billing: input.paymentType === 'platescro' ? data.catalog.billing : null,
  });
}

const formKeys = ['returnurl', 'fname', 'lname', 'company', 'country', 'city', 'add', 'email', 'phone', 'amount', 'curr', 'invoice_id', 'order_desc', 'merch_id', 'timestamp', 'lang', 'nonce', 'fp_hash', 'ExtraData'] as const;
type FormField = typeof formKeys[number];
export type LegacyPaymentPreparationReason = FormField | 'payload' | 'paymentType' | 'requestUrl' | 'redirect' | 'paymentCode' | 'convertedAmount' | 'currency_sign' | 'currency' | 'form_size';
const preparationReasons = new Set<string>([...formKeys, 'payload', 'paymentType', 'requestUrl', 'redirect', 'paymentCode', 'convertedAmount', 'currency_sign', 'currency', 'form_size']);

/** Safe stage diagnosis only, never a processor response or signed value. */
export function legacyPreparationDiagnostic(reason: unknown): string {
  if (typeof reason !== 'string') return 'PREPARATION_RESPONSE';
  if (preparationReasons.has(reason)) return `PREPARATION_${reason.toUpperCase()}`;
  if (/^http_[1-5]\d{2}$/.test(reason)) return `PREPARATION_${reason.toUpperCase()}`;
  const transportReasons = ['errors_timeout', 'errors_network', 'errors_cancelled', 'errors_redirected', 'errors_loadFailed', 'errors_contract'];
  return transportReasons.includes(reason) ? `PREPARATION_${reason.slice(7).toUpperCase()}` : 'PREPARATION_RESPONSE';
}

function preparationId(value: unknown): string | null {
  const candidate = typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : value;
  return typeof candidate === 'string' && /^[1-9]\d{0,30}$/.test(candidate) ? candidate : null;
}

/** Only a numeric card reference can survive an interrupted preparation.
 * This extracts no signed fields and does not validate or authorize a form. */
export function legacyCardPaymentId(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return preparationId((raw as Record<string, unknown>).invoice_id);
}

/** A preparation may already have created a server payment. Keep only its
 * validated ID and a constant field code so recovery need not replay the POST.
 * Never retain the rejected value, provider URL, signed form or original error. */
export class LegacyPaymentPreparationError extends ApiContractError {
  readonly paymentId: string | null;
  readonly reason: LegacyPaymentPreparationReason;
  constructor(paymentId: string | null, reason: LegacyPaymentPreparationReason) {
    super('plățile facturilor');
    this.name = 'LegacyPaymentPreparationError';
    this.paymentId = preparationId(paymentId);
    this.reason = preparationReasons.has(reason) ? reason : 'payload';
  }
}

function preparationValue<T>(paymentId: string | null, reason: LegacyPaymentPreparationReason, read: () => T): T {
  try { return read(); } catch { throw new LegacyPaymentPreparationError(paymentId, reason); }
}

// Platescro::requestData passes these billing/description fields through and
// signs order_desc as-is. CR, LF and tab are legitimate text, not delimiters
// here: URLSearchParams encodes the complete value in the provider POST body.
const multilineFormFields = new Set<FormField>(['fname', 'lname', 'company', 'city', 'add', 'order_desc', 'ExtraData']);
function formScalar(key: FormField, value: unknown): string {
  if (!multilineFormFields.has(key) || typeof value !== 'string') return scalar(value);
  return value.length <= 16384 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? value : fail();
}

export function normalizeLegacyPaymentStart(raw: unknown, paymentType: LegacyPaymentType, hostedChannel?: HostedPaymentChannel): LegacyPaymentStartResult {
  const row = preparationValue(null, 'payload', () => object(raw));
  preparationValue(null, 'paymentType', () => method(paymentType));
  const paymentId = paymentType === 'platescro' ? preparationValue(null, 'invoice_id', () => legacyCardPaymentId(row) ?? fail())
    : paymentType === 'terminals' ? preparationValue(null, 'paymentCode', () => preparationId(row.paymentCode) ?? fail()) : null;
  const read = <T,>(reason: LegacyPaymentPreparationReason, value: () => T) => preparationValue(paymentId, reason, value);
  read('paymentType', () => { if (hostedChannel !== undefined && (paymentType !== 'platescro' || !isHostedPaymentChannel(hostedChannel))) fail(); });
  if (paymentType === 'paypal') return { paymentId: null, paymentType, action: { kind: 'redirect', url: read('redirect', () => validatePaymentProviderUrl(row.redirect, paymentType)) } };
  if (paymentType === 'terminals') {
    const paymentCode = paymentId!;
    const amount = read('convertedAmount', () => { const value = decimal(row.convertedAmount); return positive(value) ? value : fail(); });
    return { paymentId: paymentCode, paymentType, action: { kind: 'terminal', paymentCode, amount, currency: null,
      currencySign: row.currency_sign == null ? null : read('currency_sign', () => text(row.currency_sign, 32)), expiresAt: null } };
  }
  const url = read('requestUrl', () => validatePaymentProviderUrl(row.requestUrl, paymentType));
  read('amount', () => { const value = decimal(row.amount); return positive(value) ? value : fail(); });
  read('curr', () => typeof row.curr === 'string' && /^[A-Za-z]{3}$/.test(row.curr) ? row.curr : fail());
  for (const key of ['merch_id', 'timestamp', 'nonce', 'fp_hash'] as const) read(key, () => {
    const value = scalar(row[key]); return value && !/\s/.test(value) ? value : fail();
  });
  read('returnurl', () => {
    const returnUrl = text(row.returnurl); const callback = new URL(returnUrl);
    // PaymentsController uses the exact named Platescro.processPayment route;
    // Router/Rewrite.php emits this path without query or trailing slash.
    if (callback.origin !== API_ORIGIN || returnUrl !== `${API_ORIGIN}/member/payments/platescro/process`) return fail();
  });
  const fields: Record<string, string> = {};
  let length = 0;
  for (const key of formKeys) {
    if (row[key] == null) continue;
    const value = read(key, () => formScalar(key, row[key])); length += key.length + value.length;
    if (length > 65536) throw new LegacyPaymentPreparationError(paymentId, 'form_size');
    fields[key] = value;
  }
  let hostedFields = fields;
  if (hostedChannel !== undefined) {
    hostedFields = read('ExtraData', () => {
      // Do not silently drop a conflicting channel/callback while normalizing
      // the response allowlist. The source handler currently returns scalar
      // ExtraData only; any new nested response contract needs explicit review.
      if (Object.keys(row).some(key => key.startsWith('ExtraData['))) return fail();
      return withHostedPaymentChannel(fields, hostedChannel);
    });
    if (Object.entries(hostedFields).reduce((size, [key, value]) => size + key.length + value.length, 0) > 65536) throw new LegacyPaymentPreparationError(paymentId, 'form_size');
  }
  return { paymentId, paymentType, action: { kind: 'form', url, method: 'POST', fields: hostedFields } };
}

/** This endpoint returns data only for an owned PAID row. null does not
 * distinguish pending, missing, foreign or failed: all remain unconfirmed. */
export function normalizeLegacyPaymentStatus(raw: unknown, expectedPaymentId: string): LegacyPaymentStatus {
  const paymentId = id(expectedPaymentId);
  if (raw === null) return { paymentId, state: 'unconfirmed', amount: null, currencySign: null };
  const row = object(raw);
  if (id(row.paymentId) !== paymentId) return fail();
  return { paymentId, state: 'paid', amount: decimal(row.sum), currencySign: row.sign == null ? null : text(row.sign, 32) };
}
export function planLegacyPaymentRead<Q extends LegacyPaymentReadCommand>(command: Q): ReadPlan<LegacyPaymentReadResult<Q>> {
  let plan: ReadPlan;
  if (command.kind === 'payments.legacy.catalog') plan = { path: '/api/payments', normalize: normalizeLegacyPaymentsData };
  else {
    const paymentId = id(command.paymentId);
    plan = { path: `/api/payments/platescro/success/${paymentId}`, normalize: raw => normalizeLegacyPaymentStatus(raw, paymentId) };
  }
  return plan as ReadPlan<LegacyPaymentReadResult<Q>>;
}
export function planLegacyPaymentStart(input: LegacyPaymentStartInput): MutationPlan {
  if (Object.keys(input).some(key => !['paymentType', 'billIds', 'selectionRevision', 'hostedChannel'].includes(key))) return inputError();
  const selected = selection(input);
  if (typeof input.selectionRevision !== 'string' || !input.selectionRevision || input.selectionRevision.length > 262144) return inputError();
  return { path: '/api/payments', method: 'POST', encoding: 'form', fields: { paymentType: selected.paymentType, 'bills[]': selected.billIds },
    invalidate: [], normalize: raw => normalizeLegacyPaymentStart(raw, selected.paymentType, selected.hostedChannel) };
}
