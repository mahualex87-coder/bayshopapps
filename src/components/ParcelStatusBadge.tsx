import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import type { ParcelStatusTone } from '@/domain/parcel-status';
import { useTheme } from '@/theme/context';
import { parcelStatusColors } from '@/theme/parcel-status';

const icons = { danger: 'alert-circle-outline', warning: 'time-outline', success: 'checkmark-circle-outline', neutral: 'information-circle-outline' } as const;

export function ParcelStatusBadge({ label, tone }: { label: string; tone: ParcelStatusTone }) {
  const { scheme } = useTheme();
  const colors = parcelStatusColors[scheme][tone];
  return <View accessible accessibilityLabel={label} style={[styles.badge, { backgroundColor: colors.background, borderColor: colors.border }]}>
    <Ionicons accessible={false} aria-hidden name={icons[tone]} size={15} color={colors.text} />
    <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', flexShrink: 1, maxWidth: '100%', gap: 5, borderRadius: 11, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '600', flexShrink: 1 },
});
