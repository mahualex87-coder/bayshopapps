import type { PaymentAction } from './payments.ts';

export type HostedCheckoutForm = Extract<PaymentAction, { kind: 'form' }>;
export type HostedWalletChannel = 'APAY' | 'GPAY';
export type HostedCheckoutSession = { paymentId: string; channel: HostedWalletChannel; url: string };
export type HostedCheckoutFailure = 'invalid_request' | 'not_dispatched' | 'provider_rejected' | 'outcome_unknown';
export type HostedCheckoutReason = 'input' | 'aborted' | 'timeout' | 'network' | 'http' | 'response' | 'provider';
type ResponseDetail = 'BODY_SIZE' | 'JSON' | 'SHAPE' | 'URL_MISSING' | 'URL_ORIGIN' | 'URL_FORMAT';
const responseDetails = new Set<ResponseDetail>(['BODY_SIZE', 'JSON', 'SHAPE', 'URL_MISSING', 'URL_ORIGIN', 'URL_FORMAT']);

/** Constant diagnostic codes only: never retain a signed form, PSP body,
 * browser URL or raw network error in an error that might be logged. Even an
 * explicit provider error is not evidence that a BayShop attempt is cancelled. */
export class HostedCheckoutError extends Error {
  readonly kind: HostedCheckoutFailure;
  readonly reason: HostedCheckoutReason;
  readonly paymentId: string | null;
  readonly dispatched: boolean;
  readonly diagnosticCode: string;
  constructor(kind: HostedCheckoutFailure, reason: HostedCheckoutReason, paymentId: string | null, dispatched: boolean, detail?: ResponseDetail | number) {
    super('Hosted checkout unavailable');
    this.name = 'HostedCheckoutError'; this.kind = kind; this.reason = reason;
    this.paymentId = paymentId; this.dispatched = dispatched;
    this.diagnosticCode = reason === 'http' && typeof detail === 'number' && Number.isInteger(detail) && detail >= 100 && detail <= 599
      ? `HOSTED_HTTP_${detail}` : reason === 'response' && responseDetails.has(detail as ResponseDetail)
        ? `HOSTED_${detail}` : `HOSTED_${reason.toUpperCase()}`;
  }
}

const endpoint = 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php';
const fieldNames = new Set(['returnurl', 'fname', 'lname', 'company', 'country', 'city', 'add', 'email', 'phone',
  'amount', 'curr', 'invoice_id', 'order_desc', 'merch_id', 'timestamp', 'lang', 'nonce', 'fp_hash',
  'ExtraData[bayshop_invoice_codes]', 'ExtraData[ep_channel]']);
const invalid = (): never => { throw new HostedCheckoutError('invalid_request', 'input', null, false); };

/** The documented response and the existing BayShop consumer identify a url,
 * but do not promise a particular path/query format. Keep the existing PSP
 * host boundary; do not infer payment status from any URL component. secure2
 * and secure3 are exact hosts observed in HTTPS PSP responses on 2026-11-03
 * (EUR/GPAY and GBP/APAY). This does not permit numbered/wildcard subdomains. */
export function validateHostedCheckoutUrl(raw: unknown): string {
  const origins = ['https://secure.euplatesc.ro', 'https://secure2.euplatesc.ro', 'https://secure3.euplatesc.ro'];
  if (typeof raw !== 'string' || raw.length > 8192 || !origins.some(origin => raw.startsWith(origin + '/')) || /[\\\s\u0000-\u001f\u007f#]/.test(raw)) return invalid();
  let url: URL;
  try { url = new URL(raw); } catch { return invalid(); }
  if (!origins.includes(url.origin) || url.username || url.password || url.port || url.hash || url.href !== raw) return invalid();
  return raw;
}

function rejectedUrlDetail(raw: unknown): ResponseDetail {
  if (typeof raw !== 'string' || !raw) return 'URL_MISSING';
  try {
    const url = new URL(raw);
    if (!['https://secure.euplatesc.ro', 'https://secure2.euplatesc.ro', 'https://secure3.euplatesc.ro'].includes(url.origin)) return 'URL_ORIGIN';
  } catch { return 'URL_FORMAT'; }
  return 'URL_FORMAT';
}

export function isHostedCheckoutUrl(raw: unknown): raw is string {
  try { validateHostedCheckoutUrl(raw); return true; } catch { return false; }
}

/** Pure, memory-only plan for an already normalized BayShop platescro form.
 * This appends the documented unsigned generate_epid switch. It does not
 * calculate money, replace the signature, authorize a wallet or create a bill.
 * https://manager.euplatesc.ro/v3/?page=docs */
export function planHostedCheckout(action: HostedCheckoutForm) {
  if (!action || action.kind !== 'form' || action.method !== 'POST' || action.url !== endpoint
    || !action.fields || typeof action.fields !== 'object' || Array.isArray(action.fields)) return invalid();
  const entries = Object.entries(action.fields);
  if (!entries.length || entries.length > fieldNames.size) return invalid();
  let size = 0;
  for (const [key, value] of entries) {
    if (!fieldNames.has(key) || typeof value !== 'string' || value.length > 16384
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return invalid();
    size += key.length + value.length;
  }
  if (size > 65536) return invalid();
  const fields = action.fields;
  const channel = fields['ExtraData[ep_channel]'];
  if ((channel !== 'APAY' && channel !== 'GPAY') || !/^[1-9]\d{0,30}$/.test(fields.invoice_id ?? '')
    || !/^\d+(?:\.\d+)?$/.test(fields.amount ?? '') || !/[1-9]/.test(fields.amount)
    || !/^[A-Za-z]{3}$/.test(fields.curr ?? '') || !/^\d{14}$/.test(fields.timestamp ?? '')
    || ['merch_id', 'nonce', 'fp_hash'].some(key => !fields[key] || /\s/.test(fields[key]))
    || !Object.hasOwn(fields, 'order_desc') || !fields.returnurl) return invalid();
  const body = new URLSearchParams(entries);
  body.append('generate_epid', '1');
  return Object.freeze({ paymentId: fields.invoice_id, channel, url: endpoint, body: body.toString() });
}

export type HostedCheckoutFetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'url' | 'redirected' | 'text'>>;
export type HostedCheckoutOptions = { fetch: HostedCheckoutFetch; signal?: AbortSignal; timeoutMs?: number };

/** Exactly one transport call, no retry. Caller keeps the original payment ID
 * in the current operation for server reconciliation. Pass the SDK58
 * expo/fetch implementation explicitly: it honors omit cookies and redirect
 * error on both native platforms. Never use the authenticated BayShop client.
 * A returned URL is checkout readiness, never payment success. */
export async function prepareHostedCheckout(action: HostedCheckoutForm, options: HostedCheckoutOptions): Promise<HostedCheckoutSession> {
  const plan = planHostedCheckout(action);
  const timeoutMs = options?.timeoutMs ?? 20000;
  if (!options || typeof options.fetch !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) return invalid();
  if (options.signal?.aborted) throw new HostedCheckoutError('not_dispatched', 'aborted', plan.paymentId, false);
  const controller = new AbortController();
  let dispatched = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    const interrupt = (reason: 'aborted' | 'timeout') => {
      // Reject first so a fetch AbortError cannot hide the known interruption.
      reject(new HostedCheckoutError(dispatched ? 'outcome_unknown' : 'not_dispatched', reason, plan.paymentId, dispatched));
      controller.abort();
    };
    onAbort = () => interrupt('aborted');
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => interrupt('timeout'), timeoutMs);
  });
  const request = async (): Promise<HostedCheckoutSession> => {
    // No awaited gap between this check and handing the single POST to fetch.
    if (options.signal?.aborted) throw new HostedCheckoutError('not_dispatched', 'aborted', plan.paymentId, false);
    dispatched = true;
    const response = await options.fetch(plan.url, {
      method: 'POST', body: plan.body, signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
    if (controller.signal.aborted) throw new HostedCheckoutError('outcome_unknown', 'aborted', plan.paymentId, true);
    if (!response.ok || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300 || response.redirected
      || (response.url && response.url !== endpoint)) throw new HostedCheckoutError('outcome_unknown', 'http', plan.paymentId, true, response.status);
    const body = await response.text();
    if (controller.signal.aborted) throw new HostedCheckoutError('outcome_unknown', 'aborted', plan.paymentId, true);
    if (typeof body !== 'string' || body.length > 65536) throw new HostedCheckoutError('outcome_unknown', 'response', plan.paymentId, true, 'BODY_SIZE');
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { throw new HostedCheckoutError('outcome_unknown', 'response', plan.paymentId, true, 'JSON'); }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HostedCheckoutError('outcome_unknown', 'response', plan.paymentId, true, 'SHAPE');
    const row = raw as Record<string, unknown>;
    if (row.error !== undefined && row.error !== null && row.error !== false && row.error !== 0 && row.error !== '' && row.error !== '0') {
      throw new HostedCheckoutError('provider_rejected', 'provider', plan.paymentId, true);
    }
    let url: string;
    try { url = validateHostedCheckoutUrl(row.url); } catch { throw new HostedCheckoutError('outcome_unknown', 'response', plan.paymentId, true, rejectedUrlDetail(row.url)); }
    return { paymentId: plan.paymentId, channel: plan.channel, url };
  };
  try { return await Promise.race([request(), interrupted]); }
  catch (error) {
    if (error instanceof HostedCheckoutError) throw error;
    throw new HostedCheckoutError(dispatched ? 'outcome_unknown' : 'not_dispatched', 'network', plan.paymentId, dispatched);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener('abort', onAbort);
  }
}
