export type Coordinates = { latitude: number; longitude: number };
export type PickupPoint = {
  id: string;
  address: string;
  coordinates?: Coordinates | null;
  eligible?: boolean;
  /** Display only: prepared from the current server quote by the owning form. */
  priceLabel?: string | null;
  allowConsolidation?: boolean | null;
  consolidationMessage?: string | null;
};
const coordinate = (value: unknown, limit: number): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) return null;
  const parsed = Number(value); return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
};
/** Invalid/missing map data never removes an otherwise selectable pickup point. */
export function pickupCoordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  const lat = coordinate(latitude, 90), lng = coordinate(longitude, 180);
  return lat === null || lng === null ? null : { latitude: lat, longitude: lng };
}
export function distanceMetres(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180, lat = (b.latitude - a.latitude) * rad, lng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function nearestPickup(points: readonly PickupPoint[], origin: Coordinates): { point: PickupPoint; distance: number } | null {
  if (!pickupCoordinates(origin.latitude, origin.longitude)) return null;
  let result: { point: PickupPoint; distance: number } | null = null;
  for (const point of points) {
    if (point.eligible === false || !point.coordinates || !pickupCoordinates(point.coordinates.latitude, point.coordinates.longitude)) continue;
    const distance = distanceMetres(origin, point.coordinates);
    if (!result || distance < result.distance) result = { point, distance };
  }
  return result;
}
export type PickupLocationDevice = {
  requestPermission(): Promise<boolean>;
  getPosition(signal?: AbortSignal): Promise<Coordinates>;
  /** Bounded, recent and sufficiently accurate position; null on cache miss. */
  getLastKnownPosition?(): Promise<Coordinates | null>;
};
type LocatedPickup = { kind: 'selected'; point: PickupPoint; distance: number; origin: Coordinates };
export async function findNearestPickup(points: readonly PickupPoint[], device: PickupLocationDevice & { isCurrent(): boolean; signal?: AbortSignal; onInterim?(result: LocatedPickup): void }): Promise<LocatedPickup | { kind: 'denied' | 'cancelled' | 'unavailable' }> {
  if (!device.isCurrent()) return { kind: 'cancelled' };
  const granted = await device.requestPermission();
  if (!device.isCurrent()) return { kind: 'cancelled' };
  if (!granted) return { kind: 'denied' };
  let finished = false;
  let interim: LocatedPickup | null = null;
  const fromPosition = (position: Coordinates): LocatedPickup | null => {
    const nearest = nearestPickup(points, position);
    return nearest ? { kind: 'selected', ...nearest, origin: { latitude: position.latitude, longitude: position.longitude } } : null;
  };
  // Start the current fix immediately: a slow cache must not delay fresh GPS.
  const fresh = device.getPosition(device.signal);
  const cached = device.getLastKnownPosition?.().then(position => {
    if (finished || !device.isCurrent() || !position) return;
    interim = fromPosition(position);
    if (interim) device.onInterim?.(interim);
  }).catch(() => {});
  try {
    const position = await fresh;
    if (!device.isCurrent()) return { kind: 'cancelled' };
    return fromPosition(position) || { kind: 'unavailable' };
  } catch (error) {
    // A failed refresh must not discard a useful recent position already shown.
    await cached;
    if (!device.isCurrent()) return { kind: 'cancelled' };
    if (interim) return interim;
    throw error;
  } finally { finished = true; }
}

/** Country translations and server labels do not restart a location request. */
export function pickupLocationScope(points: readonly PickupPoint[]): string {
  return JSON.stringify(points.map(point => [point.id, point.coordinates?.latitude ?? null, point.coordinates?.longitude ?? null, point.eligible !== false]).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en')));
}

export function canAutomaticallyLocatePickup(options: { selectedId: string; disabled: boolean; focused: boolean; foreground: boolean; attempted: boolean; points: readonly PickupPoint[] }): boolean {
  return !options.selectedId && !options.disabled && options.focused && options.foreground && !options.attempted
    && options.points.some(point => point.eligible !== false && point.coordinates && pickupCoordinates(point.coordinates.latitude, point.coordinates.longitude));
}

export type PickupCameraTarget = { kind: 'fit'; coordinates: Coordinates[] } | { kind: 'region'; center: Coordinates; delta: number } | null;
/** Fit only the actual user and selection. A large network of points must not
 * zoom the camera out to an entire country or include unavailable locations. */
export function pickupCameraTarget(points: readonly PickupPoint[], selectedId: string, userLocation?: Coordinates | null): PickupCameraTarget {
  const valid = (coordinates?: Coordinates | null) => coordinates ? pickupCoordinates(coordinates.latitude, coordinates.longitude) : null;
  const selected = valid(points.find(point => point.id === selectedId)?.coordinates);
  const user = valid(userLocation);
  if (selected && user && distanceMetres(user, selected) > 80) return { kind: 'fit', coordinates: [user, selected] };
  const center = selected ?? user ?? valid(points.find(point => point.eligible !== false && valid(point.coordinates))?.coordinates) ?? valid(points.find(point => valid(point.coordinates))?.coordinates);
  return center ? { kind: 'region', center, delta: selected || user ? 0.008 : 0.05 } : null;
}
/** Official Google Maps URLs require no key. Omit origin so Google handles it;
 * the user's coordinates never enter links, logs, persistence or the BayShop API. */
export function pickupDirectionsUrl(point: PickupPoint): string {
  const destination = point.coordinates ? `${point.coordinates.latitude},${point.coordinates.longitude}` : point.address;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`;
}
