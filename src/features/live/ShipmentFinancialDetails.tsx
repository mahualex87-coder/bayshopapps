import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ShipmentOperationDetail } from '@/api/operations-normalize';
import { plainServerText } from '@/api/account-operations';
import { positiveCharge, shipmentFinancialDisplay, shipmentSummaryCosts } from '@/domain/shipment-financial';
import { useI18n } from '@/i18n/context';
import { minTouchTarget, Notice, useUi } from '@/ui';
import { DetailRow, displayMoney } from './shared';
import { ShipmentServiceDetails } from './ParcelMetadata';

export function ShipmentFinancialSummary({ data, onPress }: { data: ShipmentOperationDetail; onPress: () => void }) {
  const { t, formatNumber } = useI18n();
  const { s, colors } = useUi();
  const display = shipmentFinancialDisplay(data);
  if (!display.visible && data.isPaid === null) return null;
  const costs = shipmentSummaryCosts(data);
  return <View style={s.card}>
    <View style={styles.summaryHeader}><Ionicons name="receipt-outline" size={20} color={colors.accent} accessible={false} /><Text accessibilityRole="header" style={[s.heading, styles.buttonText]}>{t('shipmentCompact.financial')}</Text></View>
    {costs.map((cost, index) => <View key={`${index}:${cost.labelKey || cost.label}`} style={styles.summaryRow}>
      <Text style={[s.small, styles.summaryLabel]}>{cost.labelKey ? t(cost.labelKey) : plainServerText(cost.label)}</Text>
      <Text selectable style={[s.body, styles.summaryAmount]}>{displayMoney(cost.amount, cost.currency, formatNumber)}</Text>
    </View>)}
    {data.importTaxes?.estimated && display.hasTaxes && <Text style={s.small}>{t('parcelDetail.taxEstimate')}</Text>}
    {positiveCharge(data.shippingTotal) && <View style={[styles.summaryRow, styles.total, { borderTopColor: colors.border }]}>
      <Text style={[s.body, styles.summaryLabel, { fontWeight: '700' }]}>{t('parcelDetail.shippingTotal')}</Text>
      <Text selectable style={[s.heading, styles.summaryAmount]}>{displayMoney(data.shippingTotal, data.currency, formatNumber)}</Text>
    </View>}
    {data.isPaid !== null && <View style={styles.summaryRow}><Text style={[s.small, styles.summaryLabel]}>{t('parcelDetail.payment')}</Text><Text style={[s.small, { fontWeight: '600', color: colors.text }]}>{t(data.isPaid ? 'status.paid' : 'status.unpaid')}</Text></View>}
    {display.visible && <Pressable accessibilityRole="button" accessibilityLabel={t('shipmentCompact.financialDetails')} onPress={onPress} style={({ pressed }) => [styles.detailsButton, { backgroundColor: colors.soft }, pressed && s.pressed]}>
      <Text style={[s.small, styles.buttonText, { color: colors.text, fontWeight: '600' }]}>{t('shipmentCompact.financialDetails')}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} accessible={false} />
    </Pressable>}
  </View>;
}

export function ShipmentFinancialDetails({ data, visible, onClose }: { data: ShipmentOperationDetail; visible: boolean; onClose: () => void }) {
  const { t, formatNumber } = useI18n();
  const { s, colors } = useUi();
  const display = shipmentFinancialDisplay(data);
  const taxes = data.importTaxes;
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
    <SafeAreaView accessibilityViewIsModal style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}><Text accessibilityRole="header" style={[s.heading, styles.buttonText]}>{t('shipmentCompact.financial')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('accountOps.close')} onPress={onClose} style={({ pressed }) => [styles.close, pressed && s.pressed]}><Ionicons name="close" size={24} color={colors.text} accessible={false} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.content}>
        {display.hasTaxes && taxes && <View style={s.card}>
          <Text accessibilityRole="header" style={s.heading}>{t('parcelDetail.taxBreakdown')}</Text>
          {taxes.estimated && <Notice>{t('parcelDetail.taxEstimate')}</Notice>}
          {display.taxLines.map((line,index) => <View key={`${index}:${line.title}`} style={styles.line}><DetailRow label={plainServerText(line.title)} value={displayMoney(line.amount, taxes.currency, formatNumber)} />{line.description && <Text selectable style={s.small}>{plainServerText(line.description)}</Text>}</View>)}
          {!taxes.lines.length && <Text style={s.small}>{t('shipmentCompact.taxDetailsUnavailable')}</Text>}
          {positiveCharge(taxes.total) && <DetailRow label={t('parcelDetail.taxTotal')} value={displayMoney(taxes.total, taxes.currency, formatNumber)} />}
          {positiveCharge(data.shippingTotal) && <Text style={s.small}>{t('parcelDetail.taxIncluded')}</Text>}
        </View>}
        {(display.costs.length > 0 || positiveCharge(data.shippingTotal)) && <View style={s.card}>
          <Text accessibilityRole="header" style={s.heading}>{t('parcelDetail.costs')}</Text>
          {display.costs.map((cost,index) => <DetailRow key={`${index}:${cost.label}`} label={cost.labelKey ? t(cost.labelKey) : cost.label} value={displayMoney(cost.amount,cost.currency,formatNumber)} />)}
          {positiveCharge(data.shippingTotal) && <DetailRow label={t('parcelDetail.shippingTotal')} value={displayMoney(data.shippingTotal,data.currency,formatNumber)} />}
        </View>}
        <ShipmentServiceDetails data={{ ...data, additionalServices: display.services }} />
        {(positiveCharge(data.goodsValue) || positiveCharge(data.declaredValue)) && <View style={s.card}>
          {positiveCharge(data.goodsValue) && <DetailRow label={t('live.parcel.productValue')} value={displayMoney(data.goodsValue,data.currency,formatNumber)} />}
          {positiveCharge(data.declaredValue) && <DetailRow label={t('parcelDetail.declaredValue')} value={displayMoney(data.declaredValue,data.currency,formatNumber)} />}
        </View>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles=StyleSheet.create({ screen:{flex:1}, header:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:10}, content:{padding:16,gap:12,paddingBottom:24}, close:{width:minTouchTarget,height:minTouchTarget,alignItems:'center',justifyContent:'center'}, buttonText:{flex:1,minWidth:0}, line:{gap:4}, summaryHeader:{flexDirection:'row',alignItems:'center',gap:8}, summaryRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',justifyContent:'space-between',columnGap:12,rowGap:4}, summaryLabel:{flexGrow:1,flexShrink:1,flexBasis:100}, summaryAmount:{fontVariant:['tabular-nums'],fontWeight:'600'}, total:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:12}, detailsButton:{minHeight:minTouchTarget,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,paddingVertical:8,borderRadius:12} });
