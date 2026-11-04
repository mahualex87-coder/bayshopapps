import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveAccount } from '@/api/context';
import { reviewBaseline, reviewInputFields, reviewPhotoMaxBytes, reviewWriteConfirmed, type ParcelReview, type ParcelReviewInput } from '@/api/parcel-review';
import { errorMessage } from '@/api/client';
import { useI18n } from '@/i18n/context';
import { useConfirmation } from '@/navigation/Confirmation';
import { Button, Field, Notice, minTouchTarget, useUi } from '@/ui';
import { AttachmentsEditor, type StagedFile } from './forms/AttachmentsEditor';
import { ParcelPhotos } from './forms/ParcelContent';
import { useOperationView } from './forms/useOperationView';
import { ResourceStatus } from './shared';

type Props = { id: string; fresh: boolean; onDirty: (dirty: boolean) => void; onPending: (pending: boolean) => void; onSaved?: () => void };

function ReviewForm({ initial, fresh, onDirty, onPending, onSaved, onReload }: Props & { initial: ParcelReview; onReload: () => void }) {
  const { t, formatNumber } = useI18n(); const { s, colors } = useUi(); const live = useLiveAccount();
  const { confirmDiscard } = useConfirmation();
  const [base, setBase] = useState(initial);
  const [editing, setEditing] = useState(initial.rating === null && !initial.comment && !initial.photo);
  const [rating, setRating] = useState(initial.rating || 0); const [comment, setComment] = useState(initial.comment || '');
  const [photos, setPhotos] = useState<StagedFile[]>([]); const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false); const [unknown, setUnknown] = useState(false);
  const mounted = useRef(true); const submitting = useRef(false); const pending = useRef<ParcelReviewInput | null>(null);
  const dirty = editing && (rating !== (base.rating || 0) || comment !== (base.comment || '') || photos.length > 0);
  const disabled = !fresh || !live.canMutate || live.mutationPending || busy || unknown || !base.received;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirty(dirty || busy); }, [dirty, busy, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => { onPending(busy); return () => onPending(false); }, [busy, onPending]);
  const reset = (value: ParcelReview) => { setBase(value); setRating(value.rating || 0); setComment(value.comment || ''); setPhotos([]); setEditing(false); };
  const verify = async (input: ParcelReviewInput) => {
    const latest = await live.readView({ kind: 'shipment.review.read', id: base.id });
    if (!mounted.current) return;
    if (!reviewWriteConfirmed(base.id, input, latest)) { setUnknown(true); setError('review.readbackMismatch'); return; }
    reset(latest); setUnknown(false); setError(null); setSaved(true); pending.current = null; onSaved?.();
  };
  const save = async () => {
    if (disabled || submitting.current || !dirty) return;
    const input: ParcelReviewInput = { rating, comment, expected: reviewBaseline(base), ...(photos[0] ? { photo: photos[0] } : {}) };
    try { reviewInputFields(input); } catch (problem) { setError(errorMessage(problem)); return; }
    submitting.current = true; setBusy(true); setError(null); setSaved(false); pending.current = input;
    try {
      const result = await live.mutate({ kind: 'shipment.review.save', id: base.id, input });
      if (!mounted.current) return;
      if (!result.ok) { setUnknown(result.outcome === 'unknown'); setError(result.error || 'errors.loadFailed'); return; }
      await verify(input);
    } catch { if (mounted.current) { setUnknown(true); setError('review.readbackMismatch'); } }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  };
  const check = async () => {
    if (submitting.current || !pending.current) return;
    submitting.current = true; setBusy(true);
    try { await verify(pending.current); }
    catch { if (mounted.current) setError('review.readbackMismatch'); }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  };
  const edited = () => { setSaved(false); setError(null); };
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('review.title')}</Text>
    {!base.received ? <Notice>{t('review.receivedOnly')}</Notice> : <>
      {editing ? <>
        <Text style={s.body}>{t('review.question')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('review.rating')} style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={t('review.stars', { count: formatNumber(value) })} aria-checked={rating === value} accessibilityState={{ checked: rating === value, disabled }} disabled={disabled} onPress={() => { setRating(value); edited(); }} style={{ minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={rating >= value ? 'star' : 'star-outline'} size={30} color={colors.accent} /></Pressable>)}
        </View>
        <Text style={s.small}>{rating ? t('review.stars', { count: formatNumber(rating) }) : t('review.chooseRating')}</Text>
        <Field label={t('review.comment')} value={comment} onChangeText={value => { setComment(value); edited(); }} editable={!disabled} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />
        {base.photo ? <><ParcelPhotos photos={[{ id: null, ...base.photo }]} compact hideTitle /><Text style={s.small}>{t('review.photoAlreadySaved')}</Text></> : <AttachmentsEditor title={t('review.photo')} existing={[]} staged={photos} onStagedChange={value => { setPhotos(value); edited(); }} allowPdf={false} multiple={false} maxFiles={1} maxBytes={reviewPhotoMaxBytes} disabled={disabled} />}
        <Button disabled={disabled || !dirty || rating === 0} onPress={() => { void save(); }}>{t(busy ? 'review.saving' : 'review.save')}</Button>
        {!unknown && <Button secondary disabled={busy || live.mutationPending} onPress={() => { const discard = () => { reset(base); setError(null); }; if (dirty) confirmDiscard(discard); else discard(); }}>{t('parcelForm.cancel')}</Button>}
      </> : <>
        {base.rating !== null && <Text accessibilityLabel={t('review.stars', { count: formatNumber(base.rating) })} style={[s.heading, { color: colors.accent }]}>{'★'.repeat(base.rating)}{'☆'.repeat(5 - base.rating)} <Text style={s.small}>{formatNumber(base.rating)}/5</Text></Text>}
        {base.comment && <Text selectable style={s.body}>{base.comment}</Text>}
        {base.photo && <ParcelPhotos photos={[{ id: null, ...base.photo }]} compact hideTitle />}
        <Button secondary disabled={disabled} onPress={() => { setEditing(true); setSaved(false); }}>{t(base.rating || base.comment || base.photo ? 'review.edit' : 'review.add')}</Button>
      </>}
    </>}
    {saved && <Notice>{t('review.saved')}</Notice>}
    {error && <Notice error>{t(error)}</Notice>}
    {error === 'review.changed' && !unknown && <Button secondary disabled={busy} onPress={() => { if (dirty) confirmDiscard(onReload); else onReload(); }}>{t('review.checkCurrent')}</Button>}
    {unknown && <><Notice error>{t('review.unknown')}</Notice><Button secondary disabled={busy || !live.authenticated} onPress={() => { void check(); }}>{t('review.check')}</Button></>}
  </View>;
}

export function ReceivedParcelReview(props: Props) {
  const view = useOperationView({ kind: 'shipment.review.read', id: props.id });
  const data = view.resource.data;
  return <><ResourceStatus resource={view.resource} onRefresh={() => { void view.refresh(); }} />{data && <ReviewForm key={JSON.stringify([data.id, data.rating, data.comment, data.photo?.url])} {...props} fresh={props.fresh && !view.resource.loading && !view.resource.error} initial={data} onReload={() => { void view.refresh(); }} />}</>;
}
