import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n/context';
import { useVisualPreferences } from '@/navigation/accessibility';
import { Button, Notice, useUi } from '@/ui';
import type { ContentReaderKind } from './public-content-policy';

export type InternalContentViewerProps = { url: string; title: string; onClose: () => void; kind?: ContentReaderKind };
type FrameProps = PropsWithChildren<{ title: string; onClose: () => void; onRetry: () => void; loading: boolean; failed: boolean; blocked?: boolean; source?: string; staticPage?: boolean }>;

export function ContentModalFrame({ title, onClose, onRetry, loading, failed, blocked, source, staticPage, children }: FrameProps) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t } = useI18n();
  const { reduceMotion } = useVisualPreferences();
  return <Modal visible animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={['top', 'bottom', 'left', 'right']} accessibilityViewIsModal>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[s.heading, { flex: 1 }]}>{title}</Text>
        <Button secondary onPress={onClose}>{t('contentReader.close')}</Button>
      </View>
      <View style={styles.status}>
        <Text style={s.small}>{source ? t('contentReader.externalSource', { source }) : t('contentReader.source')}</Text>
        {staticPage && <Text style={s.small}>{t('contentReader.staticPage')}</Text>}
        {loading && <View style={[s.row, { justifyContent: 'flex-start' }]}><ActivityIndicator color={colors.accent} /><Text accessibilityLiveRegion="polite" style={s.small}>{t('contentReader.loading')}</Text></View>}
        {failed && <Notice error>{t('contentReader.loadError')}</Notice>}
        {blocked && !failed && <Notice>{t('contentReader.blocked')}</Notice>}
        {failed && !loading && <Button secondary onPress={onRetry}>{t('contentReader.retry')}</Button>}
      </View>
      {!failed && <View style={styles.content}>{children}</View>}
    </SafeAreaView>
  </Modal>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  status: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  content: { flex: 1 },
});
