const artworkArchiveWidths = [320, 336, 384, 480, 640, 960] as const;

export const artworkArchiveImageSizes =
  '(max-width: 560px) 45vw, (max-width: 720px) 29vw, (max-width: 1312px) 23vw, 288px';

export const getArtworkArchiveImageSet = (source: string) => {
  const filename = source.split('/').at(-1) ?? '';
  const extensionIndex = filename.lastIndexOf('.');
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;

  if (!source.startsWith('/images/artworks/') || !stem) {
    return { sizes: undefined, src: source, srcset: undefined };
  }

  const getVariant = (width: number) => `/images/artworks/archive/${stem}-${width}.webp`;

  return {
    sizes: artworkArchiveImageSizes,
    src: getVariant(640),
    srcset: artworkArchiveWidths.map((width) => `${getVariant(width)} ${width}w`).join(', '),
  };
};
