import type { LiveParcel } from '../../api/contracts.ts';
import { packingEligibility } from '../../api/packing-normalize.ts';

/** Keep invalid IDs visible in the count instead of silently changing the shipment. */
export function warehouseSelection(rows: LiveParcel[], ids: string[]) {
  const selectedIds = [...new Set(ids)];
  const byId = new Map(rows.map(parcel => [parcel.id, parcel]));
  const chosen = selectedIds.map(id => byId.get(id));
  const storageId = chosen.find(parcel => parcel?.storageId)?.storageId ?? null;
  const invalid = chosen.some(parcel => !parcel || packingEligibility(parcel) !== null || parcel.storageId !== storageId);
  return { ids: selectedIds, storageId, invalid, ready: selectedIds.length > 0 && !invalid };
}

export function warehouseSelectionIssue(parcel: LiveParcel, storageId: string | null) {
  return packingEligibility(parcel) || (storageId && parcel.storageId !== storageId ? 'packing.otherWarehouse' : null);
}
