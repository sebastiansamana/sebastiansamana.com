import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blankableString = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }

    return value;
  },
  z.string().optional(),
);

const blankableInteger = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed.length) return undefined;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }

    return value;
  },
  z.number().int().optional(),
);

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    excerpt: z.string(),
    year: z.string(),
    location: z.string(),
    category: z.string(),
    coverImage: z.string().url(),
    gallery: z.array(z.string().url()),
    featured: z.boolean().default(false),
    order: z.number().int().nonnegative(),
  }),
});

const artworks = defineCollection({
  loader: glob({ base: './src/data/artworks', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().min(1),
    status: z.enum(['draft', 'public']).default('draft'),
    date: blankableString,
    sortYear: blankableInteger,
    sortMonth: blankableInteger,
    sortDay: blankableInteger,
    orderInYear: blankableInteger,
    medium: blankableString,
    dimensions: blankableString,
    location: blankableString,
    description: blankableString,
    image: blankableString,
    hoverImage: blankableString,
    imageWidth: blankableInteger,
    imageHeight: blankableInteger,
    imageAlt: blankableString,
  }),
});

const authorItems = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().min(1),
    spanishTitle: z.string().min(1),
    status: z.enum(['draft', 'public']).default('draft'),
    year: blankableString,
    date: blankableString,
    sortYear: blankableInteger,
    sortMonth: blankableInteger,
    sortDay: blankableInteger,
    orderInDay: blankableInteger,
    textType: blankableString,
    spanishTextType: blankableString,
    wordCount: blankableString,
    spanishWordCount: blankableString,
    spanishBody: blankableString,
  }),
});

export const collections = { artworks, authorItems, projects };
