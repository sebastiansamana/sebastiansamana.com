import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const recordsDirectory = path.join(root, 'src', 'data', 'artworks');
const publicDirectory = path.join(root, 'public');
const artworkDirectory = path.join(publicDirectory, 'images', 'artworks');
const outputDirectory = path.join(artworkDirectory, 'detail');
const manifestPath = path.join(root, 'src', 'data', 'artwork-detail-images.generated.json');
const checkOnly = process.argv.includes('--check');

const settings = {
  fallbackWidth: 1280,
  formats: {
    avif: {
      chromaSubsampling: '4:4:4',
      effort: 6,
      quality: 80,
    },
    webp: {
      alphaQuality: 100,
      effort: 6,
      quality: 90,
      smartSubsample: true,
    },
  },
  placeholder: {
    blurSigma: 0.8,
    effort: 6,
    quality: 42,
    width: 32,
  },
  widths: [480, 768, 1024, 1280, 1600, 1920, 2560],
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

    const sourceUrl = parseScalar(frontmatter, 'image');
    if (!sourceUrl) throw new Error(`${recordName}: public artwork is missing its image`);
    if (!sourceUrl.startsWith('/images/artworks/') || sourceUrl.includes('/archive/') || sourceUrl.includes('/detail/')) {
      throw new Error(`${recordName}: image must point to an original under /images/artworks/`);
    }

    const sourcePath = path.resolve(publicDirectory, sourceUrl.replace(/^\/+/, ''));
    const relativeToArtworkDirectory = path.relative(artworkDirectory, sourcePath);
    if (relativeToArtworkDirectory.startsWith('..') || path.isAbsolute(relativeToArtworkDirectory)) {
      throw new Error(`${recordName}: image escapes the artwork asset directory`);
    }

    const stem = path.basename(sourcePath, path.extname(sourcePath));
    const existingSource = sources.get(stem);
    if (existingSource && existingSource.sourceUrl !== sourceUrl) {
      throw new Error(`Detail derivative filename collision: ${existingSource.sourceUrl} and ${sourceUrl}`);
    }

    sources.set(stem, { sourcePath, sourceUrl, stem });
  }

  return [...sources.values()].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
};

const expectedVariantUrl = (stem, width, format) =>
  `/images/artworks/detail/${stem}-${width}.${format}`;

const getUnexpectedDerivativeNames = async (sources) => {
  const expectedNames = new Set(
    sources.flatMap((source) =>
      Object.keys(settings.formats).flatMap((format) =>
        settings.widths.map((width) => path.basename(expectedVariantUrl(source.stem, width, format))),
      ),
    ),
  );
  const existingNames = await readdir(outputDirectory).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });

  return existingNames.filter(
    (name) => /-\d+\.(?:avif|webp)$/.test(name) && !expectedNames.has(name),
  );
};

const makeVariant = (sourceBuffer, width, format) => {
  const pipeline = sharp(sourceBuffer)
    .rotate()
    .resize({
      kernel: sharp.kernel.lanczos3,
      width,
      withoutEnlargement: true,
    });

  return format === 'avif'
    ? pipeline.avif(settings.formats.avif)
    : pipeline.webp(settings.formats.webp);
};

const generate = async (sources) => {
  await mkdir(outputDirectory, { recursive: true });
  const unexpectedDerivativeNames = await getUnexpectedDerivativeNames(sources);
  await Promise.all(
    unexpectedDerivativeNames.map((name) => unlink(path.join(outputDirectory, name))),
  );
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

    const placeholderBuffer = await sharp(sourceBuffer)
      .rotate()
      .resize({ width: settings.placeholder.width })
      .blur(settings.placeholder.blurSigma)
      .webp({
        effort: settings.placeholder.effort,
        quality: settings.placeholder.quality,
        smartSubsample: true,
      })
      .toBuffer();
    const sourceEntry = {
      height: sourceMetadata.height,
      placeholder: `data:image/webp;base64,${placeholderBuffer.toString('base64')}`,
      sha256: hashBuffer(sourceBuffer),
      variants: {},
      width: sourceMetadata.width,
    };

    for (const format of Object.keys(settings.formats)) {
      sourceEntry.variants[format] = {};

      for (const width of settings.widths) {
        const variantUrl = expectedVariantUrl(source.stem, width, format);
        const variantPath = path.resolve(publicDirectory, variantUrl.replace(/^\/+/, ''));
        const info = await makeVariant(sourceBuffer, width, format).toFile(variantPath);
        const variantBuffer = await readFile(variantPath);

        sourceEntry.variants[format][String(width)] = {
          bytes: info.size,
          height: info.height,
          path: variantUrl,
          sha256: hashBuffer(variantBuffer),
          width: info.width,
        };
      }
    }

    manifest.sources[source.sourceUrl] = sourceEntry;
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const totalBytes = Object.values(manifest.sources).reduce(
    (sourceTotal, source) =>
      sourceTotal +
      Object.values(source.variants).reduce(
        (formatTotal, variants) =>
          formatTotal +
          Object.values(variants).reduce(
            (variantTotal, variant) => variantTotal + variant.bytes,
            0,
          ),
        0,
      ),
    0,
  );
  console.log(
    `Generated ${sources.length * settings.widths.length * Object.keys(settings.formats).length} responsive artwork detail images (${Math.round(totalBytes / 1024)} KiB).`,
  );
};

const check = async (sources) => {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new Error(
      'Artwork detail image manifest is missing or invalid. Run npm run generate:artwork-details.',
    );
  }

  if (JSON.stringify(manifest.settings) !== JSON.stringify(settings)) {
    throw new Error('Artwork detail image settings changed. Run npm run generate:artwork-details.');
  }

  const unexpectedDerivativeNames = await getUnexpectedDerivativeNames(sources);
  if (unexpectedDerivativeNames.length > 0) {
    throw new Error(
      `Unexpected artwork detail derivatives remain: ${unexpectedDerivativeNames.join(', ')}. Run npm run generate:artwork-details.`,
    );
  }

  const expectedSourceUrls = sources.map((source) => source.sourceUrl);
  const manifestSourceUrls = Object.keys(manifest.sources).sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(manifestSourceUrls) !== JSON.stringify(expectedSourceUrls)) {
    throw new Error('Public artwork detail sources changed. Run npm run generate:artwork-details.');
  }

  for (const source of sources) {
    const sourceBuffer = await readFile(source.sourcePath);
    const sourceEntry = manifest.sources[source.sourceUrl];
    if (sourceEntry.sha256 !== hashBuffer(sourceBuffer)) {
      throw new Error(`${source.sourceUrl}: source changed. Run npm run generate:artwork-details.`);
    }
    const placeholderPrefix = 'data:image/webp;base64,';
    if (!sourceEntry.placeholder?.startsWith(placeholderPrefix)) {
      throw new Error(`${source.sourceUrl}: inline placeholder is missing from the manifest.`);
    }
    const placeholderBuffer = Buffer.from(sourceEntry.placeholder.slice(placeholderPrefix.length), 'base64');
    const placeholderMetadata = await sharp(placeholderBuffer).metadata();
    if (
      placeholderMetadata.format !== 'webp' ||
      placeholderMetadata.width !== settings.placeholder.width ||
      placeholderBuffer.byteLength > 2048
    ) {
      throw new Error(`${source.sourceUrl}: inline placeholder is invalid or unexpectedly large.`);
    }

    for (const format of Object.keys(settings.formats)) {
      for (const width of settings.widths) {
        const variant = sourceEntry.variants?.[format]?.[String(width)];
        const expectedUrl = expectedVariantUrl(source.stem, width, format);
        if (!variant || variant.path !== expectedUrl) {
          throw new Error(`${source.sourceUrl}: ${width}px ${format} derivative is missing from the manifest.`);
        }

        const variantPath = path.resolve(publicDirectory, variant.path.replace(/^\/+/, ''));
        let variantBuffer;
        try {
          await stat(variantPath);
          variantBuffer = await readFile(variantPath);
        } catch {
          throw new Error(`${variant.path}: derivative is missing. Run npm run generate:artwork-details.`);
        }

        const metadata = await sharp(variantBuffer).metadata();
        const expectedMetadataFormat = format === 'avif' ? 'heif' : format;
        if (
          metadata.format !== expectedMetadataFormat ||
          metadata.width !== width ||
          variant.width !== width ||
          metadata.height !== variant.height ||
          variant.sha256 !== hashBuffer(variantBuffer)
        ) {
          throw new Error(`${variant.path}: derivative does not match the manifest. Regenerate it.`);
        }
      }
    }
  }

  console.log(
    `Verified ${sources.length * settings.widths.length * Object.keys(settings.formats).length} responsive artwork detail images.`,
  );
};

const sources = await readPublicArtworkSources();
if (sources.length === 0) throw new Error('No public artwork detail image sources were found.');

if (checkOnly) {
  await check(sources);
} else {
  await generate(sources);
}
