import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Pdf from 'react-native-pdf';
import { useI18n } from '@/i18n/context';
import { mediaStyles } from './MediaFrame';

export default function PdfView({ uri, onError }: { uri: string; onError: () => void }) {
  const { t, formatNumber } = useI18n(); const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [linkBlocked, setLinkBlocked] = useState(false);
  return <View style={{ flex: 1 }}><Pdf source={{ uri, cache: false }} trustAllCerts={false} style={{ flex: 1, backgroundColor: '#111923' }} minScale={1} maxScale={4} fitPolicy={0} enableDoubleTapZoom onError={onError} onLoadComplete={count => setTotal(count)} onPageChanged={(current, count) => { setPage(current); setTotal(count); }} onPressLink={() => setLinkBlocked(true)} renderActivityIndicator={() => <ActivityIndicator color="#FFFFFF" />} />{total > 0 && <Text accessibilityLiveRegion="polite" style={[mediaStyles.text, { padding: 10 }]}>{t('media.pdfPage', { current: formatNumber(page), total: formatNumber(total) })}</Text>}{linkBlocked && <Text accessibilityRole="alert" style={mediaStyles.hint}>{t('media.linkNotOpened')}</Text>}</View>;
}
