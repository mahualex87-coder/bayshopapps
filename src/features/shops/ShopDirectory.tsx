import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveAccount } from '@/api/context';
import type { DirectoryShop } from '@/api/shop-directory';
import { CountryLabel } from '@/components/CountryFlag';
import { countryDisplayName } from '@/domain/presentation-labels';
import { useI18n } from '@/i18n/context';
import { OptionPicker } from '@/features/accountops/shared';
import { useShopBrowse } from './useShopBrowse';
import { EmptyState, ResourceStatus, displayMoney } from '@/features/live/shared';
import { RemotePageButton } from '@/features/content/RemotePageButton';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { shopCategories, shopCountries, shopOrderParams, shopPage } from './shop-list';

function ShopTerms({ shop, compact = false }: { shop: DirectoryShop; compact?: boolean }) {
  const { t, formatNumber } = useI18n(); const { s } = useUi();
  return <View style={{ gap: 7 }}>
    {shop.commissionPercent !== null && <Text style={s.body}>{t('shops.commission')}: {formatNumber(shop.commissionPercent)}%</Text>}
    {!compact && shop.commissionCurrency && <>
      {shop.commissionMin !== null && <Text style={s.small}>{t('shops.minimum')}: {displayMoney(shop.commissionMin, shop.commissionCurrency, formatNumber)}</Text>}
      {shop.commissionMax !== null && <Text style={s.small}>{t('shops.maximum')}: {displayMoney(shop.commissionMax, shop.commissionCurrency, formatNumber)}</Text>}
    </>}
    {!compact && shop.currency && <Text style={s.small}>{t('shops.currency')}: {shop.currency}</Text>}
  </View>;
}
export function ShopsScreen() {
  const live = useLiveAccount();
  return <ShopsList key={JSON.stringify([live.authRevision, live.accountId, live.accountRevision, live.language])} />;
}
function ShopsList() {
  const { t, formatNumber, language } = useI18n(); const { s, colors } = useUi();
  const addresses = useLiveAccount().resources.addresses.data;
  const [selection, setCountry] = useState<string | null>(null);
  const [search, setSearch] = useState(''); const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const warehouses = useShopBrowse({ kind: 'warehouses.read' }, false);
  const countries = useMemo(() => shopCountries(warehouses.resource.data, addresses), [warehouses.resource.data, addresses]);
  // Wait for known countries before requesting the international catalogue.
  // An account with no warehouse options can still browse all shops.
  const country = selection ?? countries[0]?.id ?? (warehouses.resource.data ? '' : null);
  const directory = useShopBrowse(country === null ? null : { kind: 'shops.list', ...(country ? { countryCode: country } : {}) });
  const data = directory.resource.data;
  const options = useMemo(() => shopCountries(warehouses.resource.data, addresses, data?.shops), [warehouses.resource.data, addresses, data?.shops]);
  const categories = useMemo(() => shopCategories(data?.shops || []), [data]);
  const activeCategory = categories.some(value => value.id === category) ? category : '';
  const result = useMemo(() => shopPage(data?.shops || [], search, activeCategory, page), [data, search, activeCategory, page]);
  return <Screen title={t('shops.title')} subtitle={t('shops.intro')}>
    <OptionPicker country label={t('field.country')} value={country ?? 'pending'} options={[{ id: '', title: t('shops.allCountries') }, ...options]} onChange={value => { setCountry(value); setCategory(''); setPage(1); }} />
    <Field label={t('shops.search')} value={search} onChangeText={value => { setSearch(value); setPage(1); }} maxLength={150} autoCorrect={false} clearButtonMode="while-editing" />
    {categories.length > 0 && <OptionPicker label={t('shops.category')} value={activeCategory} options={[{ id: '', title: t('shops.allCategories') }, ...categories]} onChange={value => { setCategory(value); setPage(1); }} />}
    {country === null ? <ResourceStatus resource={warehouses.resource} onRefresh={() => { void warehouses.refresh(); }} /> : <ResourceStatus resource={directory.resource} onRefresh={() => { void directory.refresh(); }} />}
    {data && !directory.resource.loading && !directory.resource.error && <>
      <Text style={s.small}>{t('shops.count', { count: formatNumber(result.total) })}</Text>
      {result.items.map(shop => <Pressable key={shop.id} accessibilityRole="button" accessibilityLabel={t('shops.open', { title: shop.title })} onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id, ...(shop.countryCode ? { countryCode: shop.countryCode } : {}) } })} style={({ pressed }) => [s.card, { minHeight: minTouchTarget, gap: 9 }, pressed && s.pressed]}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Ionicons accessible={false} name="storefront-outline" size={22} color={colors.accent} /><Text style={[s.heading, { flex: 1 }]}>{shop.title}</Text><Ionicons accessible={false} name="chevron-forward" size={17} color={colors.muted} /></View>
        {shop.countryCode && <CountryLabel code={shop.countryCode} label={countryDisplayName(shop.countryCode, shop.countryTitle || shop.countryCode, language)} textStyle={s.small} />}
        {shop.categories.length > 0 && <Text style={s.small}>{shop.categories.map(value => value.title).join(' · ')}</Text>}
        <ShopTerms shop={shop} compact />
      </Pressable>)}
      {result.total === 0 && <EmptyState icon="storefront-outline" title={t('shops.empty')} text={t('shops.emptyHelp')} />}
      {result.pageCount > 1 && <><Text style={s.small}>{t('commerce.page', { page: formatNumber(result.page), pages: formatNumber(result.pageCount) })}</Text><View style={s.row}><View style={{ flex: 1 }}><Button secondary disabled={result.page <= 1} onPress={() => setPage(result.page - 1)}>{t('commerce.previousPage')}</Button></View><View style={{ flex: 1 }}><Button secondary disabled={result.page >= result.pageCount} onPress={() => setPage(result.page + 1)}>{t('commerce.nextPage')}</Button></View></View></>}
    </>}
  </Screen>;
}
export function ShopDetailScreen({ id, countryCode }: { id: string; countryCode?: string }) {
  const { t, language } = useI18n(); const { s } = useUi();
  const shop = useShopBrowse({ kind: 'shops.detail', id, ...(countryCode ? { countryCode } : {}) });
  const data = shop.resource.data;
  return <Screen title={data?.title || t('shops.shop')}>
    <ResourceStatus resource={shop.resource} onRefresh={() => { void shop.refresh(); }} />
    {!shop.resource.loading && !shop.resource.error && data === null && shop.resource.updatedAt !== null && <Notice>{t('shops.notAvailable')}</Notice>}
    {data && !shop.resource.error && !shop.resource.loading && <>
      <View style={s.card}>
        {data.countryCode && <CountryLabel code={data.countryCode} label={countryDisplayName(data.countryCode, data.countryTitle || data.countryCode, language)} textStyle={s.body} />}
        {data.url && <Text selectable style={s.small}>{data.url}</Text>}
        {data.categories.length > 0 && <Text style={s.small}>{data.categories.map(value => value.title).join(' · ')}</Text>}
        <ShopTerms shop={data} />
        <Text style={s.small}>{t('shops.quoteHelp')}</Text>
      </View>
      <Button onPress={() => router.push({ pathname: '/order/link', params: shopOrderParams(data) })}>{t(data.directoryVerified ? 'shops.order' : 'cartLink.title')}</Button>
      {data.description && <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{t('shops.about')}</Text><Text selectable style={s.body}>{data.description}</Text></View>}
      {data.url && <RemotePageButton url={data.url} label={t('shops.website')} />}
    </>}
  </Screen>;
}
