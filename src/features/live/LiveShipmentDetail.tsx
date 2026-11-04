import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ServiceIdentity } from '@/components/ServiceIdentity';
import { useLiveAccount } from '@/api/context';
import { plainServerText } from '@/api/account-operations';
import type { MutationResult } from '@/api/mutations';
import type { Attachment, ShipmentOperationDetail } from '@/api/operations-normalize';
import { shipmentDocumentAccess } from '@/api/shipment-document-policy';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { DetailRow, ResourceStatus } from './shared';
import { postalAddressFields } from './address-fields';
import { AttachmentsEditor, type StagedFile } from './forms/AttachmentsEditor';
import { DeclarationSummary, ParcelPhotos, RemoteDocumentButton } from './forms/ParcelContent';
import { ParcelDeclarationForm } from './forms/ParcelDeclarationForm';
import { LocalDeliveryChange } from './forms/LocalDeliveryChange';
import { useOperationView } from './forms/useOperationView';
import { DimensionsRow, LocalDeliveryDetails } from './ParcelMetadata';
import { ShipmentFinancialSummary, ShipmentFinancialDetails } from './ShipmentFinancialDetails';
import { ParcelDetailSection } from './ParcelDetailSection';
import { ReceivedParcelReview } from './ReceivedParcelReview';
import { ShipmentTracking } from './ShipmentTracking';
import { OutgoingServices } from '@/features/shipments/OutgoingServices';

function ShipmentAttachments({ id, kind, permitted, onDirty, onChanged, onPending }: { id: string; kind: 'invoices' | 'customs'; permitted: boolean; onDirty: (dirty: boolean) => void; onChanged: () => void; onPending: (pending: boolean) => void }) {
  const { s } = useUi();
  const live = useLiveAccount();
  const { t } = useI18n();
  const view = useOperationView(kind === 'invoices' ? { kind: 'shipment.invoices.read', id } : { kind: 'shipment.customs.read', id });
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const dirty = staged.length > 0 || removing !== null || busy;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => () => onPending(false), [onPending]);
  const data = view.resource.data;
  const enabled = permitted && live.canMutate && !view.resource.loading && !view.resource.error && !busy && !unknown;
  const apply = async (operation: 'upload' | 'delete') => {
    if (!enabled || !data || submitting.current) return;
    if (operation === 'upload' && (!staged.length || data.maxFiles !== null && data.files.length + staged.length > data.maxFiles)) return;
    if (operation === 'delete' && !removing?.id) return;
    submitting.current = true; setBusy(true); onPending(true); setMessage(null);
    try {
      let result: MutationResult;
      if (operation === 'delete') result = await live.mutate({ kind: kind === 'invoices' ? 'shipment.invoice.delete' : 'shipment.customs.delete', id, fileId: removing!.id! });
      else if (kind === 'invoices') result = await live.mutate({ kind: 'shipment.invoice.upload', id, file: staged[0] });
      else result = await live.mutate({ kind: 'shipment.customs.upload', id, files: staged });
      setFailed(!result.ok); setUnknown(result.outcome === 'unknown');
      setMessage(result.ok ? operation === 'upload' ? 'attachment.uploaded' : 'attachment.deleted' : result.error || 'errors.loadFailed');
      if (result.ok) {
        if (operation === 'upload') setStaged([]); else setRemoving(null);
        onChanged();
        // Saving an invoice clears awaiting-invoice on the backend. Its GET is
        // then intentionally unavailable; refresh the parcel status instead.
        if (kind !== 'invoices' || operation !== 'upload') await view.refresh();
      }
    } catch { setFailed(true); setUnknown(true); setMessage('errors.mutationUnknown'); }
    finally { submitting.current = false; setBusy(false); onPending(false); }
  };
  return <View style={{ gap: 10 }}>
    <ResourceStatus resource={view.resource} onRefresh={() => { void view.refresh(); }} />
    {data && <>
      <AttachmentsEditor hideTitle title={t(kind === 'invoices' ? 'parcelForm.invoices' : 'parcelDetail.supportingDocuments')} existing={data.files} staged={staged} onStagedChange={setStaged} allowPdf={kind === 'invoices'} maxFiles={data.maxFiles} multiple={kind !== 'invoices'} disabled={!enabled} readOnly={!permitted} onExistingChange={permitted ? files => { const file = data.files.find(value => !files.includes(value)); if (file?.id) { setRemoving(file); setMessage(null); } else { setMessage('parcelForm.attachmentIdentityMissing'); setFailed(true); } } : undefined} />
      {!permitted && <Notice>{t('attachment.readOnly')}</Notice>}
      {staged.length > 0 && <Button disabled={!enabled} onPress={() => { void apply('upload'); }}>{t(busy ? 'attachment.uploading' : kind === 'customs' ? 'parcelDetail.uploadSupportingDocuments' : 'attachment.upload')}</Button>}
      {removing && <View style={s.card}><Text style={s.body}>{t('attachment.deleteConfirmation')}</Text><RemoteDocumentButton url={removing.url} label={t('attachment.openSelected')} /><Button disabled={!enabled} onPress={() => { void apply('delete'); }}>{t('attachment.confirmDelete')}</Button><Button secondary disabled={busy} onPress={() => setRemoving(null)}>{t('parcelForm.cancel')}</Button></View>}
    </>}
    {message && <Notice error={failed}>{t(message)}</Notice>}
    {unknown && <Notice>{t('parcelForm.unknownHint')}</Notice>}
  </View>;
}

function ShipmentOverview({ data }: { data: ShipmentOperationDetail }) {
  const { s, colors } = useUi();
  const { t, formatNumber } = useI18n();
  const [serviceHelp, setServiceHelp] = useState(false);
  const code = data.uid || data.id;
  return <>
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{t('parcelSections.general')}</Text>
      <View style={{ gap: 3 }}><Text style={s.small}>{t('shipmentCompact.shipmentNumber')}</Text><Text selectable style={s.heading}>{code}</Text>{data.title && data.title.trim() !== code.trim() && <Text style={s.body}>{data.title}</Text>}</View>
      {data.shippingMethod && <View style={{ gap: 3 }}>
        <Text style={s.small}>{t('live.parcel.service')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ServiceIdentity title={data.shippingMethod} style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={t('shipmentCompact.deliveryHelp', { service: data.shippingMethod })} accessibilityState={{ expanded: serviceHelp }} aria-expanded={serviceHelp} onPress={() => setServiceHelp(value => !value)} style={({ pressed }) => [{ minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, pressed && s.pressed]}><Ionicons name="help-circle-outline" size={23} color={colors.accent} accessible={false} /></Pressable>
        </View>
        {serviceHelp && <View style={{ backgroundColor: colors.soft, borderRadius: 12, padding: 12 }}><Text selectable accessibilityLiveRegion="polite" style={s.small}>{data.shippingDescription || t('shipmentCompact.deliveryDescriptionUnavailable')}</Text></View>}
      </View>}
      {(data.weightKg !== null || data.volumeWeightKg != null) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {data.weightKg !== null && <View style={{ flex: 1, minWidth: 112, gap: 3 }}><Text style={s.small}>{t('parcelDetail.weight')}</Text><Text selectable style={s.body}>{t('live.parcel.weight', { weight: formatNumber(data.weightKg, { maximumFractionDigits: 3 }) })}</Text></View>}
        {data.volumeWeightKg != null && <View style={{ flex: 1, minWidth: 112, gap: 3 }}><Text style={s.small}>{t('parcelDetail.volumeWeight')}</Text><Text selectable style={s.body}>{t('parcelDetail.volumeWeightValue', { weight: formatNumber(data.volumeWeightKg, { maximumFractionDigits: 3 }) })}</Text></View>}
      </View>}
      <DimensionsRow dimensions={data.dimensionsCm} compact />
      {data.status === 'held-by-missing' && <DetailRow label={t('live.parcel.recordedStatus')} value={data.status} />}
    </View>
    {data.customsCause && <Notice error>{t('parcelMeta.customsCause')}: {plainServerText(data.customsCause)}</Notice>}
    {data.boxes.filter(box => box.heldByProhibition || box.heldByDamage).map(box => <View key={box.id} style={{ gap: 6 }}>
      {box.heldByProhibition && <Notice error>{box.uid || box.title || box.id}: {t('live.parcel.prohibited')}{box.prohibitionComment ? `\n${box.prohibitionComment}` : ''}</Notice>}
      {box.heldByDamage && <Notice error>{box.uid || box.title || box.id}: {t('live.parcel.damaged')}{box.damageComment ? `\n${box.damageComment}` : ''}</Notice>}
    </View>)}
  </>;
}

function ShipmentContents({ data }: { data: ShipmentOperationDetail }) {
  const { s } = useUi();
  const { t, formatNumber, formatDate } = useI18n();
  const recipient = postalAddressFields(data.recipientFields);
  const photos = data.boxes.reduce((count, box) => count + box.photos.length, 0);
  return <>
    {(recipient.length > 0 || data.localDelivery) && <ParcelDetailSection title={t('shipmentCompact.delivery')} summary={data.localDelivery?.title} icon="location-outline" collapsible>
      {recipient.length > 0 && <View style={s.card}><Text style={s.heading}>{t('parcelDetail.recipient')}</Text>{recipient.map((field, index) => <DetailRow key={`${field.label}:${index}`} label={field.labelKey ? t(field.labelKey) : field.label} value={field.value} country={field.labelKey === 'field.country'} />)}</View>}
      {data.localDelivery && <LocalDeliveryDetails delivery={data.localDelivery} />}
    </ParcelDetailSection>}
    {data.boxes.length > 0 && <ParcelDetailSection title={t('parcelDetail.boxes')} summary={t('shipmentCompact.contents', { boxes: formatNumber(data.boxes.length), photos: formatNumber(photos) })} icon="cube-outline" collapsible>{data.boxes.map(box => <View key={box.id} style={s.card}>
      <View style={{ gap: 3 }}>
        <Text style={s.small}>{t('shipmentCompact.incomingParcel')}</Text>
        <Text selectable style={[s.body, { fontWeight: '600' }]}>{box.uid || box.id}</Text>
        <Text style={s.small}>{t('shipmentCompact.boxContents', { items: formatNumber(box.declarationItems.length), photos: formatNumber(box.photos.length) })}</Text>
      </View>
      {box.title && box.title !== box.uid && <Text style={s.body}>{box.title}</Text>}
      {box.tracking?.trim() && <DetailRow label={t('live.parcel.tracking')} value={box.tracking} />}
      {box.additionalTracking && <DetailRow label={t('parcelDetail.additionalTracking')} value={box.additionalTracking} />}
      {(box.quantity !== null || box.weightKg !== null) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {box.quantity !== null && <View style={{ flex: 1, minWidth: 90, gap: 3 }}><Text style={s.small}>{t('parcelDetail.quantity')}</Text><Text selectable style={s.body}>{formatNumber(box.quantity)}</Text></View>}
        {box.weightKg !== null && <View style={{ flex: 1, minWidth: 90, gap: 3 }}><Text style={s.small}>{t('parcelDetail.weight')}</Text><Text selectable style={s.body}>{t('live.parcel.weight', { weight: formatNumber(box.weightKg, { maximumFractionDigits: 3 }) })}</Text></View>}
      </View>}
      {box.prohibitionHeldAt && <DetailRow label={t('parcel.event.prohibitionHeld')} value={formatDate(box.prohibitionHeldAt)} />}
      {box.damageHeldAt && <DetailRow label={t('parcel.event.damageHeld')} value={formatDate(box.damageHeldAt)} />}
      {box.photos.length > 0 && <ParcelPhotos photos={box.photos} compact />}
    </View>)}</ParcelDetailSection>}
  </>;
}

function ShipmentReadView({ id, data, fresh, onEdit, onRefresh }: { id: string; data: ShipmentOperationDetail; fresh: boolean; onEdit: () => void; onRefresh: () => void }) {
  const { s } = useUi();
  const { t, formatNumber } = useI18n();
  const { canMutate, mutationPending } = useLiveAccount();
  const access = shipmentDocumentAccess(data.status, data.boxes.length);
  const declaration = useOperationView(access.declaration !== 'unavailable' ? { kind: 'shipment.declaration.read', id } : null);
  const [invoicesDirty, setInvoicesDirty] = useState(false);
  const [customsDirty, setCustomsDirty] = useState(false);
  const [deliveryDirty, setDeliveryDirty] = useState(false);
  const [invoicesPending, setInvoicesPending] = useState(false);
  const [customsPending, setCustomsPending] = useState(false);
  const [deliveryPending, setDeliveryPending] = useState(false);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [servicesDirty, setServicesDirty] = useState(false);
  const [servicesPending, setServicesPending] = useState(false);
  const [financialOpen, setFinancialOpen] = useState(false);
  const { confirmDiscard } = useDraftGuard(invoicesDirty || customsDirty || deliveryDirty || reviewDirty || servicesDirty, { fallbackHref: data.stage === 'received' ? '/received' : '/shipments', pending: mutationPending || invoicesPending || customsPending || deliveryPending || reviewPending || servicesPending });
  const onInvoicesDirty = useCallback((dirty: boolean) => setInvoicesDirty(dirty), []);
  const onCustomsDirty = useCallback((dirty: boolean) => setCustomsDirty(dirty), []);
  return <>
    <ShipmentOverview data={data} />
    <ShipmentTracking data={data} />
    <ShipmentFinancialSummary data={data} onPress={() => setFinancialOpen(true)} />
    <ParcelDetailSection title={t('parcelDetail.declaration')} icon="document-text-outline" collapsible={data.stage === 'sent'} action={access.declaration !== 'unavailable' && access.singleBox && declaration.resource.data?.amountsVerified === true ? { label: t('parcelSections.edit'), disabled: !canMutate || !fresh || declaration.resource.loading || !!declaration.resource.error, onPress: () => confirmDiscard(onEdit) } : undefined}>
      {access.declaration === 'unavailable' ? <>
        {data.boxes.some(box => box.declarationItems.length > 0) ? data.boxes.filter(box => box.declarationItems.length > 0).map(box => <View key={box.id} style={{ gap: 8 }}>
          {data.boxes.length > 1 && <Text style={s.small}>{box.uid || box.title || box.id}</Text>}
          <DeclarationSummary items={box.declarationItems} currency={null} compact />
        </View>) : <Notice>{t('parcelDetail.noDeclaration')}</Notice>}
        <Text style={s.small}>{t('shipmentCompact.declarationReadOnly')}</Text>
      </> : <>
        <ResourceStatus resource={declaration.resource} onRefresh={() => { void declaration.refresh(); }} />
        {declaration.resource.data && <><DeclarationSummary items={declaration.resource.data.items} currency={null} compact />{declaration.resource.data.amountsVerified !== true ? <Notice>{t('declarationCurrency.shipmentUnavailable')}</Notice> : !access.singleBox && <Notice>{t('parcelDetail.declarationSingleBox')}</Notice>}</>}
      </>}
    </ParcelDetailSection>
    {data.permissions.changeLocalDelivery === true && <LocalDeliveryChange id={id} fresh={fresh} onRefresh={onRefresh} onDirty={setDeliveryDirty} onPending={setDeliveryPending} />}
    {data.stage === 'sent' && <OutgoingServices id={id} fresh={fresh} onChanged={onRefresh} onDirty={setServicesDirty} onPending={setServicesPending} />}
    {access.invoice && <ParcelDetailSection title={t('parcelForm.invoices')} icon="document-attach-outline"><ShipmentAttachments id={id} kind="invoices" permitted={fresh} onDirty={onInvoicesDirty} onChanged={onRefresh} onPending={setInvoicesPending} /></ParcelDetailSection>}
    {/* Keep this editor in one stable position. A fresh permission/status can
        expand it without losing selected files or the mutation navigation guard. */}
    <ParcelDetailSection title={t('parcelDetail.supportingDocuments')} icon="document-attach-outline" help={{ label: t('parcelDetail.supportingDocumentsHelpLabel'), text: t('parcelDetail.supportingDocumentsHelp') }} collapsible={data.status !== 'customs-held' && !data.customsCause && !customsDirty && !customsPending}>
      <ShipmentAttachments id={id} kind="customs" permitted={fresh && data.permissions.uploadCustomsDocuments === true} onDirty={onCustomsDirty} onChanged={onRefresh} onPending={setCustomsPending} />
    </ParcelDetailSection>
    {data.stage === 'received' && <ReceivedParcelReview id={id} fresh={fresh} onDirty={setReviewDirty} onPending={setReviewPending} onSaved={onRefresh} />}
    <ShipmentContents data={data} />
    <ShipmentFinancialDetails data={data} visible={financialOpen} onClose={() => setFinancialOpen(false)} />
    {data.documents.length > 0 && <ParcelDetailSection title={t('parcelDetail.documents')} summary={t('shipmentCompact.documents', { count: formatNumber(data.documents.length) })} icon="documents-outline" collapsible>
      {data.documents.map(document => <RemoteDocumentButton key={document.kind} url={document.url} label={t(`parcelDetail.document.${document.kind}`)} />)}
      {!access.invoice && <Text style={s.small}>{t('parcelDetail.invoiceNotRequested')}</Text>}
    </ParcelDetailSection>}
  </>;
}

function ShipmentDeclarationEdit({ id, returnReceived, onSaved }: { id: string; returnReceived: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  const { canMutate, mutate } = useLiveAccount();
  const view = useOperationView({ kind: 'shipment.declaration.read', id });
  return <><ResourceStatus resource={view.resource} onRefresh={() => { void view.refresh(); }} />{view.resource.data && (view.resource.data.amountsVerified !== true ? <Notice>{t('declarationCurrency.shipmentUnavailable')}</Notice> : <ParcelDeclarationForm mode="shipment" initial={view.resource.data} canSubmit={canMutate && !view.resource.error && !view.resource.loading} returnHref={returnReceived ? '/received' : '/shipments'} onSubmit={input => mutate({ kind: 'shipment.declaration.save', id, input: { currencyId: input.currencyId!, declarationItems: input.items } })} onSaved={onSaved} />)}</>;
}

export function LiveShipmentDetailRoute({ id }: { id: string }) {
  const { t } = useI18n();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const view = useOperationView({ kind: 'shipment.detail', id });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const data = view.resource.data;
  useEffect(() => {
    if (!data || view.resource.loading || view.resource.error) return;
    const actual = data.stage === 'received' ? 'received' : 'shipments';
    if (section !== actual) router.setParams({ section: actual });
  }, [data, section, view.resource.loading, view.resource.error]);
  return <Screen title={t(editing ? 'parcelForm.editDeclaration' : 'parcelDetail.shipmentTitle')} subtitle={editing ? data?.uid || data?.tracking || undefined : undefined}>
    {editing && data ? <ShipmentDeclarationEdit id={id} returnReceived={data.stage === 'received'} onSaved={() => { setEditing(false); setSaved(true); void view.refresh(); }} /> : <><ResourceStatus resource={view.resource} onRefresh={() => { void view.refresh(); }} />{saved && <Notice>{t('parcelForm.saved')}</Notice>}{data && <ShipmentReadView id={id} data={data} fresh={!view.resource.loading && !view.resource.error} onEdit={() => { setSaved(false); setEditing(true); }} onRefresh={() => { void view.refresh(); }} />}</>}
  </Screen>;
}
