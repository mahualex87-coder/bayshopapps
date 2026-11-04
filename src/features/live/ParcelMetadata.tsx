import { Text, View } from 'react-native';
import { ServiceIdentity } from '@/components/ServiceIdentity';
import type { LiveParcelDetail, LiveParcelDimensions } from '@/api/contracts';
import type { ShipmentOperationDetail } from '@/api/operations-normalize';
import { plainServerText } from '@/api/account-operations';
import { useI18n } from '@/i18n/context';
import { useUi } from '@/ui';
import { DetailRow, displayMoney } from './shared';
import { RemoteDocumentButton } from './forms/ParcelContent';
import { postalAddressFields } from './address-fields';

export function DimensionsRow({ dimensions, compact = false }: { dimensions?: LiveParcelDimensions | null; compact?: boolean }) {
  const { t, formatNumber } = useI18n();
  const { s } = useUi();
  if (!dimensions) return null;
  const values = [dimensions.x, dimensions.y, dimensions.z].map(value => value === null ? '—' : formatNumber(value, { maximumFractionDigits: 2 })).join(' × ');
  if (compact) return <View style={{ gap: 3 }}><Text style={s.small}>{t('parcelMeta.dimensions')}</Text><Text selectable style={s.body}>{t('parcelMeta.dimensionsCm', { values })}</Text></View>;
  return <DetailRow label={t('parcelMeta.dimensions')} value={t('parcelMeta.dimensionsCm', { values })} />;
}

export function LocalDeliveryDetails({ delivery }: { delivery: NonNullable<ShipmentOperationDetail['localDelivery']> }) {
  const { s } = useUi();
  const { t, formatNumber } = useI18n();
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('parcelDetail.localDestination')}</Text>
    {delivery.title && <ServiceIdentity title={delivery.title} textStyle={s.heading} />}
    <DetailRow label={t('field.address')} value={delivery.address} />
    {delivery.country && <DetailRow label={t('field.country')} value={delivery.country} country />}
    {delivery.phone && <DetailRow label={t('field.phone')} value={delivery.phone} />}
    {postalAddressFields(delivery.addressFields).filter(field => ![delivery.address, delivery.country, delivery.phone].includes(field.value)).map((field, index) => <DetailRow key={`${index}:${field.label}`} label={field.labelKey ? t(field.labelKey) : field.label} value={field.value} country={field.labelKey === 'field.country'} />)}
    {delivery.weekdaysHours && <DetailRow label={t('parcelDetail.weekdaysHours')} value={delivery.weekdaysHours} />}
    {delivery.weekendHours && <DetailRow label={t('parcelDetail.weekendHours')} value={delivery.weekendHours} />}
    {delivery.coordinates && <DetailRow label={t('parcelDetail.coordinates')} value={[delivery.coordinates.latitude, delivery.coordinates.longitude].map(value => value === null ? t('live.unavailable') : formatNumber(value, { maximumFractionDigits: 8 })).join(', ')} />}
    {delivery.postCode && <DetailRow label={t('parcelDetail.pickupPointCode')} value={delivery.postCode} />}
    {delivery.status && <DetailRow label={t('parcelDetail.localDeliveryStatus')} value={delivery.status} />}
    {delivery.qrCode && <DetailRow label={t('parcelDetail.pickupCode')} value={delivery.qrCode} />}
    {delivery.qrImageUrl && <RemoteDocumentButton url={delivery.qrImageUrl} label={t('parcelDetail.pickupQr')} />}
  </View>;
}

export function ShipmentServiceDetails({ data }: { data: LiveParcelDetail }) {
  const { s } = useUi();
  const { t, formatNumber } = useI18n();
  if (!data.additionalServices?.length) return null;
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('parcelMeta.serviceBreakdown')}</Text>
    <Text style={s.small}>{t('parcelMeta.serviceBreakdownHint')}</Text>
    {data.additionalServices.map((service, index) => <View key={`${index}:${service.key || ''}`} style={{ gap: 4 }}>
      <DetailRow label={service.title ? plainServerText(service.title) : t('parcelMeta.service')} value={service.amount === null ? t('live.unavailable') : displayMoney(service.amount, data.currency, formatNumber)} />
      {service.active !== null && <Text style={s.small}>{t(service.active ? 'parcelMeta.serviceActive' : 'parcelMeta.serviceInactive')}</Text>}
      {service.description && <Text selectable style={s.body}>{plainServerText(service.description)}</Text>}
    </View>)}
  </View>;
}
