/** Only the versioned, account-scoped BayShop payload can navigate the app.
 * Provider data never becomes a URL, a write, or a persisted account record. */
export const pushTargets = ['waiting', 'warehouse', 'shipments', 'received', 'order', 'shopping', 'refunds', 'payments', 'balance', 'loyalty', 'account', 'news', 'overview'] as const;
export type PushTarget = typeof pushTargets[number];
export type PushIntent = { eventId: string; accountId: string; target: PushTarget; id?: string; title: string; body: string };
export type PushDestination = { pathname: string; params?: Record<string, string> };
const numericId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,14}$/.test(value) && Number.isSafeInteger(Number(value));
function visibleText(value: unknown, limit: number): string { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : ''; }
export function parsePushIntent(message: { data?: unknown; notification?: { title?: unknown; body?: unknown } | null }): PushIntent | null {
  if (!message || !message.data || typeof message.data !== 'object' || Array.isArray(message.data)) return null;
  const data = message.data as Record<string, unknown>;
  if (data.bs_version !== '1' || !numericId(data.bs_account_id) || typeof data.bs_event_id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(data.bs_event_id)) return null;
  if (typeof data.bs_target !== 'string' || !pushTargets.includes(data.bs_target as PushTarget)) return null;
  if (data.bs_id != null && data.bs_id !== '' && !numericId(data.bs_id)) return null;
  const target = data.bs_target as PushTarget;
  const id = numericId(data.bs_id) && ['waiting', 'warehouse', 'shipments', 'received', 'order'].includes(target) ? data.bs_id : undefined;
  return { eventId: data.bs_event_id, accountId: data.bs_account_id, target, ...(id ? { id } : {}), title: visibleText(message.notification?.title, 160) || 'BayShop', body: visibleText(message.notification?.body, 500) };
}
export function pushDestination(intent: PushIntent, accountId: string | null): PushDestination | null {
  if (!accountId || intent.accountId !== accountId) return null;
  if (intent.id) {
    if (intent.target === 'waiting') return { pathname: '/incoming/[id]', params: { id: intent.id } };
    if (intent.target === 'warehouse') return { pathname: '/warehouse/[id]', params: { id: intent.id } };
    if (intent.target === 'shipments' || intent.target === 'received') return { pathname: '/shipment/[id]', params: { id: intent.id, section: intent.target } };
    if (intent.target === 'order') return { pathname: '/order/[id]', params: { id: intent.id } };
  }
  const paths: Record<PushTarget, string> = { waiting: '/waiting', warehouse: '/warehouse', shipments: '/shipments', received: '/received', order: '/shopping', shopping: '/shopping', refunds: '/refunds', payments: '/payments', balance: '/balance', loyalty: '/loyalty', account: '/account', news: '/notifications', overview: '/' };
  return { pathname: paths[intent.target] };
}
/** Tap intents are transient. Foreground arrivals should be offered only on tap.
 * Drop other-account notifications when an authenticated account becomes ready. */
export class PushInbox {
  private pending: PushIntent[] = [];
  private seen = new Set<string>();
  offer(intent: PushIntent): boolean {
    const key = `${intent.accountId}:${intent.eventId}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    this.pending.push(intent);
    if (this.pending.length > 32) this.pending.shift();
    return true;
  }
  take(accountId: string): PushIntent | null {
    this.pending = this.pending.filter(intent => intent.accountId === accountId);
    return this.pending.shift() ?? null;
  }
  clear(): void { this.pending = []; }
}
