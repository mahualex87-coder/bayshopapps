import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Button, Notice, useUi } from '@/ui';
import { useI18n } from '@/i18n/context';
import { createPayPalBrowserController } from './paypal-browser-controller';
import { isHostedCheckoutUrl } from '@/api/hosted-checkout';
import type { PaymentProviderProps } from './PaymentProvider';

/** Mounted only for the validated original provider URL. It is never
 * combined with a BayShop bearer token, injected script or arbitrary headers. */
export function PayPalBrowser({ action, onClose, onReturn, onFailure }: PaymentProviderProps) {
  const { s, colors } = useUi(), { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(false);
  const callbacks = useRef({ onClose, onReturn, onFailure });
  useEffect(() => { callbacks.current = { onClose, onReturn, onFailure }; }, [onClose, onReturn, onFailure]);
  const controller = useRef<ReturnType<typeof createPayPalBrowserController> | null>(null);
  const [url] = useState(action.url);
  useEffect(() => {
    if (!shown) return;
    const current = createPayPalBrowserController(url, {
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      open: value => WebBrowser.openBrowserAsync(value, {
        presentationStyle: isHostedCheckoutUrl(value)
          ? WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN
          : WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        dismissButtonStyle: 'close',
        createTask: false,
      }),
      dismiss: () => WebBrowser.dismissBrowser(),
      subscribe: listener => { const subscription = AppState.addEventListener('change', listener); return () => subscription.remove(); },
      returned: () => callbacks.current.onReturn(), closed: () => callbacks.current.onClose(),
      failed: code => { setFailed(true); callbacks.current.onFailure?.(code); },
    });
    controller.current = current;
    // Strict-mode setup/cleanup cannot open two provider windows.
    void Promise.resolve().then(() => current.start());
    return () => { current.dispose(); if (controller.current === current) controller.current = null; };
  }, [shown, url]);
  const close = () => { if (controller.current) controller.current.close(); else onClose(); };
  return <Modal visible presentationStyle="fullScreen" animationType="slide" onShow={() => setShown(true)} onRequestClose={close}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={s.row}><Text style={s.heading}>{isHostedCheckoutUrl(url) ? 'EuPlătesc' : 'PayPal'}</Text><Button secondary onPress={close}>{t('payments.close')}</Button></View>
        {failed ? <Notice error>{t('payments.providerInterrupted')}</Notice> : <><ActivityIndicator color={colors.accent} /><Text style={s.body}>{t('payments.securePayment')}</Text></>}
      </View>
    </SafeAreaView>
  </Modal>;
}
