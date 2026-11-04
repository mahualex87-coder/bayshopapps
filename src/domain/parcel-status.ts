export type ParcelStatusTone = 'danger' | 'warning' | 'success' | 'neutral';
export type ParcelStatusSource = {
  status?: string | null;
  statusLabel?: string | null;
  stage?: 'waiting' | 'warehouse' | 'sent' | 'received';
  declared?: boolean | null;
  restrictions?: { heldByDamage?: boolean | null; heldByProhibition?: boolean | null; packingDenied?: boolean | null };
};

// Codes from wpPackage::getStatus/getListStatuses. The API adapter supplies the
// effective currentStatus; translated labels and external tracking are not state.
const held = new Set(['held', 'held-by-damage', 'held-by-prohibition', 'held-by-missing', 'customs-held', 'held-by-customs', 'hold-by-user', 'dept', 'dept-storage', 'package-exceeded', 'disposed', 'disposed-by-user']);
const intermediate = new Set(['waiting', 'not-taken', 'awaiting', 'awaiting-invoice', 'order-invoice', 'packed', 'in-pallet', 'ready-to-send', 'reinclude-request', 'undeclared', 'packing-denied']);
const active = new Set(['processing', 'processing-storage', 'unheld-by-user', 'sent', 'sent-storage', 'sent-transit', 'local-depo', 'transit-depo', 'taken-to-delivery', 'ready-to-pickup', 'from-customs-to-depo', 'received', 'in-stock', 'declared']);

export function parcelStatusTone(parcel: ParcelStatusSource): ParcelStatusTone {
  const restrictions = parcel.restrictions;
  if (restrictions?.heldByDamage === true || restrictions?.heldByProhibition === true) return 'danger';
  if (parcel.status && held.has(parcel.status)) return 'danger';
  // packingDenied means waiting for all order items, not a customs/prohibition hold.
  if (parcel.stage === 'warehouse' && (restrictions?.packingDenied === true || parcel.declared === false)) return 'warning';
  if (parcel.status) {
    if (intermediate.has(parcel.status)) return 'warning';
    if (active.has(parcel.status)) return 'success';
    return 'neutral';
  }
  if (parcel.stage === 'waiting') return 'warning';
  if (parcel.stage === 'received') return 'success';
  if (parcel.stage === 'warehouse' && parcel.declared === true) return 'success';
  return 'neutral';
}
