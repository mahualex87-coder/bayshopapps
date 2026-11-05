import { useLocalSearchParams } from 'expo-router';
import { PublicShopDetailScreen } from '@/features/shops/PublicShopScreens';
import { ShopDetailScreen } from '@/features/shops/ShopDirectory';
export default function ShopDetailRoute() {
  const { id, countryCode, mode, category, page } = useLocalSearchParams<{ id: string; countryCode?: string; mode?: string; category?: string; page?: string }>();
  if (mode === 'public') return <PublicShopDetailScreen slug={id} countryCode={countryCode} category={category} page={page} />;
  return <ShopDetailScreen id={id} countryCode={countryCode} />;
}
