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
    '/architect/portfolios/of-consumption-and-participation-in-the-movable-module/': '/architect/portfolios/studio-2-2/',
  },
});
