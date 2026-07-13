// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://varelism.com',
  base: process.env.BASE_PATH || '/',
  build: {
    inlineStylesheets: 'always',
  },
  integrations: [react()],
  output: 'static',
  redirects: {
    '/author/': '/writer/',
    '/author/books/': '/writer/books/',
    '/author/everything/': '/writer/everything/',
    '/author/everything/[slug]': '/writer/everything/[slug]',
    '/esp/autor/': '/esp/escritor/',
    '/esp/autor/libros/': '/esp/escritor/libros/',
    '/esp/autor/todo/': '/esp/escritor/todo/',
    '/esp/autor/todo/[slug]': '/esp/escritor/todo/[slug]',
    '/artist/': '/painter/',
    '/artist/exhibitions/': '/painter/exhibitions/',
    '/artist/everything/': '/painter/everything/',
    '/artist/everything/[slug]': '/painter/everything/[slug]',
    '/esp/artista/': '/esp/pintor/',
    '/esp/artista/exposiciones/': '/esp/pintor/exposiciones/',
    '/esp/artista/todo/': '/esp/pintor/todo/',
    '/esp/artista/todo/[slug]': '/esp/pintor/todo/[slug]',
    '/architect/portfolios/of-consumption-and-participation-in-the-movable-module/': '/architect/portfolios/studio-2-2/',
  },
});
