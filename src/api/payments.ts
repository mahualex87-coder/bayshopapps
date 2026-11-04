import { ApiError } from './client.ts';
import { normalizeQuotedWallet, type QuotedWallet } from './payment-wallet.ts';
import { ApiContractError } from './normalize.ts';
import { MutationInputError, type MutationPlan, type ReadPlan } from './mutations.ts';
import { normalizePaymentCatalogData, type PaymentCatalog } from './payments-catalog.ts';

export type PaymentCapabilities = {
  version: number | null; invoicePaymentV1: boolean; quote: boolean; ownedStatus: boolean;
  idempotentInitiation: boolean; callbackPaymentId: boolean; invoiceOwnershipValidated: boolean;
  walletTokenLogsRedacted: boolean; walletTransportTlsVerified: boolean;
};
export type PaymentsData = { catalog: PaymentCatalog; capabilities: PaymentCapabilities };
export type PaymentTerminal = { amount: string; processorAmount: string; currency: string; currencySign: string };
export type PaymentQuote = {
  version: 1; quoteId: string; revision: string; expiresAt: string; paymentType: string; billIds: string[];
  currency: { id: string; code: string; sign: string };
  amounts: { base: string; commission: string; total: string; processor: string; processorCurrency: string };
  terminal: PaymentTerminal | null; wallet: QuotedWallet | null;
  billingRequired: boolean; billingValid: boolean;
};
export type PaymentAction =
  | { kind: 'form'; url: string; method: 'POST'; fields: Record<string, string> }
  | { kind: 'redirect'; url: string }
  | { kind: 'terminal'; paymentCode: string; amount: string; currency: string; currencySign: string; expiresAt: string | null }
  | { kind: 'pending' };
export type PaymentMeta = { version: 1; paymentId: string | null; attemptKey: string; paymentType: string; state: 'initiating' | 'pending' | 'unknown'; statusPath: string | null };
export type PaymentStartResult = { paymentMeta: PaymentMeta; paymentAction: PaymentAction };
export type PaymentStatusTerminal = { kind: 'terminal'; paymentCode: string; amount: string | null; currency: string | null; currencySign: string | null; expiresAt: string | null };
export type PaymentStatus = {
  version: 1; paymentId: string | null; attemptKey: string | null; state: 'initiating' | 'pending' | 'paid' | 'expired' | 'unknown'; retryPayment: false;
  paymentType: string | null; rawStatus: string | null; isPending: boolean | null;
  amount: string | null; currencyId: string | null; currency: string | null; createdAt: string | null; updatedAt: string | null;
  terminal: PaymentStatusTerminal | null;
};
export type PaymentQuoteInput = { paymentType: string; billIds: string[] };
export type PaymentStartInput = PaymentQuoteInput & {
  quoteId: string; quoteRevision: string; idempotencyKey: string;
  /** Encrypted wallet token, request memory only. Never place this command in storage or logs. */
  walletToken?: string;
};
export type PaymentReadCommand =
  | { kind: 'payments.catalog' }
  | ({ kind: 'payments.quote' } & PaymentQuoteInput)
  | ({ kind: 'payments.status' } & ({ paymentId: string; attemptKey?: never } | { attemptKey: string; paymentId?: never }));
export type PaymentReadResult<Q extends PaymentReadCommand> = Q extends { kind: 'payments.catalog' } ? PaymentsData : Q extends { kind: 'payments.quote' } ? PaymentQuote : PaymentStatus;

type Row = Record<string, unknown>;
const contract = (): never => { throw new ApiContractError('plățile facturilor'); };
const inputError = (key = 'errors.invalidRequest'): never => { throw new MutationInputError(key); };
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : contract();
const text = (value: unknown, max = 256): string => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : contract();
const id = (value: unknown): string => typeof value === 'string' && /^[1-9]\d{0,30}$/.test(value) ? value : contract();
const method = (value: unknown): string => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : contract();
const currency = (value: unknown): string => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : contract();
const decimal = (value: unknown): string => typeof value === 'string' && /^(?:0|[1-9]\d{0,30})(?:\.\d{1,18})?$/.test(value) ? value : contract();
const bool = (value: unknown): boolean => typeof value === 'boolean' ? value : contract();
const version = (value: unknown): 1 => value === 1 ? 1 : contract();
const uuid = (value: unknown): string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) ? value : contract();
const quoteId = (value: unknown): string => typeof value === 'string' && /^[A-Za-z0-9_-]{16,256}$/.test(value) ? value : contract();
const revision = (value: unknown): string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : contract();
function timestamp(value: unknown): string {
  const result = text(value, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) return contract();
  return result;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1) return contract();
  const result = value.map(id); if (new Set(result).size !== result.length) return contract(); return result;
}
function sameIds(a: string[], b: string[]) { return a.length === b.length && a.every(value => b.includes(value)); }
function rawStatus(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return text(value);
}

/** Missing legacy capabilities mean unavailable, never permission inferred from a method key. */
export function normalizePaymentsData(raw: unknown): PaymentsData {
  const row = object(raw); const value = row.paymentCapabilities == null ? {} : object(row.paymentCapabilities);
  const flag = (name: string) => value[name] === undefined ? false : bool(value[name]);
  if (value.version !== undefined && (!Number.isSafeInteger(value.version) || Number(value.version) < 1)) return contract();
  return { catalog: normalizePaymentCatalogData(row), capabilities: {
    version: value.version === undefined ? null : value.version as number,
    invoicePaymentV1: flag('invoicePaymentV1'), quote: flag('quote'), ownedStatus: flag('ownedStatus'),
    idempotentInitiation: flag('idempotentInitiation'), callbackPaymentId: flag('callbackPaymentId'), invoiceOwnershipValidated: flag('invoiceOwnershipValidated'),
    walletTokenLogsRedacted: flag('walletTokenLogsRedacted'), walletTransportTlsVerified: flag('walletTransportTlsVerified'),
  } };
}
export function invoicePaymentsAvailable(capabilities: PaymentCapabilities): boolean {
  return capabilities.version === 1 && capabilities.invoicePaymentV1 && capabilities.quote && capabilities.ownedStatus && capabilities.idempotentInitiation && capabilities.callbackPaymentId && capabilities.invoiceOwnershipValidated;
}
export function normalizePaymentQuote(raw: unknown): PaymentQuote {
  const row = object(raw); const cur = object(row.currency); const amount = object(row.amounts);
  const terminal = row.terminal === null ? null : object(row.terminal);
  const wallet = row.wallet === null ? null : object(row.wallet);
  return {
    version: version(row.version), quoteId: quoteId(row.quoteId), revision: revision(row.revision), expiresAt: timestamp(row.expiresAt), paymentType: method(row.paymentType), billIds: ids(row.billIds),
    currency: { id: id(cur.id), code: currency(cur.code), sign: text(cur.sign, 32) },
    amounts: { base: decimal(amount.base), commission: decimal(amount.commission), total: decimal(amount.total), processor: decimal(amount.processor), processorCurrency: currency(amount.processorCurrency) },
    terminal: terminal && { amount: decimal(terminal.amount), processorAmount: decimal(terminal.processorAmount), currency: currency(terminal.currency), currencySign: text(terminal.currencySign, 32) },
    wallet: wallet && normalizeQuotedWallet(wallet, method(row.paymentType)),
    billingRequired: bool(row.billingRequired), billingValid: bool(row.billingValid),
  };
}

/** Only an initial provider URL is accepted here. A WebView must separately gate
 * subsequent navigation and must never attach the BayShop Bearer header. */
export function validatePaymentProviderUrl(value: unknown, paymentType: string): string {
  const raw = text(value, 8192); let url: URL;
  try { url = new URL(raw); } catch { return contract(); }
  const hosts = paymentType === 'paypal' ? ['www.paypal.com', 'www.sandbox.paypal.com'] : ['platescro', 'apple-pay', 'google-pay'].includes(paymentType) ? ['secure.euplatesc.ro'] : [];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port || url.hash || /[\\\s]/.test(raw)) return contract();
  return raw;
}
function terminalAction(raw: unknown): Extract<PaymentAction, { kind: 'terminal' }> {
  const row = object(raw);
  if (row.kind !== 'terminal') return contract();
  const code = text(row.paymentCode, 128); if (!code) return contract();
  return { kind: 'terminal', paymentCode: code, amount: decimal(row.amount), currency: currency(row.currency), currencySign: text(row.currencySign, 32), expiresAt: row.expiresAt === null ? null : timestamp(row.expiresAt) };
}
export function normalizePaymentAction(raw: unknown, paymentType: string): PaymentAction {
  const row = object(raw);
  if (row.kind === 'pending') return { kind: 'pending' };
  if (row.kind === 'terminal') { if (paymentType !== 'terminals') return contract(); return terminalAction(row); }
  if (row.kind === 'redirect') return { kind: 'redirect', url: validatePaymentProviderUrl(row.url, paymentType) };
  if (row.kind !== 'form' || paymentType !== 'platescro' || row.method !== 'POST') return contract();
  const fields = object(row.fields); const result: Record<string, string> = {};
  if (!Object.keys(fields).length || Object.keys(fields).length > 100) return contract();
  let length = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[A-Za-z][A-Za-z0-9_\[\]-]{0,63}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) return contract();
    const entry = text(value, 16384); length += key.length + entry.length; if (length > 65536) return contract(); result[key] = entry;
  }
  return { kind: 'form', url: validatePaymentProviderUrl(row.url, paymentType), method: 'POST', fields: result };
}
export function normalizePaymentStartResult(raw: unknown, expected?: Pick<PaymentStartInput, 'idempotencyKey' | 'paymentType'>): PaymentStartResult {
  const row = object(raw); const meta = object(row.paymentMeta);
  const paymentId = meta.paymentId === null ? null : id(meta.paymentId); const paymentType = method(meta.paymentType); const attemptKey = uuid(meta.attemptKey);
  if (!['initiating', 'pending', 'unknown'].includes(meta.state as string) || meta.statusPath !== (paymentId ? `/api/payment-status/${paymentId}` : null)) return contract();
  if (expected && (attemptKey !== expected.idempotencyKey || paymentType !== expected.paymentType)) return contract();
  const paymentAction = normalizePaymentAction(row.paymentAction, paymentType);
  if (paymentId === null && (paymentAction.kind !== 'pending' || meta.state === 'pending')) return contract();
  if (paymentAction.kind === 'terminal' && paymentAction.paymentCode !== paymentId) return contract();
  return { paymentMeta: { version: version(meta.version), paymentId, attemptKey, paymentType, state: meta.state as PaymentMeta['state'], statusPath: meta.statusPath as string | null }, paymentAction };
}
export function normalizePaymentStatus(raw: unknown): PaymentStatus {
  const row = object(raw); const v = version(row.version); const attemptKey = row.attemptKey == null ? null : uuid(row.attemptKey);
  if (row.retryPayment !== undefined && row.retryPayment !== false) return contract();
  if (row.paymentId === null) {
    if (!attemptKey || !['initiating', 'pending', 'unknown'].includes(row.state as string) || row.retryPayment !== false) return contract();
    return { version: v, paymentId: null, attemptKey, state: row.state as PaymentStatus['state'], retryPayment: false, paymentType: null, rawStatus: null, isPending: null, amount: null, currencyId: null, currency: null, createdAt: null, updatedAt: null, terminal: null };
  }
  if (!['pending', 'paid', 'expired', 'unknown'].includes(row.state as string)) return contract();
  const paymentId = id(row.paymentId); const paymentType = method(row.paymentType);
  if (row.state === 'expired' && paymentType !== 'terminals') return contract();
  let terminal: PaymentStatusTerminal | null = null;
  if (row.terminal != null) {
    const t = object(row.terminal);
    if (paymentType !== 'terminals' || t.kind !== 'terminal' || t.paymentCode !== paymentId) return contract();
    // Older terminal rows lack their original converted currency. Do not substitute
    // the customer's present currency or invent a converted amount from the code.
    terminal = { kind: 'terminal', paymentCode: paymentId, amount: t.amount === null ? null : decimal(t.amount), currency: t.currency === null ? null : currency(t.currency), currencySign: t.currencySign === null ? null : text(t.currencySign, 32), expiresAt: t.expiresAt === null ? null : timestamp(t.expiresAt) };
  }
  return { version: v, paymentId, attemptKey, state: row.state as PaymentStatus['state'], retryPayment: false,
    paymentType, rawStatus: rawStatus(row.rawStatus), isPending: bool(row.isPending), amount: decimal(row.amount), currencyId: id(row.currencyId), currency: row.currency === null ? null : currency(row.currency),
    createdAt: row.createdAt === null ? null : text(row.createdAt, 64), updatedAt: row.updatedAt === null ? null : text(row.updatedAt, 64), terminal };
}

export function validatePaymentSelection(input: PaymentQuoteInput, data: PaymentsData) {
  if (!invoicePaymentsAvailable(data.capabilities)) throw new ApiError(0, 'payments.serverUpdateRequired');
  const billIds = ids(input.billIds); const paymentType = method(input.paymentType);
  const groups = data.catalog.invoiceGroups; const selectedMethod = data.catalog.methods?.find(value => value.id === paymentType);
  if (!groups || !selectedMethod || !selectedMethod.currencies?.length) throw new ApiError(0, 'payments.methodUnavailable');
  const matches = groups.flatMap(group => (group.invoices ?? []).filter(invoice => billIds.includes(invoice.id)).map(invoice => ({ group, invoice })));
  if (matches.length !== billIds.length || new Set(matches.map(value => value.invoice.id)).size !== billIds.length || matches.some(value => value.group !== matches[0]?.group)) throw new ApiError(0, 'payments.quoteChanged');
  const group = matches[0].group;
  if (!group.currencyId || !selectedMethod.currencies.includes(group.currency)) throw new ApiError(0, 'payments.methodUnavailable');
  return { group, method: selectedMethod };
}
export function validatePaymentQuoteSelection(quote: PaymentQuote, input: PaymentQuoteInput, data: PaymentsData) {
  const { group } = validatePaymentSelection(input, data);
  if (quote.paymentType !== input.paymentType || !sameIds(quote.billIds, input.billIds) || quote.currency.id !== group.currencyId || quote.currency.code !== group.currency) throw new ApiError(0, 'payments.quoteChanged');
}
/** Compare exact server inputs, without summing, rounding, or recalculating a fee. */
export function paymentSelectionRevision(input: PaymentQuoteInput, data: PaymentsData): string {
  const { group, method } = validatePaymentSelection(input, data);
  return JSON.stringify({ currencyId: group.currencyId, currency: group.currency, maxSum: group.maxSum,
    invoices: (group.invoices ?? []).filter(row => input.billIds.includes(row.id)).map(row => [row.id, row.amount]).sort(([a], [b]) => a.localeCompare(b)),
    method: { id: method.id, currencies: method.currencies, maxSum: method.maxSum, hideBilling: method.hideBilling, percent: method.percent, additionalFixedCommission: method.additionalFixedCommission, minimalCommission: method.minimalCommission },
    billing: data.catalog.billing,
  });
}
export function validatePaymentStart(input: PaymentStartInput, quote: PaymentQuote, current: PaymentsData, now: number) {
  validatePaymentQuoteSelection(quote, input, current);
  if (input.quoteId !== quote.quoteId || input.quoteRevision !== quote.revision) throw new ApiError(0, 'payments.quoteChanged');
  if (Date.parse(quote.expiresAt) <= now) throw new ApiError(0, 'payments.quoteExpired');
  if (quote.billingRequired && (!quote.billingValid || current.catalog.billing.isSet !== true)) throw new ApiError(0, 'payments.quoteChanged');
  if (['apple-pay', 'google-pay'].includes(input.paymentType) && (!quote.wallet || !current.capabilities.walletTokenLogsRedacted || !current.capabilities.walletTransportTlsVerified)) throw new ApiError(0, 'payments.walletUnavailable');
}
export function planPaymentRead<Q extends PaymentReadCommand>(command: Q): ReadPlan<PaymentReadResult<Q>> {
  let plan: ReadPlan;
  if (command.kind === 'payments.catalog') plan = { path: '/api/payments', normalize: normalizePaymentsData };
  else if (command.kind === 'payments.quote') {
    const params = new URLSearchParams({ paymentType: method(command.paymentType) }); ids(command.billIds).forEach(value => params.append('bills[]', value));
    plan = { path: `/api/payment-quote?${params.toString()}`, normalize: normalizePaymentQuote };
  } else {
    if ((command.paymentId !== undefined) === (command.attemptKey !== undefined)) return inputError();
    const path = command.paymentId !== undefined ? `/api/payment-status/${id(command.paymentId)}` : `/api/payment-status?${new URLSearchParams({ attemptKey: uuid(command.attemptKey) })}`;
    plan = { path, normalize: raw => {
      const result = normalizePaymentStatus(raw);
      if (command.paymentId !== undefined && result.paymentId !== command.paymentId || command.attemptKey !== undefined && result.attemptKey !== command.attemptKey) return contract();
      return result;
    } };
  }
  return plan as ReadPlan<PaymentReadResult<Q>>;
}
export function planPaymentStart(input: PaymentStartInput): MutationPlan {
  const billIds = ids(input.billIds); const paymentType = method(input.paymentType);
  const fields: MutationPlan['fields'] = { paymentApiVersion: '1', quoteId: quoteId(input.quoteId), quoteRevision: revision(input.quoteRevision), idempotencyKey: uuid(input.idempotencyKey), paymentType, 'bills[]': billIds };
  const wallet = ['apple-pay', 'google-pay'].includes(paymentType);
  if (wallet) {
    if (typeof input.walletToken !== 'string' || !input.walletToken.length || input.walletToken.length > 16384 || input.walletToken.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.walletToken)) return inputError('payments.walletUnavailable');
    fields[paymentType === 'google-pay' ? 'gpay_token' : 'apay_token'] = input.walletToken;
  } else if (input.walletToken !== undefined) return inputError();
  // No wallet token is captured by the normalizer closure or retained in a result.
  const expected = { idempotencyKey: input.idempotencyKey, paymentType };
  return { path: '/api/payments', method: 'POST', encoding: 'form', fields, invalidate: [], normalize: raw => normalizePaymentStartResult(raw, expected) };
}
