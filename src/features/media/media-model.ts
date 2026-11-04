export type MediaKind = 'image' | 'pdf';
export function mediaKind(url: string): MediaKind | null {
  try {
    const path = decodeURIComponent(new URL(url).pathname).toLowerCase();
    if (/\.pdf$/.test(path)) return 'pdf';
    if (/\.(jpe?g|png|webp|gif|heic|avif)$/.test(path)) return 'image';
  } catch { /* Malformed paths are not inferred. */ }
  return null;
}
export function mediaKindFromMime(value: string | null): MediaKind | null {
  const mime = value?.split(';')[0].trim().toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  return mime && /^image\/(jpeg|png|webp|gif|heic|avif)$/.test(mime) ? 'image' : null;
}
export function mediaIndex(index: number, length: number) { return Math.max(0, Math.min(Math.trunc(Number.isFinite(index) ? index : 0), Math.max(0, length - 1))); }
export type PhotoTransform = { scale: number; x: number; y: number };
export type PhotoSize = { width: number; height: number };
export function containedPhotoSize(viewport: PhotoSize, image?: PhotoSize): PhotoSize {
  if (!image || image.width <= 0 || image.height <= 0 || !Number.isFinite(image.width + image.height)) return viewport;
  const ratio = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}
export function boundedTransform(scale: number, x: number, y: number, width: number, height: number, content: PhotoSize = { width, height }) {
  const safeScale = Math.min(4, Math.max(1, Number.isFinite(scale) ? scale : 1));
  const boundX = Math.max(0, (content.width * safeScale - width) / 2);
  const boundY = Math.max(0, (content.height * safeScale - height) / 2);
  return { scale: safeScale, x: boundX === 0 ? 0 : Math.max(-boundX, Math.min(boundX, Number.isFinite(x) ? x : 0)), y: boundY === 0 ? 0 : Math.max(-boundY, Math.min(boundY, Number.isFinite(y) ? y : 0)) };
}
/** Keep the image point under the two fingers fixed while their midpoint moves. */
export function pinchTransform(start: PhotoTransform, scale: number, anchor: { x: number; y: number }, focal: { x: number; y: number }, viewport: PhotoSize, content?: PhotoSize): PhotoTransform {
  const nextScale = Math.min(4, Math.max(1, Number.isFinite(scale) ? scale : 1));
  const ratio = nextScale / start.scale;
  return boundedTransform(nextScale, focal.x - viewport.width / 2 - (anchor.x - viewport.width / 2 - start.x) * ratio, focal.y - viewport.height / 2 - (anchor.y - viewport.height / 2 - start.y) * ratio, viewport.width, viewport.height, content);
}
export function photoSwipeAction({ startScale, scale, pinched, canceled, dx, dy }: { startScale: number; scale: number; pinched: boolean; canceled: boolean; dx: number; dy: number }): 'dismiss' | 'next' | 'previous' | null {
  if (canceled || pinched || startScale !== 1 || scale !== 1 || !Number.isFinite(dx + dy)) return null;
  if (dy > 90 && dy > Math.abs(dx) * 1.4) return 'dismiss';
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3) return dx < 0 ? 'next' : 'previous';
  return null;
}
