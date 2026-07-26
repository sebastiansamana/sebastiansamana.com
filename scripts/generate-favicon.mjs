import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourcePath = path.join(root, 'public', 'favicon.svg');
const icoPath = path.join(root, 'public', 'favicon.ico');
const pngPath = path.join(root, 'public', 'favicon-96x96.png');
const icoSizes = [16, 32, 48, 64, 128, 256];

const source = await readFile(sourcePath);
const metadata = await sharp(source).metadata();
assert.equal(metadata.width, metadata.height, 'The favicon source must be square');

const renderPng = (size) =>
  sharp(source, { density: 192 })
    .resize(size, size, {
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .png({
      compressionLevel: 9,
      palette: false,
    })
    .toBuffer();

const pngBuffers = await Promise.all(icoSizes.map(renderPng));
const png96 = await renderPng(96);
const directorySize = 6 + icoSizes.length * 16;
const directory = Buffer.alloc(directorySize);

directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(icoSizes.length, 4);

let imageOffset = directorySize;
pngBuffers.forEach((png, index) => {
  const size = icoSizes[index];
  const entryOffset = 6 + index * 16;

  directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
  directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
  directory.writeUInt8(0, entryOffset + 2);
  directory.writeUInt8(0, entryOffset + 3);
  directory.writeUInt16LE(1, entryOffset + 4);
  directory.writeUInt16LE(32, entryOffset + 6);
  directory.writeUInt32LE(png.length, entryOffset + 8);
  directory.writeUInt32LE(imageOffset, entryOffset + 12);
  imageOffset += png.length;
});

await Promise.all([
  writeFile(icoPath, Buffer.concat([directory, ...pngBuffers])),
  writeFile(pngPath, png96),
]);

console.log(
  `Generated ${path.relative(root, icoPath)} (${icoSizes.join(', ')}px) and ${path.relative(root, pngPath)}.`,
);
