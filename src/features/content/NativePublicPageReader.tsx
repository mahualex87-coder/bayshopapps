import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { fetch } from 'expo/fetch';
import { useUi } from '@/ui';
import { ContentModalFrame, type InternalContentViewerProps } from './ContentModalFrame';
import { readPublicContent, publicPageUrl } from './public-content-policy';
import { readablePublicText } from './readable-public-text';

/** Only a GET is issued; page scripts, forms and links never enter a WebView. */
export function NativePublicPageReader({ url, title, onClose }: InternalContentViewerProps) {
  const { s } = useUi();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; text: string; failed: boolean } | null>(null);
  const key = JSON.stringify([url, revision]);
  const validUrl = publicPageUrl(url);
  const source = validUrl ? new URL(validUrl).hostname : undefined;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let active = true;
    void readPublicContent(async (uri, options) => await fetch(uri, options) as unknown as Response, url, controller.signal, 'public-page').then(html => {
      const text = readablePublicText(html);
      if (!text) throw new Error('contentReader.loadError');
      if (active) setResult({ key, text, failed: false });
    }).catch(() => { if (active) setResult({ key, text: '', failed: true }); }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [url, key]);
  const current = result?.key === key ? result : null;
  return <ContentModalFrame title={title} source={source} staticPage onClose={onClose} onRetry={() => setRevision(value => value + 1)} loading={!current} failed={current?.failed === true}>
    {current && <ScrollView contentContainerStyle={{ padding: 16 }}><Text selectable style={s.body}>{current.text}</Text></ScrollView>}
  </ContentModalFrame>;
}
