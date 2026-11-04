import type { ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUi } from '@/ui';
import { useThemeStyles } from '@/theme/context';
import type { ThemeColors } from '@/theme/palette';

type CompactLinkProps = {
  title: string;
  detail?: ReactNode;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  onPress: () => void;
  last?: boolean;
};

export function CompactLink({ title, detail, icon, badge, onPress, last = false }: CompactLinkProps) {
  const compact = useCompactStyles();
  const { colors, s } = useUi();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [compact.link, !last && compact.divider, pressed && s.pressed]}>
    <View style={compact.icon} accessible={false} aria-hidden importantForAccessibility="no-hide-descendants"><Ionicons name={icon} size={21} color={colors.accent} accessible={false} /></View>
    <View style={compact.grow}>
      <Text style={compact.label}>{title}</Text>
      {typeof detail === 'string' ? <Text style={s.small}>{detail}</Text> : detail}
      {badge && <Text style={compact.badge}>{badge}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={17} color={colors.muted} accessible={false} aria-hidden />
  </Pressable>;
}

export function SectionLabel({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const compact = useCompactStyles();
  const { s } = useUi();
  return <View style={compact.line}>
    <Text accessibilityRole="header" style={[s.heading, compact.sectionTitle]}>{title}</Text>
    {action && onPress && <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [compact.textAction, pressed && s.pressed]}><Text style={compact.actionLabel}>{action}</Text></Pressable>}
  </View>;
}

export function useCompactStyles() { return useThemeStyles(makeCompactStyles); }
const makeCompactStyles = (colors: ThemeColors) => StyleSheet.create({
  section: { gap: 6 },
  sectionTitle: { fontSize: 16, flexShrink: 1 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  group: { paddingHorizontal: 12, paddingVertical: 0, gap: 0 },
  link: { minHeight: 54, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  label: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
  badge: { color: colors.accent, fontSize: 12, lineHeight: 18, fontWeight: '600', alignSelf: 'flex-start' },
  textAction: { minHeight: 44, minWidth: 44, paddingHorizontal: 4, justifyContent: 'center', flexShrink: 1 },
  actionLabel: { color: colors.accent, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
