# Studio Meridian - Astro Architecture Portfolio

A minimal, editorial architecture portfolio built with Astro for static deployment.

## Run locally

Use Node.js 24 (the deployment version). The package requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:4321`.

## Build static site

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

This repo includes a workflow at `.github/workflows/deploy.yml`.

1. Push to `main`.
2. In GitHub: `Settings -> Pages -> Source`, select **GitHub Actions**.
3. Set your production `site` URL in `astro.config.mjs` by replacing `https://USERNAME.github.io`.
4. If your Pages URL is a project path (`/repo-name`), the workflow automatically passes the correct base path.

## Project structure

- `src/layouts/BaseLayout.astro`: global shell, fullscreen nav, transitions.
- `src/styles/global.css`: visual system, typography, motion, spacing.
- `src/pages/`: Home, Projects, Project Detail, About, Contact, CV.
- `src/content/projects/*.md`: easy-to-edit project content.
- `src/content.config.ts`: project content schema.

## First files to edit

1. `src/content/projects/*.md` - add your own projects, text, years, locations, and image URLs.
2. `src/layouts/BaseLayout.astro` - replace studio name and footer details.
3. `src/pages/about.astro`, `src/pages/contact.astro`, `src/pages/cv.astro` - update biography/contact/CV timeline.
4. `astro.config.mjs` - set your real GitHub Pages site URL.
