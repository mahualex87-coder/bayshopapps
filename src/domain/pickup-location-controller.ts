import { canAutomaticallyLocatePickup, findNearestPickup, pickupLocationScope, type Coordinates, type PickupPoint, type PickupLocationDevice } from './pickup-points.ts';

type Configuration = { points: readonly PickupPoint[]; selectedId: string; disabled: boolean; focused: boolean; foreground: boolean; onSelect(id: string): void };
type Snapshot = { locating: boolean; error: string | null; origin: Coordinates | null; recenterKey: number };

/** A request lease prevents late GPS from replacing a manual choice, another
 * carrier's point, or a saved setting. Position is memory-only. */
export function createPickupLocationController(device: PickupLocationDevice) {
  let configuration: Configuration | null = null;
  let scope = '', context = '', revision = 0, active = true;
  let snapshot: Snapshot = { locating: false, error: null, origin: null, recenterKey: 0 };
  const attempted = new Set<string>();
  const listeners = new Set<() => void>();
  let abort: AbortController | null = null;
  let selectionEcho: { revision: number; id: string } | null = null;
  const update = (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener(); };
  const invalidate = () => { revision++; selectionEcho = null; abort?.abort(); abort = null; };
  const usable = () => active && configuration && !configuration.disabled && configuration.focused && configuration.foreground;
  const locate = async (automatic: boolean) => {
    if (!usable() || snapshot.locating || !configuration) return;
    const selectedConfiguration = configuration;
    if (automatic && !canAutomaticallyLocatePickup({ ...configuration, attempted: attempted.has(scope) })) return;
    attempted.add(scope);
    const request = ++revision;
    abort?.abort();
    const requestAbort = new AbortController(); abort = requestAbort;
    selectionEcho = null;
    const current = () => request === revision && Boolean(usable());
    let appliedId: string | null = null;
    const apply = (result: { point: PickupPoint; origin: Coordinates }) => {
      if (!current()) return;
      update({ origin: result.origin, recenterKey: snapshot.recenterKey + (!automatic && appliedId === null ? 1 : 0) });
      if (appliedId !== result.point.id) {
        appliedId = result.point.id;
        selectionEcho = { revision: request, id: result.point.id };
        configuration?.onSelect(result.point.id);
      }
    };
    update({ locating: true, error: null });
    try {
      const result = await findNearestPickup(selectedConfiguration.points, { ...device, signal: requestAbort.signal, isCurrent: current, onInterim: apply });
      if (!current() || result.kind === 'cancelled') return;
      if (result.kind === 'denied') { update({ error: 'pickup.locationDenied' }); return; }
      if (result.kind === 'unavailable') { update({ error: 'pickup.noCoordinates' }); return; }
      if (result.kind === 'selected') apply(result);
    } catch { if (current()) update({ error: 'pickup.locationFailed' }); }
    finally { if (abort === requestAbort) abort = null; if (current()) update({ locating: false }); }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure(next: Configuration) {
      active = true;
      const nextScope = pickupLocationScope(next.points);
      const nextContext = JSON.stringify([nextScope, next.selectedId, next.disabled, next.focused, next.foreground]);
      // The parent's acknowledgement of our cached selection must not cancel
      // the fresh fix. Every other selection/context change still revokes it.
      const ownEcho = selectionEcho?.revision === revision && selectionEcho.id === next.selectedId && nextScope === scope && configuration?.disabled === next.disabled && configuration.focused === next.focused && configuration.foreground === next.foreground;
      configuration = next;
      if (nextContext !== context) {
        if (!ownEcho) { invalidate(); update({ locating: false, error: null }); }
        context = nextContext; scope = nextScope;
      }
      if (ownEcho) selectionEcho = null;
      // Do not later auto-fill a saved/manual choice which was cleared by its owner.
      if (next.selectedId) attempted.add(scope);
      // Defer until committed effects settle; Strict Mode's setup/cleanup cycle
      // must not open two OS permission prompts or consume the first attempt.
      const configuredRevision = revision;
      queueMicrotask(() => { if (active && revision === configuredRevision) void locate(true); });
    },
    choose(id: string) {
      if (!usable() || !configuration) return;
      invalidate(); attempted.add(scope);
      const point = configuration.points.find(item => item.id === id);
      if (!point || point.eligible === false) { update({ locating: false, error: point?.consolidationMessage || 'pickup.ineligible' }); return; }
      update({ locating: false, error: null, recenterKey: snapshot.recenterKey + 1 });
      configuration.onSelect(id);
    },
    nearest: () => locate(false),
    pause() { invalidate(); update({ locating: false }); },
    dispose() { active = false; invalidate(); configuration = null; attempted.clear(); snapshot = { locating: false, error: null, origin: null, recenterKey: 0 }; },
  };
}
