import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ShipmentOperationDetail } from '@/api/operations-normalize';
import { RemotePageButton } from '@/features/content/RemotePageButton';
import { ParcelStatusBadge } from '@/components/ParcelStatusBadge';
import { parcelStatusTone, type ParcelStatusTone } from '@/domain/parcel-status';
import { useI18n } from '@/i18n/context';
import { useTheme } from '@/theme/context';
import { parcelStatusColors } from '@/theme/parcel-status';
import { Button, minTouchTarget, useUi } from '@/ui';
import { useOperationView } from './forms/useOperationView';
import { parcelStatusLabel } from './ParcelStatus';

function ShipmentMilestones({ events }: { events: ShipmentOperationDetail['events'] }) {
  const { s } = useUi();
  const { t, formatDate, formatTime } = useI18n();
  if (!events.length) return null;
  return <View style={{ gap: 10 }}>
    <Text style={[s.small, { fontWeight: '600' }]}>{t('shipmentTracking.milestones')}</Text>
    {events.map((event, index) => <View key={`${index}:${event.date}`} style={{ gap: 3 }}><Text style={s.body}>{event.labelKey ? t(event.labelKey) : event.label}</Text><Text style={s.small}>{[formatDate(event.date), /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(event.date) ? formatTime(event.date) : null].filter(Boolean).join(' · ')}</Text></View>)}
  </View>;
}

/** The same checkpoint feed used by the web tracking popover. This optional
 * reader is mounted only on expansion and never blocks navigation/launch. */
function ShipmentTimeline({ uid, color, events }: { uid: string; color: string; events: ShipmentOperationDetail['events'] }) {
  const { s, colors } = useUi();
  const { t, formatDate, formatTime } = useI18n();
  const { resource, refresh } = useOperationView({ kind: 'shipment.tracking.read', uid }, { pageLoad: false });
  const loading = resource.loading || (!resource.data && !resource.error);
  if (loading && !resource.data) return <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={color} size="small" /><Text style={s.small}>{t('shipmentTracking.loading')}</Text></View>;
  if (resource.error) return <View style={{ gap: 8 }}><Text accessibilityLiveRegion="polite" style={[s.small, { color: colors.error }]}>{t(resource.error)}</Text><Button secondary onPress={() => { void refresh(); }}>{t('live.retry')}</Button><ShipmentMilestones events={events} /></View>;
  if (!resource.data?.checkpoints.length) return <View style={{ gap: 8 }}><Text style={s.small}>{t('shipmentTracking.empty')}</Text><ShipmentMilestones events={events} /></View>;
  return <View style={styles.timeline}>
    {resource.data.checkpoints.map((event, index) => {
      // SQL timestamps are server wall-clock times; the existing formatters
      // preserve those rather than shifting them into the device timezone.
      const date = event.dateTime;
      const hasTime = !!date && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(date);
      const time = hasTime ? formatTime(date) : event.time && /^\d{2}:\d{2}(?::\d{2})?$/.test(event.time) ? event.time : null;
      const stamp = date ? [formatDate(date), time].filter(Boolean).join(' · ') : event.time;
      const carrier = event.courier?.title || event.courier?.name || resource.data?.serviceName;
      return <View key={`${index}:${date}:${event.status}`} style={styles.event}>
        <View accessible={false} aria-hidden style={styles.rail}>
          {index < resource.data!.checkpoints.length - 1 && <View style={[styles.connector, { backgroundColor: color }]} />}
          <View style={[styles.dot, { borderColor: color, backgroundColor: index === 0 ? color : colors.surface }]} />
        </View>
        <View style={styles.eventText}>
          <Text style={[s.body, { fontWeight: index === 0 ? '700' : '600' }]}>{event.status || t('live.unavailable')}</Text>
          {event.location && <Text selectable style={s.small}>{event.location}</Text>}
          <View style={styles.eventMeta}>{stamp && <Text style={s.small}>{stamp}</Text>}{carrier && <Text style={s.small}>{carrier}</Text>}</View>
        </View>
      </View>;
    })}
  </View>;
}

export function ShipmentTracking({ data }: { data: ShipmentOperationDetail }) {
  const { s, colors } = useUi();
  const { scheme } = useTheme();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const progress = data.progress;
  const tone: ParcelStatusTone = progress?.type === 'danger' || progress?.type === 'warning' || progress?.type === 'success' ? progress.type : parcelStatusTone(data);
  const tint = parcelStatusColors[scheme][tone];
  const label = progress?.label || parcelStatusLabel(data, t);
  const percent = progress?.percent;
  const uid = data.uid?.trim();
  const tracking = data.tracking?.trim();
  // Some legacy carriers put their URL in `tracking`; it is not a number.
  const number = tracking && !/^https?:\/\//i.test(tracking) ? tracking : uid;
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('shipmentTracking.title')}</Text>
    <View style={styles.status}><ParcelStatusBadge label={label} tone={tone} /></View>
    {percent != null && <View accessibilityRole="progressbar" accessibilityLabel={t('shipmentTracking.title')} accessibilityValue={{ min: 0, max: 100, now: percent, text: label }} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={label} style={[styles.track, { backgroundColor: colors.border }]}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: tint.text }]} />
    </View>}
    {uid && <Pressable accessibilityRole="button" accessibilityLabel={t('shipmentTracking.open', { number: number! })} accessibilityState={{ expanded }} aria-expanded={expanded} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.trackingButton, { backgroundColor: colors.soft }, pressed && s.pressed]}>
      <Ionicons name="locate-outline" size={19} color={tint.text} accessible={false} aria-hidden />
      <View style={styles.trackingText}><Text style={s.small}>{t(number === uid ? 'shipmentTracking.number' : 'live.parcel.tracking')}</Text><Text style={[s.body, { color: tint.text, fontWeight: '700' }]}>{number}</Text></View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} accessible={false} aria-hidden />
    </Pressable>}
    {!uid && number && <View style={{ gap: 3 }}><Text style={s.small}>{t('live.parcel.tracking')}</Text><Text selectable style={s.body}>{number}</Text></View>}
    {progress?.storageDaysLabel && <Text style={[s.small, { color: tint.text }]}>{progress.storageDaysLabel}</Text>}
    {expanded && uid && <ShipmentTimeline key={uid} uid={uid} color={tint.text} events={data.events} />}
    {!uid && <ShipmentMilestones events={data.events} />}
    {(expanded || !uid) && data.trackingUrl && <RemotePageButton url={data.trackingUrl} label={t('shipmentTracking.carrierLink')} />}
  </View>;
}

const styles = StyleSheet.create({
  status: { alignSelf: 'center', maxWidth: '100%' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  trackingButton: { minHeight: minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12 },
  trackingText: { flex: 1, minWidth: 0, gap: 2 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  timeline: { paddingTop: 4 },
  event: { flexDirection: 'row', gap: 10 },
  rail: { width: 16, alignItems: 'center' },
  connector: { position: 'absolute', top: 14, bottom: -4, width: 2 },
  dot: { width: 14, height: 14, marginTop: 4, borderWidth: 2, borderRadius: 7 },
  eventText: { flex: 1, minWidth: 0, gap: 4, paddingBottom: 18 },
  eventMeta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 3 },
});
