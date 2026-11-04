/** Provider pages are isolated from the account transport. Allow HTTPS bank
 * challenges, but never local resources, credential URLs or app/deep links. */
export function paymentNavigationAllowed(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') return false;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
    if (/^[\d.]+$/.test(host) || host.includes(':') || host.includes('[')) return false;
    return /^[a-z0-9.-]+$/.test(host);
  } catch { return false; }
}

export function paymentFormBody(fields: Record<string, string>): string {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form.toString();
}

type InitialPaymentAction = { kind: 'redirect'; url: string } | { kind: 'form'; url: string; fields: Record<string, string> };
/** A callback identifies a payment to READ, never proves that it was paid.
 * PayPal's process request must execute: it captures the approved order on BayShop.
 * Bind its payment ID to the approval token returned by our authenticated API. */
export function inspectPaymentReturn(rawUrl: string, action: InitialPaymentAction, origin: string): { paymentId: string | null; finished: boolean } | null {
  try {
    if (!paymentNavigationAllowed(rawUrl)) return null;
    const url = new URL(rawUrl);
    if (url.origin !== origin) return null;
    const path = url.pathname.replace(/\/$/, '');
    if (action.kind === 'form') {
      const paymentId = action.fields.invoice_id;
      if (!/^[1-9]\d{0,30}$/.test(paymentId ?? '') || !/^\/member\/payments\/platescro\/(?:process|success|failed)(?:\/[^/]+)?$/.test(path)) return null;
      return { paymentId, finished: /\/(?:success|failed)(?:\/[^/]+)?$/.test(path) };
    }
    const approved = new URL(action.url);
    if (!['www.paypal.com', 'www.sandbox.paypal.com'].includes(approved.hostname)) return null;
    if (path === '/member/payments/paypal/process') {
      const tokens = url.searchParams.getAll('token');
      const paymentIds = url.searchParams.getAll('payment');
      const expectedToken = approved.searchParams.get('token');
      if (!expectedToken || tokens.length !== 1 || tokens[0] !== expectedToken || paymentIds.length !== 1 || !/^[1-9]\d{0,30}$/.test(paymentIds[0])) return null;
      return { paymentId: paymentIds[0], finished: false };
    }
    if (/^\/member\/payments\/paypal\/(?:success|failed)$/.test(path)) return { paymentId: null, finished: true };
    return null;
  } catch { return null; }
}
