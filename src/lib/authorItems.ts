import type { CollectionEntry } from 'astro:content';

export type AuthorItem = CollectionEntry<'authorItems'>;

const missingSortValue = Number.MIN_SAFE_INTEGER;

const hasValue = (value: string | number | undefined) =>
  value !== undefined && String(value).trim().length > 0;

export const isPublicAuthorItem = (item: AuthorItem) => item.data.status === 'public';

export const sortAuthorItems = (items: AuthorItem[]) =>
  [...items].sort((a, b) => {
    const sortKeys = [
      (b.data.sortYear ?? missingSortValue) - (a.data.sortYear ?? missingSortValue),
      (b.data.sortMonth ?? missingSortValue) - (a.data.sortMonth ?? missingSortValue),
      (b.data.sortDay ?? missingSortValue) - (a.data.sortDay ?? missingSortValue),
      (b.data.orderInDay ?? 0) - (a.data.orderInDay ?? 0),
    ];
    const numericResult = sortKeys.find((result) => result !== 0);

    if (numericResult) return numericResult;

    return a.data.title.localeCompare(b.data.title, undefined, { sensitivity: 'base' });
  });

export const getPublicAuthorItems = (items: AuthorItem[]) =>
  sortAuthorItems(items.filter(isPublicAuthorItem));

export const getAuthorItemTitle = (item: AuthorItem, locale: 'en' | 'es' = 'en') =>
  locale === 'es' ? item.data.spanishTitle : item.data.title;

export const getAuthorItemMetadata = (item: AuthorItem, locale: 'en' | 'es' = 'en') => {
  const textType = locale === 'es' ? item.data.spanishTextType : item.data.textType;
  const wordCount = locale === 'es' ? item.data.spanishWordCount : item.data.wordCount;

  return [item.data.year, textType, wordCount].filter(hasValue).map((value) => String(value));
};

export const getAuthorItemDetailMetadata = (
  item: AuthorItem,
  locale: 'en' | 'es' = 'en',
) => {
  const textType = locale === 'es' ? item.data.spanishTextType : item.data.textType;
  const wordCount = locale === 'es' ? item.data.spanishWordCount : item.data.wordCount;
  const labels =
    locale === 'es'
      ? { date: 'Fecha', category: 'Categoría', words: 'Palabras' }
      : { date: 'Date', category: 'Category', words: 'Words' };

  return [
    { label: labels.date, value: item.data.date ?? item.data.year },
    { label: labels.category, value: textType },
    { label: labels.words, value: wordCount },
  ].filter((item): item is { label: string; value: string } => hasValue(item.value));
};
