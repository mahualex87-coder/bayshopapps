import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pickAttachment } from './pick-attachment';
import { AttachmentSelectionError, mergePickedFiles, validatePickedFiles, type AttachmentSource, type StagedFile } from './attachment-selection';
import { DocumentViewer } from '@/features/media/DocumentViewer';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useI18n } from '@/i18n/context';
import { Button, Notice, minTouchTarget, useUi } from '@/ui';

export type { StagedFile } from './attachment-selection';
export type ExistingFile = { id: string | null; url: string; thumbnail?: string | null; displayName?: string };
function fileName(url: string): string { try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch { return ''; } }

export function AttachmentsEditor({ title, existing, onExistingChange, staged, onStagedChange, allowPdf = true, maxFiles = null, maxBytes = null, multiple = true, disabled = false, readOnly = false, hideTitle = false }: { title: string; hideTitle?: boolean; existing: ExistingFile[]; onExistingChange?: (files: ExistingFile[]) => void; staged: StagedFile[]; onStagedChange: (files: StagedFile[]) => void; allowPdf?: boolean; maxFiles?: number | null; maxBytes?: number | null; multiple?: boolean; disabled?: boolean; readOnly?: boolean }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { t, countt, formatNumber } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<ExistingFile | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pickingRef = useRef(false);
  const latest = useRef({ disabled, readOnly, staged, existing, onStagedChange, allowPdf, maxBytes, maxFiles, multiple });
  useLayoutEffect(() => { latest.current = { disabled, readOnly, staged, existing, onStagedChange, allowPdf, maxBytes, maxFiles, multiple }; });
  const full = maxFiles !== null && existing.length + staged.length >= maxFiles;
  const pick = async (source: AttachmentSource) => {
    if (disabled || readOnly || pickingRef.current || full) return;
    pickingRef.current = true;
    setPicking(true); setError(null);
    try {
      const remaining = maxFiles === null ? null : Math.max(1, maxFiles - existing.length - staged.length);
      const assets = await pickAttachment(source, { allowPdf, maxBytes, maxFiles, multiple }, remaining, () => mounted.current && !latest.current.disabled && !latest.current.readOnly);
      const current = latest.current;
      // Permission/status may change while the OS picker is open; do not stage into a disabled form.
      if (!mounted.current || !assets || current.disabled || current.readOnly) return;
      const chosen = validatePickedFiles(assets, current);
      current.onStagedChange(mergePickedFiles(chosen, current.staged, current.existing.length, current));
    } catch (cause) { if (mounted.current) setError(cause instanceof AttachmentSelectionError ? cause.key : 'attachment.pickError'); }
    finally { pickingRef.current = false; if (mounted.current) setPicking(false); }
  };
  return <View style={s.card}>
    {!hideTitle && <Text accessibilityRole="header" style={s.heading}>{title}</Text>}
    {!readOnly && <Text style={s.small}>{t(allowPdf ? 'attachment.formats' : 'attachment.imageFormats')}{maxFiles !== null ? ` · ${countt('attachment.limit', maxFiles)}` : ''}{maxBytes !== null ? ` · ${t('attachment.sizeLimit', { size: formatNumber(maxBytes / 1048576) })}` : ''}</Text>}
    {readOnly && existing.length === 0 && <Text style={s.small}>{t('attachment.none')}</Text>}
    {existing.map((file, index) => <View key={file.id || file.url} style={styles.row}>
      <Pressable accessibilityRole="button" disabled={!file.url} accessibilityState={{ disabled: !file.url }} accessibilityLabel={file.url ? t('attachment.open', { name: file.displayName || fileName(file.url) || t('attachment.number', { number: formatNumber(index + 1) }) }) : `${file.displayName || t('attachment.number', { number: formatNumber(index + 1) })}. ${t('attachment.previewUnavailable')}`} onPress={() => { if (file.url) setViewing(file); }} style={({ pressed }) => [styles.file, pressed && s.pressed]}><Ionicons name="document-outline" size={20} color={colors.accent} /><View style={styles.copy}><Text style={styles.name}>{file.displayName || fileName(file.url) || t('attachment.number', { number: formatNumber(index + 1) })}</Text>{!file.url && <Text style={s.small}>{t('attachment.previewUnavailable')}</Text>}</View></Pressable>
      {!readOnly && onExistingChange && <Pressable accessibilityRole="button" accessibilityLabel={t('attachment.remove', { name: file.displayName || fileName(file.url) || formatNumber(index + 1) })} disabled={disabled} accessibilityState={{ disabled }} onPress={() => { if (!disabled && !readOnly) onExistingChange(existing.filter(value => value !== file)); }} style={styles.remove}><Ionicons name="close" size={21} color={colors.error} /></Pressable>}
    </View>)}
    {staged.map(file => <View key={file.uri} style={styles.row}><View style={styles.file}><Ionicons name="cloud-upload-outline" size={20} color={colors.accent} /><View style={styles.copy}><Text style={styles.name}>{file.name}</Text><Text style={s.small}>{t('attachment.staged')}{file.size !== undefined ? ` · ${t('attachment.bytes', { size: formatNumber(file.size) })}` : ''}</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel={t('attachment.remove', { name: file.name })} disabled={disabled || readOnly} accessibilityState={{ disabled: disabled || readOnly }} onPress={() => { if (!disabled && !readOnly) onStagedChange(staged.filter(value => value.uri !== file.uri)); }} style={styles.remove}><Ionicons name="close" size={21} color={colors.error} /></Pressable></View>)}
    {error && <Notice error>{t(error, { size: formatNumber((maxBytes || 0) / 1048576) })}</Notice>}
    {error === 'attachment.cameraSettings' && <Button secondary onPress={() => { void Linking.openSettings().catch(() => setError('attachment.settingsError')); }}>{t('attachment.openSettings')}</Button>}
    {!readOnly && <View style={styles.sources}>{([
      { source: 'camera', icon: 'camera-outline' }, { source: 'gallery', icon: 'images-outline' }, { source: 'files', icon: 'document-attach-outline' },
    ] as const).map(({ source, icon }) => <Pressable key={source} accessibilityRole="button" accessibilityLabel={t(`attachment.${source}`)} accessibilityState={{ disabled: disabled || picking || full, busy: picking }} disabled={disabled || picking || full} onPress={() => { void pick(source); }} style={({ pressed }) => [styles.source, (disabled || picking || full) && styles.sourceDisabled, pressed && s.pressed]}><Ionicons name={icon} size={22} color={colors.accent} /><Text style={styles.sourceText}>{t(`attachment.${source}`)}</Text></Pressable>)}</View>}
    {picking && <Text accessibilityLiveRegion="polite" style={s.small}>{t('attachment.picking')}</Text>}
    {staged.length > 0 && <Text style={s.small}>{t('attachment.pendingHint')}</Text>}
    {viewing && <DocumentViewer url={viewing.url} title={viewing.displayName || fileName(viewing.url) || title} onClose={() => setViewing(null)} />}
  </View>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({ sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, source: { flexGrow: 1, flexBasis: 78, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 8, backgroundColor: colors.soft, borderRadius: 14 }, sourceDisabled: { opacity: 0.45 }, sourceText: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' }, row: { flexDirection: 'row', alignItems: 'center', gap: 6 }, file: { flex: 1, minHeight: minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }, copy: { flex: 1, gap: 3 }, name: { flexShrink: 1, fontSize: 13, lineHeight: 19, color: colors.text }, remove: { minWidth: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 10 } });
