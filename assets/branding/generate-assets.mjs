import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regenerate home-screen icons only. Splash, launch and in-app branding have
// separate layouts and must not be overwritten by an icon alignment correction.
// SHARP_MODULE can point to an existing bundled sharp installation.
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const output = dirname(fileURLToPath(import.meta.url));
const source = await readFile(join(output, 'official-logo.source.svg'), 'utf8');
const sourceWidth = 441;
const sourceHeight = 392.06;
if (!source.includes('viewBox="0 0 441 392.06"') || !source.includes('fill="#df4546"') || !source.includes('fill-rule="evenodd"')) {
  throw new Error('Unexpected official logo geometry. Inspect the source before regenerating assets.');
}
// The left speed lines make the complete artwork bounds asymmetrical. Center
// the primary circular body, whose right outer arc yields this optical anchor,
// rather than centering the full 441px-wide bounding box. The exact path stays
// unchanged; only its uniform scale and translation are different.
const opticalAnchor = { x: 244.2, y: 196.06 };
const artwork = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const document = (body, description) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="${description}">${body}</svg>\n`;
const centered = (width, monochrome = false) => {
  const scale = width / sourceWidth;
  const x = 512 - opticalAnchor.x * scale;
  const y = 512 - opticalAnchor.y * scale;
  const mark = monochrome ? artwork.replace('fill="#df4546"', 'fill="#FFFFFF"') : artwork;
  if (x < 0 || y < 0 || x + width > 1024 || y + sourceHeight * scale > 1024) {
    throw new Error('Icon transform clips the official artwork');
  }
  return `<g transform="translate(${x} ${y}) scale(${scale})">${mark}</g>`;
};

const assets = {
  icon: document(`<rect width="1024" height="1024" fill="#FFFFFF"/>${centered(820)}`, 'BayShop official logo with optically centered circular body'),
  'adaptive-foreground': document(centered(540), 'BayShop optically centered adaptive foreground'),
  'adaptive-monochrome': document(centered(540, true), 'BayShop optically centered themed icon mask'),
};

for (const [name, svg] of Object.entries(assets)) {
  await writeFile(join(output, `${name}.svg`), svg);
  let render = sharp(Buffer.from(svg)).resize(1024, 1024);
  if (name === 'icon') render = render.flatten({ background: '#FFFFFF' }).removeAlpha();
  await render.png().toFile(join(output, `${name}.png`));
  const metadata = await sharp(join(output, `${name}.png`)).metadata();
  if (metadata.width !== 1024 || metadata.height !== 1024) throw new Error(`Invalid dimensions for ${name}`);
  if (name === 'icon' && metadata.hasAlpha) throw new Error('The iOS app icon must be opaque');
  console.log(`${name}.png: ${metadata.width}x${metadata.height}, alpha=${metadata.hasAlpha}`);
}

const foreground = await sharp(join(output, 'adaptive-foreground.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const monochrome = await sharp(join(output, 'adaptive-monochrome.png')).ensureAlpha().raw().toBuffer();
let maximumRadius = 0;
const bounds = { left: 1024, top: 1024, right: -1, bottom: -1 };
for (let y = 0; y < foreground.info.height; y++) for (let x = 0; x < foreground.info.width; x++) {
  const index = (y * foreground.info.width + x) * 4;
  const alpha = foreground.data[index + 3];
  if (alpha !== monochrome[index + 3]) throw new Error('Adaptive and themed icon masks are misaligned');
  if (alpha > 0) {
    maximumRadius = Math.max(maximumRadius, Math.hypot(x + 0.5 - 512, y + 0.5 - 512));
    bounds.left = Math.min(bounds.left, x); bounds.top = Math.min(bounds.top, y);
    bounds.right = Math.max(bounds.right, x); bounds.bottom = Math.max(bounds.bottom, y);
  }
}
const safeRadius = 1024 * 33 / 108;
if (maximumRadius > safeRadius) throw new Error(`Adaptive artwork exceeds the Android safe circle: ${maximumRadius} > ${safeRadius}`);
console.log(`Optical circle anchor: source (${opticalAnchor.x}, ${opticalAnchor.y}) -> canvas (512, 512)`);
console.log(`Adaptive raster bounds: ${JSON.stringify(bounds)}`);
console.log(`Adaptive safe circle verified: artwork radius ${maximumRadius.toFixed(2)}px <= ${safeRadius.toFixed(2)}px`);
console.log(`Official source SHA-256: ${createHash('sha256').update(source).digest('hex')}`);
