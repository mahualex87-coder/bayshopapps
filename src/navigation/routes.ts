import type { DemoState } from '../state/contracts';

export type ParcelSection = 'waiting' | 'warehouse' | 'shipments' | 'received';
const normalizePath = (path: string) => path.split(/[?#]/)[0].replace(/\/$/, '') || '/';

export function activeParcelSection(path: string, shipments: Pick<DemoState['shipments'][number], 'id' | 'status'>[]): ParcelSection | null {
  const pathname = normalizePath(path);
  if (pathname === '/waiting' || pathname.startsWith('/incoming/')) return 'waiting';
  if (pathname === '/warehouse' || pathname.startsWith('/warehouse/') || pathname === '/shipment/new') return 'warehouse';
  if (pathname === '/shipments') return 'shipments';
  if (pathname === '/received') return 'received';
  if (pathname.startsWith('/shipment/')) {
    let id: string;
    try { id = decodeURIComponent(pathname.slice('/shipment/'.length)); } catch { return null; }
    const shipment = shipments.find(item => item.id === id);
    return shipment ? shipment.status === 'Primit' ? 'received' : 'shipments' : null;
  }
  return null;
}

/** A loaded live detail can be newer than the cached list, or absent from its
 * selected country. Its section parameter is updated from the detail response. */
export function activeLiveParcelSection(path: string, shipments: Pick<DemoState['shipments'][number], 'id' | 'status'>[], section?: string): ParcelSection | null {
  const pathname = normalizePath(path);
  if (pathname.startsWith('/shipment/') && pathname !== '/shipment/new' && (section === 'received' || section === 'shipments')) {
    try { if (decodeURIComponent(pathname.slice('/shipment/'.length))) return section; } catch { return null; }
  }
  return activeParcelSection(path, shipments);
}

export const primaryPaths = ['/', '/waiting', '/warehouse', '/shipments', '/received', '/shopping', '/shops', '/refunds', '/account', '/cart', '/balance', '/payments', '/loyalty', '/warehouse-addresses', '/address-book', '/calculator', '/notifications', '/settings', '/support'];
export function isDetailPath(path: string) { return !primaryPaths.includes(normalizePath(path)); }
