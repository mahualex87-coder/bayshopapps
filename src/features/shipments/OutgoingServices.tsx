import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveAccount } from '@/api/context';
import { changeOutgoingService, outgoingServiceConfirmed, outgoingServiceReview, type OutgoingServiceMutationCommand } from '@/api/outgoing-services';
import { errorMessage } from '@/api/client';
import { useI18n } from '@/i18n/context';
import { Button, Notice, useUi } from '@/ui';
import { displayMoney, ResourceStatus } from '@/features/live/shared';
import { ParcelDetailSection } from '@/features/live/ParcelDetailSection';
import { useOperationView } from '@/features/live/forms/useOperationView';

type Props = { id: string; fresh: boolean; onPending: (value: boolean) => void; onDirty: (value: boolean) => void; onChanged: () => void };
export function OutgoingServices(props: Props) {
  const live = useLiveAccount(); const { language } = useI18n();
  return <Services key={JSON.stringify([props.id, live.accountId, live.accountRevision, language])} {...props} />;
}
function Services({ id, fresh, onPending, onDirty, onChanged }: Props) {
  const live = useLiveAccount(); const { t, formatNumber } = useI18n(); const { s, colors } = useUi();
  const view = useOperationView({ kind: 'outgoing.services', id });
  const [review, setReview] = useState<OutgoingServiceMutationCommand | null>(null);
  const [uncertain, setUncertain] = useState<OutgoingServiceMutationCommand | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [failed, setFailed] = useState(false);
  const submitting = useRef(false); const mounted = useRef(true); const readController = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; readController.current?.abort(); }; }, []);
  useEffect(() => { onDirty(!!review || busy); return () => onDirty(false); }, [review, busy, onDirty]);
  useEffect(() => { onPending(busy); return () => onPending(false); }, [busy, onPending]);
  const enabled = fresh && live.canMutate && !view.resource.loading && !view.resource.error && !busy && !uncertain;
  const readCurrent = () => {
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    return live.readView({ kind: 'outgoing.services', id }, { signal: controller.signal });
  };
  const confirm = async () => {
    if (!review || !enabled || submitting.current) return;
    const command = review; submitting.current = true; setBusy(true); setMessage(null);
    try {
      const result = await changeOutgoingService(command, () => live.mutate(command), readCurrent);
      if (!mounted.current) return;
      setFailed(result.outcome !== 'confirmed');
      if (result.outcome === 'confirmed') { setReview(null); setUncertain(null); setMessage(command.enabled ? 'outgoingServices.requested' : 'outgoingServices.cancelled'); onChanged(); }
      else if (result.outcome === 'unknown') { setReview(null); setUncertain(command); setMessage('outgoingServices.unknown'); }
      else { setReview(null); setMessage(result.error || 'errors.saveFailed'); }
      await view.refresh();
    } finally { submitting.current = false; if (mounted.current) setBusy(false); }
  };
  const reconcile = async () => {
    if (!uncertain || busy || live.mutationPending || submitting.current) return;
    submitting.current = true; setBusy(true);
    try {
      const data = await readCurrent(); if (!mounted.current) return;
      if (outgoingServiceConfirmed(uncertain, data)) { setMessage(uncertain.enabled ? 'outgoingServices.requested' : 'outgoingServices.cancelled'); setFailed(false); setUncertain(null); onChanged(); }
      else { setMessage('outgoingServices.unknown'); setFailed(true); }
      await view.refresh();
    } catch (error) { if (mounted.current) { setFailed(true); setMessage(errorMessage(error)); } }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  };
  return <ParcelDetailSection title={t('outgoingServices.title')} icon="options-outline">
    <ResourceStatus resource={view.resource} onRefresh={() => { if (!busy) void view.refresh(); }} />
    {view.resource.data?.length === 0 && !view.resource.loading && !view.resource.error && <Text style={s.small}>{t('outgoingServices.empty')}</Text>}
    {view.resource.data?.map(item => {
      const selected = review?.service === item.key; const isComplete = item.state === 'completed';
      const canRequest = item.canRequest && item.price !== null && !!item.currency;
      return <View key={item.key} style={[s.card, { gap: 10 }]}>
        <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}><Ionicons accessible={false} name={item.key === 'invoice-creation' ? 'document-text-outline' : item.key === 'hold-parcel' ? 'pause-circle-outline' : 'return-down-back-outline'} size={22} color={colors.accent} /><Text style={[s.heading, { flex: 1 }]}>{item.title}</Text></View>
        {item.description && <Text style={s.body}>{item.description}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[s.small, isComplete && { color: colors.success, fontWeight: '700' }]}>{t(`outgoingServices.state.${item.state}`)}</Text>
          <Text style={[s.body, { fontWeight: '600' }]}>{item.price === null || !item.currency ? t('outgoingServices.priceUnavailable') : displayMoney(item.price, item.currency, formatNumber)}</Text>
        </View>
        {selected ? <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.soft }}>
          <Text style={s.body}>{t(review.enabled ? 'outgoingServices.confirmRequest' : 'outgoingServices.confirmCancel', { title: item.title, price: item.price === null ? '' : displayMoney(item.price, item.currency, formatNumber) })}</Text>
          <Button disabled={!enabled} onPress={() => { void confirm(); }}>{t(busy ? 'outgoingServices.saving' : review.enabled ? 'outgoingServices.confirm' : 'outgoingServices.confirmCancellation')}</Button>
          <Button secondary disabled={busy} onPress={() => setReview(null)}>{t('outgoingServices.back')}</Button>
        </View> : <>
          {canRequest && <Button disabled={!enabled} onPress={() => { setReview({ kind: 'outgoing.service.set', id, service: item.key, enabled: true, review: outgoingServiceReview(item) }); setMessage(null); }}>{t('outgoingServices.request')}</Button>}
          {item.canCancel && <Button secondary disabled={!enabled} onPress={() => { setReview({ kind: 'outgoing.service.set', id, service: item.key, enabled: false, review: outgoingServiceReview(item) }); setMessage(null); }}>{t('outgoingServices.cancel')}</Button>}
          {!canRequest && !item.canCancel && !isComplete && <Text style={s.small}>{t(item.mutationMode ? 'outgoingServices.statusRestricted' : 'outgoingServices.unavailable')}</Text>}
        </>}
      </View>;
    })}
    {message && <Notice error={failed}>{t(message)}</Notice>}
    {uncertain && <Button secondary disabled={busy || live.mutationPending} onPress={() => { void reconcile(); }}>{t('outgoingServices.check')}</Button>}
  </ParcelDetailSection>;
}
