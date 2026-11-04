import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLiveAccount } from '@/api/context';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Notice, useUi } from '@/ui';

export function WaitingActions({ id, enabled, onEdit }: { id: string; enabled: boolean; onEdit?: () => void }) {
  const { s } = useUi();
  const { t } = useI18n();
  const { canMutate, mutate } = useLiveAccount();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const { bypass } = useDraftGuard(confirming || busy, { fallbackHref: '/waiting', pending: busy });
  const remove = async () => {
    if (!enabled || !canMutate || submitting.current || unknown) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await mutate({ kind: 'waiting.delete', id });
      if (result.ok) { bypass(() => router.replace('/waiting')); return; }
      setError(result.error || 'errors.loadFailed'); setUnknown(result.outcome === 'unknown');
    } catch { setError('errors.mutationUnknown'); setUnknown(true); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    {onEdit && <Button disabled={!enabled || !canMutate || confirming || unknown} onPress={onEdit}>{t('parcelForm.edit')}</Button>}
    {confirming ? <View style={s.card}><Text style={s.heading}>{t('parcelForm.deleteConfirmation')}</Text><Text style={s.body}>{t('parcelForm.deleteExplanation')}</Text><Button disabled={!enabled || !canMutate || unknown} onPress={() => { void remove(); }}>{t(busy ? 'parcelForm.saving' : 'parcelForm.confirmDelete')}</Button><Button secondary disabled={busy} onPress={() => setConfirming(false)}>{t('parcelForm.cancel')}</Button></View> : <Button secondary disabled={!enabled || !canMutate || unknown} onPress={() => setConfirming(true)}>{t('parcelForm.delete')}</Button>}
    {error && <Notice error>{t(error)}</Notice>}{unknown && <Notice>{t('parcelForm.unknownHint')}</Notice>}
  </View>;
}
