import { useEffect, type ComponentType } from 'react';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ViewProps } from 'react-native';
import type { ZaraPageProps } from './zara-page-types';

type PageNativeProps = Pick<ZaraPageProps, 'startUrl' | 'observer' | 'capture' | 'back' | 'onFailure' | 'onBlocked'> & ViewProps & {
  onPageState: (event: { nativeEvent: { url: string; loading: boolean; canGoBack: boolean } }) => void;
  onPageMessage: (event: { nativeEvent: { url: string; data: string } }) => void;
};
let Page: ComponentType<PageNativeProps> | null = null;
try { if (requireOptionalNativeModule('BayShopShopBrowser')) Page = requireNativeView<PageNativeProps>('BayShopShopBrowser'); } catch { /* Manual entry works on older builds. */ }
export function ZaraPage({ onState, onMessage, ...props }: ZaraPageProps) {
  const { onFailure } = props;
  useEffect(() => { if (!Page) onFailure(); }, [onFailure]);
  return Page ? <Page {...props} style={{ flex: 1 }}
    onPageState={({ nativeEvent: e }) => onState(e.url, e.loading, e.canGoBack)}
    onPageMessage={({ nativeEvent: e }) => onMessage(e.url, e.data)} /> : null;
}
