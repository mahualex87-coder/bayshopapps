import { useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { useI18n } from '@/i18n/context';
import { ContentModalFrame, type InternalContentViewerProps } from './ContentModalFrame';
import { readerNavigationAllowed, readerUrl } from './public-content-policy';
import { NativePublicPageReader } from './NativePublicPageReader';

function NativeReader({ url, title, onClose, kind = 'bayshop-info' }: InternalContentViewerProps) {
  const { language } = useI18n();
  // v14 declares its optional generic as `undefined`, which otherwise turns
  // the intersected props into `never` under strict TypeScript.
  const reader = useRef<WebView<object>>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const validUrl = readerUrl(url, kind, url);
  const source = kind === 'public-page' && validUrl ? new URL(validUrl).hostname : undefined;
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => { reader.current?.stopLoading(); setFailed(true); setLoading(false); }, 20_000);
    return () => clearTimeout(timer);
  }, [loading, revision]);
  const fail = () => { setFailed(true); setLoading(false); };
  const retry = () => { setFailed(false); setBlocked(false); setLoading(true); setRevision(value => value + 1); };
  return <ContentModalFrame title={title} source={source} onClose={onClose} onRetry={retry} loading={!!validUrl && loading} failed={!validUrl || failed} blocked={blocked}>
    {validUrl && !failed && <WebView<object>
      key={revision}
      ref={reader}
      source={{ uri: validUrl, headers: { 'Accept-Language': language } }}
      style={{ flex: 1 }}
      // Rejected originWhitelist URLs are delegated to the OS. Catch every
      // origin and refuse it in our full URL policy instead.
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={request => {
        const allowed = request.navigationType !== 'formsubmit' && request.navigationType !== 'formresubmit' && readerNavigationAllowed(request.url, kind, url);
        if (!allowed) setBlocked(true);
        return allowed;
      }}
      onNavigationStateChange={state => { if (!readerNavigationAllowed(state.url, kind, url)) { reader.current?.stopLoading(); setBlocked(true); } }}
      onOpenWindow={() => setBlocked(true)}
      onFileDownload={() => setBlocked(true)}
      onLoadStart={() => setLoading(true)}
      onLoadEnd={() => setLoading(false)}
      onError={fail}
      onHttpError={event => { if (readerUrl(event.nativeEvent.url, kind, url)) fail(); }}
      onContentProcessDidTerminate={fail}
      onRenderProcessGone={fail}
      renderError={() => <></>}
      javaScriptEnabled={false}
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled={false}
      incognito
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      cacheEnabled={false}
      saveFormDataDisabled
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      geolocationEnabled={false}
      allowsLinkPreview={false}
      dataDetectorTypes="none"
      setSupportMultipleWindows
    />}
  </ContentModalFrame>;
}

export function InternalContentViewer(props: InternalContentViewerProps) {
  if (props.kind === 'public-page') return <NativePublicPageReader key={props.url} {...props} />;
  return <NativeReader key={`${props.kind || 'bayshop-info'}:${props.url}`} {...props} />;
}
