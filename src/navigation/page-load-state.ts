/** A screen owns its requests. Hidden/back-stack screens cannot block another
 * screen, and settling a superseded request cannot remove a newer one. */
export class PageLoadState {
  private tasks = new Map<string, boolean>();
  private listeners = new Set<() => void>();
  private snapshot = { pending: 0, blocking: 0 };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  set = (id: string, pending: boolean, blocking: boolean) => {
    if (pending) this.tasks.set(id, blocking); else this.tasks.delete(id);
    const next = { pending: this.tasks.size, blocking: [...this.tasks.values()].filter(Boolean).length };
    if (next.pending === this.snapshot.pending && next.blocking === this.snapshot.blocking) return;
    this.snapshot = next;
    this.listeners.forEach(listener => listener());
  };
  remove = (id: string) => this.set(id, false, false);
}

type InitialResource = { data: unknown; error: string | null };
export function initialAccountPending(account: {
  authenticated: boolean;
  resources: Record<'profile' | 'balance' | 'waiting' | 'warehouse' | 'sent' | 'received', InitialResource>;
  parcelPages: { received: { overallTotal: number | null } };
}) {
  if (!account.authenticated) return false;
  const missing = (resource: InitialResource) => resource.data === null && resource.error === null;
  return (['profile', 'balance', 'waiting', 'warehouse', 'sent'] as const).some(key => missing(account.resources[key]))
    // Received history is intentionally NOT downloaded at launch.
    || account.parcelPages.received.overallTotal === null && missing(account.resources.received);
}
