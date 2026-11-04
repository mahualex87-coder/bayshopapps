import type { PushDeviceBinding } from '../../api/push-device.ts';
import type { PushPermission } from './native-push.ts';

export type PushRecord = { accountId: string; token?: string } | { cleanup: true };
export type PushSession = { resolved: boolean; accountId: string | null; revision: number };
export type PushState = { busy: boolean; optedIn: boolean; registered: boolean; permission: PushPermission; error: string | null };
type Device = {
  read: () => Promise<PushRecord | null>;
  save: (record: PushRecord | null) => Promise<void>;
  permission: () => Promise<PushPermission>;
  request: () => Promise<PushPermission>;
  token: () => Promise<string>;
  clear: () => Promise<void>;
  bind: (token: string, previousToken: string | undefined, revision: number) => Promise<PushDeviceBinding>;
};
const idle: PushState = { busy: false, optedIn: false, registered: false, permission: 'undetermined', error: null };

export function createPushRegistration(device: Device) {
  let session: PushSession = { resolved: false, accountId: null, revision: 0 };
  let generation = 0;
  let needsCleanup = false;
  let state = idle;
  let binding: { token: string; lease: PushDeviceBinding } | undefined;
  let work = Promise.resolve();
  let queuedRefresh: number | null = null;
  const subscribers = new Set<() => void>();
  function publish(next: Partial<PushState>) {
    state = { ...state, ...next };
    subscribers.forEach(listener => listener());
  }
  // Persist a tombstone before deleting the address. A crash or failed native
  // deletion must finish cleanup before another account can use this installation.
  async function revoke() {
    needsCleanup = true;
    const lease = binding?.lease;
    const remote = Promise.resolve().then(() => lease?.release()).catch(() => {});
    // Even when storage cannot be written, invalidate the actual FCM address.
    try { await device.save({ cleanup: true }); } catch { /* Retry deletion of the record below. */ }
    await device.clear();
    binding = undefined;
    await device.save(null);
    needsCleanup = false;
    await remote;
  }
  type Operation = 'refresh' | 'enable' | 'disable';
  function enqueue(operation: Operation, revokePrevious = false) {
    const revision = generation;
    const scope = session;
    if (operation === 'refresh' && !revokePrevious && queuedRefresh === revision) return work;
    if (operation === 'refresh') queuedRefresh = revision;
    const current = () => revision === generation;
    const run = async () => {
      if (operation === 'refresh' && queuedRefresh === revision) queuedRefresh = null;
      if (operation === 'disable' || needsCleanup) {
        await revoke();
        if (operation === 'disable') {
          if (current()) publish({ ...idle, permission: state.permission });
          return;
        }
      }
      let record: PushRecord | null;
      try { record = await device.read(); }
      catch (error) {
        if (revokePrevious || (scope.resolved && !scope.accountId)) await revoke();
        throw error;
      }
      // Handle completed sign-out even if the next login has already started.
      if ((revokePrevious && (record || binding)) || (record && ('cleanup' in record || (scope.resolved && record.accountId !== scope.accountId)))) {
        await revoke();
        record = null;
      }
      if (!current() || !scope.resolved || !scope.accountId) return;
      publish({ busy: true, error: null });
      let permission = await device.permission();
      if (!current()) return;
      if (operation === 'enable' && permission === 'undetermined') permission = await device.request();
      if (!current()) return;
      publish({ permission });
      if (permission !== 'granted') {
        publish({ optedIn: false, registered: false });
        if (record || binding) await revoke();
        return;
      }
      if (!record && operation !== 'enable') { publish({ optedIn: false, registered: false }); return; }
      const previousToken = record && 'accountId' in record ? record.token : undefined;
      if (!record) await device.save({ accountId: scope.accountId });
      if (!current()) return;
      publish({ optedIn: true });
      // Read the current FCM token even on a refresh callback. A callback queued
      // before sign-out cannot inject the former account's address.
      const token = await device.token();
      if (!current()) return;
      if (!binding || binding.token !== token) {
        const previous = binding;
        const lease = await device.bind(token, previousToken, scope.revision);
        binding = { token, lease };
        if (previous && previous.token !== token) await previous.lease.release().catch(() => {});
      }
      if (!current()) return;
      if (token !== previousToken) await device.save({ accountId: scope.accountId, token });
      if (current()) publish({ registered: true });
    };
    work = work.then(run).catch((error: unknown) => {
      if (!current()) return;
      const failure = error as { key?: string; status?: number } | null;
      const unavailable = failure?.key === 'push.serverUpdate' || failure?.status === 404;
      publish({ registered: false, error: needsCleanup ? 'push.cleanupFailed' : unavailable ? 'push.serverUpdate' : 'push.failed' });
    }).finally(() => { if (current()) publish({ busy: false }); });
    return work;
  }
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    setSession(next: PushSession) {
      const previous = session;
      if (previous.resolved === next.resolved && previous.accountId === next.accountId && previous.revision === next.revision) return work;
      generation++;
      session = next;
      publish({ ...idle, busy: !!next.accountId });
      return enqueue('refresh', !!previous.accountId && (previous.accountId !== next.accountId || previous.revision !== next.revision));
    },
    refresh: () => enqueue('refresh'),
    enable: () => enqueue('enable'),
    disable: () => {
      generation++;
      publish({ busy: true, optedIn: false, registered: false });
      return enqueue('disable');
    },
  };
}
