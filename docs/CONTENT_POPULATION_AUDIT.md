# Content Population Audit and Runbook

- Audited: 11 July 2026
- Repository state audited: `fceb101` on `main`
- Route naming updated: 13 July 2026 (`Writer` / `Escritor` and `Painter` / `Pintor`; internal `authorItems` and `artist` identifiers retained).
- Painter archive responsive-asset pipeline updated: 29 August 2026.
- Purpose: authoritative hand-off for future Writer, Architect portfolio, and Painter population work.

This document records the current implementation. It is not a redesign brief. Routine population must preserve the routes, data architecture, visual identity, layouts, breakpoints, navigation, transitions, animations, PDF quality, and existing content.

If the implementation later changes, update this document in the same change. Until then, a future Codex session should read this file before asking population questions or editing files.

## 1. Non-negotiable operating rules

1. Add content through the existing data source for that section. Never hardcode a new item into an archive, route, or component.
2. Do not invent unknown metadata, translations, dates, media, physical dimensions, locations, descriptions, alt text requiring artistic interpretation, or publication approval.
3. Do not alter existing content, spelling, slugs, order values, assets, or publication states while adding a new item.
4. Do not edit layouts, typography, spacing, breakpoints, animation code, route-transition code, navigation, headers, footers, route names, or URL structure during population.
5. Do not add unsupported fields and then assume they render. The exact supported fields are listed below.
6. Treat `draft` as archive/route exclusion, not as security. The repository and any asset placed under `public/` may still expose the material.
7. Never describe content as private or password-protected: neither feature exists.
8. Preserve original PDFs byte-for-byte wherever possible. Do not rasterize, recompress, downsample, optimize, or replace them merely to populate the website.
9. Do not push, merge, or deploy unless explicitly instructed. A push to `main` starts the GitHub Pages deployment workflow.
10. Population is complete only after both language routes, sorting, assets, responsive behavior, build output, and the applicable test matrix have been checked.

### Normal edit boundary

| Population target | Files normally allowed to change | Files not to change during routine population |
|---|---|---|
| Writer | One new or updated `src/content/authorItems/<slug>.md` record | Archive/detail routes, `AuthorIndexArchive.astro`, `AuthorItemDetail.astro`, schemas, layout, styles |
| Architect portfolio | `src/data/portfolios.ts` plus supplied files under `public/pdfs/` and `public/images/portfolios/` | Portfolio archive/detail/PDF components, routes, layout, PDF.js support files, styles |
| Painter | One record in `src/data/artworks/<slug>.md` plus supplied files under `public/images/artworks/` | `ArtworkArchive.astro`, detail routes, language dictionaries, schemas, layout, styles |

An exception to this boundary is a separately authorized implementation change, such as adding true Spanish-specific portfolio fields when the Spanish PDF is ready. That is not routine population and must be tested as a system change.

## 2. Route scope and protected environments

### Holder pages: preserve exactly

| English holder | Spanish counterpart | English file | Spanish file |
|---|---|---|---|
| `/buy/` | `/esp/comprar/` | `src/pages/buy.astro` | `src/pages/esp/comprar.astro` |
| `/writer/books/` | `/esp/escritor/libros/` | `src/pages/writer/books.astro` | `src/pages/esp/escritor/libros.astro` |
| `/architect/projects/` | `/esp/arquitecto/proyectos/` | `src/pages/architect/projects/index.astro` | `src/pages/esp/arquitecto/proyectos/index.astro` |
| `/painter/exhibitions/` | `/esp/pintor/exposiciones/` | `src/pages/painter/exhibitions.astro` | `src/pages/esp/pintor/exposiciones.astro` |

All four pairs render `WorkInProgressPage.astro` and opt into `BaseLayout.astro`'s
server-rendered main reveal so their complete canvas and content start hidden over white
before using the universal page fade. Do not populate or restyle them.

The project holder has three old example project detail routes in each language because `src/content/projects/` is still built by dynamic routes. They are not the active portfolio system, are not linked from the holder index, and must not be edited as part of `/architect/portfolios/` population.

### Complete/protected pages and systems

| Environment | English | Spanish | Primary implementation |
|---|---|---|---|
| Homepage | `/` | `/esp/` | `src/pages/index.astro`, `src/pages/esp/index.astro` |
| About | `/about/` | `/esp/sobre/` | corresponding page files plus `AboutComposition.astro` |
| Custom 404 | `/404.html` | `/esp/404/` | corresponding page files plus `NotFoundPage.astro` |
| Contact | `/contact/` | `/esp/contacto/` | corresponding page files plus `ContactPage.astro` |
| Writer landing | `/writer/` | `/esp/escritor/` | completed animated landing pages |
| Architect landing | `/architect/` | `/esp/arquitecto/` | completed 3D landing pages |
| Painter landing | `/painter/` | `/esp/pintor/` | completed animated landing pages |
| Header, footer, language switch, transitions | all pages using the shared shell | all Spanish routes | `src/layouts/BaseLayout.astro` and `src/styles/global.css` |

The Contact pair also opts into the server-rendered main reveal. `ContactPage.astro` must not
add a second opacity reveal; its viewport positioning and email interaction behavior remain
component-specific.

Do not use the legacy root routes `/books/`, `/booklist/`, or `/memories/` as population sources. They are unrelated to the three active archives. The repository `README.md` also predates the active archive architecture; this runbook and the implementation are authoritative.

### Active population routes

| System | English archive | Spanish archive | Detail pair |
|---|---|---|---|
| Writer | `/writer/everything/` | `/esp/escritor/todo/` | same filename-derived slug in both |
| Architect | `/architect/portfolios/` | `/esp/arquitecto/portafolios/` | same explicit portfolio `id` in both |
| Painter | `/painter/everything/` | `/esp/pintor/todo/` | same filename-derived collection ID in both |

## 3. Shared architecture and behavior

### Build and content lifecycle

The site is Astro 5.18 static output (`astro.config.mjs:6-13`). A fresh `npm run build` validates content, builds client bundles, generates every public static route, and copies `public/` into `dist/`. `dist/` and `.astro/` are ignored and must not be committed.

| System | Source | Visibility step | Ordering step | Outputs |
|---|---|---|---|---|
| Writer | one bilingual Markdown file | exact `status === 'public'` | shared date-priority sorter | EN archive/detail and ES archive/detail |
| Painter | one shared Markdown record plus images | exact `status === 'public'` | shared date-priority sorter | EN grid/index/detail and ES grid/index/detail |
| Portfolio | one object in a TypeScript array plus PDF/images | none; every array item is public | literal array order | EN grid/index/detail/PDF and ES grid/index/detail/PDF |

Writer and Painter use Astro content collections defined in `src/content.config.ts`. Portfolio does not: it uses `src/data/portfolios.ts` directly.

### Language pairing

`BaseLayout.astro:19-87` maps the static English/Spanish routes. Detail switches at `:43-80` preserve the suffix slug for projects, portfolios, Writer items, and Painter items. The mapping is duplicated at `:743-868` so the persistent header is corrected after Astro page transitions. Both copies are intentional; routine population must not edit either.

There is no translation-pair identifier:

- Writer: one record contains the English and Spanish versions.
- Painter: one record is reused by both languages.
- Portfolio: one object is reused by both languages.

A public Writer or Painter item therefore always generates both language routes together. A portfolio object also always generates both routes.

### Visibility and security boundary

| State/request | Writer | Painter | Portfolio |
|---|---|---|---|
| `public` | Both language archives and details build | Both language archives and details build | Not a field; all registry items build |
| `draft` | Both language archives/details excluded | Both language archives/details excluded | Not supported |
| omitted status | Defaults to `draft` | Defaults to `draft` | Not applicable |
| `private` / `unpublished` / password | Invalid or unsupported | Invalid or unsupported | Unsupported |
| public in only one language | Unsupported | Unsupported | Unsupported by current shared object |

Important: `public/` is copied independently of record status. A draft artwork whose image is under `public/images/artworks/` has no archive/detail route, but its raw image URL is still deployable. A PDF under `public/pdfs/` is likewise public even before it is referenced by the portfolio registry. Truly confidential assets must remain outside `public/`, `dist/`, and any public repository.

### Metadata, SEO, and structured data

`BaseLayout.astro` accepts `title`, `description`, and a global `indexable` control. Indexable routes emit:

- `<html lang="en|es">`
- a standard meta description
- a self-referencing canonical URL
- a matching Open Graph URL
- a document title

Canonical and Open Graph URLs are derived globally from `Astro.site`; there are no per-record SEO overrides. `@astrojs/sitemap` generates the canonical sitemap, and `public/robots.txt` advertises it. The site still has no `hreflang`, Twitter tags, or JSON-LD/structured data. Do not solicit or add unsupported per-record SEO/canonical fields during population.

### Assets and deployment

- Literal content asset URLs are rooted at `/images/...` and `/pdfs/...`.
- PDF.js WebAssembly support is served from `public/pdfjs/wasm/` and must remain in place.
- This custom GitHub Actions Pages workflow does not require a repository `CNAME` file; the custom domain is controlled in GitHub Pages Settings during cutover.
- GitHub Actions uses Node 20, `npm ci`, and `npm run build` with `BASE_PATH` (`.github/workflows/deploy.yml:18-45`).
- A push to `main` triggers deployment. Local population work must stop before push unless the user expressly authorizes it.
- The production PDF copy is byte-identical to the file placed in `public/pdfs/`; the audited PDF had matching source/build SHA-256 values.

### Existing automated coverage

There are two committed browser regressions:

- `npm run test:home-mobile` rebuilds, starts a preview, uses Chrome/Edge at 390 x
  844 with DPR 3, throttles CPU/network, and confirms cold taps on all three
  homepage columns navigate correctly. It also verifies that the homepage
  preloader is the sole allowed shell-hiding state and that the header/footer
  are fully visible before and after interaction, with a matching cold preloader
  check on `/esp/`.
- `npm run test:holder-reveal` rebuilds, serves the generated output locally, and checks all
  eight holder routes plus both Contact routes (ten total) at desktop and phone sizes. It
  verifies a hidden first main frame over white, the universal 450ms ease opacity
  reveal activity, the visible interactive final state, and the absence of a
  duplicate Contact opacity reveal. It additionally discovers every generated
  non-home page with the shared shell and checks all sampled cold-load frames for
  effective header/footer visibility, checks both visualisation routes, and
  verifies client-side language/category navigation keeps the persistent shell
  painted above the white route overlay.

The homepage test is valuable as a global regression but does not validate the three archives.

There is no Writer archive-, Painter archive-, or portfolio-specific automated content test,
no standalone content validation script, and no configured `astro check` script. The manual
matrices below are therefore mandatory.

## 4. Writer population system

### Files and lifecycle

- Schema: `src/content.config.ts:70-87`
- Records: `src/content/authorItems/*.md`
- Filtering, sorting, metadata: `src/lib/authorItems.ts`
- Date localization: `src/lib/dateLabels.ts`
- Archive component: `src/components/AuthorIndexArchive.astro`
- Detail component: `src/components/AuthorItemDetail.astro`
- Archive routes: `src/pages/writer/everything.astro` and `src/pages/esp/escritor/todo.astro`
- Detail routes: the corresponding `[slug].astro` files

There is no writer generator. Create one UTF-8 Markdown record manually using the existing schema.

### Exact fields

Optional strings and integers use the blank preprocessors at `src/content.config.ts:4-30`: blanks become `undefined`. The schema does not enforce real calendar ranges; population must.

| Field/source | Required? | Language | Behavior |
|---|---|---|---|
| filename `<slug>.md` | operationally required | shared | creates `item.slug` and both detail URLs; no frontmatter slug |
| Astro entry ID | derived | shared | internal source-derived value; application does not use a frontmatter ID |
| `title` | schema-required | English | EN archive/detail title and final tie-break sort |
| `spanishTitle` | schema-required | Spanish | ES archive/detail title; no English fallback |
| `status` | optional, default `draft` | shared | `draft` or `public` only; controls both languages |
| `year` | optional display string | shared | first archive metadata value; final detail date fallback; not a sort key |
| `date` | optional display string | shared | detail date fallback only; not an archive value or sort key |
| `sortYear` | optional integer | shared | first descending sort key; localized detail month/year input |
| `sortMonth` | optional integer | shared | second descending sort key; must be 1-12 when supplied |
| `sortDay` | optional integer | shared | third descending sort key; validate against the date |
| `orderInDay` | optional integer; missing means 0 | shared | fourth descending tie-breaker; larger appears first |
| `textType` | optional | English | EN category/type |
| `spanishTextType` | optional | Spanish | ES category/type |
| `wordCount` | optional display string | English | manual, e.g. `436 words`; never runtime-derived |
| `spanishWordCount` | optional display string | Spanish | manual, e.g. `467 palabras` |
| Markdown after frontmatter | technically optional | English | rendered with Astro Markdown |
| `spanishBody` | technically optional string | Spanish | split on two or more newlines; each piece becomes a plain `<p>` |

Operationally, a meaningful public item requires a unique slug, both exact titles, and both final bodies. If the Spanish body is not ready, keep the shared record draft: a public record with blank `spanishBody` still generates an empty Spanish detail page.

Fields that do not exist: internal frontmatter ID, pair ID, original language, per-language status, publication-date type, private/unpublished state, image/thumbnail, SEO title, SEO description, canonical URL, external-reference metadata, enquiry URL, and a back-to-top option.

### English and Spanish formatting

- The English body is Markdown-rendered (`AuthorItemDetail.astro:16,62-67`). Normal Markdown links can hold external references, but unusual headings, lists, images, code, or embeds require visual review because the component specifically styles paragraphs only.
- `spanishBody` is not Markdown. Use a YAML literal block (`|-`) with blank lines for multiple paragraphs. Markdown/HTML text will be escaped rather than rendered.
- Spanish inline links are unsupported. Do not change the component during routine population to add them.

### Sorting, metadata, numbering, and responsive layout

`sortAuthorItems` (`src/lib/authorItems.ts:13-26`) orders by:

1. `sortYear` descending
2. `sortMonth` descending
3. `sortDay` descending
4. `orderInDay` descending, missing as 0
5. English `title` ascending, case-insensitive

Missing date sort values use `Number.MIN_SAFE_INTEGER` and fall behind known values. Newest is first only when the sort tuple is correctly populated. Filename, source order, and filesystem order do not control the archive. English and Spanish share one order; even a total tie uses the English title.

Archive metadata is:

- English: `year / textType / wordCount`
- Spanish: `year / spanishTextType / spanishWordCount`

Blank values disappear without extra separators. The archive uses an `<ol>` but `list-style: none`, so no number is visible.

Detail date selection is localized `sortMonth + sortYear`, then raw `date`, then `year`. The day is not shown on detail. Detail metadata order is Date/Fecha, Category/Categoría, Words/Palabras.

Responsive behavior:

- Archive alignment follows a four-column content width, becomes the three-column equivalent at 1312px, stacks each row vertically at 720px, and uses the two-column equivalent/smaller text at 560px.
- Detail maximum width is 58rem; its typography/top padding changes at 760px and 560px.
- Live audit: at 1440px the record row rendered as two equal grid columns; at 390px it rendered as a vertical flex row.

### Detail-derived behavior

- Return/Volver links are fixed by the localized route.
- Enquiries are generated mailto links to `sebastian.samana@icloud.com` with localized greeting, subject, title, and visible metadata.
- Back-to-top is derived, not configured. It remains hidden when the content endpoint fits within the initial viewport and appears for a longer page; scrolling is smooth unless reduced motion is preferred.
- Archive/detail reveal behavior is provided by `data-varelism-route-reveal` and the global transition code. Do not modify it.

### Existing-item trace

`src/content/authorItems/i-see-gohsts.md` is the source of truth:

1. The `authorItems` collection validates it.
2. Exact `status: public` passes the public filter.
3. Its shared sort tuple puts it in the archive.
4. English archive renders `I See Gohsts` and `2026 / Notes / 436 words`.
5. Spanish archive renders `Veo Fantasmas` and `2026 / Notas / 467 palabras`.
6. Both dynamic routes generate with slug `i-see-gohsts`.
7. English detail renders Markdown; Spanish detail renders `spanishBody`.
8. The language switch preserves the slug.
9. Fresh build output contains all four archive/detail files. It displays `June 2026` and `junio 2026` because sort month/year precede raw `date`.

The existing spelling `Gohsts` is authoritative content. Do not silently correct it.

### First Writer intake message

> Please send the following in one package:
>
> 1. Publication state: should the shared bilingual item be `public` now or remain `draft`? There is no private state and both languages publish together.
> 2. Exact English title and exact Spanish title.
> 3. Final English body and final Spanish body, preserving paragraph breaks. Mark required English Markdown formatting and provide exact link labels/URLs. If the Spanish body is not ready, the whole item will remain draft.
> 4. Exact date in unambiguous `YYYY-MM-DD` form, if known. If only part is known, identify that precision and leave the rest blank. If another item shares the exact date, say which should appear first. State only if the archive display year should intentionally differ.
> 5. Exact English and Spanish type/category labels, or say to leave them blank.
> 6. Exact displayed word-count strings, or authorize Codex to count the final approved text and write `N words` / `N palabras`.
> 7. Preferred stable lowercase kebab-case slug, or authorization to derive it from the English title.

Do not ask for unsupported IDs, pair keys, original language, SEO fields, canonical, enquiry link, thumbnails, or images.

### Safe Writer procedure

1. Collect the consolidated intake above; do not infer missing facts.
2. Validate both final bodies as UTF-8; check supplied English Markdown links.
3. Inspect `src/content/authorItems/` and both prospective routes for collisions.
4. Create exactly one `src/content/authorItems/<slug>.md` record. Put English metadata/body in it.
5. Add Spanish title, type, word count, and `spanishBody` to that same record. Never create a parallel Spanish file.
6. Add no asset fields. Embedded English Markdown media is an explicit exception requiring approval and visual QA.
7. Validate real calendar values and compare the new tuple against all existing public records. Do not alter existing order fields.
8. Verify both archives have identical item order, localized title/metadata, and correct links.
9. Verify both details, Return/Volver, language switch, enquiry, formatting, and conditional back-to-top.
10. Check 1440, 1024, about 700, and 390px widths.
11. Run the common completion gate below.
12. Review fresh `dist/`: a public item needs both detail files; a draft needs neither and neither archive row.

## 5. Painter population system

### Files and lifecycle

- Schema: `src/content.config.ts:48-68`
- Records: `src/data/artworks/*.md`
- Assets: `public/images/artworks/`
- Generator: `scripts/new-artwork.mjs` via `npm run new-artwork`
- Archive-thumbnail generator: `scripts/generate-artwork-thumbnails.mjs` via `npm run generate:artwork-thumbnails`
- Filtering, sorting, metadata: `src/lib/artworks.ts`
- Archive component: `src/components/ArtworkArchive.astro`
- Archive routes: `src/pages/painter/everything.astro` and `src/pages/esp/pintor/todo.astro`
- Detail routes: the corresponding `[slug].astro` files

The repository rule is strict: create/update artwork Markdown records only; never hardcode an artwork into an archive or route; leave unknown metadata blank.

### Exact fields

| Field/source | Required? | Language | Behavior |
|---|---|---|---|
| filename `<slug>.md` / collection `id` | operationally required | shared | both detail route slugs; no frontmatter slug |
| `title` | only schema-required field | shared | both archive/detail titles, alt fallback, metadata fallback, enquiry |
| `status` | optional, default `draft` | shared | `draft` or `public` only; controls both languages |
| `date` | optional display string | shared | preferred archive date label; never a sort key |
| `sortYear` | optional integer | shared | first descending sort key |
| `sortMonth` | optional integer | shared | second sort key; localized detail month input |
| `sortDay` | optional integer | shared | third sort key |
| `orderInYear` | optional integer; missing means 0 | shared | fourth descending tie-breaker; shared by grid/index |
| `medium` | optional string | shared | index/detail medium |
| `dimensions` | optional string | shared | index/detail physical dimensions; never derive from pixels |
| `location` | optional string | shared | stored but currently not rendered, sorted, included in enquiry, or used for SEO |
| `description` | optional plain string | shared | detail caption paragraph and meta description; title is SEO fallback |
| `image` | optional path | shared | original detail image and source for generated responsive archive thumbnails |
| `hoverImage` | optional path | shared | original red source for generated responsive grid hover/focus/touch thumbnails |
| `imageWidth` / `imageHeight` | optional integers | derived from supplied main image | all three `image` fields must be truthy for image markup to render |
| `imageAlt` | optional string | shared | falls back to title |

Fields that do not exist: Spanish title/medium/description/alt, explicit slug, pair ID, full-date type, orientation, separate normal thumbnail, additional images/gallery, separate grid/index order, private status, SEO fields, canonical, structured data, references, and custom enquiry link.

### Generator and naming behavior

The generator:

- requires a title;
- derives a lowercase ASCII kebab slug by NFKD normalization, diacritic/apostrophe removal, and non-alphanumeric hyphenation;
- defaults to `draft`;
- asks for all schema fields except `hoverImage`;
- writes with exclusive-create mode and refuses to overwrite;
- does not copy or inspect assets;
- labels `description` as “Exhibition description,” although it is the artwork detail/SEO description;
- does not validate a user-supplied custom slug.

Validate any custom slug against `^[a-z0-9]+(?:-[a-z0-9]+)*$` and reject path separators or `..`. Existing assets generally use `<slug>.jpg` and optional `<slug>-red.webp`. Preserve the existing `retatro-abuelo.*` typo but do not copy it as a convention.

For every public artwork image and hover image, `npm run generate:artwork-thumbnails` creates uncropped WebP derivatives at 320, 336, 384, 480, 640, and 960 pixels wide under `public/images/artworks/archive/`. It also writes a manifest containing source and derivative hashes. The committed derivatives are archive-only; the supplied originals remain unchanged and continue to serve detail pages. `npm run build` runs the manifest check first and fails when a public source or required derivative is missing or stale.

The English and Spanish Painter archive routes and Architect landing routes select the matching Latin/Spanish subsets under `public/fonts/painter-archive/` and the responsive logo/basket images under `public/images/painter-archive/`. They preserve the same font outlines, weights, image states, dimensions, and interaction behavior; the full font family remains the glyph fallback. Other routes retain their existing shell assets.

The two Architect landing routes load `public/models/Processed_Rock_Model_web.glb`, a Meshopt-compressed web derivative of `Processed_Rock_Model_optimized.glb`. The source models remain unchanged. The derivative preserves the scene, node, and material structure with near-identical bounds; the routes keep the same camera fitting, controls, reveal timing, navigation, and continuous orbit while reducing transfer and rendering work. Routine content population must not regenerate the derivative or change either route's model reference.

### English/Spanish behavior

One record is reused by both languages. The title, description, dimensions, date string, image, and alt text are shared. Spanish detail translates labels/month names and only these exact, case-sensitive, comma-separated medium tokens:

| Stored token | Spanish display |
|---|---|
| `Charcoal` | `Carboncillo` |
| `HB Pencil` | `Lápiz HB` |
| `Pastels` | `Pasteles` |
| `Watercolor` | `Acuarela` |

Unknown tokens remain unchanged. Routine population must not edit the hardcoded Spanish dictionary. If different Spanish title/description or an unsupported translated medium is required, stop and request explicit direction because the current data model cannot store it.

### Sorting, dates, numbering, grid, and index

`sortArtworks` (`src/lib/artworks.ts:10-23`) orders:

1. `sortYear` descending
2. `sortMonth` descending
3. `sortDay` descending
4. `orderInYear` descending, missing as 0
5. shared `title` ascending, case-insensitive

Missing date parts follow populated values. Filename, filesystem order, and `date` do not control sorting. Both languages, grid, and index receive the same sorted array. The index is an `<ol>` whose markers are hidden; there is no visible numbering.

Archive date uses explicit `date` first, otherwise joins known sort parts as `day.month.year`. Detail date prefers localized `Month Year` from `sortMonth`/`sortYear`, then the archive label.

Archive starts in grid mode. The active-mode button is hidden, so the visible button offers the other mode. State is not persisted and resets to grid on load.

Grid implementation:

- Masonry.js with a fixed column sizer, gutter, `fitWidth: true`, and item selector `.artwork-card`.
- Default intended aligned width: four columns; column width `clamp(11rem, 23vw, 18rem)`.
- At 1312px: aligned width becomes three columns.
- At 720px and below: exactly three calculated columns.
- At 560px and below: exactly two calculated columns.
- There is no one-column breakpoint.
- Live audit confirmed 4 columns at 1440px, 3 at 1024px, and 2 at 390px.

There is no orientation branch. The stored pixel dimensions establish intrinsic aspect ratio; CSS uses full column width and automatic height. Portrait works create taller cards, landscape works shorter cards, and Masonry fills the shortest available column. Physical orientation may be derived from decoded pixels, but physical dimensions may not.

The grid uses generated responsive WebP derivatives selected through `srcset` and `sizes`; the detail continues to use the unchanged original. Up to the first five small base derivatives load eagerly because they compose the initial mobile viewport; the first and final candidates within that bounded group receive high priority. Their small hover derivatives also load eagerly at low priority so hover/focus/touch behavior remains immediate. Any later base and hover derivatives retain native lazy loading. `hoverImage` is layered over the base and uses the main image’s width/height attributes, so it must match the main image aspect ratio. Without it, title/meta hover still works but no red image appears.

Hover/focus behavior:

- fine pointer: hover reveals red image and recolors title/meta;
- keyboard: focus-visible does the same and adds an outline;
- coarse pointer: press/touch temporarily applies the same state.

Index metadata is available `date / medium / dimensions`. Blanks disappear. Rows stack vertically at 720px.

### Detail-derived behavior

- Image markup appears only when `image`, `imageWidth`, and `imageHeight` are all present/truthy.
- Desktop detail is image plus a 13-18rem metadata column; it becomes one column at 760px and reduces text again at 560px.
- `description` is one plain paragraph below the figure. No Markdown body or gallery exists.
- Enquiry mailto is derived for `sebastian.samana@icloud.com` and includes title plus visible date/medium/dimensions, not location/description.
- Detail SEO is `<title> | Samana` and description-or-title fallback.

### Existing-item trace

`src/data/artworks/yozo.md` demonstrates the lifecycle:

1. The glob loader validates it and derives ID `yozo`.
2. `status: public` passes the filter.
3. September 2025 sort fields place it first in the audited public set.
4. Grid uses responsive derivatives generated from `yozo.jpg` and `yozo-red.webp`, plus the title and archive label `2025`; detail uses the originals.
5. Index shows `2025 / Pastels / 420 mm x 297 mm`.
6. Both detail route generators use ID `yozo`.
7. English detail displays `September 2025`; Spanish displays `septiembre 2025` and `Pasteles`.
8. Language switching preserves `yozo`.
9. Fresh output contains both localized details. Its blank description and alt cause title fallbacks; stored location is absent from output.

Audited public order was Yozo, Wei's Rhino, The Dive, Cena en Figueretas. Six other records were draft. Do not normalize the existing `orderInYear` values or alter that relative order while adding new work.

### First Painter intake message

> Please send the following in one reply:
>
> 1. The original main image, plus the red hover image if one already exists. The red image is optional and will not be invented.
> 2. The exact artwork title. The current model uses it on both English and Spanish pages; say before population if that is not acceptable.
> 3. The creation date only to the precision actually known and, only if different, the exact short archive date label. Unknown parts stay blank.
> 4. The exact medium.
> 5. Physical dimensions, including units and dimension order.
> 6. Publication choice: `draft` or `public`. Without explicit public approval it remains draft.
> 7. Optional known location and description/caption. Blank is valid; location is stored but not displayed and description is shared between languages.
> 8. Only if another work has the same exact sort date: desired relative order.
> 9. Only to override safe defaults: a custom lowercase kebab slug or specific alt text.
>
> Codex will derive asset-safe names, decoded pixel width/height, and portrait/landscape orientation from the supplied image. It will not infer title, date, medium, physical dimensions, location, description, or publication status.

If a new medium has no current Spanish mapping, disclose that it will remain unchanged in Spanish and pause if that is unacceptable.

### Safe Painter procedure

1. Collect the consolidated intake and explicitly resolve publication status.
2. Decode the supplied main image; record its actual positive width/height and EXIF-normalized orientation. Preserve the source quality.
3. Decode optional red hover image and compare aspect ratio. Do not generate one without explicit instruction.
4. Check record, asset, case-sensitive filename, slug, and route collisions.
5. Run `npm run new-artwork` or create the same schema manually. Use one shared record only. Keep it draft until approval.
6. Copy supplied assets to `public/images/artworks/`. Add `hoverImage` manually because the record generator omits it.
7. For a public record, run `npm run generate:artwork-thumbnails` and commit its generated archive derivatives plus the updated manifest. Do not replace or recompress the supplied originals.
8. Leave every unknown optional field blank. Do not create unsupported translation/gallery/SEO fields.
9. Validate the sort tuple and verify it does not change existing relative order unexpectedly.
10. Check both grid and index, both detail routes, language switch, metadata omission, enquiry, and asset URLs. Confirm archives request responsive WebP derivatives while details still request originals.
11. Check 1440, 1024, near 700, and 390px plus fine-pointer hover, keyboard focus, and coarse-pointer press.
12. Run the common completion gate.
13. Review `dist`: public needs both details and both rows; draft needs neither detail/row. Regardless of status, remember any copied public asset is deployable.

## 6. Architect portfolio system

This section is intentionally detailed because portfolio data, inline canvas rendering, and the original PDF are separate layers.

### Files and lifecycle

- Registry/interface: `src/data/portfolios.ts`
- PDFs: `public/pdfs/`
- Cover, red-hover, and first-page preview images: `public/images/portfolios/`
- Archive component: `src/components/PortfolioArchive.astro`
- Inline viewer: `src/components/PdfScrollViewer.astro`
- Native iframe page: `src/components/PdfDocumentPage.astro`
- Archive routes: `src/pages/architect/portfolios.astro` and `src/pages/esp/arquitecto/portafolios.astro`
- Detail routes: each locale's `portfolios/[slug].astro`
- Auxiliary PDF routes: each locale's `portfolios/[slug]/pdf.astro`

Portfolio is not an Astro content collection. Every object in the exported `portfolios` array creates English and Spanish archive cards/index rows and all four detail/PDF routes.

### Exact portfolio fields

| Field | Required? | Language | Behavior |
|---|---|---|---|
| `id` | required | shared | stable slug and route pair |
| `title` | required | currently shared | archive/detail/PDF title; no `spanishTitle` exists |
| `subtitle` | optional | currently shared | archive metadata, detail description, enquiry |
| `pdfUrl` | required | currently shared | inline PDF.js viewer, native link, auxiliary iframe route |
| `pdfPreviewImage` | optional | shared | eager first-page raster while page 1 canvas prepares |
| `pdfPreviewImageWidth` / `pdfPreviewImageHeight` | optional | derived | intrinsic preview dimensions |
| `coverImage` | optional | shared | grid thumbnail |
| `coverHoverImage` | optional | shared | red grid hover/focus thumbnail |
| `coverImageAlt` | optional | shared | falls back to title |
| `coverImageWidth` / `coverImageHeight` | optional | derived | all required with `coverImage` for cover markup |
| `pageCount` | required number | shared | archive label, page placeholders, runtime count validation |
| `pageAspectRatios` | optional number array | shared | width/height ratio for each page before rendering; actual PDF ratio replaces it on render |

There are no fields for Spanish title/subtitle/PDF, status, draft/private, publication date, explicit order, SEO override, canonical, description/body, page images, custom enquiry link, or structured data.

`getPortfolioById` is exported at `src/data/portfolios.ts:44` but is currently unused; route generation maps the array directly.

### Archive order, grid, index, and thumbnails

No sorting function exists. Both grid and index call `portfolios.map`, so literal array order is the public order in both languages. Inserting a new object may place the new item as requested, but the relative order of all existing objects must remain unchanged.

The archive defaults to grid and resets there on load. Grid/index switch behavior, hidden active button, hover colors, focus styles, and breakpoints parallel the Painter archive:

- four-column intended aligned width by default;
- three-column equivalent below 1312px;
- three calculated columns at 720px and below;
- two calculated columns at 560px and below;
- index rows stack below 720px;
- `<ol>` markers are hidden, so no visible numbering.

The normal and red covers are two independent raster assets layered together. Both use the normal cover's stored dimensions, so their aspect ratios must match. The archive never generates either thumbnail from the PDF.

Fine-pointer hover and keyboard focus swap to the red cover. Unlike the Painter archive, the portfolio archive has no coarse-pointer touch-active binding, so touch retains the base cover.

Archive metadata is `subtitle / pageCount pages` or `subtitle / pageCount paginas` with missing pieces removed. The unaccented Spanish archive labels (`Cuadricula`, `Indice`, `paginas`, `todavia`) are the exact current strings and must not be silently rewritten during population. A positive page count is effectively always present because the interface requires it.

### Inline PDF rendering and quality

`PdfScrollViewer.astro` creates one vertically stacked figure per configured PDF page. Despite historical “page-turning/flipbook” terminology, the current accepted implementation is continuous vertical scrolling; do not replace it with a flipbook.

Key behavior:

- `safePageCount` floors a positive count, otherwise falls back to 1.
- Each placeholder uses the matching configured width/height aspect ratio, then first configured ratio, then 1.414.
- Only page 1 can show `pdfPreviewImage`.
- PDF.js is loaded from `pdfjs-dist/webpack.mjs` with 262,144-byte range chunks and `wasmUrl: '/pdfjs/wasm/'`.
- Runtime rejects the inline viewer when actual `numPages` differs from configured placeholders; the fallback still links to the original PDF.
- IntersectionObserver uses `rootMargin: '120% 0px'`, queues nearest pages first, and evicts canvases 900ms after they leave the near-page region.
- Maximum simultaneous renders: 2 above 760px, 1 at 760px and below.
- Native DPR is capped at 3.
- Per-page pixel budget: 6,000,000 desktop and 4,000,000 mobile.
- Output DPR is `max(1, min(native DPR, sqrt(pixel budget / CSS page area)))`.
- Viewer width/DPR changes trigger rerender when width changes by at least 8px or DPR by at least 0.05, debounced 160ms.
- Canvas is opaque white and swaps in only after a render completes.
- At 760px the detail reduces main padding/link text; otherwise pages remain full viewer width.
- The content width is `min(100%, 92rem)`.

The inline viewer rasterizes only the on-screen presentation at a device-aware resolution. It does not rewrite the source PDF. The detail header keeps the original `pdfUrl` as its progressive-enhancement destination. On mobile, tablet, iPadOS desktop-user-agent, and touch-first devices, “Open PDF” therefore opens the original file in the browser's native PDF viewer. Fine-pointer desktop browsers enhance the link to the branded auxiliary `/pdf/` route, which iframes the original PDF. The auxiliary route also redirects mobile/tablet devices to the raw `pdfUrl`, so direct or stale wrapper links cannot trap Safari inside an iframe. Both paths preserve the PDF's vector text/linework and original embedded imagery.

Never turn PDF pages into website JPEGs as the source, never replace `pdfUrl` with a raster export, and never overwrite the source merely to reduce transfer size.

### Audited Studio 2.2 facts and lifecycle

The `studio-2-2` registry object is at `src/data/portfolios.ts:26-41`.

- `id`: `studio-2-2`
- title: `Studio 2.2`
- source: `/pdfs/studio-2-2.pdf`
- configured/actual page count: 39
- file size: 15,392,303 bytes
- source/build SHA-256: `44FD0E64BB035A9D68DC29841F0A28FE0F2EC1622BCC941133F02B111ECBA4BD`
- PDF 1.6, tagged, optimized, unencrypted, no forms/JavaScript
- creator: Adobe InDesign 21.1; producer: Adobe PDF Library 18.0
- 27 pages at 1686.61 x 1190.55 points and 12 pages at 1686.61 x 1303.94 points
- configured tall pages: 5, 8, 9, 11, 15, 17, 18, 21, 24, 26, 27, 28
- PDF resources contain fonts, images, and form/vector objects; direct native viewing preserves them
- source inspection found 44,632 live text characters, 1,383 line objects, 205 rectangles, 5,190 curves, and 393 embedded raster images rather than a flattened document
- all discovered SF Pro Display and Myriad Pro font subsets are embedded
- preview and both cover assets decode at their configured dimensions
- rendered pages 1, 20, and 39 were visually checked and clean

Lifecycle:

1. Array order puts the object in both archives.
2. `id` creates both localized detail and both auxiliary PDF routes.
3. Archive renders cover/red cover, title, and `39 pages/paginas`.
4. Both details currently pass the same `pdfUrl`, page count, ratios, and preview to PDF.js.
5. English/Spanish UI labels, return link, enquiry wording, and page ARIA labels differ; title and PDF do not.
6. Page placeholders follow the configured ratios and PDF.js verifies all 39 pages before ready state.
7. Native mobile/tablet “Open PDF” serves the unchanged original; desktop keeps the branded iframe wrapper.
8. The build copied the PDF byte-identically.
9. Live audit at 1440px and 390px loaded 39 pages, showed no console errors, and paired the same slug across languages.

The Spanish auxiliary `/pdf/` wrapper sets `lang="es"` and localized fallback text, but `PdfDocumentPage.astro` still emits the shared English generic meta-description pattern `<title> architecture portfolio.`. Preserve that current metadata behavior during routine population.

The old English slug `/architect/portfolios/of-consumption-and-participation-in-the-movable-module/` redirects to `/architect/portfolios/studio-2-2/` in `astro.config.mjs`. Do not remove or repurpose it.

### Spanish PDF: current limitation and safest future workflow

Current fact: `/esp/arquitecto/portafolios/studio-2-2/` uses the English `/pdfs/studio-2-2.pdf`. The registry has no `spanishPdfUrl` or `spanishTitle`. The Spanish UI is localized, but the document/title are shared.

During this audit:

- do not request the unfinished Spanish PDF;
- do not create a placeholder;
- do not overwrite or rename the English PDF;
- do not point English at a future Spanish file.

When the final Spanish PDF is ready, handle it as a separately authorized additive system change:

1. Keep it outside `public/` until publication is approved; inspect the final supplied original directly.
2. Record its hash, page count, page order, and every page box/aspect ratio. Render representative first/middle/last pages for QA.
3. Give it a distinct stable path such as `/pdfs/studio-2-2-es.pdf`. Preserve the English file and hash.
4. Add the smallest localized optional fields needed to `Portfolio`, for example Spanish title/subtitle/PDF URL, Spanish page count/ratios, and Spanish preview fields. Do not replace the shared English fields or convert the registry to a new architecture.
5. Make only the Spanish archive/detail/PDF routes select the Spanish fields. Keep the same `id` so language switching remains paired.
6. Do not assume Spanish pagination/geometry matches English; derive it from the final file. Reuse a cover only if explicitly approved.
7. Build and compare every English archive/detail/PDF route and the English PDF hash before/after. Any English change is a regression.
8. Verify the new Spanish raw PDF, inline viewer, fallback, auxiliary PDF route, page labels, enquiry, and language switch on desktop/tablet/mobile.

For a brand-new portfolio whose Spanish PDF is not ready, the current choices are explicit: publish the object in both archives with the English PDF on the Spanish route, or keep the object out of the registry until localized publishing is acceptable. There is no draft/status flag and no locale-only publication.

### First Architect intake message

> Please send the following in one package.
>
> **Needed immediately**
> 1. Exact English portfolio title.
> 2. The final original English PDF, with page order already approved.
> 3. Preferred stable lowercase kebab ID, or authorization to derive it from the title.
> 4. Desired archive placement relative to existing portfolios. Existing relative order will not change.
> 5. Confirm the item is ready to be publicly emitted in both languages. There is no draft/private state. If the Spanish PDF is not ready, confirm whether the Spanish route may temporarily use the English PDF; otherwise the registry entry must wait.
>
> **Optional display metadata/assets**
> 6. Optional subtitle.
> 7. Supplied normal cover, red-hover cover, cover alt text, and first-page preview. State if an approved deterministic derivative may be made from the PDF; none will be invented.
>
> **English PDF requirements**
> 8. Confirm this is the quality-preserving final source, not a downsampled review export, and identify any pages intentionally omitted. Codex will derive file hash, page count, page sizes, aspect-ratio array, preview pixel dimensions, and validate order; do not manually guess them.
>
> **Spanish PDF**
> 9. It is not required now and no placeholder will be created. When final, provide the original Spanish PDF plus exact Spanish title/subtitle and any distinct cover/preview requirements. It will receive a separate URL and derived page metadata without changing the English PDF.

Do not ask for a manual page count that can be measured, status values the model does not support, SEO fields, canonical, a custom enquiry link, or page JPEGs.

### Safe Architect procedure

1. Collect the split intake above and resolve the two-language publication consequence.
2. Validate the English PDF: decodes, unencrypted or browser-readable as approved, no unexpected JavaScript, exact page count/order/boxes, representative visual renders, and stable hash.
3. Validate supplied cover/red cover/preview: decode, actual dimensions, matching cover aspect ratios, meaningful alt where provided.
4. Inspect registry order, existing IDs, routes, filenames, asset case, and redirect collisions.
5. Copy the untouched English PDF to a unique `public/pdfs/` filename.
6. Copy approved raster assets to `public/images/portfolios/`. Do not derive/red-tint without authorization.
7. Add one `Portfolio` object, preserving all existing relative array order. Derive `pageCount` and one width/height ratio per source PDF page.
8. Do not add the unfinished Spanish PDF. Under the current model, confirm the Spanish route's English-PDF behavior.
9. Verify both archives in grid/index and both details/auxiliary PDF routes.
10. Verify page count match, every page order, standard/tall ratios, first preview swap, lazy render/eviction, fallback, native Open PDF, enquiry, back-to-top, and language switch.
11. Check 1440, 1024, about 700, and 390px. Inspect first, representative different-size, middle, and last pages.
12. Run the common completion gate and compare `public`/`dist` PDF hashes.

## 7. Common completion gate

Every future population task must complete all applicable checks.

### Diff and schema/build

1. `git status --short`: only intended records/assets/data should be new or changed.
2. `git diff --check`: no whitespace errors.
3. Confirm no protected/holder/layout/navigation/style/animation/route files changed.
4. `npm run build`: must exit 0. The current build may report the established Vite large-chunk warning; a new content/schema/PDF error is a failure.

Build success does not prove string asset paths exist. Check every referenced file separately with exact case.

### Generated output

For each new public Writer/Painter slug:

- both archive HTML files exist;
- both detail HTML files exist;
- both archives contain the item exactly once;
- language links preserve the slug;
- no draft slug gets either detail or an archive row.

For each portfolio ID:

- both archive HTML files contain it once;
- both localized detail files and both `/pdf/` files exist;
- raw PDF and image assets exist in `dist`;
- `pageCount` equals actual PDF pages;
- source/build PDF SHA-256 values match.
- a local byte-range request for the raw PDF returns `206 Partial Content` and the PDF.js worker/WASM requests succeed.

### Preview/manual matrix

Run `npm run preview` and test at approximately:

- 1440 x 1000 desktop
- 1024 x 900 tablet
- about 700px width near archive/detail breakpoints
- 390 x 844 phone

Across applicable routes verify:

- direct load and Astro transition entry;
- EN/ES archive and detail language switch;
- Return/Volver;
- exact order and no unintended existing-order change;
- grid/index mode and reset-on-load behavior;
- long title/metadata wrapping;
- image/PDF load with no console errors;
- keyboard focus and fine/coarse pointer state;
- enquiry subject/body;
- back-to-top and reduced-motion behavior;
- raw native PDF and inline PDF fallback.

### Existing regression

Run `npm run test:home-mobile` for every completed population batch. It requires Chrome or Edge (or `CHROME_PATH`); if that browser prerequisite is unavailable, report the test as not run and do not describe the batch as fully verified. It cannot replace the archive-specific manual checks.

Run `npm run test:holder-reveal` after any separately authorized change to the holder pages,
the Contact routes or `ContactPage.astro`, `BaseLayout.astro`'s main reveal opt-in, or the
universal route-reveal timing. It checks all eight holder routes plus both Contact routes
(ten total) for the exact reveal timing at desktop and phone sizes, then audits every
generated non-home shared-shell route and the covered client-navigation paths for
continuous header/footer visibility.

### Stop conditions

Do not call population complete if:

- required source text/assets are missing;
- public approval is ambiguous;
- a requested Spanish-specific artwork field is unsupported;
- a Writer Spanish body is missing for a public item;
- a portfolio would expose an unacceptable English PDF on the Spanish route;
- a PDF count/order/ratio is unverified;
- an asset path is missing or case-mismatched;
- build or an applicable route check fails;
- existing content/order/visual behavior changed unexpectedly.

### Audit baseline on 11 July 2026

- `npm run build` passed and generated 78 route HTML pages (77 routed `index.html` files plus `404.html`). The established Vite large-chunk warning remained non-fatal and was not “fixed.”
- `npm run test:home-mobile` passed all three cold mobile taps.
- Both language archives and representative details returned HTTP 200.
- Painter had four public and six draft records; all twelve draft detail-route checks (six slugs x two languages) were absent.
- Painter grid rendered 4/3/2 columns at 1440/1024/390px; Writer rows changed from two-column desktop to stacked phone; portfolio inline viewer loaded all 39 pages in both languages without console errors.
- The raw PDF returned `206 Partial Content` for a byte-range request and `Content-Type: application/pdf`.
- `public/pdfs/studio-2-2.pdf` and its `dist` copy had the identical SHA-256 recorded above.
- Only this runbook and the `AGENTS.md` pointer were changed; application code, existing content, assets, and order were untouched.

## 8. Quick future intake summary

When the user says “Let’s populate …”, ask the full consolidated questionnaire in the relevant section above. In short:

- **Writer:** shared publication state; exact EN/ES titles and bodies; exact known date/precision and same-day order; EN/ES type; word-count handling; slug.
- **Architect:** final original English PDF; exact title; ID; array placement; public-in-both-languages consequence; optional subtitle/covers/preview; do not request the unfinished Spanish PDF.
- **Painter:** original image and optional supplied red hover; exact shared title; known date; medium; physical dimensions; draft/public; optional known location/description; only conditional tie order/slug/alt.

Pixel dimensions, image orientation, PDF hash, PDF page count, page geometry, and page aspect ratios are derived from supplied assets. Titles, dates, media, physical dimensions, translations, descriptions, and publication intent are not.
