import type { Incoming, Shipment } from '../state/contracts';
import { parcelStatusTone } from './parcel-status.ts';

// Exact labels of the local prototype model; never infer API status from translated text.
const statusCodes = {
  'Așteptat': 'not-taken',
  'Recepționat': 'in-stock',
  'În pregătire': 'processing',
  'Trimise': 'sent',
  'Reținere vamală': 'customs-held',
  'Primit': 'received',
} satisfies Record<Incoming['status'] | Shipment['status'], string>;

export function legacyParcelStatusTone(status: Incoming['status'] | Shipment['status']) {
  return parcelStatusTone({ status: statusCodes[status] });
}
