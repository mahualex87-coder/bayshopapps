import { useI18n } from '@/i18n/context';
import { Notice } from '@/ui';

/** Prefer the selected point's exact localized server warning. */
export function ConsolidationNotice({ point, carrierAllowsConsolidation }: {
  point?: { allowConsolidation?: boolean | null; consolidationMessage?: string | null } | null;
  carrierAllowsConsolidation?: boolean | null;
}) {
  const { t } = useI18n();
  if (point?.consolidationMessage) return <Notice>{point.consolidationMessage}</Notice>;
  if (point?.allowConsolidation === false) return <Notice>{t('deliveryChange.noConsolidation')}</Notice>;
  return carrierAllowsConsolidation === false ? <Notice>{t('packing.noConsolidation')}</Notice> : null;
}
