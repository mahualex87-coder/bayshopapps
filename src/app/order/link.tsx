import { useLocalSearchParams } from 'expo-router';
import { CartLinkEditor } from '@/features/commerce/CartLinkEditor';
export default function OrderByLink() {
  const { storageId, shopId, shopCountryCode } = useLocalSearchParams<{ storageId?: string; shopId?: string; shopCountryCode?: string }>();
  return <CartLinkEditor initialStorageId={storageId} selectedShop={shopId ? { id: shopId, ...(shopCountryCode ? { countryCode: shopCountryCode } : {}) } : undefined} />;
}
