import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { divisionParts, divisionQuote, type StockDivision } from '@/api/stock-division';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Field, Notice, useUi } from '@/ui';
import { displayMoney, ResourceStatus } from '../shared';
import { useOperationView } from './useOperationView';

export function StockDivisionForm({ id, enabled, onCancel, onSent, onUnknown }: { id: string; enabled: boolean; onCancel: () => void; onSent: () => void; onUnknown: () => void }) {
  const view = useOperationView({ kind: 'stock.division.read', id });
  return <>{(view.resource.loading || view.resource.error) && <ResourceStatus resource={view.resource} onRefresh={() => { void view.refresh(); }} />}{view.resource.data && <DivisionEditor key={view.resource.updatedAt} id={id} data={view.resource.data} enabled={enabled && !view.resource.loading && !view.resource.error} onCancel={onCancel} onSent={onSent} onUnknown={onUnknown} />}</>;
}
function DivisionEditor({ id, data, enabled, onCancel, onSent, onUnknown }: { id: string; data: StockDivision; enabled: boolean; onCancel: () => void; onSent: () => void; onUnknown: () => void }) {
  const { s } = useUi(), { t, formatNumber } = useI18n();
  const { canMutate, mutationPending, mutate } = useLiveAccount();
  const [assignments, setAssignments] = useState<Record<string, string>>(() => Object.fromEntries(data.items.map(item => [item.id, String(item.partNumber)])));
  const [comment, setComment] = useState(data.comment), [message, setMessage] = useState<string | null>(null), [unknown, setUnknown] = useState(false), [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const dirty = comment !== data.comment || data.items.some(item => assignments[item.id] !== String(item.partNumber));
  useDraftGuard(dirty || pending || mutationPending, { fallbackHref: '/warehouse', pending: pending || mutationPending });
  const count = divisionParts(data.items, assignments), amount = divisionQuote(data, assignments);
  const canSubmit = enabled && canMutate && !pending && !mutationPending && !unknown && data.verified && !!data.currency && amount !== null;
  const submit = async () => {
    if (!canSubmit || submitting.current) return;
    submitting.current = true; setPending(true); setMessage(null);
    try {
      const result = await mutate({ kind: 'stock.division.save', id, data, assignments, comment });
      if (result.ok) onSent();
      else { setUnknown(result.outcome === 'unknown'); if (result.outcome === 'unknown') onUnknown(); setMessage(result.error || 'errors.loadFailed'); }
    } catch { setUnknown(true); onUnknown(); setMessage('errors.mutationUnknown'); }
    finally { submitting.current = false; setPending(false); }
  };
  return <View style={{ gap: 10 }}>
    <Text style={s.small}>{t('stockServices.divisionInstructions')}</Text>
    {!data.verified && <Notice>{t('stockServices.divisionUnavailable')}</Notice>}
    {data.basePrice !== null && data.currency && <Text style={s.body}>{t('stockServices.divisionBase', { price: displayMoney(data.basePrice, data.currency, formatNumber) })}</Text>}
    {data.extraPrice !== null && data.currency && <Text style={s.small}>{t('stockServices.divisionExtra', { price: displayMoney(data.extraPrice, data.currency, formatNumber) })}</Text>}
    {data.items.map(item => <View key={item.id} style={{ gap: 4 }}><Text style={s.body}>{item.title} · {t('stockServices.units', { count: formatNumber(item.quantity) })}</Text><Field label={t('stockServices.destinationPart')} accessibilityLabel={`${item.title}. ${t('stockServices.destinationPart')}`} keyboardType="number-pad" value={assignments[item.id]} onChangeText={value => setAssignments(previous => ({ ...previous, [item.id]: value }))} editable={data.verified && enabled && !pending && !unknown} /></View>)}
    {count === null && <Text style={s.small}>{t('stockServices.divisionMinimum')}</Text>}
    {amount !== null && data.currency && <Text style={[s.heading, { fontWeight: '700' }]}>{t('stockServices.total', { price: displayMoney(amount, data.currency, formatNumber) })}</Text>}
    <Notice>{t('stockServices.divisionEffects')}</Notice>
    <Field label={t('parcelDetail.serviceComment')} multiline value={comment} onChangeText={setComment} editable={!pending && !unknown} />
    <Button disabled={!canSubmit} onPress={() => { void submit(); }}>{t(pending ? 'parcelForm.saving' : 'parcelDetail.confirmRequest')}</Button>
    <Button secondary disabled={pending} onPress={onCancel}>{t('parcelForm.cancel')}</Button>
    {message && <Notice error>{t(message)}</Notice>}{unknown && <Notice>{t('parcelForm.unknownHint')}</Notice>}
  </View>;
}
