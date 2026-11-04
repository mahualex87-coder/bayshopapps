import { Notice } from '@/ui';
import { useI18n } from '@/i18n/context';
import type { PickupMapProps } from './pickup-map-types';

// Web previews retain the point list and official directions link. Native
// builds use the supported Google Maps SDK in PickupMap.native.tsx.
export function PickupMap(_props: PickupMapProps) {
  const { t } = useI18n();
  return <Notice>{t('pickup.mapWeb')}</Notice>;
}
