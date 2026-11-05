import { useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { isZaraBrowseUrl } from './zara-product';
import type { ZaraPageProps } from './zara-page-types';

export function ZaraPage({ startUrl, observer, capture, back, onState, onMessage, onFailure, onBlocked }: ZaraPageProps) {
  const web = useRef<WebView<object>>(null);
  const lastBack = useRef(back);
  useEffect(() => { if (capture) web.current?.injectJavaScript(capture); }, [capture]);
  useEffect(() => { if (lastBack.current !== back) { lastBack.current = back; web.current?.goBack(); } }, [back]);
  if (!isZaraBrowseUrl(startUrl)) return null;
  return <WebView<object> ref={web} style={{ flex: 1 }} source={{ uri: startUrl }}
    incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} cacheEnabled={false}
    // Filter every request here; a rejected originWhitelist entry opens the OS browser.
    originWhitelist={['*']} onShouldStartLoadWithRequest={event => {
      const allowed = isZaraBrowseUrl(event.url) && event.navigationType !== 'formsubmit' && event.navigationType !== 'formresubmit';
      if (!allowed && event.isTopFrame) onBlocked();
      return allowed;
    }}
    onNavigationStateChange={state => {
      if (!isZaraBrowseUrl(state.url)) { web.current?.stopLoading(); onFailure(); return; }
      onState(state.url, state.loading, state.canGoBack);
    }}
    javaScriptEnabled injectedJavaScript={observer} injectedJavaScriptForMainFrameOnly
    onMessage={event => onMessage(event.nativeEvent.url, event.nativeEvent.data)}
    onOpenWindow={onBlocked} javaScriptCanOpenWindowsAutomatically={false}
    mediaCapturePermissionGrantType="deny" allowsLinkPreview={false} dataDetectorTypes="none" onFileDownload={onBlocked}
    allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
    onContentProcessDidTerminate={onFailure} onError={onFailure} onHttpError={event => { if (event.nativeEvent.statusCode >= 400) onFailure(); }}
  />;
}
