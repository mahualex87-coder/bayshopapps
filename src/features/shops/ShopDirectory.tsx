import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveAccount } from '@/api/context';
import { ShopCommission } from './ShopCommission';
import { CountryLabel } from '@/components/CountryFlag';
import { countryDisplayName } from '@/domain/presentation-labels';
import { useI18n } from '@/i18n/context';
import { OptionPicker } from '@/features/accountops/shared';
import { useShopBrowse } from './useShopBrowse';
import { EmptyState, ResourceStatus } from '@/features/live/shared';
import { ShopContent } from './ShopContent';
import { PublicCategoryResults } from './PublicShopScreens';
import { usePublicShopCatalog } from './usePublicShopCatalog';
import { Button, Field, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { shopCategories, shopCountries, shopOrderContext, shopPage } from './shop-list';

function ShopCountryRequired() {
  const { t } = useI18n();
  return <Screen title={t('shops.title')}>
    <Notice>{t('shops.destinationRequired')}</Notice>
    <Button onPress={() => router.push('/account/region')}>{t('accountRegion.title')}</Button>
  </Screen>;
}
export function ShopsScreen() {
  const live = useLiveAccount();
  if (live.resources.profile.data?.countryId === null) return <ShopCountryRequired />;
  return <ShopsList key={JSON.stringify([live.authRevision, live.accountId, live.accountRevision, live.language])} />;
}
function ShopsList() {
  const { t, formatNumber, language } = useI18n(); const { s, colors } = useUi();
  const { resources } = useLiveAccount();
  const addresses = resources.addresses.data;
  const destinationCountry = resources.profile.data?.countryCode;
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
  const publicContext = data?.verified === false && country && destinationCountry ? { sourceCountry: country, destinationCountry, language } : null;
  const publicRoot = usePublicShopCatalog(publicContext);
  const categories = useMemo(() => data?.verified === false
    ? (publicRoot.data?.categories || []).map(item => ({ id: item.slug, title: item.title }))
    : shopCategories(data?.shops || []), [data, publicRoot.data]);
  const publicCategory = publicContext && categories.find(option => option.id === category);
  const activeCategory = categories.some(value => value.id === category) ? category : '';
  const result = useMemo(() => shopPage(data?.shops || [], search, activeCategory, page), [data, search, activeCategory, page]);
  return <Screen title={t('shops.title')} subtitle={t('shops.intro')}>
    <OptionPicker country label={t('field.country')} value={country ?? 'pending'} options={[{ id: '', title: t('shops.allCountries') }, ...options]} onChange={value => { setCountry(value); setCategory(''); setPage(1); }} />
    <Field label={t(publicCategory ? 'shops.searchPage' : 'shops.search')} value={search} onChangeText={value => { setSearch(value); if (!publicCategory) setPage(1); }} maxLength={150} autoCorrect={false} clearButtonMode="while-editing" />
    {categories.length > 0 && <OptionPicker label={t('shops.category')} value={activeCategory} options={[{ id: '', title: t('shops.allCategories') }, ...categories]} onChange={value => { setCategory(value); setSearch(''); setPage(1); }} />}
    {country === null ? <ResourceStatus resource={warehouses.resource} onRefresh={() => { void warehouses.refresh(); }} /> : <ResourceStatus resource={directory.resource} onRefresh={() => { void directory.refresh(); }} />}
    {publicContext && publicRoot.error && <><Notice error>{t('shops.categoriesUnavailable')}</Notice><Button secondary onPress={publicRoot.retry}>{t('live.retry')}</Button></>}
    {publicContext && publicCategory
      ? <PublicCategoryResults context={publicContext} category={publicCategory} page={page} setPage={setPage} search={search} />
      : data && !directory.resource.loading && !directory.resource.error && <>
      <Text style={s.small}>{t('shops.count', { count: formatNumber(result.total) })}</Text>
      {result.items.map(shop => <Pressable key={shop.id} accessibilityRole="button" accessibilityLabel={t('shops.open', { title: shop.title })} onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop.id, ...(shop.countryCode ? { countryCode: shop.countryCode } : {}) } })} style={({ pressed }) => [s.card, { minHeight: minTouchTarget, gap: 9 }, pressed && s.pressed]}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Ionicons accessible={false} name="storefront-outline" size={22} color={colors.accent} /><Text style={[s.heading, { flex: 1 }]}>{shop.title}</Text><Ionicons accessible={false} name="chevron-forward" size={17} color={colors.muted} /></View>
        {shop.countryCode && <CountryLabel code={shop.countryCode} label={countryDisplayName(shop.countryCode, shop.countryTitle || shop.countryCode, language)} textStyle={s.small} />}
        {shop.categories.length > 0 && <Text style={s.small}>{shop.categories.map(value => value.title).join(' · ')}</Text>}
        <ShopCommission account={shop.commissionPercent} standard={shop.publicCommissionPercent} />
      </Pressable>)}
      {result.total === 0 && <EmptyState icon="storefront-outline" title={t('shops.empty')} text={t('shops.emptyHelp')} />}
      {result.pageCount > 1 && <><Text style={s.small}>{t('commerce.page', { page: formatNumber(result.page), pages: formatNumber(result.pageCount) })}</Text><View style={s.row}><View style={{ flex: 1 }}><Button secondary disabled={result.page <= 1} onPress={() => setPage(result.page - 1)}>{t('commerce.previousPage')}</Button></View><View style={{ flex: 1 }}><Button secondary disabled={result.page >= result.pageCount} onPress={() => setPage(result.page + 1)}>{t('commerce.nextPage')}</Button></View></View></>}
    </>}
  </Screen>;
}
export function ShopDetailScreen({ id, countryCode }: { id: string; countryCode?: string }) {
  const { t } = useI18n();
  const missingCountry = useLiveAccount().resources.profile.data?.countryId === null;
  const shop = useShopBrowse(missingCountry ? null : { kind: 'shops.detail', id, ...(countryCode ? { countryCode } : {}) });
  if (missingCountry) return <ShopCountryRequired />;
  const data = shop.resource.data;
  return <Screen title={data?.title || t('shops.shop')}>
    {(shop.resource.loading || shop.resource.error || shop.resource.updatedAt === null) && <ResourceStatus resource={shop.resource} onRefresh={() => { void shop.refresh(); }} />}
    {!shop.resource.loading && !shop.resource.error && data === null && shop.resource.updatedAt !== null && <Notice>{t('shops.notAvailable')}</Notice>}
    {data && <ShopContent key={data.id} shop={data} order={shopOrderContext(data)} knownShop={data} />}
  </Screen>;
}
