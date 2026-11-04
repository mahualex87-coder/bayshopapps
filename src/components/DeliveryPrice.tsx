import { Text, View } from 'react-native';
import { deliveryPriceLabel, type DeliveryQuote } from '@/domain/delivery-price';
import { useI18n } from '@/i18n/context';
import { useUi } from '@/ui';

export function DeliveryPrice({ quote, method = false }: { quote: DeliveryQuote; method?: boolean }) {
  const { t, formatNumber } = useI18n(); const { s } = useUi();
  const value = deliveryPriceLabel(quote, formatNumber, method);
  return <View style={{ gap: 3 }}><Text style={s.small}>{t('packing.localQuote')}</Text><Text selectable style={s.heading}>{value ?? t('packing.priceUnavailable')}</Text></View>;
}
