import { mergeStockServiceStates, needsLegacyStockStates } from '@/api/stock-service-status';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { StockDetail } from '@/api/operations-normalize';
import { plainServerText } from '@/api/account-operations';
import { errorMessage } from '@/api/client';
import { useLiveAccount } from '@/api/context';
import { canCancelStockService, currentStockServiceDetail, stockServiceState, type StockServiceKind } from '@/domain/stock-service-state';
import { cancelPendingStockService } from '@/domain/stock-service-cancellation';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { useI18n } from '@/i18n/context';
import { Button, Field, Notice, useUi } from '@/ui';
import { ResourceStatus, displayMoney } from '../shared';
import { useOperationView } from './useOperationView';
import { StockDivisionForm } from './StockDivisionForm';

export function StockServices({ detail, storageId, fresh = false, onRefresh }: { detail: StockDetail; storageId?: string; fresh?: boolean; onRefresh: () => void }) {
  const { s, colors } = useUi(); const { canMutate, mutationPending, mutate, readView } = useLiveAccount();
  const { t, formatNumber } = useI18n();
  const prices = useOperationView(storageId ? { kind: 'stock.services', storageId } : null);
  const current = useOperationView(storageId ? { kind: 'stock.current', id: detail.id, storageId } : null);
  const currentRow = !current.resource.loading && !current.resource.error ? current.resource.data?.find(item => item.id === detail.id) : undefined;
  const legacy = useOperationView(needsLegacyStockStates(currentRow) ? { kind: 'stock.legacyStates', countryCode: detail.countryCode || undefined } : null);
  const merged = mergeStockServiceStates(currentRow, !legacy.resource.loading && !legacy.resource.error ? legacy.resource.data : null);
  const currentDetail = currentStockServiceDetail(detail, merged);
  const serviceFresh = fresh && !!currentRow;
  const [chosen, setChosen] = useState<StockServiceKind | null>(null), [comment, setComment] = useState('');
  const [canceling, setCanceling] = useState<StockServiceKind | null>(null);
  const [cancelMessage, setCancelMessage] = useState<{ kind: StockServiceKind; text: string; error: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null), [failed, setFailed] = useState(false), [unknown, setUnknown] = useState(false), [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<StockServiceKind[]>([]);
  useDraftGuard(comment.trim().length > 0 || mutationPending || busy, { fallbackHref: '/warehouse', pending: mutationPending || busy });
  const submitting = useRef(false);
  const currentPrice = chosen && chosen !== 'label' && chosen !== 'division' ? prices.resource.data?.[chosen] : null;
  const quoteReady = !prices.resource.loading && !prices.resource.error && !!prices.resource.data?.currency;
  const canConfirm = !!chosen && chosen !== 'division' && serviceFresh && canMutate && !busy && !mutationPending && !unknown && !accepted.includes(chosen) && stockServiceState(currentDetail, chosen) === 'available' && (chosen === 'label' || quoteReady && currentPrice !== null && currentPrice !== undefined);
  const sent = (kind: StockServiceKind) => { setAccepted(previous => [...previous, kind]); setChosen(null); setComment(''); setFailed(false); setMessage('parcelDetail.requestSent'); onRefresh(); void current.refresh(); void legacy.refresh(); };
  const cancelRequest = async () => {
    if (!canceling || !storageId || !serviceFresh || !canMutate || busy || mutationPending || unknown || submitting.current || !canCancelStockService(currentDetail, canceling)) return;
    const kind = canceling;
    submitting.current = true; setBusy(true); setCancelMessage(null);
    try {
      const result = await cancelPendingStockService({
        service: kind,
        readCurrent: async () => {
          const row = (await readView({ kind: 'stock.current', id: detail.id, storageId })).find(item => item.id === detail.id);
          if (!row) return undefined;
          const fallback = !Object.prototype.hasOwnProperty.call(row.serviceStates || {}, kind) ? await readView({ kind: 'stock.legacyStates', countryCode: detail.countryCode || undefined }) : null;
          return currentStockServiceDetail(detail, mergeStockServiceStates(row, fallback));
        },
        send: () => mutate({ kind: 'stock.service.cancel', id: detail.id, service: kind }),
        describeError: errorMessage,
      });
      setUnknown(result.status === 'unknown');
      setCancelMessage({ kind, text: result.error || `stockServices.cancel${result.status[0].toUpperCase()}${result.status.slice(1)}`, error: result.status === 'unknown' || result.status === 'rejected' });
      if (result.status === 'cancelled' || result.status === 'changed') {
        setAccepted(previous => previous.filter(value => value !== kind && !(kind === 'declaration' && value === 'photos')));
        setCanceling(null);
      }
      onRefresh();
      await Promise.all([current.refresh(), legacy.refresh()]);
    } finally { submitting.current = false; setBusy(false); }
  };
  const submit = async () => {
    if (!chosen || chosen === 'division' || !canConfirm || submitting.current) return;
    const kind = chosen;
    submitting.current = true; setBusy(true); setMessage(null);
    try {
      const result = await mutate(kind === 'label' ? { kind: 'stock.label.request', id: detail.id } : { kind: 'stock.service.save', id: detail.id, ...(kind === 'photos' ? { photo: 1 as const } : kind === 'verification' ? { verification: 1 as const } : { declaration: 1 as const }), ...(comment.trim() ? { comment: comment.trim() } : {}) });
      setFailed(!result.ok); setUnknown(result.outcome === 'unknown');
      if (result.ok) sent(kind); else setMessage(result.error || 'errors.loadFailed');
    } catch { setFailed(true); setUnknown(true); setMessage('errors.mutationUnknown'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <View style={{ gap: 12 }}><Text accessibilityRole="header" style={s.heading}>{t('parcelDetail.services')}</Text>
    {storageId ? (prices.resource.loading || prices.resource.error) && !chosen && <ResourceStatus resource={prices.resource} onRefresh={() => { void prices.refresh(); }} /> : <Notice>{t('parcelDetail.servicesUnavailable')}</Notice>}
    {!chosen && (current.resource.loading || current.resource.error) && <ResourceStatus resource={current.resource} onRefresh={() => { void current.refresh(); }} />}
    {!chosen && legacy.resource.error && <ResourceStatus resource={legacy.resource} onRefresh={() => { void legacy.refresh(); }} />}
    {!serviceFresh && <Notice>{t('stockServices.freshRequired')}</Notice>}
    {(['photos', 'verification', 'declaration', 'division', 'label'] as const).map(kind => {
      const serverState = stockServiceState(currentDetail, kind);
      const state = accepted.includes(kind) && serverState === 'available' ? 'pending' : serverState;
      const price = kind === 'label' || kind === 'division' ? null : prices.resource.data?.[kind];
      const metadata = kind === 'label' ? null : prices.resource.data?.details?.[kind];
      const title = plainServerText(metadata?.title) || t(kind === 'declaration' || kind === 'division' ? `stockServices.${kind}` : `parcelDetail.service.${kind}`);
      const description = plainServerText(metadata?.description);
      const selected = chosen === kind;
      const cancelNeedsLegacy = !Object.prototype.hasOwnProperty.call(currentRow?.serviceStates || {}, kind);
      const complete = state === 'completed';
      const active = state === 'pending' || state === 'registered';
      const color = complete ? colors.success : active ? colors.warning : colors.muted;
      const backgroundColor = complete ? colors.successSoft : active ? colors.warningSoft : colors.soft;
      return <View key={kind} style={[s.card, selected && { borderColor: colors.accentBorder }, complete && { borderColor: colors.successBorder }]}>
        <Text accessibilityRole="header" style={s.heading}>{title}</Text>
        {description ? <Text style={s.small}>{description}</Text> : null}
        {price !== null && price !== undefined && prices.resource.data?.currency && <Text style={[s.body, { fontWeight: '700' }]}>{t('stockServices.price', { price: displayMoney(price, prices.resource.data.currency, formatNumber) })}</Text>}
        {state !== 'available' && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, padding: 9, borderRadius: 10, backgroundColor }}><Ionicons accessible={false} aria-hidden name={complete ? 'checkmark-circle' : active ? 'time-outline' : 'information-circle-outline'} size={20} color={color} /><Text style={[s.small, { color, flex: 1, fontWeight: complete || active ? '700' : '400' }]}>{t(`stockServices.${state}`)}</Text></View>}
        {state === 'available' && kind === 'label' && <Text style={s.small}>{t('parcelDetail.labelCostUnknown')}</Text>}
        {state === 'available' && kind !== 'division' && kind !== 'label' && (price === null || price === undefined || !prices.resource.data?.currency) && <Text style={s.small}>{t('parcelDetail.servicesUnavailable')}</Text>}
        {!selected && state === 'available' && <Button secondary disabled={!serviceFresh || !canMutate || busy || mutationPending || unknown || !!chosen || !!canceling || kind !== 'label' && kind !== 'division' && (!quoteReady || price === null || price === undefined)} onPress={() => { setChosen(kind); setComment(''); setMessage(null); setCancelMessage(null); void current.refresh(); void legacy.refresh(); if (kind !== 'label' && kind !== 'division') void prices.refresh(); }}>{t('parcelDetail.request')}</Button>}
        {canceling !== kind && canCancelStockService(currentDetail, kind) && <Button secondary disabled={!serviceFresh || !canMutate || busy || mutationPending || unknown || !!chosen || !!canceling} onPress={() => { setCanceling(kind); setCancelMessage(null); void current.refresh(); void legacy.refresh(); }}>{t('stockServices.cancelRequest')}</Button>}
        {canceling === kind && <View style={{ gap: 10 }}>
          <Text style={s.small}>{t(kind === 'declaration' ? 'stockServices.cancelDeclarationHint' : 'stockServices.cancelHint')}</Text>
          {(current.resource.loading || cancelNeedsLegacy && legacy.resource.loading) && <Text accessibilityLiveRegion="polite" style={s.small}>{t('stockServices.cancelChecking')}</Text>}
          {current.resource.error && <Notice error>{t(current.resource.error)}</Notice>}
          {cancelNeedsLegacy && legacy.resource.error && <Notice error>{t(legacy.resource.error)}</Notice>}
          {!current.resource.loading && !(cancelNeedsLegacy && legacy.resource.loading) && !canCancelStockService(currentDetail, kind) && <Notice>{t('stockServices.cancelChanged')}</Notice>}
          <Button disabled={!serviceFresh || !canMutate || busy || mutationPending || unknown || cancelNeedsLegacy && (legacy.resource.loading || !!legacy.resource.error) || !canCancelStockService(currentDetail, kind)} onPress={() => { void cancelRequest(); }}>{t(busy || mutationPending ? 'parcelForm.saving' : 'stockServices.confirmCancel')}</Button>
          <Button secondary disabled={busy || mutationPending} onPress={() => setCanceling(null)}>{t('stockServices.keepRequest')}</Button>
        </View>}
        {cancelMessage?.kind === kind && <Notice error={cancelMessage.error}>{t(cancelMessage.text)}</Notice>}
        {selected && kind === 'division' && <StockDivisionForm id={detail.id} enabled={serviceFresh && canMutate && !unknown && !accepted.includes(kind) && state === 'available'} onCancel={() => setChosen(null)} onSent={() => sent('division')} onUnknown={() => setUnknown(true)} />}
        {selected && (legacy.resource.loading || legacy.resource.error) && <ResourceStatus resource={legacy.resource} onRefresh={() => { void legacy.refresh(); }} />}
        {selected && (current.resource.loading || current.resource.error) && <ResourceStatus resource={current.resource} onRefresh={() => { void current.refresh(); }} />}
        {selected && kind !== 'division' && <View style={{ gap: 10 }}>
          {kind !== 'label' && (prices.resource.loading || prices.resource.error) && <ResourceStatus resource={prices.resource} onRefresh={() => { void prices.refresh(); }} />}
          {(current.resource.loading || legacy.resource.loading || kind !== 'label' && prices.resource.loading) && <Text accessibilityLiveRegion="polite" style={s.small}>{t('stockServices.checking')}</Text>}
          {kind === 'declaration' && <Notice>{t('stockServices.declarationEffects')}</Notice>}
          {kind !== 'label' && kind !== 'declaration' && <Field label={t('parcelDetail.serviceComment')} value={comment} onChangeText={setComment} editable={!mutationPending && !busy && !unknown} multiline />}
          <Text style={s.small}>{t('stockServices.confirmHint')}</Text>
          <Button disabled={!canConfirm} onPress={() => { void submit(); }}>{t(mutationPending || busy ? 'parcelForm.saving' : 'parcelDetail.confirmRequest')}</Button>
          <Button secondary disabled={mutationPending || busy} onPress={() => { setChosen(null); setComment(''); }}>{t('parcelForm.cancel')}</Button>
        </View>}
      </View>;
    })}
    {message && <Notice error={failed}>{t(message)}</Notice>}{unknown && <Notice>{t('parcelForm.unknownHint')}</Notice>}
  </View>;
}
