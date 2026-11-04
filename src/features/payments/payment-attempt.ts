import { isHostedCheckoutUrl } from '../../api/hosted-checkout.ts';

type AttemptFields = { attemptKey: string; paymentId: string | null; createdAt: number; paymentType?: 'platescro' | 'paypal' | 'terminals'; phase?: 'preparing' | 'checkout'; issue?: string };
export type LegacyPaymentAttempt = AttemptFields & { version: 1 };
export type PaymentInvoiceScope = { currency: string; invoices: { id: string; reference: string; amount: string }[] };
export type ScopedPaymentAttempt = AttemptFields & { version: 2; scope: PaymentInvoiceScope; reviewedLegacyKeys?: string[]; hostedChannel?: 'CC' | 'APAY' | 'GPAY'; selectionDigest?: string; resumeUrl?: string; processorResumeUrl?: string; resolution?: { kind: 'invoices_paid'; checkedAt: number } };
export type PaymentAttempt = LegacyPaymentAttempt | ScopedPaymentAttempt;
export type PaymentLedger = { version: 2; activeAttemptKey: string | null; attempts: PaymentAttempt[] };

export const MAX_PAYMENT_ATTEMPTS = 32;
export const MAX_PAYMENT_SCOPE_INVOICES = 100;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const positiveId = /^[1-9]\d{0,30}$/;
const fail = (): never => { throw new Error('payments.recoveryFailed'); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const keysOnly = (row: Record<string, unknown>, keys: readonly string[]) => { if (Object.keys(row).some(key => !keys.includes(key))) fail(); };

/** An approval link is a capability. Store only the original Orders approval
 * URL in the encrypted account ledger; never log it or attach account auth. */
export function isPayPalApprovalUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\\\s]/.test(raw)) return false;
  try {
    const url = new URL(raw), tokens = url.searchParams.getAll('token');
    return url.protocol === 'https:' && ['www.paypal.com', 'www.sandbox.paypal.com'].includes(url.hostname)
      && !url.username && !url.password && !url.port && !url.hash && url.pathname === '/checkoutnow'
      && [...url.searchParams.keys()].length === 1 && tokens.length === 1 && /^[A-Za-z0-9-]{6,128}$/.test(tokens[0]);
  } catch { return false; }
}

export function areAttemptInvoicesPaid(attempt: PaymentAttempt | null): boolean {
  return attempt?.version === 2 && attempt.resolution?.kind === 'invoices_paid';
}

/** A cash terminal code does not reserve an invoice or authorize a charge. */
export function isNonExclusiveAttempt(attempt: PaymentAttempt): boolean {
  return attempt.paymentType === 'terminals' || isUnopenedCardAttempt(attempt) || areAttemptInvoicesPaid(attempt);
}

/** The card API only prepares an unpaid row and signed form. The app saves
 * its ID before opening that form. Old card attempts without an ID therefore
 * never reached the processor. This inference is NOT valid for PayPal. */
export function isUnopenedCardAttempt(attempt: PaymentAttempt | null): boolean {
  return attempt?.paymentType === 'platescro' && (attempt.phase === 'preparing' || attempt.phase === undefined && attempt.paymentId === null);
}

function parseScope(value: unknown): PaymentInvoiceScope {
  const row = object(value);
  keysOnly(row, ['currency', 'invoices']);
  if (typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency) || !Array.isArray(row.invoices) || row.invoices.length === 0 || row.invoices.length > MAX_PAYMENT_SCOPE_INVOICES) return fail();
  const ids = new Set<string>();
  const invoices = row.invoices.map(value => {
    const invoice = object(value);
    keysOnly(invoice, ['id', 'reference', 'amount']);
    if (typeof invoice.id !== 'string' || !positiveId.test(invoice.id) || ids.has(invoice.id)
      || typeof invoice.reference !== 'string' || invoice.reference.length > 128 || /[\u0000-\u001f\u007f]/.test(invoice.reference)
      || typeof invoice.amount !== 'string' || invoice.amount.length > 64 || !/^\d+(?:\.\d+)?$/.test(invoice.amount) || !/[1-9]/.test(invoice.amount)) return fail();
    ids.add(invoice.id);
    return { id: invoice.id, reference: invoice.reference, amount: invoice.amount };
  });
  return { currency: row.currency, invoices };
}

function parseAttempt(value: unknown): PaymentAttempt {
  const row = object(value);
  const commonKeys = ['version', 'attemptKey', 'paymentId', 'createdAt', 'paymentType', 'phase', 'issue'];
  keysOnly(row, row.version === 2 ? [...commonKeys, 'scope', 'reviewedLegacyKeys', 'hostedChannel', 'selectionDigest', 'resumeUrl', 'processorResumeUrl', 'resolution'] : commonKeys);
  if (![1, 2].includes(row.version as number) || typeof row.attemptKey !== 'string' || !uuid.test(row.attemptKey)
    || !(row.paymentId === null || typeof row.paymentId === 'string' && positiveId.test(row.paymentId))
    || typeof row.createdAt !== 'number' || !Number.isSafeInteger(row.createdAt) || row.createdAt <= 0 || !Number.isFinite(new Date(row.createdAt).getTime())
    || row.paymentType !== undefined && !['platescro', 'paypal', 'terminals'].includes(row.paymentType as string)
    || row.phase !== undefined && !['preparing', 'checkout'].includes(row.phase as string)
    || row.issue !== undefined && (typeof row.issue !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(row.issue))) return fail();
  const fields: AttemptFields = {
    attemptKey: row.attemptKey, paymentId: row.paymentId as string | null, createdAt: row.createdAt,
    ...(row.paymentType !== undefined ? { paymentType: row.paymentType as AttemptFields['paymentType'] } : {}),
    ...(row.phase !== undefined ? { phase: row.phase as AttemptFields['phase'] } : {}),
    ...(row.issue !== undefined ? { issue: row.issue as string } : {}),
  };
  if (row.version === 1) return { version: 1, ...fields };
  let reviewedLegacyKeys: string[] | undefined;
  if (row.reviewedLegacyKeys !== undefined) {
    if (!Array.isArray(row.reviewedLegacyKeys) || row.reviewedLegacyKeys.length > MAX_PAYMENT_ATTEMPTS
      || row.reviewedLegacyKeys.some(key => typeof key !== 'string' || !uuid.test(key) || key.toLowerCase() === fields.attemptKey.toLowerCase())
      || new Set(row.reviewedLegacyKeys.map(key => (key as string).toLowerCase())).size !== row.reviewedLegacyKeys.length) return fail();
    reviewedLegacyKeys = [...row.reviewedLegacyKeys] as string[];
  }
  if (row.resumeUrl !== undefined && (row.paymentType !== 'paypal' || row.phase !== 'checkout' || !isPayPalApprovalUrl(row.resumeUrl))) return fail();
  if (row.processorResumeUrl !== undefined && (row.paymentType !== 'platescro' || row.phase !== 'checkout' || fields.paymentId === null || !['APAY', 'GPAY'].includes(row.hostedChannel as string) || !isHostedCheckoutUrl(row.processorResumeUrl))) return fail();
  if (row.hostedChannel !== undefined && (row.paymentType !== 'platescro' || !['CC', 'APAY', 'GPAY'].includes(row.hostedChannel as string))) return fail();
  if (row.selectionDigest !== undefined && (typeof row.selectionDigest !== 'string' || !/^[a-f0-9]{64}$/.test(row.selectionDigest))) return fail();
  let resolution: ScopedPaymentAttempt['resolution'];
  if (row.resolution !== undefined) {
    const value = object(row.resolution); keysOnly(value, ['kind', 'checkedAt']);
    if (value.kind !== 'invoices_paid' || typeof value.checkedAt !== 'number' || !Number.isSafeInteger(value.checkedAt) || value.checkedAt <= 0 || value.checkedAt > 8640000000000000) return fail();
    resolution = { kind: 'invoices_paid', checkedAt: value.checkedAt };
  }
  return { version: 2, ...fields, scope: parseScope(row.scope), ...(reviewedLegacyKeys !== undefined ? { reviewedLegacyKeys } : {}), ...(row.hostedChannel !== undefined ? { hostedChannel: row.hostedChannel as ScopedPaymentAttempt['hostedChannel'] } : {}), ...(row.selectionDigest !== undefined ? { selectionDigest: row.selectionDigest as string } : {}), ...(row.resumeUrl !== undefined ? { resumeUrl: row.resumeUrl as string } : {}), ...(row.processorResumeUrl !== undefined ? { processorResumeUrl: row.processorResumeUrl as string } : {}), ...(resolution ? { resolution } : {}) };
}

/** Recovery contains identifiers, exact invoice scope and an optional provider
 * GET capability in encrypted storage. Never persist payer data, signed forms,
 * account credentials or native wallet tokens. */
export function parsePaymentAttempt(raw: string | null): PaymentAttempt | null {
  return raw === null ? null : parseAttempt(JSON.parse(raw));
}

export function emptyPaymentLedger(): PaymentLedger {
  return { version: 2, activeAttemptKey: null, attempts: [] };
}

/** An active view is independent of unresolved records. A hidden attempt is
 * still pending; no archive/navigation action invents cancellation or payment. */
export function parsePaymentLedger(raw: string | null): PaymentLedger {
  if (raw === null) return emptyPaymentLedger();
  const row = object(JSON.parse(raw));
  keysOnly(row, ['version', 'activeAttemptKey', 'attempts']);
  if (row.version !== 2 || !Array.isArray(row.attempts) || row.attempts.length > MAX_PAYMENT_ATTEMPTS
    || !(row.activeAttemptKey === null || typeof row.activeAttemptKey === 'string' && uuid.test(row.activeAttemptKey))) return fail();
  const attempts = row.attempts.map(parseAttempt);
  const keys = new Set(attempts.map(attempt => attempt.attemptKey.toLowerCase()));
  if (keys.size !== attempts.length || row.activeAttemptKey !== null && !attempts.some(attempt => attempt.attemptKey === row.activeAttemptKey)) return fail();
  const paymentIds = new Set<string>();
  const invoiceIds = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.paymentId !== null) {
      if (paymentIds.has(attempt.paymentId)) return fail();
      paymentIds.add(attempt.paymentId);
    }
    if (attempt.version !== 2) continue;
    if (!isNonExclusiveAttempt(attempt)) for (const invoice of attempt.scope.invoices) {
      if (invoiceIds.has(invoice.id)) return fail();
      invoiceIds.add(invoice.id);
    }
    for (const key of attempt.reviewedLegacyKeys ?? []) {
      const reviewed = attempts.find(value => value.attemptKey.toLowerCase() === key.toLowerCase());
      if (reviewed && reviewed.version !== 1) return fail();
    }
  }
  return { version: 2, activeAttemptKey: row.activeAttemptKey as string | null, attempts };
}

/** Invoice IDs are account-wide: a changed currency label cannot bypass a
 * pending payment for the same invoice. Review of legacy records never does. */
export function attemptsBlockingBills(attempts: readonly PaymentAttempt[], billIds: readonly string[]): ScopedPaymentAttempt[] {
  const selected = new Set(billIds);
  return attempts.filter((attempt): attempt is ScopedPaymentAttempt => attempt.version === 2 && !isNonExclusiveAttempt(attempt) && attempt.scope.invoices.some(invoice => selected.has(invoice.id)));
}

export function legacyUnscopedAttempts(attempts: readonly PaymentAttempt[]): LegacyPaymentAttempt[] {
  return attempts.filter((attempt): attempt is LegacyPaymentAttempt => attempt.version === 1 && !isNonExclusiveAttempt(attempt));
}

function storageBoundary(origin: string, accountId: string): string {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || !/^[1-9]\d*$/.test(accountId)) return fail();
  return `${url.hostname}.${accountId}`;
}

export function paymentAttemptStorageKey(origin: string, accountId: string): string {
  return `bayshop.payment-attempt.v1.${storageBoundary(origin, accountId)}`;
}

export function paymentLedgerStorageKey(origin: string, accountId: string): string {
  return `bayshop.payment-attempt.v2.${storageBoundary(origin, accountId)}`;
}
