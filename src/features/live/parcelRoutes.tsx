import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLiveAccount } from '@/api/context';
import { plainServerText } from '@/api/account-operations';
import type { LiveWarehouse } from '@/api/contracts';
import { warehouseForStorage, type DeclarationDocument } from '@/api/operations-normalize';
import { useI18n } from '@/i18n/context';
import { Button, Notice, Screen, useUi } from '@/ui';
import { ResourceStatus, DetailRow, displayMoney } from './shared';
import { useOperationView } from './forms/useOperationView';
import { ParcelDeclarationForm, type ParcelFormSubmission } from './forms/ParcelDeclarationForm';
import { ParcelStatus } from './ParcelStatus';
import { ParcelDocuments } from './ParcelDocuments';
import { DeclarationSummary, ParcelPhotos } from './forms/ParcelContent';
import { WaitingActions } from './forms/WaitingActions';
import { StockServices } from './forms/StockServices';
import { DimensionsRow } from './ParcelMetadata';
import { ParcelDetailSection } from './ParcelDetailSection';
import { WaitingMetadata, StockRequestStatus } from './WaitingMetadata';
import { WaitingPasscode } from './forms/WaitingPasscode';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { declarationForDisplay } from './forms/declaration-currency';
import { waitingWarehouseOption, waitingWarehouseOptions } from '@/domain/waiting-warehouse-options';
import { declarationParcelTitle } from '@/domain/declaration-parcel-title';

const emptyDeclaration: DeclarationDocument = { title: null, currencyCode: null, currencyId: null, availableCurrencies: {}, items: [], invoices: [], customsDocuments: [] };
const warehouseOption = (warehouse: LiveWarehouse) => ({ value: warehouse.id, title: warehouse.title, countryCode: warehouse.code, currencyId: warehouse.currencyId, availableCurrencies: warehouse.availableCurrencies, requireInvoiceUpload: warehouse.requireInvoiceUpload });
const attached = (input: ParcelFormSubmission) => ({ invoiceList: input.invoiceList, customsDocsList: input.customsDocsList, invoices: input.invoices, customsDocuments: input.customsDocuments });

export function LiveIncomingFormRoute() {
  const { t } = useI18n();
  const { canMutate, mutate } = useLiveAccount();
  const warehouses = useOperationView({ kind: 'warehouses.read' });
  const [saved, setSaved] = useState(false);
  const options = waitingWarehouseOptions(warehouses.resource.data || []);
  return <Screen title={t(saved ? 'parcelForm.created' : 'parcelForm.newTitle')} subtitle={t('parcelForm.newSubtitle')}>
    {!saved && <ResourceStatus resource={warehouses.resource} onRefresh={() => { void warehouses.refresh(); }} />}
    {saved ? <><Notice>{t('parcelForm.createdMessage')}</Notice><Button onPress={() => router.replace('/waiting')}>{t('parcelForm.viewWaiting')}</Button></> : warehouses.resource.data ? <>
      {options.length === 0 ? <Notice error>{t('parcelForm.warehousesUnavailable')}</Notice> : <ParcelDeclarationForm mode="waiting-new" initial={emptyDeclaration} warehouses={options} canSubmit={canMutate && !warehouses.resource.error && !warehouses.resource.loading} returnHref="/waiting" onSubmit={input => mutate({ kind: 'waiting.create', input: { storage: input.storage, tracking: input.tracking, declarations: input.items, ...(input.currencyCode ? { currency: input.currencyCode } : {}), photosPackageRequested: 0, verificationPackageRequested: 0, ...attached(input) } })} onSaved={() => setSaved(true)} />}
    </> : null}
  </Screen>;
}

export function LiveIncomingDetailRoute({ id }: { id: string }) {
  const { s } = useUi();
  const { t, formatDate, formatNumber } = useI18n();
  const { canMutate, mutate } = useLiveAccount();
  const view = useOperationView({ kind: 'waiting.detail', id });
  const warehouses = useOperationView({ kind: 'warehouses.read' });
  const live = useLiveAccount();
  const [editing, setEditing] = useState(false);
  const [passcodeDirty, setPasscodeDirty] = useState(false);
  const [passcodePending, setPasscodePending] = useState(false);
  useDraftGuard(passcodeDirty, { fallbackHref: '/waiting', pending: passcodePending || live.mutationPending });
  const [saved, setSaved] = useState(false);
  const data = view.resource.data;
  const warehouse = warehouseForStorage(warehouses.resource.data, data?.storage, live.resources.waiting.data?.find(item => item.id === id)?.storageId);
  const waitingOption = warehouse ? waitingWarehouseOption(warehouse) : null;
  const metadataReady = !!waitingOption && !warehouses.resource.error && !warehouses.resource.loading;
  return <Screen title={editing ? t('parcelForm.editTitle') : declarationParcelTitle(data?.items || []) || t('parcelDetail.waitingTitle')} subtitle={data?.uid || data?.tracking || undefined}>
    {(editing || !metadataReady) && <ResourceStatus resource={warehouses.resource} onRefresh={() => { void warehouses.refresh(); }} />}
    {editing && data ? <ParcelDeclarationForm mode="waiting-edit" initial={data} tracking={data.tracking || ''} storage={waitingOption?.value || ''} warehouses={waitingOption ? [waitingOption] : []} currencyDisplay={data.currency} requireInvoiceUpload={metadataReady ? warehouse?.requireInvoiceUpload : null} canSubmit={canMutate && !view.resource.error && !view.resource.loading && metadataReady} returnHref="/waiting" onSubmit={input => mutate({ kind: 'waiting.edit', id: data.id, input: { storage: input.storage, tracking: input.tracking, declarations: input.items, ...(input.currencyCode ? { currency: input.currencyCode.toLowerCase() } : {}), ...(data.dimensions ? { dimensions: data.dimensions } : {}), ...(data.photosPackageRequested !== null ? { photosPackageRequested: data.photosPackageRequested ? 1 : 0 } : {}), ...(data.verificationPackageRequested !== null ? { verificationPackageRequested: data.verificationPackageRequested ? 1 : 0 } : {}), ...attached(input) } })} onSaved={() => { setEditing(false); setSaved(true); void view.refresh(); }} /> : <>
      <ResourceStatus resource={view.resource} onRefresh={() => { void view.refresh(); }} />
      {saved && <Notice>{t('parcelForm.saved')}</Notice>}
      {data && <>
        <ParcelDetailSection title={t('parcelSections.declaration')} icon="document-text-outline" action={{ label: t('parcelSections.edit'), disabled: !canMutate || passcodeDirty || live.mutationPending || !metadataReady || view.resource.loading || !!view.resource.error || !data.storage || !data.tracking, onPress: () => { setSaved(false); setEditing(true); } }}>
        <DeclarationSummary compact advancedFields={false} items={data.items.map(item => declarationForDisplay(item, metadataReady ? warehouse : undefined))} currency={null} />
        {metadataReady && warehouse?.requireInvoiceUpload === true && data.invoices.length === 0 && !view.resource.loading && !view.resource.error && <Notice error>{t('parcelForm.invoiceRequired')}</Notice>}
        <ParcelDocuments invoices={data.invoices} customsDocuments={data.customsDocuments} requireInvoiceUpload={metadataReady ? warehouse?.requireInvoiceUpload : null} />
        </ParcelDetailSection>
        <ParcelDetailSection title={t('parcelSections.general')} icon="information-circle-outline" collapsible>
        <View style={s.card}><DetailRow label={t('live.parcel.tracking')} value={data.tracking} /><DetailRow label={t('live.parcel.depot')} value={data.storage} country countryCode={warehouse?.code} />{data.createdAt && <DetailRow label={t('parcelDetail.createdAt')} value={formatDate(data.createdAt)} />}{data.amount !== null && <DetailRow label={t('live.parcel.productValue')} value={displayMoney(data.amount, data.currency, formatNumber)} />}{data.serviceName && <DetailRow label={t('live.parcel.service')} value={data.serviceName} />}{data.trackingStatus && <DetailRow label={t('live.parcel.trackingStatus')} value={['UNKNOWN', 'TRACKED', 'DELIVERED'].includes(data.trackingStatus) ? t(`tracking.${data.trackingStatus}`) : data.trackingStatus} />}</View>
        <WaitingMetadata detail={data} />
        </ParcelDetailSection>
        {(data.passcodeAllowed === true || data.passcode !== null) && <WaitingPasscode key={data.id} detail={data} fresh={!view.resource.loading && !view.resource.error} onRefresh={() => { void view.refresh(); }} onDirty={setPasscodeDirty} onPending={setPasscodePending} />}
        <WaitingActions id={data.id} enabled={!passcodeDirty && metadataReady && !view.resource.loading && !view.resource.error && !!data.storage && !!data.tracking} />
      </>}
    </>}
  </Screen>;
}

export function LiveStockDetailRoute({ id }: { id: string }) {
  const { s } = useUi();
  const { t, formatDate, formatNumber } = useI18n();
  const { canMutate, mutate } = useLiveAccount();
  const detail = useOperationView({ kind: 'stock.detail', id });
  const warehouses = useOperationView({ kind: 'warehouses.read' });
  const live = useLiveAccount();
  const declaration = useOperationView({ kind: 'stock.declaration.read', id });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const data = detail.resource.data;
  const document = declaration.resource.data;
  const refresh = live.refresh;
  const accountId = live.resources.profile.data?.id;
  useEffect(() => { void refresh(['warehouse']); }, [id, accountId, refresh]);
  const stockList = live.resources.warehouse;
  const verificationComment = !stockList.loading && !stockList.error ? stockList.data?.find(item => item.id === id)?.verificationComment : null;
  const warehouse = warehouseForStorage(warehouses.resource.data, data?.countryCode || data?.storage, live.resources.warehouse.data?.find(item => item.id === id)?.storageId);
  const metadataReady = !!warehouse && !warehouses.resource.error && !warehouses.resource.loading;
  return <Screen title={editing ? t('parcelForm.editDeclaration') : declarationParcelTitle(document?.items || []) || data?.title || t('parcelDetail.stockTitle')} subtitle={data?.uid || undefined}>
    {(editing || !metadataReady) && <ResourceStatus resource={warehouses.resource} onRefresh={() => { void warehouses.refresh(); }} />}
    {editing && document ? <ParcelDeclarationForm mode="stock" initial={document} currencyDisplay={data?.currency} storage={warehouse?.id} warehouses={warehouse ? [warehouseOption(warehouse)] : []} requireInvoiceUpload={metadataReady ? warehouse?.requireInvoiceUpload : null} canSubmit={canMutate && !detail.resource.error && !detail.resource.loading && !declaration.resource.error && !declaration.resource.loading && metadataReady} returnHref="/warehouse" onSubmit={input => mutate({ kind: 'stock.declaration.save', id, input: { declarationItems: input.items, ...(input.currencyCode ? { currency: input.currencyCode.toLowerCase() } : {}), ...attached(input) } })} onSaved={() => { setEditing(false); setSaved(true); void declaration.refresh(); void detail.refresh(); }} /> : <>
      <ResourceStatus resource={detail.resource} onRefresh={() => { void detail.refresh(); void refresh(['warehouse']); }} />
      {saved && <Notice>{t('parcelForm.saved')}</Notice>}
      {data && <>
        <ParcelStatus parcel={{ stage: 'warehouse', status: data.status, declared: data.declared, restrictions: { heldByProhibition: data.heldByProhibition, heldByDamage: data.heldByDamage, packingDenied: data.packingDenied } }} />
        {data.heldByProhibition && <Notice error>{t('live.parcel.prohibited')}{data.prohibitionComment ? `\n${data.prohibitionComment}` : ''}</Notice>}
        {data.heldByDamage && <Notice error>{t('live.parcel.damaged')}{data.damageComment ? `\n${data.damageComment}` : ''}</Notice>}
        {data.packingDenied && <Notice error>{t('live.parcel.packingDenied')}</Notice>}
      </>}
      <ParcelDetailSection title={t('parcelSections.declaration')} icon="document-text-outline" action={{ label: t('parcelSections.edit'), disabled: !canMutate || live.mutationPending || !metadataReady || !document || declaration.resource.loading || !!declaration.resource.error || detail.resource.loading || !!detail.resource.error, onPress: () => { setSaved(false); setEditing(true); } }}>
      <ResourceStatus resource={declaration.resource} onRefresh={() => { void declaration.refresh(); }} />
      {metadataReady && warehouse?.requireInvoiceUpload === true && document?.invoices.length === 0 && !declaration.resource.loading && !declaration.resource.error && <Notice error>{t('parcelForm.invoiceRequired')}</Notice>}
      {document && <><DeclarationSummary compact items={document.items.map(item => declarationForDisplay(item, metadataReady ? warehouse : undefined))} currency={null} /><ParcelDocuments invoices={document.invoices} customsDocuments={document.customsDocuments} requireInvoiceUpload={metadataReady ? warehouse?.requireInvoiceUpload : null} /></>}
      </ParcelDetailSection>
      {data && <>
        <ParcelDetailSection title={t('parcelDetail.photos')} icon="images-outline"><ParcelPhotos photos={data.photos} compact hideTitle /></ParcelDetailSection>
        <ParcelDetailSection title={t('parcelSections.general')} icon="information-circle-outline" collapsible>
        <View style={s.card}>
          <DetailRow label={t('live.parcel.tracking')} value={data.tracking} />
          {data.additionalTracking && <DetailRow label={t('parcelDetail.additionalTracking')} value={data.additionalTracking} />}
          <DetailRow label={t('live.parcel.depot')} value={data.storage || data.countryCode} country countryCode={data.countryCode || warehouse?.code} />
          {data.amount !== null && <DetailRow label={t('live.parcel.productValue')} value={`${displayMoney(data.amount, data.currency, formatNumber)}${data.currency ? '' : ` · ${t('parcelDetail.currencyUnavailable')}`}`} />}
          {data.weightKg !== null && <DetailRow label={t('parcelDetail.weight')} value={t('live.parcel.weight', { weight: formatNumber(data.weightKg, { maximumFractionDigits: 3 }) })} />}
          {data.volumeWeight !== null && <DetailRow label={t('parcelDetail.volumeWeight')} value={t('parcelDetail.volumeWeightValue', { weight: formatNumber(data.volumeWeight, { maximumFractionDigits: 3 }) })} />}
          {data.createdAt && <DetailRow label={t('parcelDetail.receivedAt')} value={formatDate(data.createdAt)} />}
          <DimensionsRow dimensions={data.dimensionsCm} />
          <StockRequestStatus status={data.declarationRequestStatus} />
          {data.freeDaysStorage !== null && <DetailRow label={t('parcelDetail.freeStorage')} value={String(data.freeDaysStorage)} />}
        </View>
        {verificationComment && <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('waitingMeta.verificationComment')}</Text><Text selectable style={s.body}>{plainServerText(verificationComment)}</Text></View>}
        {stockList.error && <Notice error>{t('waitingMeta.verificationUnavailable')}</Notice>}
        </ParcelDetailSection>
      </>}
      {data && !detail.resource.error && <StockServices detail={{ ...data, ...(!declaration.resource.loading && !declaration.resource.error && document ? { declarationItemCount: document.items.length } : {}), ...(!stockList.loading && !stockList.error && stockList.data?.find(item => item.id === id)?.verificationRequestStatus ? { verificationRequestStatus: stockList.data.find(item => item.id === id)?.verificationRequestStatus } : {}) }} storageId={metadataReady ? warehouse?.id : undefined} fresh={!detail.resource.loading && !detail.resource.error && data.status === 'in-stock'} onRefresh={() => { void detail.refresh(); void refresh(['warehouse']); }} />}
    </>}
  </Screen>;
}
