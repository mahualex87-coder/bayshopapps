import { Text, View } from 'react-native';
import type { WaitingDetail } from '@/api/operations-normalize';
import { plainServerText } from '@/api/account-operations';
import { useI18n } from '@/i18n/context';
import { useUi } from '@/ui';
import { DetailRow } from './shared';
import { LocalDeliveryDetails } from './ParcelMetadata';

export function StockRequestStatus({ status }: { status?: string | null }) {
  const { t } = useI18n();
  if (status === undefined) return null;
  const key = status === null ? 'notRequested' : ['waiting', 'done', 'canceled'].includes(status) ? status : null;
  return <DetailRow label={t('waitingMeta.declarationRequest')} value={key ? t(`waitingMeta.request.${key}`) : status} />;
}

export function WaitingMetadata({ detail }: { detail: WaitingDetail }) {
  const { s } = useUi();
  const { t } = useI18n();
  const requests = [
    { key: 'photos', value: detail.photosPackageRequested, comment: detail.photosPackageRequestedComments },
    { key: 'verification', value: detail.verificationPackageRequested, comment: detail.verificationPackageRequestedComments },
  ];
  const hasRequests = requests.some(request => request.value !== null || request.comment);
  const packing = detail.autoPacking;
  return <>
    {hasRequests && <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{t('waitingMeta.requests')}</Text>
      {requests.map(request => request.value !== null || request.comment ? <View key={request.key} style={{ gap: 4 }}>
        <DetailRow label={t(`waitingMeta.${request.key}`)} value={request.value === null ? t('live.unavailable') : t(request.value ? 'waitingMeta.request.requested' : 'waitingMeta.request.notRequested')} />
        {request.comment && <Text selectable style={s.body}>{plainServerText(request.comment)}</Text>}
      </View> : null)}
    </View>}
    {packing?.enabled !== null && packing?.enabled !== undefined && <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{t('waitingMeta.autoPacking')}</Text>
      <DetailRow label={t('waitingMeta.state')} value={t(packing.enabled ? 'waitingMeta.enabled' : 'waitingMeta.disabled')} />
      {packing.enabled && packing.insurance !== null && <DetailRow label={t('waitingMeta.insurance')} value={t(packing.insurance ? 'waitingMeta.selected' : 'waitingMeta.notSelected')} />}
    </View>}
    {detail.localDelivery && <LocalDeliveryDetails delivery={detail.localDelivery} />}
  </>;
}
