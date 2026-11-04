import { useLocalSearchParams } from 'expo-router';
import { ShopDetailScreen } from '@/features/shops/ShopDirectory';
export default function ShopDetailRoute() {
  const { id, countryCode } = useLocalSearchParams<{ id: string; countryCode?: string }>();
  return <ShopDetailScreen id={id} countryCode={countryCode} />;
}
