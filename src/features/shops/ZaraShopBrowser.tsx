import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n/context';
import { useVisualPreferences } from '@/navigation/accessibility';
import { Button, Notice, minTouchTarget, useUi } from '@/ui';
import { ZaraPage } from './ZaraPage';
import { isZaraBrowseUrl, zaraCaptureScript, zaraProductUrl, zaraSelectionObserverScript } from './zara-product';
import { resolveZaraReply, type ZaraImport, type ZaraOptions, type ZaraRequest } from './zara-browser-capture';

export function ZaraShopBrowser({ startUrl, onClose, onProduct }: { startUrl: string; onClose: () => void; onProduct: (product: ZaraImport) => void }) {
  const { s, colors } = useUi(); const { t } = useI18n(); const { reduceMotion } = useVisualPreferences();
  const [page, setPage] = useState({ url: startUrl, loading: true, canGoBack: false });
  const [back, setBack] = useState(0); const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState(!isZaraBrowseUrl(startUrl));
  const [notice, setNotice] = useState<string | null>(null);
  const [options, setOptions] = useState<ZaraOptions | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const current = useRef(startUrl);
  const pending = useRef<ZaraRequest | null>(null);
  const finished = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRequest = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null; pending.current = null; setScript(null);
  }, []);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  const fail = useCallback(() => { clearRequest(); setFailed(true); setOptions(null); }, [clearRequest]);
  useEffect(() => {
    if (Platform.OS === 'web' || !page.loading || failed) return;
    const timer = setTimeout(fail, 30_000);
    return () => clearTimeout(timer);
  }, [page.url, page.loading, failed, fail, revision]);
  const updatePage = (url: string, loading: boolean, canGoBack: boolean) => {
    if (!isZaraBrowseUrl(url)) { fail(); return; }
    if (current.current !== url || loading && !page.loading) {
      clearRequest(); setOptions(null); setNotice(null);
    }
    current.current = url; setPage({ url, loading, canGoBack });
  };
  const capture = (selection?: ZaraRequest['selection']) => {
    const url = zaraProductUrl(current.current);
    if (!url || page.loading || pending.current || finished.current || failed) return;
    const id = randomUUID();
    pending.current = { id, url, selection }; setNotice(null); setScript(zaraCaptureScript(id));
    timeout.current = setTimeout(() => { clearRequest(); setOptions(null); setNotice('zara.timeout'); }, 5000);
  };
  const receive = (url: string, message: string) => {
    if (!pending.current || finished.current) return;
    const result = resolveZaraReply(pending.current, url, current.current, message);
    if (!result) return;
    clearRequest();
    if (result.ok) { finished.current = true; onProduct(result.draft); return; }
    if (result.reason === 'size' && result.draft && result.choices?.length) {
      setOptions({ draft: result.draft, choices: result.choices }); setNotice(null);
    } else { setOptions(null); setNotice('zara.' + result.reason); }
  };
  const previous = () => { clearRequest(); setOptions(null); setNotice(null); setBack(n => n + 1); };
  const useLink = () => {
    const url = zaraProductUrl(current.current);
    if (!url || url !== zaraProductUrl(page.url) || finished.current || pending.current) return;
    finished.current = true;
    onProduct({ url });
  };
  const retry = () => {
    clearRequest(); setOptions(null); setNotice(null); setFailed(false); current.current = startUrl;
    setPage({ url: startUrl, loading: true, canGoBack: false }); setRevision(n => n + 1);
  };
  const manual = Platform.OS === 'web' || failed;
  return <Modal visible presentationStyle="fullScreen" animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={!manual && page.canGoBack ? previous : onClose}>
    <SafeAreaView accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.surface }} edges={['top','bottom','left','right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
        {!manual && page.canGoBack && <Pressable accessibilityRole="button" accessibilityLabel={t('navigation.back')} onPress={previous}
          style={{ minHeight: minTouchTarget, minWidth: minTouchTarget, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>}
        <View style={{ flex: 1 }}><Text accessibilityRole="header" style={s.heading}>Zara România</Text><Text style={s.small}>zara.com</Text></View>
        {!manual && page.loading && <ActivityIndicator accessible accessibilityLabel={t('live.loading')} color={colors.accent} />}
        <Button secondary onPress={onClose}>{t('contentReader.close')}</Button>
      </View>
      {manual ? <View style={{ padding: 16, gap: 12 }}><Notice>{t(Platform.OS === 'web' ? 'zara.webFallback' : 'zara.failed')}</Notice>
        {failed && zaraProductUrl(page.url) && <Button onPress={useLink}>{t('zara.useLink')}</Button>}
        {Platform.OS !== 'web' && <Button secondary onPress={retry}>{t('live.retry')}</Button>}
        <Button onPress={onClose}>{t('zara.manual')}</Button></View> : <>
        <View style={{ flex: 1 }}><ZaraPage key={revision} startUrl={startUrl} observer={zaraSelectionObserverScript}
          capture={script} back={back} onState={updatePage} onMessage={receive} onFailure={fail} onBlocked={() => setNotice('zara.blocked')} /></View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 9, gap: 6, borderTopWidth: 1, borderColor: colors.border }}>
          {notice && <Text accessibilityRole="alert" style={s.small}>{t(notice)}</Text>}
          {notice && notice !== 'zara.unavailable' && !script && zaraProductUrl(page.url) &&
            <Button secondary onPress={useLink}>{t('zara.useLink')}</Button>}
          {options ? <>
            <Text accessibilityRole="header" style={s.heading}>{t('zara.pickSize')}</Text>
            <Text numberOfLines={2} style={s.small}>{options.draft.title} · {options.draft.color}</Text>
            <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
              {options.choices.map(choice => <Button key={choice.label} secondary disabled={page.loading || !!script} onPress={() => capture({ draft: options.draft, choice })}>
                {choice.price && choice.price !== options.draft.price ? choice.label + ' · ' + choice.price + ' RON' : choice.label}
              </Button>)}
            </ScrollView>
          </> : zaraProductUrl(page.url)
            ? <Button disabled={page.loading || !!script} onPress={() => capture()}>{t(script || page.loading ? 'zara.reading' : 'zara.useProduct')}</Button>
            : <Text style={s.small}>{t('zara.findProduct')}</Text>}
        </View>
      </>}
    </SafeAreaView>
  </Modal>;
}
