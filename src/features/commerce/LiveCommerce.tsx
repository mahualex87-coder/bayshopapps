import { currencyDisplayLabel } from '@/domain/presentation-labels';
import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeUserUrl } from '@/domain/user-url';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cartSelectionIssue, groupCartByShop, type CartShopGroup } from '@/domain/cart-shops';
import { useLiveAccount } from '@/api/context';
import { cartItemFields, OperationValidationError, type CartItemInput } from '@/api/operations-contracts';
import type { CartItem } from '@/api/operations-normalize';
import type { LiveWarehouse } from '@/api/contracts';
import { useI18n } from '@/i18n/context';
import { useDraftGuard } from '@/navigation/useDraftGuard';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { OptionPicker } from '@/features/accountops/shared';
import { DetailRow, ResourceStatus, displayMoney } from '@/features/live/shared';
import { useOperationView } from '@/features/live/forms/useOperationView';
import { RemotePageButton } from '@/features/content/RemotePageButton';
import { CountryLabel } from '@/components/CountryFlag';
import { commercePage, filterCart } from './list-model';
import { ProductDetailsFields } from './ProductDetailsFields';

function PageControls({ kind, result, onChange, disabled = false }: { kind: 'products' | 'orders'; result: { page: number; pages: number; total: number; from: number; to: number }; onChange: (page: number) => void; disabled?: boolean }) {
  const { s } = useUi();
  const { t, countt, formatNumber } = useI18n();
  const range = result.from === result.to ? formatNumber(result.from) : `${formatNumber(result.from)}–${formatNumber(result.to)}`;
  return <View style={{ gap: 8 }}><Text accessibilityLiveRegion="polite" style={s.small}>{countt(`commerce.${kind}Range`, result.total, { range })}</Text>{result.pages > 1 && <><Text style={s.small}>{t('commerce.page', { page: formatNumber(result.page), pages: formatNumber(result.pages) })}</Text><View style={s.row}><View style={{ flex: 1 }}><Button secondary disabled={disabled || result.page <= 1} onPress={() => onChange(result.page - 1)}>{t('commerce.previousPage')}</Button></View><View style={{ flex: 1 }}><Button secondary disabled={disabled || result.page >= result.pages} onPress={() => onChange(result.page + 1)}>{t('commerce.nextPage')}</Button></View></View></>}</View>;
}
function CartEditor({ warehouse, item, onSaved, onClose, onCheck }: { warehouse: LiveWarehouse; item?: CartItem; onSaved: () => void; onClose: () => void; onCheck: () => void }) {
  const { s } = useUi();
  const live = useLiveAccount(); const { t } = useI18n();
  const initial = { title: item?.title || '', url: item?.url || '', quantity: item ? String(item.quantity) : '1', price: item ? String(item.price) : '', shipping: item?.shipping == null ? '' : String(item.shipping), color: item?.color || '', size: item?.size || '', comment: item?.comment || '' };
  const [values, setValues] = useState(initial); const [error, setError] = useState<string | null>(null); const [errors, setErrors] = useState<Record<string, string>>({}); const [unknown, setUnknown] = useState(false);
  const currency = item ? item.currency : currencyDisplayLabel(warehouse.availableCurrencies?.find(value => value.id === warehouse.currencyId)?.title);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const guard = useDraftGuard(dirty || live.mutationPending, { fallbackHref: '/cart', pending: live.mutationPending });
  const save = async () => {
    if (!live.canMutate || unknown) return;
    setError(null); setErrors({});
    const input: CartItemInput = { storage_id: item?.storageId ?? warehouse.id, ...values, url: normalizeUserUrl(values.url), price: values.price.trim().replace(',', '.'), shipping: values.shipping.trim().replace(',', '.'), ...(item?.comment == null && values.comment === initial.comment ? { comment: undefined } : {}) };
    try { cartItemFields(input); }
    catch (error) { setError('errors.validation'); if (error instanceof OperationValidationError) setErrors(error.fieldErrors); return; }
    const result = await live.mutate(item ? { kind: 'cart.edit', id: item.id, input } : { kind: 'cart.create', input });
    if (result.ok) guard.bypass(onSaved);
    else { setError(result.error || 'errors.saveFailed'); setErrors(result.fieldErrors || {}); setUnknown(result.outcome === 'unknown'); }
  };
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t(item ? 'commerce.edit' : 'commerce.add')}</Text>
    <CountryLabel code={warehouse.code} label={warehouse.title} textStyle={s.small} size="small" />
    {!item && <Notice>{t('commerce.currencyContext')}</Notice>}
    <DetailRow label={t('live.balance.currency')} value={currencyDisplayLabel(currency) || null} />
    <Field label={t('commerce.url')} value={values.url} onChangeText={value => setValues(previous => ({ ...previous, url: value }))} error={errors.url ? t(errors.url) : undefined} editable={!item && !live.mutationPending && !unknown} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
    {item && <Text style={s.small}>{t('cartLink.linkLocked')}</Text>}
    <ProductDetailsFields values={values} onChange={(key, value) => setValues(previous => ({ ...previous, [key]: value }))} errors={errors} disabled={live.mutationPending || unknown} currency={currencyDisplayLabel(currency)} />
    {error && <Notice error>{t(error)}</Notice>}
    {unknown && <><Notice error>{t('commerce.unknown')}</Notice><Button secondary onPress={() => guard.confirmDiscard(onCheck)}>{t('commerce.checkList')}</Button></>}
    <Button disabled={!live.canMutate || unknown} onPress={() => { void save(); }}>{t(live.mutationPending ? 'accountOps.saving' : 'accountOps.save')}</Button>
    <Button secondary disabled={live.mutationPending} onPress={() => guard.confirmDiscard(onClose)}>{t('accountOps.cancel')}</Button>
  </View>;
}

function CartQuote({ ids, shopId }: { ids: string[]; shopId: string }) {
  const { s } = useUi(); const { t, formatNumber } = useI18n();
  const quote = useOperationView({ kind: 'cart.prices', ids });
  const valid = quote.resource.data?.shopId === shopId && (ids.length === 1 || quote.resource.data.isComplex === true);
  return <View style={s.card}><Text style={s.heading}>{t('commerce.quoteTitle')}</Text><ResourceStatus resource={quote.resource} onRefresh={() => { void quote.refresh(); }} />
    {quote.resource.data?.lines.map(line => <View key={line.key} style={s.row}><Text style={[s.body, { flex: 1 }]}>{t(`commerce.${line.key}`)}</Text><Text style={s.heading}>{displayMoney(line.amount, quote.resource.data!.currency, formatNumber)}</Text></View>)}
    {quote.resource.data && !quote.resource.error && !quote.resource.loading && (valid ? <Button onPress={() => router.push({ pathname: '/order/new', params: { carts: ids.join(',') } })}>{t('commerce.checkout')}</Button> : <Notice error>{t('cartLink.selectionChanged')}</Notice>)}
  </View>;
}

function ShopCart({ group, ready, busy, onEdit, onDelete }: { group: CartShopGroup; ready: boolean; busy: boolean; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  const { t, formatNumber } = useI18n(); const { s, colors } = useUi();
  const [selected, setSelected] = useState<string[]>([]); const [quoted, setQuoted] = useState<string[] | null>(null); const [page, setPage] = useState(1); const [deleteId, setDeleteId] = useState<string | null>(null);
  const paged = commercePage(group.items, page); const issue = cartSelectionIssue(group, selected);
  const change = (id: string) => { setQuoted(null); setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : group.isComplex === true ? [...previous, id] : [id]); };
  return <View style={{ gap: 10 }}>
    <View style={{ gap: 5, paddingTop: 10 }}><View style={[s.row, { gap: 10 }]}><Ionicons accessible={false} name="storefront-outline" color={colors.accent} size={22} /><Text style={[s.heading, { flex: 1 }]}>{group.title || t('cartLink.unknownShop')}</Text>{group.currency && <Text style={s.small}>{group.currency}</Text>}</View><Text style={s.small}>{t(group.isComplex === true ? 'cartLink.groupHelp' : group.shopId ? 'cartLink.singleOnly' : 'cartLink.shopPending')}</Text></View>
    {paged.items.map(item => <View key={item.id} style={s.card}>
      <Pressable accessibilityRole={group.isComplex === true ? 'checkbox' : 'radio'} accessibilityLabel={t('cartLink.selectProduct', { title: item.title })} aria-checked={selected.includes(item.id)} accessibilityState={{ checked: selected.includes(item.id), disabled: !ready || !group.shopId }} disabled={!ready || !group.shopId} onPress={() => change(item.id)} style={({ pressed }) => [{ minHeight: minTouchTarget, flexDirection: 'row', gap: 10, alignItems: 'center' }, pressed && s.pressed]}><Ionicons accessible={false} name={selected.includes(item.id) ? 'checkbox' : 'square-outline'} size={23} color={selected.includes(item.id) ? colors.accent : colors.muted} /><View style={{ flex: 1 }}><Text style={s.heading}>{item.title}</Text>{item.uid && <Text selectable style={s.small}>{item.uid}</Text>}</View></Pressable>
      <View style={s.row}><Text style={s.small}>{t('commerce.quantity')}: {formatNumber(item.quantity)}</Text><Text style={s.heading}>{displayMoney(item.price, item.currency, formatNumber)}</Text></View>
      {item.shipping !== null && <View style={s.row}><Text style={[s.small, { flex: 1 }]}>{t('commerce.shipping')}</Text><Text style={s.body}>{displayMoney(item.shipping, item.currency, formatNumber)}</Text></View>}
      {(item.color || item.size) && <Text style={s.small}>{[item.color, item.size].filter(Boolean).join(' · ')}</Text>}{item.comment && <Text style={s.body}>{item.comment}</Text>}
      {item.url && <RemotePageButton url={item.url} label={t('commerce.url')} />}
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button secondary disabled={!ready} onPress={() => onEdit(item.id)}>{t('commerce.edit')}</Button></View><View style={{ flex: 1 }}><Button secondary disabled={!ready} onPress={() => setDeleteId(item.id)}>{t('commerce.delete')}</Button></View></View>
      {deleteId === item.id && <><Notice error>{t('commerce.deleteQuestion')}</Notice><Button disabled={!ready} onPress={() => { setQuoted(null); onDelete(item.id); }}>{t('commerce.confirmDelete')}</Button><Button secondary disabled={busy} onPress={() => setDeleteId(null)}>{t('accountOps.cancel')}</Button></>}
    </View>)}
    {paged.pages > 1 && <PageControls kind="products" result={paged} onChange={setPage} disabled={busy} />}
    {selected.length > 0 && <Text style={s.small}>{t('cartLink.selected', { count: formatNumber(selected.length) })}</Text>}
    {issue && selected.length > 0 && <Notice>{t(issue)}</Notice>}
    <Button disabled={!ready || !!issue} onPress={() => setQuoted([...selected])}>{t('cartLink.quoteSelected')}</Button>
    {quoted && !cartSelectionIssue(group, quoted) && group.shopId && <CartQuote key={JSON.stringify(quoted)} ids={quoted} shopId={group.shopId} />}
  </View>;
}

function CartWarehouse({ warehouse, onLock }: { warehouse: LiveWarehouse; onLock: (locked: boolean) => void }) {
  const live = useLiveAccount(); const { t, language } = useI18n();
  const cart = useOperationView({ kind: 'cart.list', countryCode: warehouse.code });
  const [editing, setEditing] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [unknown, setUnknown] = useState(false); const [saved, setSaved] = useState(false); const [search, setSearch] = useState('');
  const detail = useOperationView(editing ? { kind: 'cart.detail', id: editing } : null);
  const refreshCart = cart.refresh;
  const hadFocus = useRef(false);
  useFocusEffect(useCallback(() => { if (hadFocus.current && !editing) void refreshCart(); hadFocus.current = true; }, [refreshCart, editing]));
  useEffect(() => { onLock(!!editing); return () => onLock(false); }, [editing, onLock]);
  const ready = live.canMutate && !unknown && !cart.resource.loading && !cart.resource.error;
  const filtered = filterCart(cart.resource.data || [], search, language); const groups = groupCartByShop(filtered);
  const savedChange = () => { setEditing(null); setSaved(true); setUnknown(false); void cart.refresh(); };
  const remove = async (id: string) => {
    if (!ready) return; setError(null); setSaved(false);
    const result = await live.mutate({ kind: 'cart.delete', ids: [id] });
    if (result.ok) { setSaved(true); void cart.refresh(); }
    else { setError(result.error || 'errors.saveFailed'); setUnknown(result.outcome === 'unknown'); }
  };
  return <>
    {!editing && <ResourceStatus resource={cart.resource} onRefresh={() => { if (!live.mutationPending) void cart.refresh(); }} />}
    {error && <Notice error>{t(error)}</Notice>}{saved && <Notice>{t('accountOps.saved')}</Notice>}
    {unknown && <><Notice error>{t('commerce.unknown')}</Notice><Button secondary onPress={() => { setUnknown(false); void cart.refresh(); }}>{t('commerce.checkList')}</Button></>}
    {editing ? <>
      {!detail.resource.data && <ResourceStatus resource={detail.resource} onRefresh={() => { void detail.refresh(); }} />}
      {detail.resource.data && <CartEditor key={`${editing}:${detail.resource.updatedAt}`} warehouse={warehouse} item={detail.resource.data} onSaved={savedChange} onClose={() => setEditing(null)} onCheck={() => { setEditing(null); setSaved(false); setUnknown(false); void cart.refresh(); }} />}
      {!detail.resource.data && <Button secondary onPress={() => setEditing(null)}>{t('accountOps.cancel')}</Button>}
    </> : <>
      <Button disabled={live.mutationPending || unknown} onPress={() => router.push({ pathname: '/order/link', params: { storageId: warehouse.id } })}>{t('cartLink.title')}</Button>
      {!!cart.resource.data?.length && <Field label={t('commerce.search')} value={search} onChangeText={setSearch} autoCorrect={false} editable={!live.mutationPending} />}
      {cart.resource.data?.length === 0 && !cart.resource.loading && !cart.resource.error && <Notice>{t('commerce.emptyCart')}</Notice>}
      {!!cart.resource.data?.length && !filtered.length && !cart.resource.loading && !cart.resource.error && <Notice>{t('commerce.noMatch')}</Notice>}
      {groups.map(group => <ShopCart key={group.key} group={group} ready={!!ready} busy={live.mutationPending} onEdit={id => { setSaved(false); setEditing(id); }} onDelete={id => { void remove(id); }} />)}
    </>}
  </>;
}
export function LiveCartScreen({ initialStorageId }: { initialStorageId?: string }) {
  const { t } = useI18n(); const live = useLiveAccount(); const warehouses = useOperationView({ kind: 'warehouses.read' }); const [warehouseId, setWarehouseId] = useState(initialStorageId || ''); const [locked, setLocked] = useState(false);
  const warehouse = warehouses.resource.data?.find(item => item.id === warehouseId) || warehouses.resource.data?.[0];
  return <Screen title={t('commerce.cart')} subtitle={t('commerce.cartIntro')}>
    {!locked && <ResourceStatus resource={warehouses.resource} onRefresh={() => { void warehouses.refresh(); }} />}
    {warehouses.resource.data && <OptionPicker country label={t('commerce.warehouse')} value={warehouse?.id || ''} options={warehouses.resource.data.map(item => ({ id: item.id, title: item.title, countryCode: item.code }))} onChange={setWarehouseId} disabled={live.mutationPending || locked} />}
    {warehouse && <CartWarehouse key={`${live.accountId}:${live.accountRevision}:${warehouse.id}`} warehouse={warehouse} onLock={setLocked} />}
  </Screen>;
}
