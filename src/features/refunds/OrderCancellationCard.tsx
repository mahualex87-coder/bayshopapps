import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { type OrderCancellation } from '@/api/account-financial-actions';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { ResourceStatus, displayMoney } from '@/features/live/shared';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { GlassSurface } from '@/navigation/GlassSurface';
import { Button, Notice, useUi } from '@/ui';

function CancellationForm({ initial, onConfirmed }: { initial: OrderCancellation; onConfirmed: () => void }) {
  const live = useLiveAccount(); const { t, formatNumber } = useI18n(); const { s } = useUi();
  const [order, setOrder] = useState(initial); const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState<string | null>(null); const [unknown, setUnknown] = useState(false); const [confirmed, setConfirmed] = useState(false);
  useDraftGuard(review && !unknown, { fallbackHref: '/orders', pending: busy || live.mutationPending });
  const verify = async () => {
    const current = await live.readView({ kind: 'order.cancellation', id: order.id }); setOrder(current);
    if (current.processingStatus === 'canceled') { setConfirmed(true); setUnknown(false); setReview(false); setError(null); onConfirmed(); }
    else { setUnknown(true); setError('cancellation.unconfirmed'); }
  };
  const act = async (mode: 'prepare' | 'cancel' | 'verify') => {
    if (lock.current || live.mutationPending || !live.canMutate) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      if (mode === 'verify') { await verify(); return; }
      if (unknown) return;
      if (mode === 'prepare') {
        const current = await live.readView({ kind: 'order.cancellation', id: order.id }); setOrder(current);
        if (!current.canCancel) { setError('cancellation.changed'); return; }
        setReview(true); return;
      }
      if (!review || !order.canCancel) return;
      const result = await live.mutate({ kind: 'order.cancel', id: order.id, revision: order.revision });
      if (!result.ok) { setError(result.error || 'errors.loadFailed'); setUnknown(result.outcome === 'unknown'); setReview(false); return; }
      setUnknown(true); setReview(false); await verify();
    } catch { if (mode === 'cancel' || mode === 'verify') { setUnknown(true); setError('cancellation.unconfirmed'); } else setError('errors.loadFailed'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!order.canCancel && !unknown && !confirmed) return null;
  const disabled = busy || live.mutationPending || !live.canMutate;
  return <GlassSurface style={{ padding: 16, gap: 10, borderRadius: 18 }}>
    <Text accessibilityRole="header" style={s.heading}>{t('cancellation.title')}</Text>
    {error && <Notice error>{t(error)}</Notice>}
    {confirmed ? <Notice>{t('cancellation.confirmed')}</Notice> : unknown ? <><Notice>{t('cancellation.noRepeat')}</Notice><Button secondary disabled={disabled} onPress={() => { void act('verify'); }}>{t('cancellation.check')}</Button></> : review ? <>
      <View style={s.row}><Text style={[s.body, { flex: 1 }]}>{order.uid || order.id}</Text><Text style={s.heading}>{displayMoney(order.totalPrice, order.currency, formatNumber)}</Text></View>
      <Text style={s.body}>{t('cancellation.question')}</Text><Text style={s.small}>{t('cancellation.balanceHint')}</Text>
      <Button disabled={disabled} onPress={() => { void act('cancel'); }}>{t('cancellation.confirm')}</Button>
      <Button secondary disabled={disabled} onPress={() => setReview(false)}>{t('cancellation.keep')}</Button>
    </> : <><Text style={s.small}>{t('cancellation.available')}</Text><Button secondary disabled={disabled} onPress={() => { void act('prepare'); }}>{t('cancellation.action')}</Button></>}
  </GlassSurface>;
}

export function OrderCancellationCard({ id, onConfirmed }: { id: string; onConfirmed: () => void }) {
  const live = useLiveAccount();
  // Deliberately use the existing owner-scoped order endpoint. Cancellation
  // remains available while the richer member-purchases API is being deployed.
  const result = useOperationView({ kind: 'order.cancellation', id }, { pageLoad: false });
  return <><ResourceStatus resource={result.resource} onRefresh={() => { void result.refresh(); }} />{result.resource.data && <CancellationForm key={`${id}:${live.accountId}:${live.accountRevision}:${live.language}`} initial={result.resource.data} onConfirmed={onConfirmed} />}</>;
}
