import { router, useFocusEffect, useIsFocused, usePreventRemove, type Href } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform } from 'react-native';
import { useShellNavigation } from './context';
import { useI18n } from '@/i18n/context';
import { useConfirmation } from './Confirmation';
import { requestDraftLeave } from './draft-leave';

type DraftGuardOptions = { onBack?: () => boolean; fallbackHref?: Href; pending?: boolean };

/** Protect route removal and shell switching, while allowing retained child screens. */
export function useDraftGuard(dirty: boolean, { onBack, fallbackHref = '/', pending = false }: DraftGuardOptions = {}) {
  const shell = useShellNavigation();
  const { t, registerLanguageGuard } = useI18n();
  const { confirmDiscard } = useConfirmation();
  const focused = useIsFocused();
  const [released, setReleased] = useState(false);
  const latest = useRef({ dirty, pending, onBack, focused, fallbackHref });
  useLayoutEffect(() => { latest.current = { dirty, pending, onBack, focused, fallbackHref }; }, [dirty, pending, onBack, focused, fallbackHref]);
  // Check before the account provider changes locale or clears server-backed forms.
  useEffect(() => registerLanguageGuard(() => !latest.current.focused || !latest.current.dirty && !latest.current.pending), [registerLanguageGuard]);
  const dialogOpen = useRef(false);

  const askToDiscard = useCallback((proceed: () => void) => {
    requestDraftLeave(() => latest.current, confirm => {
      if (Platform.OS === 'web') { confirmDiscard(confirm); return; }
      if (dialogOpen.current) return;
      dialogOpen.current = true;
      const cancel = () => { dialogOpen.current = false; };
      const discard = () => { dialogOpen.current = false; confirm(); };
      Alert.alert(t('confirmation.discardTitle'), t('confirmation.unsaved'), [
        { text: t('confirmation.keepEditing'), style: 'cancel', onPress: cancel },
        { text: t('confirmation.discard'), style: 'destructive', onPress: discard },
      ], { cancelable: true, onDismiss: cancel });
    }, proceed);
  }, [confirmDiscard, t]);

  const disablePrevention = usePreventRemove((dirty || pending) && !released, ({ data, repeat }) => {
    if (latest.current.pending) return;
    // A swipe-back gesture follows the same step behavior as the visible Back button.
    if (latest.current.focused && ['GO_BACK', 'POP'].includes(data.action.type) && latest.current.onBack?.()) return;
    askToDiscard(() => { setReleased(true); repeat(); });
  });

  const bypass = useCallback((proceed: () => void) => {
    // Explicit successful-save navigation remains allowed before finally clears busy.
    setReleased(true);
    disablePrevention();
    proceed();
  }, [disablePrevention]);
  const confirmLeave = useCallback((proceed: () => void) => {
    askToDiscard(() => bypass(proceed));
  }, [askToDiscard, bypass]);

  const registerLeaveGuard = shell?.registerLeaveGuard;
  const registerBackHandler = shell?.registerBackHandler;
  useFocusEffect(useCallback(() => {
    // Pushing an address/declaration child retains this route and its draft.
    // Restore its protection when that child returns.
    setReleased(false);
    const removeGuard = registerLeaveGuard?.(confirmLeave);
    const handleBack = () => {
      if (latest.current.pending) return true;
      if (latest.current.onBack?.()) return true;
      if (!router.canGoBack() && latest.current.dirty) {
        confirmLeave(() => router.replace(latest.current.fallbackHref));
        return true;
      }
      return false;
    };
    const removeBack = registerBackHandler?.(handleBack);
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => { removeGuard?.(); removeBack?.(); subscription.remove(); };
  }, [confirmLeave, registerBackHandler, registerLeaveGuard]));

  return { bypass, confirmDiscard: askToDiscard };
}
