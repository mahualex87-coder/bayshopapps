import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import type { WaitingDetail } from '@/api/operations-normalize';
import { useI18n } from '@/i18n/context';
import { useConfirmation } from '@/navigation/Confirmation';
import { Button, Field, Notice, useUi } from '@/ui';
import { DetailRow } from '../shared';

export function WaitingPasscode({ detail, fresh, onRefresh, onDirty, onPending }: { detail: WaitingDetail; fresh: boolean; onRefresh: () => void; onDirty: (dirty: boolean) => void; onPending: (pending: boolean) => void }) {
  const { s } = useUi();
  const live = useLiveAccount(); const { t } = useI18n(); const { confirmDiscard } = useConfirmation();
  const [open, setOpen] = useState(false); const [value, setValue] = useState(''); const [baseline, setBaseline] = useState('');
  const [busy, setBusy] = useState(false); const [unknown, setUnknown] = useState(false); const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState<string | null>(null); const [saved, setSaved] = useState(false); const submitting = useRef(false);
  const dirty = busy || open && value !== baseline;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => () => onPending(false), [onPending]);
  const reset = () => { setOpen(false); setValue(''); setUnknown(false); setConflict(false); setMessage(null); };
  const close = () => { if (dirty && !unknown) confirmDiscard(reset); else reset(); };
  const blocked = busy || live.mutationPending || unknown || conflict;
  const enabled = fresh && detail.passcodeAllowed === true && live.canMutate && !blocked;
  const submit = async () => {
    if (!enabled || value === baseline || submitting.current) return;
    submitting.current = true; setBusy(true); onPending(true); setMessage(null); setSaved(false);
    let dispatched = false;
    try {
      const latest = await live.readView({ kind: 'waiting.detail', id: detail.id });
      if (latest.passcodeAllowed !== true) { setConflict(true); setMessage('passcode.notAllowed'); onRefresh(); return; }
      if ((latest.passcode || '') !== baseline) { setConflict(true); setMessage('passcode.changed'); onRefresh(); return; }
      dispatched = true;
      const result = await live.mutate({ kind: 'waiting.passcode.save', id: detail.id, passcode: value });
      if (result.ok) { reset(); setSaved(true); onRefresh(); }
      else { setUnknown(result.outcome === 'unknown'); setMessage(result.fieldErrors?.passcode ? 'passcode.invalid' : result.error || 'errors.saveFailed'); }
    } catch (error) { setUnknown(dispatched); setMessage(dispatched ? 'errors.mutationUnknown' : errorMessage(error)); }
    finally { submitting.current = false; setBusy(false); onPending(false); }
  };
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('parcelDetail.passcode')}</Text>
    <DetailRow label={t('passcode.current')} value={detail.passcode || t('parcelDetail.passcodeNotSet')} />
    {open ? <>
      <Field label={t('parcelDetail.passcode')} value={value} onChangeText={setValue} editable={!blocked} autoCapitalize="none" autoCorrect={false} autoComplete="off" />
      {value === '' && baseline !== '' && <Notice>{t('passcode.clearHint')}</Notice>}
      <Button disabled={!enabled || value === baseline} onPress={() => { void submit(); }}>{t(busy ? 'parcelForm.saving' : value === '' ? 'passcode.remove' : 'passcode.save')}</Button>
      <Button secondary disabled={busy || live.mutationPending} onPress={close}>{t('parcelForm.cancel')}</Button>
    </> : detail.passcodeAllowed === true ? <Button secondary disabled={!fresh || live.mutationPending} onPress={() => { setBaseline(detail.passcode || ''); setValue(detail.passcode || ''); setSaved(false); setOpen(true); }}>{t('passcode.edit')}</Button> : <Notice>{t('passcode.notAllowed')}</Notice>}
    {saved && <Notice>{t('passcode.saved')}</Notice>}
    {message && <Notice error>{t(message)}</Notice>}
    {unknown && <Notice>{t('parcelForm.unknownHint')}</Notice>}
  </View>;
}
