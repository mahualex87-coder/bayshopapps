import { isPayPalApprovalUrl } from './payment-attempt.ts';
import { isHostedCheckoutUrl } from '../../api/hosted-checkout.ts';

type BrowserResult = { type: string };
export type BrowserFailureCode = 'BROWSER_URL' | 'BROWSER_LOCKED' | 'BROWSER_RESULT' | 'BROWSER_OPEN_FAILED';
const failureCodes = new Set<BrowserFailureCode>(['BROWSER_URL', 'BROWSER_LOCKED', 'BROWSER_RESULT', 'BROWSER_OPEN_FAILED']);
/** Only constants may reach support diagnostics, never a native error or URL. */
export function browserFailureCode(value: unknown): BrowserFailureCode | null {
  return failureCodes.has(value as BrowserFailureCode) ? value as BrowserFailureCode : null;
}
type Dependencies = {
  platform: 'ios' | 'android';
  open(url: string): Promise<BrowserResult>;
  dismiss(): Promise<unknown>;
  subscribe(listener: (state: string) => void): () => void;
  returned(): void;
  closed(): void;
  failed(reason: BrowserFailureCode): void;
};

/** The OS browser owns navigation/cookies. Closing it proves neither payment
 * nor cancellation; the caller only performs authenticated invoice reads. */
export function createPayPalBrowserController(url: string, dependencies: Dependencies) {
  let alive = true, started = false, completed = false, away = false;
  let unsubscribe: (() => void) | null = null;
  const finish = () => {
    if (!alive || completed) return;
    completed = true; unsubscribe?.(); unsubscribe = null;
    dependencies.returned(); dependencies.closed();
  };
  const fail = (reason: BrowserFailureCode) => {
    if (!alive || completed) return;
    // A rejected or locked open did not acquire a browser. Mark it terminal
    // before the callback can unmount us; cleanup must not dismiss a different
    // session through Expo's global dismissBrowser API.
    completed = true; unsubscribe?.(); unsubscribe = null;
    dependencies.failed(reason);
  };
  return {
    async start() {
      if (!alive || started) return;
      started = true;
      if (!isPayPalApprovalUrl(url) && !isHostedCheckoutUrl(url)) { fail('BROWSER_URL'); return; }
      if (dependencies.platform === 'android') unsubscribe = dependencies.subscribe(state => {
        if (state !== 'active') away = true;
        else if (away) finish();
      });
      try {
        const result = await dependencies.open(url);
        if (!alive || completed) return;
        // Android resolves as soon as Custom Tabs opens; that is not a return.
        if (result.type === 'cancel' || result.type === 'dismiss') finish();
        else if (result.type !== 'opened') fail(result.type === 'locked' ? 'BROWSER_LOCKED' : 'BROWSER_RESULT');
      } catch { fail('BROWSER_OPEN_FAILED'); }
    },
    close() {
      if (!alive || completed) return;
      if (started && dependencies.platform === 'ios') void dependencies.dismiss().catch(() => {});
      finish();
    },
    dispose() {
      alive = false; unsubscribe?.(); unsubscribe = null;
      if (started && !completed && dependencies.platform === 'ios') void dependencies.dismiss().catch(() => {});
    },
  };
}
