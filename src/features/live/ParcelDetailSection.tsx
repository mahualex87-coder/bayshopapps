import { useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassSurface } from '@/navigation/GlassSurface';
import { minTouchTarget, useUi } from '@/ui';

export function ParcelDetailSection({ title, summary, icon, children, collapsible = false, expanded: controlledExpanded, onExpandedChange, action, help }: PropsWithChildren<{ title: string; summary?: string | null; icon: keyof typeof Ionicons.glyphMap; collapsible?: boolean; expanded?: boolean; onExpandedChange?: (expanded: boolean) => void; action?: { label: string; disabled: boolean; onPress: () => void }; help?: { label: string; text: string } }>) {
  const { colors, s } = useUi();
  const [localExpanded, setExpanded] = useState(!collapsible);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const toggle = () => { const next = !expanded; if (onExpandedChange) onExpandedChange(next); else setExpanded(next); };
  // Required actions can become visible after a fresh server response without
  // remounting their editors or discarding a staged document.
  const visible = !collapsible || expanded;
  const heading = <><Ionicons accessible={false} aria-hidden name={icon} size={20} color={colors.accent} /><View style={styles.title}><Text accessibilityRole="header" style={s.heading}>{title}</Text>{summary && <Text style={s.small}>{summary}</Text>}</View>{collapsible && <Ionicons accessible={false} aria-hidden name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} />}</>;
  return <View style={styles.section}>
    <GlassSurface style={styles.surface}><View style={styles.header}>
      {collapsible ? <Pressable accessibilityRole="button" accessibilityLabel={[title, summary].filter(Boolean).join('. ')} accessibilityState={{ expanded: visible }} aria-expanded={visible} onPress={toggle} style={({ pressed }) => [styles.heading, pressed && s.pressed]}>{heading}</Pressable> : <View style={styles.heading}>{heading}</View>}
      {help && <Pressable accessibilityRole="button" accessibilityLabel={help.label} accessibilityState={{ expanded: helpExpanded }} aria-expanded={helpExpanded} onPress={() => setHelpExpanded(value => !value)} style={({ pressed }) => [styles.help, pressed && s.pressed]}><Ionicons accessible={false} aria-hidden name="help-circle-outline" size={23} color={colors.accent} /></Pressable>}
      {action && <Pressable accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ disabled: action.disabled }} disabled={action.disabled} onPress={action.onPress} style={({ pressed }) => [styles.action, action.disabled && { opacity: .45 }, pressed && s.pressed]}><Ionicons accessible={false} aria-hidden name="create-outline" size={18} color={colors.accent} /><Text style={[styles.actionText, { color: colors.accent }]}>{action.label}</Text></Pressable>}
    </View></GlassSurface>
    {help && helpExpanded && <Text accessibilityLiveRegion="polite" style={[s.small, styles.helpText]}>{help.text}</Text>}
    <View style={[styles.body, !visible && styles.hidden]} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>{children}</View>
  </View>;
}
const styles = StyleSheet.create({ section: { gap: 9 }, surface: { borderRadius: 14, overflow: 'hidden' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 5 }, heading: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: minTouchTarget, paddingVertical: 8 }, title: { flex: 1, minWidth: 0 }, help: { width: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center' }, helpText: { paddingHorizontal: 10 }, action: { maxWidth: '53%', minHeight: minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 }, actionText: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' }, body: { gap: 10 }, hidden: { display: 'none' } });
