export type BrightnessAdapter = {
  available: () => Promise<boolean>;
  get: () => Promise<number>;
  set: (value: number) => Promise<void>;
  usingSystem?: () => Promise<boolean>;
  restoreSystem?: () => Promise<void>;
};

/** Serializes native operations across rapid modal opens/closes and AppState
 * transitions. A retiring modal cannot restore over a newer active modal. */
export function createQrBrightnessController(adapter: BrightnessAdapter) {
  const owners = new Map<symbol, boolean>();
  let previous: { value: number; system: boolean } | null = null;
  let queue = Promise.resolve();
  const active = () => [...owners.values()].some(Boolean);
  const restore = async () => {
    if (!previous) return;
    const saved = previous;
    if (saved.system && adapter.restoreSystem) await adapter.restoreSystem();
    else await adapter.set(saved.value);
    previous = null;
  };
  const sync = async () => {
    if (active() && previous === null) {
      if (!await adapter.available() || !active()) return;
      const value = await adapter.get();
      const system = adapter.usingSystem ? await adapter.usingSystem() : false;
      if (!active()) return;
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Brightness unavailable');
      previous = { value, system };
      try { await adapter.set(1); }
      catch (error) { await restore(); throw error; }
    }
    if (!active()) await restore();
  };
  const schedule = () => {
    const result = queue.then(sync);
    queue = result.catch(() => {});
    return result;
  };
  return {
    acquire(initiallyActive: boolean) {
      const owner = Symbol('pickup QR');
      owners.set(owner, initiallyActive);
      const ready = schedule();
      return {
        ready,
        setActive(value: boolean) {
          if (!owners.has(owner)) return Promise.resolve();
          owners.set(owner, value);
          return schedule();
        },
        release() {
          owners.delete(owner);
          return schedule();
        },
      };
    },
  };
}
