import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const publicPath = path.join(root, 'public');
const sourcePath = path.join(publicPath, 'favicon.svg');
const canonicalPngPath = path.join(publicPath, 'favicon-192x192.png');
const expectedPngs = new Map([
  ['favicon-96x96.png', 96],
  ['apple-touch-icon.png', 180],
  ['favicon-192x192.png', 192],
  ['favicon-512x512.png', 512],
]);

const source = await readFile(sourcePath);
const sourceMetadata = await sharp(source).metadata();
assert.equal(sourceMetadata.width, 512, 'SVG should expose a high-resolution intrinsic width');
assert.equal(sourceMetadata.height, 512, 'SVG should expose a square intrinsic size');

for (const [filename, size] of expectedPngs) {
  const metadata = await sharp(path.join(publicPath, filename)).metadata();
  assert.equal(metadata.format, 'png', `${filename} should be a PNG`);
  assert.equal(metadata.width, size, `${filename} width should match its declared size`);
  assert.equal(metadata.height, size, `${filename} must remain square`);
}

const { data: canonicalPixels, info: canonicalInfo } = await sharp(canonicalPngPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let index = 0; index < canonicalPixels.length; index += canonicalInfo.channels) {
  assert.equal(canonicalPixels[index + 3], 255, 'Canonical PNG must be fully opaque to avoid an inner Google halo');
}

const perimeterOffsets = [];
for (let coordinate = 0; coordinate < canonicalInfo.width; coordinate += 1) {
  perimeterOffsets.push(coordinate, (canonicalInfo.height - 1) * canonicalInfo.width + coordinate);
}
for (let coordinate = 1; coordinate < canonicalInfo.height - 1; coordinate += 1) {
  perimeterOffsets.push(coordinate * canonicalInfo.width, coordinate * canonicalInfo.width + canonicalInfo.width - 1);
}
for (const pixelOffset of perimeterOffsets) {
  const channelOffset = pixelOffset * canonicalInfo.channels;
  const red = canonicalPixels[channelOffset];
  const green = canonicalPixels[channelOffset + 1];
  const blue = canonicalPixels[channelOffset + 2];
  assert.ok(red >= 250 && green >= 250 && blue >= 250, 'Canonical PNG perimeter must be white, not grey');
}

const smallIcon = await sharp(source, { density: 384 })
  .resize(16, 16, { fit: 'contain', kernel: sharp.kernel.lanczos3 })
  .removeAlpha()
  .raw()
  .toBuffer();
let solidDarkPixels = 0;
for (let index = 0; index < smallIcon.length; index += 3) {
  if (smallIcon[index] < 80 && smallIcon[index + 1] < 80 && smallIcon[index + 2] < 80) {
    solidDarkPixels += 1;
  }
}
assert.ok(solidDarkPixels >= 12, `16px icon should retain solid mark detail; found ${solidDarkPixels} dark pixels`);

const ico = await readFile(path.join(publicPath, 'favicon.ico'));
assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved field should be zero');
assert.equal(ico.readUInt16LE(2), 1, 'ICO should contain icon images');
const icoCount = ico.readUInt16LE(4);
const icoSizes = Array.from({ length: icoCount }, (_, index) => {
  const entryOffset = 6 + index * 16;
  return [ico[entryOffset] || 256, ico[entryOffset + 1] || 256];
});
assert.deepEqual(
  icoSizes,
  [16, 32, 48, 64, 128, 256].map((size) => [size, size]),
  'ICO should include square browser sizes from 16px through 256px',
);

for (const relativePath of ['src/layouts/BaseLayout.astro', 'src/components/PdfDocumentPage.astro']) {
  const layout = await readFile(path.join(root, relativePath), 'utf8');
  assert.match(layout, /rel="icon" type="image\/png" sizes="192x192" href="\/favicon-192x192\.png"/);
  assert.match(layout, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/);
  assert.doesNotMatch(layout, /favicon[^"']*\?v=/, `${relativePath} should use stable favicon URLs for crawlers`);
}

console.log(`Favicon assets passed: 192px canonical source, opaque white perimeter, ${solidDarkPixels} solid dark pixels at 16px, and complete ICO fallbacks.`);
