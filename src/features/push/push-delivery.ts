import { parsePushIntent, PushInbox, pushDestination, type PushIntent } from './push-intent.ts';
import type { PushState } from './push-registration.ts';

type Scope = { accountId: string | null; revision: number; signedOut: boolean };
type Message = Parameters<typeof parsePushIntent>[0];

/** Hold taps in memory during launch. Foreground receipt only updates the banner. */
export class PushDelivery {
  private scope: Scope = { accountId: null, revision: 0, signedOut: false };
  private inbox = new PushInbox();
  private bannersSeen = new Set<string>();
  private listeners = new Set<() => void>();
  private view: { banner: PushIntent | null } = { banner: null };
  private status: () => PushState;

  constructor(status: () => PushState) { this.status = status; }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private notify(banner: PushIntent | null) {
    this.view = { banner };
    this.listeners.forEach(listener => listener());
  }
  setScope(scope: Scope) {
    if (scope.signedOut || this.scope.revision !== scope.revision || (this.scope.accountId && this.scope.accountId !== scope.accountId)) {
      this.clear();
      this.bannersSeen.clear();
    }
    this.scope = scope;
  }
  clear() {
    this.inbox.clear();
    this.dismiss();
  }
  dismiss = () => { if (this.view.banner) this.notify(null); };
  current = (owner: string, revision: number) =>
    this.scope.accountId === owner && this.scope.revision === revision && this.status().optedIn;

  message = (message: Message) => {
    const intent = parsePushIntent(message);
    if (!intent || !this.current(intent.accountId, this.scope.revision)) return;
    const key = intent.accountId + '/' + intent.eventId;
    if (this.bannersSeen.has(key)) return;
    this.bannersSeen.add(key);
    if (this.bannersSeen.size > 256) this.bannersSeen.delete(this.bannersSeen.values().next().value!);
    this.notify(intent);
  };
  opened = (message: Message) => {
    const intent = parsePushIntent(message);
    if (intent) this.open(intent);
  };
  open = (intent: PushIntent) => {
    if (this.scope.signedOut || (this.scope.accountId && this.scope.accountId !== intent.accountId)) return;
    const status = this.status();
    if (this.scope.accountId && !status.busy && !status.optedIn) return;
    if (this.inbox.offer(intent)) this.notify(this.view.banner?.eventId === intent.eventId ? null : this.view.banner);
    else if (this.view.banner?.eventId === intent.eventId) this.dismiss();
  };
  // If distinct taps raced launch, honor the latest one without opening
  // several screens or showing several unsaved-draft prompts.
  take(owner: string, revision: number) {
    if (!this.current(owner, revision)) return null;
    let latest: PushIntent | null = null;
    let intent = this.inbox.take(owner);
    while (intent) { latest = intent; intent = this.inbox.take(owner); }
    return latest && pushDestination(latest, owner);
  }
}
