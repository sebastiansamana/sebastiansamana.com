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
