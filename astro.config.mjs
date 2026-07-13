// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

const sitemapRedirectPrefixes = ['/author', '/esp/autor', '/artist', '/esp/artista'];
const sitemapExcludedPaths = new Set([
  '/404.html',
  '/esp/404',
  '/booklist',
  '/books',
  '/memories',
  '/math-visualisation-lab',
  '/architect/portfolios/of-consumption-and-participation-in-the-movable-module',
]);
const sitemapExcludedPatterns = [
  /^\/(?:architect\/portfolios|esp\/arquitecto\/portafolios)\/[^/]+\/pdf$/,
  /^\/(?:architect\/projects|esp\/arquitecto\/proyectos)\/[^/]+$/,
];

const normalizeSitemapPath = (pathname) => {
  if (pathname === '/') return '/';

  return pathname.replace(/\/+$/, '');
};

// https://astro.build/config
export default defineConfig({
  site: 'https://sebastiansamana.com',
  base: process.env.BASE_PATH || '/',
  build: {
    inlineStylesheets: 'always',
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => {
        const pathname = normalizeSitemapPath(new URL(page).pathname);

        return (
          !sitemapExcludedPaths.has(pathname) &&
          !sitemapExcludedPatterns.some((pattern) => pattern.test(pathname)) &&
          !sitemapRedirectPrefixes.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
          )
        );
      },
    }),
  ],
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
