import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const recordsDirectory = path.join(root, 'src', 'data', 'artworks');
const publicDirectory = path.join(root, 'public');
const artworkDirectory = path.join(publicDirectory, 'images', 'artworks');
const outputDirectory = path.join(artworkDirectory, 'archive');
const manifestPath = path.join(outputDirectory, 'manifest.json');
const checkOnly = process.argv.includes('--check');

const settings = {
  alphaQuality: 100,
  effort: 6,
  format: 'webp',
  quality: 84,
  smartSubsample: true,
  widths: [320, 336, 384, 480, 640, 960],
};

const hashBuffer = (buffer) => createHash('sha256').update(buffer).digest('hex');

const parseScalar = (frontmatter, key) => {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'm'));
  if (!match) return undefined;

  const rawValue = match[1].trim();
  if (!rawValue) return undefined;

  if (rawValue.startsWith('"')) return JSON.parse(rawValue);
  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1).replaceAll("''", "'");
  }

  return rawValue;
};

const readPublicArtworkSources = async () => {
  const recordNames = (await readdir(recordsDirectory))
    .filter((name) => name.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));
  const sources = new Map();

  for (const recordName of recordNames) {
    const recordPath = path.join(recordsDirectory, recordName);
    const record = await readFile(recordPath, 'utf8');
    const frontmatterMatch = record.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) throw new Error(`${recordName}: missing YAML frontmatter`);

    const frontmatter = frontmatterMatch[1];
    if (parseScalar(frontmatter, 'status') !== 'public') continue;

    for (const field of ['image', 'hoverImage']) {
      const sourceUrl = parseScalar(frontmatter, field);
      if (!sourceUrl) continue;
      if (!sourceUrl.startsWith('/images/artworks/') || sourceUrl.includes('/archive/')) {
        throw new Error(`${recordName}: ${field} must point to an original under /images/artworks/`);
      }

      const sourcePath = path.resolve(publicDirectory, sourceUrl.replace(/^\/+/, ''));
      const relativeToArtworkDirectory = path.relative(artworkDirectory, sourcePath);
      if (relativeToArtworkDirectory.startsWith('..') || path.isAbsolute(relativeToArtworkDirectory)) {
        throw new Error(`${recordName}: ${field} escapes the artwork asset directory`);
      }

      const stem = path.basename(sourcePath, path.extname(sourcePath));
      const existingSource = sources.get(stem);
      if (existingSource && existingSource.sourceUrl !== sourceUrl) {
        throw new Error(`Archive derivative filename collision: ${existingSource.sourceUrl} and ${sourceUrl}`);
      }

      sources.set(stem, { sourcePath, sourceUrl, stem });
    }
  }

  return [...sources.values()].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
};

const expectedVariantUrl = (stem, width) => `/images/artworks/archive/${stem}-${width}.webp`;

const generate = async (sources) => {
  await mkdir(outputDirectory, { recursive: true });
  const manifest = {
    version: 1,
    settings,
    sources: {},
  };

  for (const source of sources) {
    const sourceBuffer = await readFile(source.sourcePath);
    const sourceMetadata = await sharp(sourceBuffer).metadata();
    if (!sourceMetadata.width || !sourceMetadata.height) {
      throw new Error(`${source.sourceUrl}: unable to determine source dimensions`);
    }

    const sourceEntry = {
      height: sourceMetadata.height,
      sha256: hashBuffer(sourceBuffer),
      variants: {},
      width: sourceMetadata.width,
    };

    for (const width of settings.widths) {
      const variantUrl = expectedVariantUrl(source.stem, width);
      const variantPath = path.resolve(publicDirectory, variantUrl.replace(/^\/+/, ''));
      const info = await sharp(sourceBuffer)
        .rotate()
        .resize({
          kernel: sharp.kernel.lanczos3,
          width,
        })
        .webp({
          alphaQuality: settings.alphaQuality,
          effort: settings.effort,
          quality: settings.quality,
          smartSubsample: settings.smartSubsample,
        })
        .toFile(variantPath);
      const variantBuffer = await readFile(variantPath);

      sourceEntry.variants[String(width)] = {
        bytes: info.size,
        height: info.height,
        path: variantUrl,
        sha256: hashBuffer(variantBuffer),
        width: info.width,
      };
    }

    manifest.sources[source.sourceUrl] = sourceEntry;
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const totalBytes = Object.values(manifest.sources).reduce(
    (sourceTotal, source) =>
      sourceTotal +
      Object.values(source.variants).reduce(
        (variantTotal, variant) => variantTotal + variant.bytes,
        0,
      ),
    0,
  );
  console.log(
    `Generated ${sources.length * settings.widths.length} responsive artwork thumbnails (${Math.round(totalBytes / 1024)} KiB).`,
  );
};

const check = async (sources) => {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new Error(
      'Artwork thumbnail manifest is missing or invalid. Run npm run generate:artwork-thumbnails.',
    );
  }

  if (JSON.stringify(manifest.settings) !== JSON.stringify(settings)) {
    throw new Error('Artwork thumbnail settings changed. Run npm run generate:artwork-thumbnails.');
  }

  const expectedSourceUrls = sources.map((source) => source.sourceUrl);
  const manifestSourceUrls = Object.keys(manifest.sources).sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(manifestSourceUrls) !== JSON.stringify(expectedSourceUrls)) {
    throw new Error('Public artwork sources changed. Run npm run generate:artwork-thumbnails.');
  }

  for (const source of sources) {
    const sourceBuffer = await readFile(source.sourcePath);
    const sourceEntry = manifest.sources[source.sourceUrl];
    if (sourceEntry.sha256 !== hashBuffer(sourceBuffer)) {
      throw new Error(`${source.sourceUrl}: source changed. Run npm run generate:artwork-thumbnails.`);
    }

    for (const width of settings.widths) {
      const variant = sourceEntry.variants[String(width)];
      const expectedUrl = expectedVariantUrl(source.stem, width);
      if (!variant || variant.path !== expectedUrl) {
        throw new Error(`${source.sourceUrl}: ${width}px derivative is missing from the manifest.`);
      }

      const variantPath = path.resolve(publicDirectory, variant.path.replace(/^\/+/, ''));
      let variantBuffer;
      try {
        await stat(variantPath);
        variantBuffer = await readFile(variantPath);
      } catch {
        throw new Error(`${variant.path}: derivative is missing. Run npm run generate:artwork-thumbnails.`);
      }

      const metadata = await sharp(variantBuffer).metadata();
      if (
        metadata.format !== settings.format ||
        metadata.width !== width ||
        variant.width !== width ||
        metadata.width !== variant.width ||
        metadata.height !== variant.height ||
        variant.sha256 !== hashBuffer(variantBuffer)
      ) {
        throw new Error(`${variant.path}: derivative does not match the manifest. Regenerate it.`);
      }
    }
  }

  console.log(`Verified ${sources.length * settings.widths.length} responsive artwork thumbnails.`);
};

const sources = await readPublicArtworkSources();
if (sources.length === 0) throw new Error('No public artwork image sources were found.');

if (checkOnly) {
  await check(sources);
} else {
  await generate(sources);
}
