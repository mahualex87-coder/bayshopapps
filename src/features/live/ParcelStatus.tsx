import { ParcelStatusBadge } from '@/components/ParcelStatusBadge';
import { parcelStatusTone, type ParcelStatusSource } from '@/domain/parcel-status';
import { useI18n } from '@/i18n/context';

export const knownParcelStatuses = new Set(['processing', 'awaiting-invoice', 'held-by-damage', 'held-by-prohibition', 'hold-by-user', 'packed', 'sent', 'customs-held', 'local-depo', 'taken-to-delivery', 'received', 'ready-to-pickup', 'in-stock', 'waiting', 'not-taken']);
export function parcelStatusLabel(parcel: ParcelStatusSource, t: (key: string) => string): string {
  if (parcel.restrictions?.heldByProhibition === true) return t('status.held-by-prohibition');
  if (parcel.restrictions?.heldByDamage === true) return t('status.held-by-damage');
  if (parcel.status && knownParcelStatuses.has(parcel.status)) return t(`status.${parcel.status}`);
  if (parcel.status === 'held-by-missing') return parcel.statusLabel || t('status.held');
  return parcel.statusLabel || parcel.status || (parcel.stage ? t(`stage.${parcel.stage}`) : t('common.unavailable'));
}
export function ParcelStatus({ parcel }: { parcel: ParcelStatusSource }) {
  const { t } = useI18n();
  return <ParcelStatusBadge label={parcelStatusLabel(parcel, t)} tone={parcelStatusTone(parcel)} />;
}
