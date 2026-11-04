import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { newsData, type ServerNews } from '@/api/account-operations';
import { useI18n } from '@/i18n/context';
import { Button, Notice, Screen, minTouchTarget, useUi } from '@/ui';
import { ResourceStatus } from '@/features/live/shared';
import { ChatSupportAction } from '@/features/support/ChatSupportAction';
import { PhotoViewer } from '@/features/media/PhotoViewer';
import { remoteFileUrl } from '@/features/live/forms/remoteFiles';
import { GlassSurface } from '@/navigation/GlassSurface';
import { useAccountView } from './shared';

type NewsImage = { url: string; alt: string | null };

export function NewsImagePreview({ image, compact = false, onOpen }: { image: NewsImage; compact?: boolean; onOpen: () => void }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const uri = remoteFileUrl(image.url);
  const unavailable = failed || !uri;
  const description = image.alt || t('accountOps.newsImage');
  const handleLoad: NonNullable<ComponentProps<typeof Image>['onLoad']> = event => {
    // Native supplies source dimensions; React Native Web forwards the image load event.
    const loaded = event.nativeEvent as { source?: { width?: number; height?: number }; target?: { naturalWidth?: number; naturalHeight?: number } };
    const width = loaded.source?.width ?? loaded.target?.naturalWidth;
    const height = loaded.source?.height ?? loaded.target?.naturalHeight;
    if (typeof width === 'number' && typeof height === 'number' && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) setRatio(width / height);
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={`${t('accountOps.newsImageOpen')}: ${description}${unavailable ? `. ${t('accountOps.newsImageUnavailable')}` : ''}`} onPress={onOpen} style={({ pressed }) => [styles.newsImage, compact ? styles.newsThumbnail : [styles.newsImageExpanded, { aspectRatio: ratio }, unavailable && styles.newsImageFailed], pressed && s.pressed]}>
    {!unavailable ? <Image source={{ uri: uri! }} accessible={false} resizeMode="contain" style={StyleSheet.absoluteFill} onError={() => setFailed(true)} onLoad={handleLoad} />
      : <View style={styles.newsImageFallback}><Ionicons name="image-outline" size={compact ? 22 : 27} color={colors.muted} accessible={false} />{!compact && <Text style={styles.newsImageHint}>{t('accountOps.newsImageUnavailable')}</Text>}</View>}
    {!compact && !unavailable && <View pointerEvents="none" style={styles.newsImageExpand}><Ionicons name="expand-outline" size={16} color={colors.text} accessible={false} /></View>}
  </Pressable>;
}

export function NewsCard({ news, expanded, onToggle }: { news: ServerNews; expanded: boolean; onToggle: () => void }) {
  const { s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, formatDate } = useI18n();
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const images = news.images || [];
  const body = news.body.trim();
  const paragraphs = body.split(/\n\s*\n/).filter(Boolean);
  // Short notices remain fully visible even when they wrap beyond three lines.
  // Anything we clamp always has a control that reveals the complete body.
  const canCollapse = images.length > 0 || body.length > 220 || paragraphs.length > 1 || body.split('\n').length > 3;
  const showFullBody = expanded || !canCollapse;
  const date = formatDate(news.date);
  const toggleLabel = t(expanded ? 'accountOps.close' : 'accountOps.readMore');
  return <GlassSurface style={styles.newsCard}>
    <View style={styles.newsHeaderRow}>
      <View style={styles.newsHeader}>
        <Text accessibilityRole="header" selectable style={styles.newsTitle}>{news.title}</Text>
        {date && <Text style={styles.newsDate}>{date}</Text>}
      </View>
      {!expanded && images[0] && <NewsImagePreview key={images[0].url} image={images[0]} compact onOpen={() => setSelectedImage(0)} />}
    </View>
    {expanded && images.length > 0 && <View style={styles.newsImages}>{images.map((image, index) => <NewsImagePreview key={`${index}:${image.url}`} image={image} onOpen={() => setSelectedImage(index)} />)}</View>}
    {!!body && (showFullBody
      ? <View style={styles.paragraphs}>{paragraphs.map((paragraph, index) => <Text key={index} selectable style={styles.newsBody}>{paragraph}</Text>)}</View>
      : <Text style={styles.newsBody} numberOfLines={3} ellipsizeMode="tail">{body.replace(/\s*\n\s*/g, ' ')}</Text>)}
    {canCollapse && <Pressable accessibilityRole="button" accessibilityLabel={`${toggleLabel}: ${news.title}`} accessibilityState={{ expanded }} aria-expanded={expanded} onPress={onToggle} style={({ pressed }) => [styles.newsToggle, pressed && s.pressed]}>
      <Text style={styles.newsToggleLabel}>{toggleLabel}</Text>
      <Text accessible={false} importantForAccessibility="no" aria-hidden style={styles.newsToggleSymbol}>{expanded ? '−' : '+'}</Text>
    </Pressable>}
    {selectedImage !== null && images.length > 0 && <PhotoViewer photos={images} initialIndex={selectedImage} title={news.title || t('accountOps.newsImage')} onClose={() => setSelectedImage(null)} />}
  </GlassSurface>;
}

export function LiveNews(){
  const {t}=useI18n();const {resource,reload}=useAccountView({kind:'news.read'},newsData);const [expanded,setExpanded]=useState<string|null>(null);const [limit,setLimit]=useState(15);
  return <Screen title={t('accountOps.news')} subtitle={t('accountOps.newsIntro')}><ResourceStatus resource={resource} onRefresh={reload}/>{resource.data?.slice(0,limit).map(news=><NewsCard key={news.id} news={news} expanded={expanded===news.id} onToggle={()=>setExpanded(expanded===news.id?null:news.id)}/>)}{resource.data&&resource.data.length>limit&&<Button secondary onPress={()=>setLimit(value=>value+15)}>{t('accountOps.moreNews')}</Button>}{resource.data?.length===0&&<Notice>{t('accountOps.emptyNews')}</Notice>}</Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  newsCard: { padding: 16, gap: 14, borderColor: colors.glassBorder },
  newsHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  newsHeader: { flex: 1, minWidth: 0, gap: 5 },
  newsTitle: { color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  newsDate: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  newsBody: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '400' },
  paragraphs: { gap: 12 },
  newsToggle: { minHeight: Math.max(48, minTouchTarget), paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.soft, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  newsToggleLabel: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '600', flexShrink: 1 },
  newsToggleSymbol: { color: colors.muted, fontSize: 22, lineHeight: 25 },
  newsImages: { gap: 12 },
  newsImage: { overflow: 'hidden', borderRadius: 13, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center' },
  newsThumbnail: { width: 72, height: 64, flexShrink: 0 },
  newsImageExpanded: { width: '100%', minHeight: 96, maxHeight: 220 },
  newsImageFailed: { height: 96, aspectRatio: undefined },
  newsImageFallback: { alignItems: 'center', justifyContent: 'center', gap: 7, padding: 8 },
  newsImageHint: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  newsImageExpand: { position: 'absolute', right: 6, bottom: 6, padding: 6, borderRadius: 10, backgroundColor: colors.glassStrong },
});
export function LiveSupport(){
  const { t } = useI18n();
  return <Screen title={t('accountOps.support')}>
    <ChatSupportAction />
  </Screen>;
}
