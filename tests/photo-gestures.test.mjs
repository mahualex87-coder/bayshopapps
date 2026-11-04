import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedTransform, containedPhotoSize, pinchTransform } from '../src/features/media/media-model.ts';

const viewport = { width: 320, height: 640 };
test('pinch keeps the touched image point under the moving fingers', () => {
  const start = { scale: 1, x: 0, y: 0 };
  const anchor = { x: 240, y: 360 };
  const focal = { x: 250, y: 370 };
  const next = pinchTransform(start, 2, anchor, focal, viewport);
  assert.deepEqual(next, { scale: 2, x: -70, y: -30 });
  // The original point (80,40) remains at the new midpoint (90,50).
  assert.equal(80 * next.scale + next.x, focal.x - viewport.width / 2);
  assert.equal(40 * next.scale + next.y, focal.y - viewport.height / 2);
});
test('successive pinches start at the retained zoom and pan, and clamp to 1–4x', () => {
  const start = { scale: 2, x: -40, y: 10 };
  const point = { x: 160, y: 320 };
  assert.deepEqual(pinchTransform(start, 3, point, point, viewport), { scale: 3, x: -60, y: 15 });
  assert.deepEqual(pinchTransform(start, .2, point, point, viewport), { scale: 1, x: 0, y: 0 });
  assert.equal(pinchTransform(start, 20, point, point, viewport).scale, 4);
});
test('wide and portrait images pan only where scaled image extends past the viewport', () => {
  const wide = containedPhotoSize(viewport, { width: 1200, height: 600 });
  assert.deepEqual(wide, { width: 320, height: 160 });
  assert.deepEqual(boundedTransform(2, 500, 500, 320, 640, wide), { scale: 2, x: 160, y: 0 });
  const tall = containedPhotoSize(viewport, { width: 400, height: 1600 });
  assert.deepEqual(tall, { width: 160, height: 640 });
  assert.deepEqual(boundedTransform(2, 500, -900, 320, 640, tall), { scale: 2, x: 0, y: -320 });
});
test('layout changes re-bound zoom and pan without changing the selected image', () => {
  const before = { scale: 3, x: 300, y: 600 };
  const landscape = { width: 640, height: 320 };
  const content = containedPhotoSize(landscape, { width: 400, height: 800 });
  assert.deepEqual(boundedTransform(before.scale, before.x, before.y, 640, 320, content), { scale: 3, x: 0, y: 320 });
  assert.deepEqual(containedPhotoSize(viewport, { width: NaN, height: 500 }), viewport);
});

test('downward swipe closes only an unzoomed photo and never a pan or pinch', async () => {
  const { photoSwipeAction } = await import('../src/features/media/media-model.ts');
  const swipe = { startScale: 1, scale: 1, pinched: false, canceled: false, dx: 12, dy: 130 };
  assert.equal(photoSwipeAction(swipe), 'dismiss');
  assert.equal(photoSwipeAction({ ...swipe, scale: 2 }), null);
  assert.equal(photoSwipeAction({ ...swipe, startScale: 2 }), null);
  assert.equal(photoSwipeAction({ ...swipe, pinched: true }), null);
  assert.equal(photoSwipeAction({ ...swipe, canceled: true }), null);
  assert.equal(photoSwipeAction({ ...swipe, dy: 45 }), null);
  assert.equal(photoSwipeAction({ ...swipe, dy: -130 }), null);
  assert.equal(photoSwipeAction({ ...swipe, dx: 120, dy: 120 }), null);
  assert.equal(photoSwipeAction({ ...swipe, dx: NaN }), null);
  assert.equal(photoSwipeAction({ ...swipe, dx: -140, dy: 20 }), 'next');
  assert.equal(photoSwipeAction({ ...swipe, dx: 140, dy: 20 }), 'previous');
});
