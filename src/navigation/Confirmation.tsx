import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ComponentRef, type PropsWithChildren } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { minTouchTarget } from '@/ui';
import { useI18n } from '@/i18n/context';

type Confirmation = { confirmDiscard: (proceed: () => void) => void };
type PendingConfirmation = { proceed: () => void; previousFocus: HTMLElement | null };
const ConfirmationContext = createContext<Confirmation | null>(null);

export function ConfirmationProvider({ children }: PropsWithChildren) {
  const styles = useThemeStyles(makeStyles);
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const pending = useRef<PendingConfirmation | null>(null);
  const cancelButton = useRef<ComponentRef<typeof View>>(null);
  const confirmDiscard = useCallback((proceed: () => void) => {
    if (pending.current) return;
    const previousFocus = Platform.OS === 'web' && document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pending.current = { proceed, previousFocus };
    setVisible(true);
  }, []);
  const finish = useCallback((discard: boolean) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    setVisible(false);
    requestAnimationFrame(() => {
      if (!pending.current && current.previousFocus?.isConnected) current.previousFocus.focus();
    });
    if (discard) current.proceed();
  }, []);
  const context = useMemo(() => ({ confirmDiscard }), [confirmDiscard]);

  return <ConfirmationContext.Provider value={context}>
    <View style={styles.fill} aria-hidden={visible} accessibilityElementsHidden={visible} importantForAccessibility={visible ? 'no-hide-descendants' : 'auto'}>{children}</View>
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => finish(false)} onShow={() => {
      if (Platform.OS === 'web') requestAnimationFrame(() => (cancelButton.current as unknown as HTMLElement | null)?.focus());
    }}>
      <View style={styles.overlay}>
        <View role="alertdialog" aria-modal accessibilityLabel={t('confirmation.discardTitle')} accessibilityViewIsModal style={styles.panel}>
          <Text accessibilityRole="header" style={styles.title}>{t('confirmation.discardTitle')}</Text>
          <Text style={styles.message}>{t('confirmation.unsaved')}</Text>
          <Pressable ref={cancelButton} accessibilityRole="button" onPress={() => finish(false)} style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}><Text style={styles.cancelText}>{t('confirmation.keepEditing')}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => finish(true)} style={({ pressed }) => [styles.button, styles.discard, pressed && styles.pressed]}><Text style={styles.discardText}>{t('confirmation.discard')}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </ConfirmationContext.Provider>;
}

export function useConfirmation() {
  const confirmation = useContext(ConfirmationContext);
  if (!confirmation) throw new Error('useConfirmation trebuie folosit în ConfirmationProvider.');
  return confirmation;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  fill: { flex: 1 },
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 22, padding: 22, gap: 12, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 4 },
  button: { minHeight: Math.max(46, minTouchTarget), borderRadius: 13, padding: 12, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: colors.soft }, cancelText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  discard: { backgroundColor: colors.dangerButton }, discardText: { color: colors.onAccent, fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.8 },
});
