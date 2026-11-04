import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n/context';
/** A bundled PDF.js canvas renderer; never navigates to PDF links or sends files to another service. */
export default function PdfView({ uri, onError }: { uri: string; onError: () => void }) {
  const { t } = useI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => { const listener = (event: MessageEvent) => { if (event.source === frame.current?.contentWindow && event.origin === location.origin && event.data?.type === 'pdf-error') onError(); }; window.addEventListener('message', listener); return () => window.removeEventListener('message', listener); }, [onError]);
  const onLoad = () => frame.current?.contentWindow?.postMessage({ type: 'pdf-open', uri, labels: { position: t('media.pdfPage', { current: '{current}', total: '{total}' }), previous: t('media.previousPage'), next: t('media.nextPage'), minus: t('media.zoomOut'), plus: t('media.zoomIn'), error: t('media.error') } }, location.origin);
  return <iframe ref={frame} src="/pdf/viewer.html" title={t('parcelForm.invoices')} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" onError={onError} onLoad={onLoad} style={{ border: 0, flex: 1, width: '100%', backgroundColor: '#111923' }} />;
}
