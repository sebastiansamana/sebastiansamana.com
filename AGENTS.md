# Codex Rules

- Before populating `/writer/everything/`, `/architect/portfolios/`, or `/painter/everything/`, read and follow `docs/CONTENT_POPULATION_AUDIT.md`. It is the authoritative route, schema, bilingual-pairing, visibility, asset, sorting, intake, and validation runbook.
- Treat the holder pages and completed shared environments listed in that runbook as protected. Routine population must change only the relevant content/data records and supplied public assets; do not edit routes, archive/detail components, layouts, styles, navigation, transitions, or animations.
- Add artworks through the data system only. Create or update Markdown records in `src/data/artworks/` using `npm run new-artwork` or the same frontmatter schema; do not hardcode artworks directly into `/painter/everything` or archive components.
- Keep unknown artwork metadata blank. Do not invent dates, media, dimensions, locations, descriptions, or publication status.
