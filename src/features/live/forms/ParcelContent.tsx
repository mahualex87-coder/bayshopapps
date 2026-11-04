import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PhotoViewer } from '@/features/media/PhotoViewer';
import { DocumentViewer } from '@/features/media/DocumentViewer';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Attachment } from '@/api/operations-normalize';
import { useI18n } from '@/i18n/context';
import { Button, Notice, minTouchTarget, useUi } from '@/ui';
import { remoteFileUrl } from './remoteFiles';
import { useThemeStyles } from '@/theme/context';
import type { ThemeColors } from '@/theme/palette';
import { displayMoney } from '../shared';

export function safeRemoteUrl(value: string, httpsOnly = true) { try { const url = new URL(value); return (url.protocol === 'https:' || !httpsOnly && url.protocol === 'http:') && !url.username && !url.password; } catch { return false; } }
export function RemoteDocumentButton({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  return <><Button secondary onPress={() => setOpen(true)}>{label}</Button>{open && <DocumentViewer url={url} title={label} onClose={() => setOpen(false)} />}</>;
}

export function ParcelPhotos({ photos, compact = false, hideTitle = false }: { photos: Attachment[]; compact?: boolean; hideTitle?: boolean }) {
  const { colors, s } = useUi(); const styles = useThemeStyles(makeStyles);
  const { t, formatNumber } = useI18n();
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const entries = photos.map((photo, index) => <Pressable key={photo.id || photo.url} accessibilityRole="button" accessibilityLabel={t('parcelDetail.openPhoto', { number: formatNumber(index + 1) })} onPress={() => setSelected(index)} style={[s.card, styles.photo, compact && styles.compactPhoto]}>
    {!failed.has(photo.url) && remoteFileUrl(photo.thumbnail || photo.url) ? <Image accessible={false} source={{ uri: remoteFileUrl(photo.thumbnail || photo.url)! }} style={[styles.image, compact && styles.compactImage]} resizeMode="contain" onError={() => setFailed(previous => new Set(previous).add(photo.url))} /> : <View style={[styles.image, compact && styles.compactImage, styles.placeholder]}><Ionicons name="image-outline" size={30} color={colors.muted} /><Text style={s.small}>{t('parcelDetail.photoUnavailable')}</Text></View>}
    <Text style={s.small}>{t('parcelDetail.photoNumber', { number: formatNumber(index + 1) })}</Text>
  </Pressable>);
  return <View style={{ gap: 10 }}>{!hideTitle && <Text accessibilityRole="header" style={s.heading}>{t('parcelDetail.photos')}</Text>}{compact ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>{entries}</ScrollView> : <View style={styles.gallery}>{entries}</View>}{photos.length === 0 && <Text style={s.small}>{t('parcelDetail.noPhotos')}</Text>}{selected !== null && <PhotoViewer photos={photos} initialIndex={selected} title={t('parcelDetail.photos')} onClose={() => setSelected(null)} />}</View>;
}

export function DeclarationSummary({ items, currency, compact = false, advancedFields = true }: { compact?: boolean; advancedFields?: boolean; items: { title: string; url: string | null; quantity: number | null; price: string | null; currency?: string | null; productType?: string | null; orderNumber?: string | null }[]; currency: string | null }) {
  const { t, formatNumber } = useI18n();
  const { s } = useUi(); const styles = useThemeStyles(makeStyles);
  return <View style={{ gap: 10 }}>{items.map((item, index) => <View key={index} style={[s.card, compact && styles.compactDeclaration]}><Text style={s.heading}>{item.title}</Text><Text style={s.body}>{t('parcelDetail.quantity')}: {item.quantity === null ? t('live.unavailable') : formatNumber(item.quantity)}</Text><Text style={s.body}>{t('parcelDetail.unitPrice')}: {item.price === null ? t('live.unavailable') : displayMoney(Number(item.price), item.currency || currency, formatNumber)}</Text>{item.price !== null && !item.currency && !currency && <Text style={s.small}>{t('parcelDetail.currencyUnavailable')}</Text>}{item.url && <Text selectable style={s.small}>{item.url}</Text>}{advancedFields && item.productType && <Text style={s.small}>{t('parcelForm.productType')}: {item.productType}</Text>}{advancedFields && item.orderNumber && <Text style={s.small}>{t('parcelForm.orderNumber')}: {item.orderNumber}</Text>}</View>)}{items.length === 0 && <Notice>{t('parcelDetail.noDeclaration')}</Notice>}</View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({ strip: { flexDirection: 'row', gap: 9, paddingBottom: 3 }, compactPhoto: { width: 108, flexGrow: 0, flexBasis: 'auto', padding: 8, gap: 5 }, compactImage: { height: 88 }, compactDeclaration: { padding: 12, gap: 6 }, gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, photo: { flexGrow: 1, flexBasis: 140, minHeight: minTouchTarget }, image: { width: '100%', height: 130 }, placeholder: { alignItems: 'center', justifyContent: 'center', gap: 8 } });
