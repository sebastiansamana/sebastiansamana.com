import type { CollectionEntry } from 'astro:content';

export type Artwork = CollectionEntry<'artworks'>;

const missingSortValue = Number.MIN_SAFE_INTEGER;

export const isPublicArtwork = (artwork: Artwork) => artwork.data.status === 'public';

export const sortArtworks = (artworks: Artwork[]) =>
  [...artworks].sort((a, b) => {
    const sortKeys = [
      (b.data.sortYear ?? missingSortValue) - (a.data.sortYear ?? missingSortValue),
      (b.data.sortMonth ?? missingSortValue) - (a.data.sortMonth ?? missingSortValue),
      (b.data.sortDay ?? missingSortValue) - (a.data.sortDay ?? missingSortValue),
      (b.data.orderInYear ?? 0) - (a.data.orderInYear ?? 0),
    ];
    const numericResult = sortKeys.find((result) => result !== 0);

    if (numericResult) return numericResult;

    return a.data.title.localeCompare(b.data.title, undefined, { sensitivity: 'base' });
  });

export const getPublicArtworks = (artworks: Artwork[]) => sortArtworks(artworks.filter(isPublicArtwork));

const hasValue = (value: string | number | undefined) =>
  value !== undefined && String(value).trim().length > 0;

export const getArtworkDateLabel = (artwork: Artwork) => {
  if (hasValue(artwork.data.date)) return artwork.data.date;

  const { sortDay, sortMonth, sortYear } = artwork.data;
  if (!sortYear) return undefined;

  return [sortDay, sortMonth, sortYear].filter((part) => part !== undefined).join('.');
};

export const getArtworkMetadata = (artwork: Artwork) =>
  [
    { label: 'Date', value: getArtworkDateLabel(artwork) },
    { label: 'Medium', value: artwork.data.medium },
    { label: 'Dimensions', value: artwork.data.dimensions },
  ].filter((item): item is { label: string; value: string } => hasValue(item.value));
