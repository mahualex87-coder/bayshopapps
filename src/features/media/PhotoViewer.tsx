import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import { useI18n } from '@/i18n/context';
import { Button } from '@/ui';
import { remoteFileUrl } from '@/features/live/forms/remoteFiles';
import { boundedTransform, containedPhotoSize, mediaIndex, photoSwipeAction, pinchTransform, type PhotoSize, type PhotoTransform } from './media-model';
import { MediaControl, MediaFrame, mediaStyles } from './MediaFrame';

export function PhotoViewer({ photos, initialIndex = 0, title, onClose }: { photos: { url: string; alt?: string | null }[]; initialIndex?: number; title: string; onClose: () => void }) {
  const { t, formatNumber } = useI18n();
  const [selected, setSelected] = useState(() => mediaIndex(initialIndex, photos.length));
  const index = mediaIndex(selected, photos.length);
  const move = (delta: number) => setSelected(mediaIndex(index + delta, photos.length));
  return <MediaFrame title={title} onClose={onClose}>
    <ZoomablePhoto onDismiss={onClose} key={`${index}:${photos[index]?.url}`} url={photos[index]?.url || ''} accessibilityLabel={photos[index]?.alt || title} onPrevious={index > 0 ? () => move(-1) : undefined} onNext={index < photos.length - 1 ? () => move(1) : undefined} />
    {photos.length > 1 && <View style={mediaStyles.toolbar}><MediaControl icon="chevron-back" label={t('media.previous')} disabled={index === 0} onPress={() => move(-1)} /><Text accessibilityLiveRegion="polite" style={mediaStyles.text}>{t('media.position', { current: formatNumber(index + 1), total: formatNumber(photos.length) })}</Text><MediaControl icon="chevron-forward" label={t('media.next')} disabled={index === photos.length - 1} onPress={() => move(1)} /></View>}
    <Text style={mediaStyles.hint}>{t('media.hint')}</Text>
  </MediaFrame>;
}

export function ZoomablePhoto({ url, onPrevious, onNext, onDismiss, accessibilityLabel }: { url: string; onDismiss?: () => void; accessibilityLabel?: string; onPrevious?: () => void; onNext?: () => void }) {
  const { t } = useI18n();
  const uri = remoteFileUrl(url);
  const [state, setState] = useState({ scale: 1, x: 0, y: 0 });
  const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  const size = useRef({ width: 1, height: 1 });
  const [dismissDrag, setDismissDrag] = useState(0);
  const imageSize = useRef<PhotoSize | undefined>(undefined);
  const transform = useRef(state);
  const pinchStart = useRef<{ transform: PhotoTransform; focal: { x: number; y: number }; scale: number } | null>(null);
  const pinching = useRef(false);
  const panSession = useRef({ pinched: false, rebase: false, startScale: 1 });
  const apply = useCallback((scale: number, x = 0, y = 0) => {
    const viewport = size.current;
    const next = boundedTransform(scale, x, y, viewport.width, viewport.height, containedPhotoSize(viewport, imageSize.current));
    transform.current = next; setState(next);
  }, []);
  // Native recognizers, with JS callbacks and no Reanimated dependency.
  // The midpoint is valid only after pinch activation on Android.
  const pinch = usePinchGesture({
    enabled: !loading && !failed, disableReanimated: true,
    onActivate: event => {
      pinching.current = true; panSession.current.pinched = true; setDismissDrag(0);
      pinchStart.current = { transform: transform.current, focal: { x: event.focalX, y: event.focalY }, scale: event.scale || 1 };
    },
    onUpdate: event => {
      const start = pinchStart.current;
      if (!start) return;
      const next = pinchTransform(start.transform, start.transform.scale * event.scale / start.scale, start.focal, { x: event.focalX, y: event.focalY }, size.current, containedPhotoSize(size.current, imageSize.current));
      apply(next.scale, next.x, next.y);
    },
    onFinalize: () => {
      if (pinching.current) panSession.current.rebase = true;
      pinching.current = false; pinchStart.current = null;
    },
  });
  const pan = usePanGesture({
    enabled: !loading && !failed, disableReanimated: true, minDistance: 5, averageTouches: true,
    onBegin: () => { panSession.current = { pinched: pinching.current, rebase: false, startScale: transform.current.scale }; setDismissDrag(0); },
    onUpdate: event => {
      if (pinching.current || event.numberOfPointers > 1) { panSession.current.pinched = true; return; }
      // Dropping from two fingers to one must not jump or keep pan locked.
      if (panSession.current.rebase) { panSession.current.rebase = false; return; }
      const current = transform.current;
      if (current.scale > 1) apply(current.scale, current.x + event.changeX, current.y + event.changeY);
      else if (onDismiss && !panSession.current.pinched && event.translationY > Math.abs(event.translationX) * 1.4) setDismissDrag(Math.max(0, event.translationY));
    },
    onDeactivate: event => {
      const action = photoSwipeAction({ startScale: panSession.current.startScale, scale: transform.current.scale, pinched: panSession.current.pinched, canceled: event.canceled, dx: event.translationX, dy: event.translationY });
      if (action === 'dismiss') onDismiss?.();
      else if (action === 'next') onNext?.();
      else if (action === 'previous') onPrevious?.();
      setDismissDrag(0);
    },
    onFinalize: () => setDismissDrag(0),
  });
  const doubleTap = useTapGesture({
    enabled: !loading && !failed, disableReanimated: true, numberOfTaps: 2, maxDistance: 8,
    onDeactivate: event => {
      if (event.canceled) return;
      const focal = { x: event.x, y: event.y };
      const next = pinchTransform(transform.current, transform.current.scale > 1 ? 1 : 2, focal, focal, size.current, containedPhotoSize(size.current, imageSize.current));
      apply(next.scale, next.x, next.y);
    },
  });
  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);
  const loaded: NonNullable<ComponentProps<typeof Image>['onLoad']> = event => {
    const source = event.nativeEvent as { source?: { width?: number; height?: number }; target?: { naturalWidth?: number; naturalHeight?: number } };
    const width = source.source?.width ?? source.target?.naturalWidth;
    const height = source.source?.height ?? source.target?.naturalHeight;
    if (width && height) imageSize.current = { width, height };
    apply(transform.current.scale, transform.current.x, transform.current.y); setLoading(false);
  };
  return <View style={{ flex: 1 }}>
    <View style={styles.viewport} onLayout={event => { size.current = event.nativeEvent.layout; apply(transform.current.scale, transform.current.x, transform.current.y); }}>
      {uri && !failed ? <><GestureDetector gesture={gesture} touchAction="none"><View collapsable={false} testID="photo-gesture-surface" style={StyleSheet.absoluteFill}><Image key={attempt} accessibilityLabel={accessibilityLabel || t('parcelDetail.photos')} source={{ uri }} resizeMode="contain" style={[StyleSheet.absoluteFill, { transform: [{ translateX: state.x }, { translateY: state.y + dismissDrag }, { scale: state.scale }] }]} onLoad={loaded} onError={() => { setFailed(true); setLoading(false); }} /></View></GestureDetector>{loading && <View pointerEvents="none" style={mediaStyles.center}><ActivityIndicator color="#FFFFFF" /><Text style={mediaStyles.text}>{t('media.loading')}</Text></View>}</> : <View style={mediaStyles.center}><Text accessibilityRole="alert" style={mediaStyles.text}>{t('media.error')}</Text>{uri && <Button onPress={() => { setFailed(false); setLoading(true); setAttempt(attempt + 1); }}>{t('media.retry')}</Button>}</View>}
    </View>
    <View style={mediaStyles.toolbar}><MediaControl icon="remove" label={t('media.zoomOut')} disabled={loading || failed || state.scale === 1} onPress={() => apply(state.scale - .5)} /><MediaControl icon="scan-outline" label={t('media.reset')} disabled={loading || failed || state.scale === 1} onPress={() => apply(1)} /><MediaControl icon="add" label={t('media.zoomIn')} disabled={loading || failed || state.scale === 4} onPress={() => apply(state.scale + .5)} /></View>
  </View>;
}
const styles = StyleSheet.create({ viewport: { flex: 1, overflow: 'hidden' } });
