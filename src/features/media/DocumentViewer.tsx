import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { fetch } from 'expo/fetch';
import { useI18n } from '@/i18n/context';
import { Button } from '@/ui';
import { remoteFileUrl } from '@/features/live/forms/remoteFiles';
import { mediaKind } from './media-model';
import { MediaFrame, mediaStyles } from './MediaFrame';
import { ZoomablePhoto } from './PhotoViewer';
import PdfView from './PdfView';
import { readDocument } from './read-document';
import { preparePdf } from './pdf-file';

export function DocumentViewer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const { t } = useI18n(); const [attempt, setAttempt] = useState(0);
  const uri = remoteFileUrl(url);
  return <MediaFrame title={title} onClose={onClose}>{!uri ? <View style={mediaStyles.center}><Text style={mediaStyles.text}>{t('media.unsupported')}</Text></View> : mediaKind(uri) === 'image' ? <ZoomablePhoto key={uri} url={uri} /> : <DownloadedDocument key={`${uri}:${attempt}`} uri={uri} retry={() => setAttempt(attempt + 1)} />}</MediaFrame>;
}
function DownloadedDocument({ uri, retry }: { uri: string; retry: () => void }) {
  const { t } = useI18n();
  const [resolved, setResolved] = useState<{ kind: 'image' | 'pdf'; uri: string } | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true; let dispose: (() => void) | undefined;
    const timer = setTimeout(() => controller.abort(), 30000);
    void (async () => {
      try {
        const response = await fetch(uri, { signal: controller.signal, credentials: 'omit', redirect: 'error', headers: { Accept: 'application/pdf,image/*' } });
        const result = await readDocument(response as unknown as Response);
        if (!active) return;
        if (result.kind === 'image') setResolved({ kind: 'image', uri });
        else { const local = preparePdf(result.bytes); dispose = local.dispose; setResolved({ kind: 'pdf', uri: local.uri }); }
      } catch (cause) { if (active) setError(cause instanceof Error && cause.message === 'media.unsupported' ? cause.message : 'media.error'); }
      finally { clearTimeout(timer); }
    })();
    return () => { active = false; controller.abort(); clearTimeout(timer); dispose?.(); };
  }, [uri]);
  return <>{error ? <View style={mediaStyles.center}><Text accessibilityRole="alert" style={mediaStyles.text}>{t(error)}</Text><Button onPress={retry}>{t('media.retry')}</Button></View> : resolved?.kind === 'image' ? <ZoomablePhoto key={resolved.uri} url={resolved.uri} /> : resolved?.kind === 'pdf' ? <PdfView uri={resolved.uri} onError={() => setError('media.error')} /> : <View style={mediaStyles.center}><ActivityIndicator color="#FFFFFF" /><Text style={mediaStyles.text}>{t('media.loading')}</Text></View>}</>;
}
