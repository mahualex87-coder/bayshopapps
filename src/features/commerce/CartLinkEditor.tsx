import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useLiveAccount } from '@/api/context';
import { errorMessage } from '@/api/client';
import { cartMarketMatches, type CartLinkData, type CartSaved } from '@/api/cart-link';
import { requireShopMatch, type DirectoryShop } from '@/api/shop-directory';
import { cartItemFields, cartProductUrl, OperationValidationError } from '@/api/operations-contracts';
import { normalizeUserUrl } from '@/domain/user-url';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { OptionPicker } from '@/features/accountops/shared';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { ProductDetailsFields } from './ProductDetailsFields';
import { useShopBrowse } from '@/features/shops/useShopBrowse';
import { ZaraShopBrowser } from '@/features/shops/ZaraShopBrowser';
import { zaraProductUrl } from '@/features/shops/zara-product';
import type { ZaraImport } from '@/features/shops/zara-browser-capture';
import { ResourceStatus } from '@/features/live/shared';

const blank = { title: '', quantity: '1', price: '', shipping: '', color: '', size: '', comment: '' };
type ShopSelection = { id: string; countryCode?: string };
const romanianMarket = { countryCode: 'RO', currency: 'RON' } as const;
type EditorProps = { zaraUrl?: string | null; initialStorageId?: string; selectedShop?: ShopSelection; inlineShop?: DirectoryShop; onClose?: () => void };

function EditorSection({ title, subtitle, close, closeDisabled, children }: PropsWithChildren<{ title: string; subtitle?: string; close?: () => void; closeDisabled: boolean }>) {
  const { t } = useI18n(); const { s, colors } = useUi();
  if (!close) return <Screen title={title} subtitle={subtitle}>{children}</Screen>;
  return <View style={[s.card, { gap: 12 }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text accessibilityRole="header" style={[s.heading, { flex: 1 }]}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('shops.closeForm')} accessibilityState={{ disabled: closeDisabled }} disabled={closeDisabled} onPress={close}
        style={({ pressed }) => [{ minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' }, pressed && s.pressed]}>
        <Ionicons accessible={false} name="close-circle-outline" size={23} color={closeDisabled ? colors.muted : colors.accentText} />
      </Pressable>
    </View>
    {subtitle && <Text style={s.small}>{subtitle}</Text>}
    {children}
  </View>;
}

export function CartLinkEditor(props: EditorProps) {
  const live = useLiveAccount(); const { language } = useI18n();
  return <CartLinkForm key={JSON.stringify([live.authRevision, live.accountId, live.accountRevision, language, props.selectedShop, props.inlineShop?.id])} {...props} />;
}
function CartLinkForm({ initialStorageId, selectedShop, inlineShop, zaraUrl, onClose }: EditorProps) {
  const live = useLiveAccount(); const { t } = useI18n(); const { s } = useUi();
  const [browsing, setBrowsing] = useState(false);
  const [replacement, setReplacement] = useState<ZaraImport | null>(null);
  const [imported, setImported] = useState<ZaraImport | null>(null);
  const [url, setUrl] = useState(''); const [checkedUrl, setCheckedUrl] = useState('');
  const [lookup, setLookup] = useState<CartLinkData | null>(null); const [storageId, setStorageId] = useState(initialStorageId || '');
  const [values, setValues] = useState(blank); const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null); const [errors, setErrors] = useState<Record<string, string>>({});
  const [unknown, setUnknown] = useState(false); const [saved, setSaved] = useState<CartSaved | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null); const submitting = useRef(false);
  const shopView = useShopBrowse(selectedShop && !inlineShop ? { kind: 'shops.detail', ...selectedShop } : null);
  const shopReady = !selectedShop || (inlineShop?.directoryVerified && inlineShop.id === selectedShop.id) || !!shopView.resource.data && !shopView.resource.error && !shopView.resource.loading;
  useEffect(() => () => request.current?.abort(), []);
  const busy = checking || live.mutationPending;
  const dirty = !saved && (!!url || JSON.stringify(values) !== JSON.stringify(blank) || busy);
  function closeInline() {
    if (onClose && !submitting.current && !unknown) guard.confirmDiscard(onClose);
  }
  const guard = useDraftGuard(dirty, {
    fallbackHref: onClose ? '/shops' : '/cart', pending: busy,
    onBack: () => {
      if (!onClose || !dirty || unknown) return false;
      closeInline();
      return true;
    },
  });
  const storage = lookup?.storages.find(item => item.id === storageId);
  const checked = !!lookup && checkedUrl === normalizeUserUrl(url) && !!storage && shopReady && (!imported || cartMarketMatches(lookup, storage.id, romanianMarket));
  const check = async (selectedId?: string, changedCountry = false, product = imported) => {
    if (busy || saved || unknown || !shopReady) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const targetUrl = product?.url ?? normalizeUserUrl(url); setChecking(true); setError(null); setErrors({}); setLookup(null); setCheckedUrl('');
    try {
      const canonicalUrl = cartProductUrl(targetUrl);
      const result = await live.readView({ kind: 'cart.link', url: canonicalUrl, ...(selectedId ? { storageId: selectedId } : {}) }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const selected = result.storageId || (result.storages.some(item => item.id === selectedId) ? selectedId! : '');
      if (product && !cartMarketMatches(result, selected, romanianMarket)) {
        setError('zara.market'); return;
      }
      if (selectedShop) {
        const matched = await live.readView({ kind: 'shops.match', ...selectedShop, url: canonicalUrl }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        requireShopMatch(matched, selectedShop.id, selected);
      }
      const currencyContextChanged = changedCountry || !!storageId && selected !== storageId;
      setUrl(canonicalUrl); setCheckedUrl(canonicalUrl); setLookup(result); setStorageId(selected);
      setValues(previous => ({ ...previous, ...(!product && currencyContextChanged ? { price: '' } : {}), shipping: currencyContextChanged || !previous.shipping ? result.shipping === null ? '' : String(result.shipping) : previous.shipping }));
    } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
    finally { if (!controller.signal.aborted) setChecking(false); }
  };
  const applyProduct = (product: ZaraImport) => {
    if (busy || saved || unknown || submitting.current) return;
    setReplacement(null); setImported(product); setUrl(product.url);
    setLookup(null); setCheckedUrl(''); setStorageId(initialStorageId || '');
    setValues('title' in product ? { ...blank, title: product.title, price: product.price, color: product.color, size: product.size } : blank);
    void check(initialStorageId, false, product);
  };
  const acceptProduct = (product: ZaraImport) => {
    if (busy || saved || unknown || submitting.current) return;
    setBrowsing(false);
    if (dirty) setReplacement(product);
    else applyProduct(product);
  };
  const useManualEntry = () => {
    setImported(null); setLookup(null); setCheckedUrl(''); setValues(blank); setStorageId(initialStorageId || '');
    setError(null); setErrors({});
  };
  const save = async (checkout: boolean) => {
    if (submitting.current || !checked || replacement || !lookup?.canSave || !storage || !live.canMutate || busy || unknown || saved) return;
    setError(null); setErrors({});
    const input = { ...values, storage_id: storage.id, url: checkedUrl, price: values.price.trim().replace(',', '.'), shipping: values.shipping.trim().replace(',', '.'), ...(selectedShop ? { selectedShop } : {}), ...(imported ? { expectedMarket: romanianMarket } : {}) };
    try { cartItemFields(input); } catch (cause) { setError('errors.validation'); if (cause instanceof OperationValidationError) setErrors(cause.fieldErrors); return; }
    submitting.current = true;
    try {
      const result = await live.mutate({ kind: 'cart.create', input });
      if (!result.ok) { setError(result.error || 'errors.saveFailed'); setErrors(result.fieldErrors || {}); setUnknown(result.outcome === 'unknown'); return; }
      const record = result.data as CartSaved;
      setSaved(record); setChecking(true);
      if (record?.id) {
        const controller = new AbortController(); request.current = controller;
        try {
          const product = await live.readView({ kind: 'cart.detail', id: record.id }, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (product.id === record.id && product.shopId && (product.status === null || product.status === 'unpaid')) {
            setReadyId(record.id);
            if (checkout) guard.bypass(() => router.replace({ pathname: '/order/new', params: { carts: record.id! } }));
          }
        } catch { /* The save is confirmed. A failed read never authorizes another POST. */ }
      }
    } finally { submitting.current = false; setChecking(false); }
  };
  const closeProps = { close: onClose ? closeInline : undefined, closeDisabled: busy || unknown };
  if (saved) return <EditorSection title={t('cartLink.savedTitle')} {...closeProps}><Notice>{t('cartLink.saved')}</Notice><Text style={s.heading}>{values.title}</Text>{saved.uid && <Text selectable style={s.small}>{saved.uid}</Text>}{!readyId && <Notice>{t('cartLink.savedContinue')}</Notice>}{readyId && <Button disabled={checking} onPress={() => guard.bypass(() => router.replace({ pathname: '/order/new', params: { carts: readyId } }))}>{t('cartLink.buyOne')}</Button>}<Button secondary onPress={() => guard.bypass(() => router.replace({ pathname: '/cart', params: { storageId: saved?.storageId || storageId } }))}>{t('commerce.openCart')}</Button></EditorSection>;
  return <EditorSection title={t('cartLink.title')} subtitle={t(selectedShop && inlineShop ? 'shops.pasteProduct' : 'cartLink.intro')} {...closeProps}>
    {selectedShop && !inlineShop && <><ResourceStatus resource={shopView.resource} onRefresh={() => { void shopView.refresh(); }} />{shopView.resource.data && <View style={s.card}><Text style={s.heading}>{shopView.resource.data.title}</Text><Text style={s.small}>{t('shops.pasteProduct')}</Text></View>}{!shopView.resource.loading && !shopView.resource.error && !shopView.resource.data && <Notice error>{t('shops.notAvailable')}</Notice>}</>}
    {replacement && <View style={[s.card, { gap: 8 }]}><Notice>{t('zara.replaceHelp')}</Notice>
      <Text style={s.body}>{'title' in replacement ? [replacement.title, replacement.color, replacement.size, replacement.price + ' RON'].join(' · ') : replacement.url}</Text>
      <Button onPress={() => applyProduct(replacement)}>{t('zara.replace')}</Button>
      <Button secondary onPress={() => setReplacement(null)}>{t('confirmation.keepEditing')}</Button>
    </View>}
    {zaraUrl && <Button secondary disabled={busy || unknown || !!replacement} onPress={() => setBrowsing(true)}>{t('zara.browse')}</Button>}
    {browsing && zaraUrl && <ZaraShopBrowser startUrl={zaraProductUrl(url) || zaraUrl} onClose={() => setBrowsing(false)} onProduct={acceptProduct} />}
    {imported && <View style={{ gap: 5 }}>
      {'title' in imported ? <>
        <Text accessibilityRole="header" style={s.heading}>{imported.title}</Text>
        <Text style={s.small}>{[imported.color, imported.size, imported.price + ' RON'].join(' · ')}</Text>
        {imported.sku && <Text selectable style={s.small}>SKU {imported.sku}</Text>}
        <Text style={s.small}>{t('zara.review')}</Text>
      </> : <Text style={s.small}>{t('zara.linkOnly')}</Text>}
      <Button secondary disabled={busy || unknown} onPress={() => guard.confirmDiscard(useManualEntry)}>{t('zara.manual')}</Button>
    </View>}
    <Field label={t('commerce.url')} value={url} onChangeText={value => { setUrl(value); setLookup(null); setCheckedUrl(''); }} editable={!busy && !unknown && !imported} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://" maxLength={2000} error={errors.url ? t(errors.url) : undefined} />
    <Button secondary disabled={busy || !url.trim() || unknown || !shopReady} onPress={() => { void check(storageId); }}>{t(checking ? 'cartLink.checking' : 'cartLink.check')}</Button>
    {lookup && <View style={s.card}>
      <OptionPicker country label={t('cartLink.orderCountry')} value={storageId} options={lookup.storages.map(item => ({ id: item.id, countryCode: item.countryCode, title: item.countryTitle }))} disabled={busy || unknown || !!imported || !!selectedShop || lookup.writeMode === 'legacy-matched'} onChange={value => { if (value !== storageId) { setStorageId(value); void check(value, true); } }} />
      {lookup.shop ? <View style={{ gap: 3 }}><Text style={s.small}>{t('cartLink.shop')}</Text><Text style={s.heading}>{lookup.shop.title}</Text></View> : lookup.canSave ? <Notice>{t(lookup.writeMode === 'legacy-matched' ? 'cartLink.matchedLegacy' : 'cartLink.manual')}</Notice> : null}
      {!lookup.canSave && <Notice error>{t('cartLink.serverUpdateRequired')}</Notice>}
    </View>}
    {checked && lookup.canSave && <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{t('cartLink.details')}</Text>
      <ProductDetailsFields values={values} onChange={(key, value) => setValues(previous => ({ ...previous, [key]: value }))} errors={errors} disabled={busy || unknown} currency={storage?.currency || storage?.currencySign} />
    </View>}
    {error && <Notice error>{t(error)}</Notice>}
    {unknown && <><Notice error>{t('commerce.unknown')}</Notice><Button secondary onPress={() => guard.bypass(() => router.replace({ pathname: '/cart', params: { storageId } }))}>{t('commerce.checkList')}</Button></>}
    {checked && lookup.canSave && <><Button disabled={busy || !!replacement || unknown || !live.canMutate || !lookup?.canSave} onPress={() => { void save(false); }}>{t('cartLink.add')}</Button><Button secondary disabled={busy || !!replacement || unknown || !live.canMutate || !lookup?.canSave} onPress={() => { void save(true); }}>{t('cartLink.buyOne')}</Button></>}
  </EditorSection>;
}
