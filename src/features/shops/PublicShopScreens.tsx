import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useLiveAccount } from '@/api/context';
import { EmptyState } from '@/features/live/shared';
import { useI18n } from '@/i18n/context';
import type { Language } from '@/i18n/core';
import { usePageLoad } from '@/navigation/PageLoading';
import { Button, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { ShopContent } from './ShopContent';
import { usePublicShopCatalog, usePublicShopDetail } from './usePublicShopCatalog';

type CatalogContext = { sourceCountry: string; destinationCountry: string; language: Language };
export function PublicCategoryResults({ context, category, page, setPage, search }: { context: CatalogContext; category: { id: string; title: string }; page: number; setPage: (page: number) => void; search: string }) {
  const { t, formatNumber } = useI18n(); const { s, colors } = useUi();
  const catalog = usePublicShopCatalog({ ...context, category: category.id, page });
  usePageLoad(catalog.loading, catalog.loading && !catalog.data);
  if (catalog.error) return <><Notice error>{t('shops.categoriesUnavailable')}</Notice><Button secondary onPress={catalog.retry}>{t('live.retry')}</Button></>;
  if (!catalog.data) return null;
  const needle = search.trim().toLocaleLowerCase(context.language);
  const matches = catalog.data.shops.filter(shop => !needle || shop.title.toLocaleLowerCase(context.language).includes(needle));
  return <>
    {matches.map(shop => <Pressable key={shop.slug} accessibilityRole="button" accessibilityLabel={t('shops.open', { title: shop.title })} onPress={() => router.push({
      pathname: '/shop/[id]', params: { id: shop.slug, mode: 'public', countryCode: context.sourceCountry, category: category.id, page: String(page) },
    })} style={({ pressed }) => [s.card, { minHeight: minTouchTarget, gap: 9 }, pressed && s.pressed]}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Ionicons accessible={false} name="storefront-outline" size={22} color={colors.accent} /><Text style={[s.heading, { flex: 1 }]}>{shop.title}</Text><Ionicons accessible={false} name="chevron-forward" size={17} color={colors.muted} /></View>
      {shop.description && <Text numberOfLines={2} style={s.small}>{shop.description}</Text>}
    </Pressable>)}
    {!matches.length && <EmptyState icon="storefront-outline" title={t('shops.empty')} text={t('shops.emptyHelp')} />}
    {(catalog.data.hasPrevious || catalog.data.hasNext) && <>
      <Text style={s.small}>{t('shops.pageNumber', { page: formatNumber(page) })}</Text>
      <View style={s.row}><View style={{ flex: 1 }}><Button secondary disabled={!catalog.data.hasPrevious} onPress={() => setPage(page - 1)}>{t('commerce.previousPage')}</Button></View>
      <View style={{ flex: 1 }}><Button secondary disabled={!catalog.data.hasNext} onPress={() => setPage(page + 1)}>{t('commerce.nextPage')}</Button></View></View>
    </>}
  </>;
}
export function PublicShopDetailScreen({ slug, countryCode, category, page }: { slug: string; countryCode?: string; category?: string; page?: string }) {
  const { t, language } = useI18n();
  const destination = useLiveAccount().resources.profile.data?.countryCode;
  const context = destination && countryCode ? { sourceCountry: countryCode, destinationCountry: destination, language } : null;
  const detail = usePublicShopDetail(context ? { ...context, shopSlug: slug } : null);
  // Reuse the category page the customer actually opened. A deep link with
  // an arbitrary category must not invent membership or a personal fee.
  const pageNumber = Number(page);
  const listing = usePublicShopCatalog(context && category && Number.isSafeInteger(pageNumber) && pageNumber >= 1 ? { ...context, category, page: pageNumber } : null);
  usePageLoad(detail.loading, detail.loading && !detail.data);
  const fromList = listing.data?.shops.some(item => item.slug === slug) ? listing.data.categories.find(item => item.slug === category) : null;
  const categories = detail.data?.categories?.length ? detail.data.categories : fromList ? [fromList] : [];
  return <Screen title={detail.data?.title || t('shops.shop')}>
    {detail.error && <><Notice error>{t('shops.notAvailable')}</Notice><Button secondary onPress={detail.retry}>{t('live.retry')}</Button></>}
    {!detail.error && !detail.loading && !detail.data && <Notice>{t('shops.notAvailable')}</Notice>}
    {detail.data && <ShopContent key={slug} shop={{ ...detail.data, countryCode: countryCode || null, categories: categories.map(item => ({ id: item.slug, title: item.title })) }} />}
  </Screen>;
}
