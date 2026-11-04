import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useUi } from '@/ui';
import { ContentModalFrame, type InternalContentViewerProps } from './ContentModalFrame';
import { readPublicContent, readerUrl } from './public-content-policy';

function readableText(html: string): string {
  // Only text leaves the inert document; no HTML, scripts, forms or links mount.
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,button,input,select,textarea,iframe,object,embed,svg,canvas,img,video,audio,link,meta').forEach(node => node.remove());
  const body = document.querySelector('article,main,[role="main"]') || document.body;
  body.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,br,section,tr,blockquote').forEach(node => node.appendChild(document.createTextNode('\n\n')));
  return (body.textContent || '').replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function InternalContentViewer({ url, title, onClose, kind = 'bayshop-info' }: InternalContentViewerProps) {
  const { s } = useUi();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; text: string; failed: boolean } | null>(null);
  const key = JSON.stringify([url, kind, revision]);
  const validUrl = readerUrl(url, kind, url);
  const source = kind === 'public-page' && validUrl ? new URL(validUrl).hostname : undefined;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let active = true;
    void readPublicContent(fetch, url, controller.signal, kind).then(html => {
      const text = readableText(html);
      if (!text) throw new Error('contentReader.loadError');
      if (active) setResult({ key, text, failed: false });
    }).catch(() => { if (active) setResult({ key, text: '', failed: true }); }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [url, key, kind]);
  const current = result?.key === key ? result : null;
  return <ContentModalFrame title={title} source={source} staticPage={kind === 'public-page'} onClose={onClose} onRetry={() => setRevision(value => value + 1)} loading={!current} failed={current?.failed === true}>
    {current && <ScrollView contentContainerStyle={{ padding: 16 }}><Text selectable style={s.body}>{current.text}</Text></ScrollView>}
  </ContentModalFrame>;
}
