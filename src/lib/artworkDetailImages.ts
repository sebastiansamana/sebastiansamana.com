import manifest from '../data/artwork-detail-images.generated.json';

type DetailVariant = {
  bytes: number;
  height: number;
  path: string;
  sha256: string;
  width: number;
};

type DetailSource = {
  height: number;
  placeholder: string;
  sha256: string;
  variants: Record<'avif' | 'webp', Record<string, DetailVariant>>;
  width: number;
};

const detailSources = manifest.sources as Record<string, DetailSource>;
const fallbackWidth = String(manifest.settings.fallbackWidth);

export const artworkDetailImageSizes =
  '(max-width: 760px) calc(100vw - 2rem), (max-width: 1312px) calc(100vw - 24rem), 55rem';

const makeSrcset = (variants: Record<string, DetailVariant>) =>
  Object.values(variants)
    .sort((a, b) => a.width - b.width)
    .map((variant) => `${variant.path} ${variant.width}w`)
    .join(', ');

export const getArtworkDetailImageSet = (source: string) => {
  const entry = detailSources[source];

  if (!entry) {
    return {
      avifSrcset: undefined,
      placeholder: undefined,
      sizes: undefined,
      src: source,
      webpSrcset: undefined,
    };
  }

  return {
    avifSrcset: makeSrcset(entry.variants.avif),
    placeholder: entry.placeholder,
    sizes: artworkDetailImageSizes,
    src: entry.variants.webp[fallbackWidth]?.path ?? source,
    webpSrcset: makeSrcset(entry.variants.webp),
  };
};
