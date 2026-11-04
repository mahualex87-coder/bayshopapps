import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { API_ORIGIN } from '@/api/client';
import { Button, Notice, useUi } from '@/ui';
import { useI18n } from '@/i18n/context';
import { inspectPaymentReturn, paymentFormBody, paymentNavigationAllowed } from './provider-policy';
import type { PaymentProviderProps } from './PaymentProvider';
import { PayPalBrowser } from './PayPalBrowser';

export function PaymentProvider({ action, onClose, onReturn, onFailure }: PaymentProviderProps) {
  if (action.kind === 'redirect') return <PayPalBrowser action={action} onClose={onClose} onReturn={onReturn} onFailure={onFailure} />;
  return <HostedPaymentProvider action={action} onClose={onClose} onReturn={onReturn} onFailure={onFailure} />;
}

function HostedPaymentProvider({ action, onClose, onReturn, onFailure }: PaymentProviderProps) {
  const { s, colors } = useUi();
  const { t } = useI18n();
  const view = useRef<WebView<object>>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [host, setHost] = useState(new URL(action.url).hostname);
  const completionNotified = useRef(false);
  const interrupted = useRef(false);
  const callbackPaymentId = useRef<string | null>(null);
  // Keep callback correlation bound to the same action as the one-shot POST.
  const [initialAction] = useState(() => action);
  const [source] = useState(() => initialAction.kind === 'form'
    ? { uri: initialAction.url, method: 'POST' as const, body: paymentFormBody(initialAction.fields), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    : { uri: initialAction.url });
  const recheckCapturedPayment = () => {
    if (callbackPaymentId.current && !completionNotified.current) {
      completionNotified.current = true;
      onReturn(callbackPaymentId.current);
    }
  };
  const fail = () => {
    if (interrupted.current || completionNotified.current) return;
    interrupted.current = true;
    view.current?.stopLoading(); setLoading(false); setFailed(true);
    if (onFailure) { completionNotified.current = true; onFailure(); }
    else recheckCapturedPayment();
  };
  const close = () => { interrupted.current = true; recheckCapturedPayment(); onClose(); };
  const captureReturn = (url: string) => {
    if (interrupted.current) return null;
    const result = inspectPaymentReturn(url, initialAction, API_ORIGIN);
    if (result?.paymentId) {
      callbackPaymentId.current = result.paymentId;
    }
    return result;
  };
  return <Modal visible presentationStyle="fullScreen" animationType="slide" onRequestClose={close}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ padding: 12, gap: 8 }}>
        <View style={s.row}><Text style={s.heading}>{t('payments.securePayment')}</Text><Button secondary onPress={close}>{t('payments.close')}</Button></View>
        <Text style={s.small}>{host}</Text>
        {loading && <ActivityIndicator color={colors.accent} />}
        {failed && <Notice error>{t('payments.providerInterrupted')}</Notice>}
      </View>
      {!failed && <WebView<object> ref={view} source={source} style={{ flex: 1 }} originWhitelist={['*']}
        onShouldStartLoadWithRequest={request => {
          // 3DS pages may create an empty child frame before submitting its
          // challenge. It is inert, never an account callback or a top-level URL.
          if (request.isTopFrame === false && request.url === 'about:blank') return true;
          const allowed = paymentNavigationAllowed(request.url);
          if (!allowed) fail();
          else if (request.isTopFrame !== false) captureReturn(request.url);
          return allowed;
        }}
        onNavigationStateChange={state => {
          if (!paymentNavigationAllowed(state.url)) { fail(); return; }
          captureReturn(state.url);
          setHost(new URL(state.url).hostname);
        }}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={event => {
          setLoading(false);
          // Let BayShop's return request finish before checking owned status.
          // An early notification could unmount this view during the callback.
          // Neither navigation nor a successful response proves payment success.
          const result = captureReturn(event.nativeEvent.url);
          if (result && !interrupted.current && !completionNotified.current) {
            completionNotified.current = true;
            onReturn(callbackPaymentId.current ?? undefined);
          }
        }}
        onError={fail} onHttpError={event => { if (event.nativeEvent.statusCode >= 400) fail(); }}
        onContentProcessDidTerminate={fail} onRenderProcessGone={fail} onOpenWindow={fail} onFileDownload={fail}
        renderError={() => <></>} javaScriptEnabled domStorageEnabled enableApplePay paymentRequestEnabled incognito sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false} cacheEnabled={false} saveFormDataDisabled
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never" geolocationEnabled={false} allowsLinkPreview={false} dataDetectorTypes="none"
      />}
    </SafeAreaView>
  </Modal>;
}
