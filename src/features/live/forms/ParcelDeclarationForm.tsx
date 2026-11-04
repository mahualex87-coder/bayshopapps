import { countryDisplayName, currencyDisplayLabel } from '@/domain/presentation-labels';
import { useRef, useState } from 'react';
import { normalizeUserUrl } from '@/domain/user-url';
import { declarationParcelTitle } from '@/domain/declaration-parcel-title';
import { sortCountries, sortCurrencies } from '@/domain/option-order';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { DeclarationDocument } from '@/api/operations-normalize';
import { declarationItems, waitingTracking, invoiceRequirementError, OperationValidationError, type DeclarationItemInput } from '@/api/operations-contracts';
import type { MutationResult } from '@/api/mutations';
import { CountryLabel } from '@/components/CountryFlag';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Field, Notice, useUi } from '@/ui';
import { DeclarationEditor, newDeclarationItem, type DeclarationDraftItem } from './DeclarationEditor';
import { AttachmentsEditor, type ExistingFile, type StagedFile } from './AttachmentsEditor';
import { remoteFileUrl } from './remoteFiles';
import { displayMoney } from '../shared';
import { applyDeclarationCurrency, codeForCurrencyId, commonDeclarationCurrency, declarationCurrencySubmission, declarationForEditing } from './declaration-currency';
import { declarationTotals } from './declaration-totals';
import { declarationUploads } from './declaration-attachments';

export type WarehouseFormOption = { value: string; title: string; countryCode?: string | null; currency?: string | null; currencyId?: string | null; availableCurrencies?: { id: string; title: string; sign: string | null }[]; requireInvoiceUpload?: boolean | null };
export type ParcelFormSubmission = { tracking: string; storage: string; currencyCode: string | null; currencyId: string | null; items: DeclarationItemInput[]; invoiceList: string[]; customsDocsList: string[]; invoices: StagedFile[]; customsDocuments: StagedFile[] };
export function ParcelDeclarationForm({ mode, initial, tracking: initialTracking = '', storage: initialStorage = '', warehouses = [], requireInvoiceUpload, canSubmit, returnHref, onSubmit, onSaved }: { mode: 'waiting-new' | 'waiting-edit' | 'stock' | 'shipment'; initial: DeclarationDocument; tracking?: string; storage?: string; currencyDisplay?: string | null; warehouses?: WarehouseFormOption[]; requireInvoiceUpload?: boolean | null; canSubmit: boolean; returnHref: Href; onSubmit: (input: ParcelFormSubmission) => Promise<MutationResult>; onSaved: () => void }) {
  const { s } = useUi();
  const { t, formatNumber, language } = useI18n();
  const [tracking, setTracking] = useState(initialTracking);
  const [storage, setStorage] = useState(initialStorage);
  // For waiting/stock this is an explicit override, never an inferred default.
  const [currencyId, setCurrencyId] = useState(mode === 'shipment' ? initial.items.length ? Object.keys(initial.availableCurrencies).find(id => initial.availableCurrencies[id].toLowerCase() === commonDeclarationCurrency(initial.items)) || null : initial.currencyId : null);
  const [items, setItems] = useState<DeclarationDraftItem[]>(() => initial.items.length ? initial.items.map((item, index) => { const value = mode === 'shipment' ? item : declarationForEditing(item, warehouses.find(value => value.value === initialStorage)); return { ...value, clientKey: `saved-${item.id || index}`, url: item.url || '', quantity: String(item.quantity) }; }) : [{ ...newDeclarationItem(), ...(mode !== 'shipment' ? { currency: codeForCurrencyId(warehouses.find(value => value.value === initialStorage), warehouses.find(value => value.value === initialStorage)?.currencyId), currencyId: warehouses.find(value => value.value === initialStorage)?.currencyId || null } : {}) }]);
  const [invoices, setInvoices] = useState<ExistingFile[]>(initial.invoices);
  const [customs, setCustoms] = useState<ExistingFile[]>(initial.customsDocuments);
  const [newInvoices, setNewInvoices] = useState<StagedFile[]>([]);
  const [newCustoms, setNewCustoms] = useState<StagedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const submitting = useRef(false);
  const draft = JSON.stringify({ tracking, storage, currencyId, items, invoices, customs, newInvoices, newCustoms });
  const [original] = useState(draft);
  const { bypass, confirmDiscard } = useDraftGuard(draft !== original || busy, { fallbackHref: returnHref, pending: busy });
  const waiting = mode === 'waiting-new' || mode === 'waiting-edit';
  const selectedWarehouse = warehouses.find(value => value.value === storage);
  const requiredInvoice = mode === 'waiting-new' ? selectedWarehouse?.requireInvoiceUpload : requireInvoiceUpload;
  const uploads = declarationUploads(requiredInvoice, newInvoices, newCustoms);
  const invoiceError = mode === 'shipment' || mode === 'waiting-new' && !storage ? null : invoiceRequirementError(requiredInvoice, invoices.length, newInvoices.length);
  const currencyMetadata = mode === 'shipment' ? { currencyId: initial.warehouseCurrencyId, availableCurrencies: Object.entries(initial.availableCurrencies).map(([id, title]) => ({ id, title, sign: null })) } : selectedWarehouse;
  const warehouseCurrencies = sortCurrencies(currencyMetadata?.availableCurrencies || [], item => item.title);
  const commonCurrency = commonDeclarationCurrency(items);
  const selectedCurrencyId = currencyId || warehouseCurrencies.find(value => value.title.toLowerCase() === commonCurrency)?.id || (mode === 'waiting-new' && items.every(item => !item.currency && !item.currencyId) ? selectedWarehouse?.currencyId : null) || null;
  const warehouseCurrency = warehouseCurrencies.find(value => value.id === selectedCurrencyId);
  const newRowCode = codeForCurrencyId(currencyMetadata, selectedCurrencyId) || codeForCurrencyId(currencyMetadata, currencyMetadata?.currencyId);
  const mixedCurrencies = new Set(items.map(item => item.currency).filter(Boolean)).size > 1;
  const displayCurrency = mixedCurrencies ? t('declarationCurrency.mixed') : warehouseCurrency?.title || commonCurrency?.toUpperCase() || t(storage || mode === 'shipment' ? 'live.unavailable' : 'parcelForm.defaultCurrency');
  const moneySubmission = declarationCurrencySubmission(items, mode, currencyMetadata, currencyId);
  const totals = declarationTotals(items, t('live.unavailable'));
  const parcelTitle = declarationParcelTitle(items);
  const selectCurrency = (id: string) => {
    const code = codeForCurrencyId(currencyMetadata, id);
    if (!code) return;
    setCurrencyId(id);
    setItems(previous => applyDeclarationCurrency(previous, id, code));
  };
  const changeItems = (next: DeclarationDraftItem[]) => setItems(next.map(item => !item.id && !item.currencyId && !item.currency && newRowCode ? { ...item, currency: newRowCode, currencyId: warehouseCurrencies.find(value => value.title.toLowerCase() === newRowCode)?.id || null } : item));
  const editable = !busy && canSubmit && !unknown;
  const submit = async () => {
    if (submitting.current || !editable) return;
    setError(null); setFieldErrors({});
    const errors: Record<string, string> = {};
    if (invoiceError) errors.invoiceList = invoiceError;
    if (waiting) { try { waitingTracking(tracking.trim()); } catch { errors.tracking = 'parcelForm.invalidTracking'; } }
    if (waiting && (!storage || mode === 'waiting-new' && !warehouses.some(warehouse => warehouse.value === storage))) errors.storage = 'parcelForm.chooseWarehouse';
    if (mode === 'shipment' && !selectedCurrencyId) errors.currencyId = 'parcelForm.currencyRequired';
    if (moneySubmission.error) errors.currencyId = moneySubmission.error;
    const inputItems: DeclarationItemInput[] = items.map((item, index) => {
      const itemCode = item.currency || codeForCurrencyId(selectedWarehouse, item.currencyId);
      if (mode !== 'shipment' && item.currencyId && !itemCode) errors[`items.${index}.currency`] = 'parcelForm.currencyRequired';
      const value = { ...(item.id ? { id: item.id } : {}), title: item.title.trim(), url: normalizeUserUrl(item.url), quantity: item.quantity.trim(), price: item.price.trim().replace(',', '.'), ...(itemCode ? { currency: itemCode.toLowerCase() } : {}), ...(item.productType ? { productType: item.productType } : {}), ...(item.orderNumber ? { orderNumber: item.orderNumber } : {}) };
      for (const field of ['title', 'url', 'quantity', 'price'] as const) if (!value[field]) errors[`items.${index}.${field}`] = `parcelForm.invalid.${field}`;
      try { declarationItems([value], { outgoing: mode === 'shipment', stock: mode === 'stock' }); }
      catch (failure) { if (failure instanceof OperationValidationError) errors[`items.${index}.${failure.field}`] = ['title', 'url', 'quantity', 'price', 'currency', 'id'].includes(failure.field) ? `parcelForm.invalid.${failure.field}` : 'errors.invalidField'; else errors[`items.${index}`] = 'errors.invalidRequest'; }
      return value;
    });
    if (invoices.some(file => !file.id && !remoteFileUrl(file.url))) errors.invoiceList = 'parcelForm.attachmentIdentityMissing';
    if (customs.some(file => !file.id)) errors.customsDocsList = 'parcelForm.attachmentIdentityMissing';
    if (Object.keys(errors).length) { setFieldErrors(errors); setError('parcelForm.fixFields'); return; }
    submitting.current = true; setBusy(true);
    try {
      const result = await onSubmit({ tracking: tracking.trim(), storage, currencyCode: moneySubmission.currencyCode, currencyId: selectedCurrencyId, items: inputItems, invoiceList: invoices.map(file => file.id || remoteFileUrl(file.url)!), customsDocsList: customs.map(file => file.id!), invoices: uploads.invoices, customsDocuments: uploads.customsDocuments });
      if (result.ok) { bypass(onSaved); return; }
      setError(result.error || 'errors.loadFailed'); setFieldErrors(result.fieldErrors || {}); setUnknown(result.outcome === 'unknown');
    } catch { setError('errors.mutationUnknown'); setUnknown(true); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    {mode === 'waiting-new' && <View style={s.field}><Text style={s.label}>{t('parcelForm.warehouse')}</Text><View style={s.choices} accessibilityRole="radiogroup" accessibilityLabel={t('parcelForm.warehouse')}>{sortCountries(warehouses, warehouse => ({ code: warehouse.countryCode, name: warehouse.title, id: warehouse.value })).map(warehouse => <Pressable key={warehouse.value} disabled={!editable} accessibilityRole="radio" aria-checked={storage === warehouse.value} accessibilityState={{ checked: storage === warehouse.value, disabled: !editable }} accessibilityLabel={countryDisplayName(warehouse.countryCode, warehouse.title, language)} onPress={() => { setStorage(warehouse.value); setCurrencyId(null); const code = codeForCurrencyId(warehouse, warehouse.currencyId); setItems(previous => previous.map(item => !item.id && !item.currency && !item.currencyId && code ? { ...item, currency: code, currencyId: warehouse.currencyId } : item)); }} style={[s.choice, storage === warehouse.value && s.choiceSelected]}><CountryLabel label={warehouse.title} code={warehouse.countryCode} textStyle={[s.choiceText, storage === warehouse.value && s.choiceTextSelected]} size="small" /></Pressable>)}</View></View>}
    {mode === 'waiting-edit' && <View style={s.card}><Text style={s.label}>{t('parcelForm.warehouse')}</Text><CountryLabel label={selectedWarehouse?.title || storage} code={selectedWarehouse?.countryCode} textStyle={s.body} /></View>}
    {waiting && <Field label={t('parcelForm.tracking')} value={tracking} onChangeText={setTracking} editable={editable} autoCapitalize="characters" autoCorrect={false} error={fieldErrors.tracking ? t(fieldErrors.tracking) : undefined} />}
    {mode !== 'shipment' && parcelTitle && <Text selectable style={s.body}>{t('parcelForm.automaticTitle', { title: parcelTitle })}</Text>}
    {mode === 'shipment' && Object.keys(initial.availableCurrencies).length > 0 && <View style={s.field}><Text style={s.label}>{t('live.balance.currency')}</Text><View style={s.choices} accessibilityRole="radiogroup" accessibilityLabel={t('live.balance.currency')}>{warehouseCurrencies.map(({ id, title: label }) => <Pressable key={id} disabled={!editable} accessibilityRole="radio" aria-checked={selectedCurrencyId === id} accessibilityState={{ checked: selectedCurrencyId === id, disabled: !editable }} onPress={() => selectCurrency(id)} style={[s.choice, selectedCurrencyId === id && s.choiceSelected]}><Text style={[s.choiceText, selectedCurrencyId === id && s.choiceTextSelected]}>{currencyDisplayLabel(label)}</Text></Pressable>)}</View></View>}
    {mode !== 'shipment' && warehouseCurrencies.length > 0 && <View style={waiting ? s.card : s.field}>
      <Text style={s.label}>{t(waiting ? 'parcelForm.currency' : 'live.balance.currency')}</Text>
      {waiting && (mixedCurrencies || !selectedCurrencyId) && <Text style={s.heading}>{currencyDisplayLabel(displayCurrency)}</Text>}
      <View style={s.choices} accessibilityRole="radiogroup" accessibilityLabel={t(waiting ? 'parcelForm.currency' : 'live.balance.currency')}>
        {warehouseCurrencies.map(item => <Pressable key={item.id} disabled={!editable} accessibilityRole="radio" aria-checked={selectedCurrencyId === item.id} accessibilityState={{ checked: selectedCurrencyId === item.id, disabled: !editable }} onPress={() => selectCurrency(item.id)} style={[s.choice, selectedCurrencyId === item.id && s.choiceSelected]}><Text style={[s.choiceText, selectedCurrencyId === item.id && s.choiceTextSelected]}>{currencyDisplayLabel(item.title)}</Text></Pressable>)}
      </View>
    </View>}
    {(!waiting || warehouseCurrencies.length === 0) && <View style={s.card}><Text style={s.label}>{t('parcelForm.currency')}</Text><Text style={s.heading}>{currencyDisplayLabel(displayCurrency)}</Text></View>}
    {warehouseCurrencies.length > 0 && <Notice>{t('declarationCurrency.overrideHint')}</Notice>}
    {(mode === 'stock' || mode === 'shipment') && mixedCurrencies && <Notice error>{t(mode === 'stock' ? 'declarationCurrency.stockMixed' : 'declarationCurrency.shipmentMixed')}</Notice>}
    {items.some(item => item.requiresPriceEntry && !item.price.trim()) && <Notice error>{t('declarationCurrency.originalMissing')}</Notice>}
    <DeclarationEditor items={items} onChange={changeItems} currency={displayCurrency} disabled={!editable} advancedFields={mode === 'stock'} fieldErrors={fieldErrors} />
    {mode !== 'shipment' && invoiceError && <Notice error>{t(invoiceError)}</Notice>}
    {mode !== 'shipment' && requiredInvoice === true && !invoiceError && <Notice>{t('parcelForm.invoiceRequiredPresent')}</Notice>}
    {mode !== 'shipment' && <>
      {(requiredInvoice === true || invoices.length > 0) && <AttachmentsEditor title={t(requiredInvoice === true ? 'parcelForm.invoices' : 'parcelForm.existingDocuments')} existing={invoices} onExistingChange={setInvoices} staged={uploads.invoices} onStagedChange={setNewInvoices} maxBytes={25_000_000} disabled={!editable} readOnly={requiredInvoice !== true} />}
      <AttachmentsEditor title={t('parcelForm.customsDocumentsOptional')} existing={customs} onExistingChange={setCustoms} staged={uploads.customsDocuments} onStagedChange={files => { setNewCustoms(files); if (requiredInvoice === false) setNewInvoices([]); }} maxBytes={25_000_000} disabled={!editable} />
    </>}
    {Object.keys(totals).length > 0 && <View style={s.card}><Text style={s.label}>{t('parcelForm.productsTotal')}</Text>{sortCurrencies(Object.entries(totals), ([code]) => code).map(([code, amount]) => <Text key={code} style={s.heading}>{displayMoney(amount, code, formatNumber)}</Text>)}<Text style={s.small}>{t('parcelForm.shippingSeparate')}</Text></View>}
    {error && <Notice error>{t(error)}</Notice>}
    {Object.entries(fieldErrors).filter(([field]) => field !== 'tracking' && !/^items\.\d+\.(title|url|quantity|price)$/.test(field)).map(([field, message]) => <Notice key={field} error>{field.startsWith('items.') ? `${t('parcelForm.productNumber', { number: formatNumber(Number(field.split('.')[1]) + 1) })}: ` : ''}{t(message)}</Notice>)}
    {unknown ? <><Notice>{t('parcelForm.unknownHint')}</Notice><Button secondary onPress={() => router.push(returnHref)}>{t('parcelForm.checkAccount')}</Button></> : <Button disabled={!editable || !!invoiceError} onPress={() => { void submit(); }}>{t(busy ? 'parcelForm.saving' : mode === 'waiting-new' ? 'parcelForm.create' : 'parcelForm.save')}</Button>}
    <Button secondary disabled={busy} onPress={() => confirmDiscard(() => bypass(() => router.canGoBack() ? router.back() : router.replace(returnHref)))}>{t('parcelForm.cancel')}</Button>
  </View>;
}
