import { useState } from 'react';
import { ShopCommission } from './ShopCommission';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DirectoryShop } from '@/api/shop-directory';
import { CountryLabel } from '@/components/CountryFlag';
import { countryDisplayName } from '@/domain/presentation-labels';
import { CartLinkEditor } from '@/features/commerce/CartLinkEditor';
import { RemotePageButton } from '@/features/content/RemotePageButton';
import { displayMoney } from '@/features/live/shared';
import { useI18n } from '@/i18n/context';
import { GlassSurface } from '@/navigation/GlassSurface';
import { Button, minTouchTarget, useUi } from '@/ui';
import { zaraRomaniaShopStart } from './zara-product';
import type { shopOrderContext } from './shop-list';

type ShopDisplay = Pick<DirectoryShop, 'title' | 'url' | 'description' | 'countryCode' | 'categories'> &
  Partial<Pick<DirectoryShop, 'countryTitle' | 'commissionPercent' | 'publicCommissionPercent' | 'commissionMin' | 'commissionMax' | 'commissionCurrency' | 'currency'>>;

export function ShopContent({ shop, knownShop, order = {} }: { shop: ShopDisplay; knownShop?: DirectoryShop; order?: ReturnType<typeof shopOrderContext> }) {
  const { colors, s } = useUi();
  const { t, language, formatNumber } = useI18n();
  const [open, setOpen] = useState(true);
  const [terms, setTerms] = useState(false);
  const zaraUrl = zaraRomaniaShopStart(shop.countryCode, shop.url);
  const host = shop.url ? new URL(shop.url).hostname : '';
  return <>
    <GlassSurface style={{ borderRadius: 22 }}>
      <LinearGradient colors={[colors.loyaltyTop, colors.loyaltyMiddle, colors.loyaltyBottom]} style={{ gap: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ borderRadius: 13, padding: 9, backgroundColor: colors.accentSoft }}><Ionicons accessible={false} name="storefront-outline" size={25} color={colors.accentText} /></View>
          <View style={{ flex: 1, gap: 3 }}>
            {shop.countryCode && <CountryLabel code={shop.countryCode} label={countryDisplayName(shop.countryCode, shop.countryTitle || shop.countryCode, language)} textStyle={s.body} />}
            {!!host && <Text selectable style={s.small}>{host}</Text>}
          </View>
        </View>
        {(shop.commissionPercent != null || shop.publicCommissionPercent != null || shop.currency) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 25, rowGap: 8 }}>
          <ShopCommission account={shop.commissionPercent} standard={shop.publicCommissionPercent} />
          {shop.currency && <View><Text style={s.small}>{t('shops.currency')}</Text><Text style={s.heading}>{shop.currency}</Text></View>}
        </View>}
        {shop.categories.length > 0 && <View style={{ gap: 5 }}><Text style={s.small}>{t('shops.categories')}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {shop.categories.map(category => <Text key={category.id} style={[s.small, { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, color: colors.text, backgroundColor: colors.soft, overflow: 'hidden' }]}>{category.title}</Text>)}
        </View></View>}
      </LinearGradient>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: terms }} onPress={() => setTerms(!terms)}
        style={({ pressed }) => [{ minHeight: minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }, pressed && s.pressed]}>
        <Text style={[s.body, { flex: 1, fontWeight: '600' }]}>{t('shops.conditions')}</Text>
        <Ionicons accessible={false} name={terms ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} />
      </Pressable>
      {terms && <View style={{ gap: 6, paddingHorizontal: 16, paddingBottom: 14 }}>
        {shop.commissionCurrency && shop.commissionMin != null && <Text style={s.small}>{t('shops.minimum')}: {displayMoney(shop.commissionMin, shop.commissionCurrency, formatNumber)}</Text>}
        {shop.commissionCurrency && shop.commissionMax != null && <Text style={s.small}>{t('shops.maximum')}: {displayMoney(shop.commissionMax, shop.commissionCurrency, formatNumber)}</Text>}
        {shop.description && <Text selectable style={s.body}>{shop.description}</Text>}
        <Text style={s.small}>{t(knownShop ? 'shops.quoteHelp' : 'shops.publicQuoteHelp')}</Text>
      </View>}
    </GlassSurface>
    {open
      ? <CartLinkEditor {...order} inlineShop={knownShop} zaraUrl={zaraUrl} onClose={() => setOpen(false)} />
      : <Button onPress={() => setOpen(true)}>{t(order.selectedShop ? 'shops.order' : 'cartLink.title')}</Button>}
    {shop.url && !zaraUrl && <RemotePageButton url={shop.url} label={t('shops.website')} />}
  </>;
}
