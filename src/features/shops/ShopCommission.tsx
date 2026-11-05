import { Text, View } from 'react-native';
import { useI18n } from '@/i18n/context';
import { useUi } from '@/ui';
import { shopCommissionLines } from './shop-commission';

export function ShopCommission({ account, standard }: { account?: number | null; standard?: number | null }) {
  const { t, formatNumber } = useI18n();
  const { s } = useUi();
  const lines = shopCommissionLines(account, standard);
  if (!lines.length) return null;
  return <View style={{ gap: 2 }}>{lines.map((line, i) =>
    <Text key={line.label} style={i === 0 ? s.body : s.small}>
      {t(line.label, line.rate === null ? undefined : { rate: formatNumber(line.rate, { maximumSignificantDigits: 15 }) })}
    </Text>
  )}</View>;
}
