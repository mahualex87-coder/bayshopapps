import type { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n/context';
import { useVisualPreferences } from '@/navigation/accessibility';
import { minTouchTarget } from '@/ui';

export function MediaFrame({ title, onClose, children }: PropsWithChildren<{ title: string; onClose: () => void }>) {
  const { t } = useI18n(); const { reduceMotion } = useVisualPreferences();
  const insets = useSafeAreaInsets(); const frame = useSafeAreaFrame();
  return <Modal visible animationType={reduceMotion ? 'none' : 'fade'} presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent={false}>
    <SafeAreaProvider initialMetrics={{ frame, insets }} style={mediaStyles.root}>
    <StatusBar style="light" animated={false} />
    <GestureHandlerRootView style={mediaStyles.root}>
    <SafeAreaView style={mediaStyles.root} edges={['top', 'bottom', 'left', 'right']} accessibilityViewIsModal>
      <View style={mediaStyles.header}><Text accessibilityRole="header" numberOfLines={2} style={mediaStyles.title}>{title}</Text><MediaControl icon="close" label={t('media.close')} onPress={onClose} /></View>
      {children}
    </SafeAreaView>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  </Modal>;
}
export function MediaControl({ icon, label, onPress, disabled = false }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [mediaStyles.control, disabled && { opacity: .3 }, pressed && { opacity: .65 }]}><Ionicons name={icon} size={23} color="#FFFFFF" /></Pressable>;
}
export const mediaStyles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#111923' }, header: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }, title: { flex: 1, minWidth: 0, color: '#FFFFFF', fontSize: 16, fontWeight: '600' }, control: { flexShrink: 0, minWidth: minTouchTarget, minHeight: minTouchTarget, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#263344' }, toolbar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, padding: 10 }, text: { color: '#E7EDF7', textAlign: 'center', fontSize: 13, lineHeight: 20 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }, hint: { color: '#AFBED2', fontSize: 12, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 8 } });
