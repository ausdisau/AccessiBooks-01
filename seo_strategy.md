# SEO Strategy

## In scope
- Public marketing pages
- Public catalog, discovery, author, event, and content pages in the documented web application
- Any public SSR pages or SEO endpoints exposed by the API server (`/robots.txt`, `/sitemap.xml`, canonical/meta emitters)

## Out of scope
- Authenticated dashboard and account-only routes
- Admin pages
- Mobile app surfaces
- Non-production mockup or migration directories

## Target audience
- Readers, listeners, caregivers, educators, and users with disabilities seeking accessible books and reading tools.

## Primary keywords
- Unknown — likely centered on accessible audiobooks, accessible ebooks, dyslexia-friendly reading, disability-friendly reading tools, and accessible reading platform terms.

## Deployment and surface notes
- The documented primary public web surface is `artifacts/accessibooks/` (React + Vite SPA).
- `artifacts/api-server/` owns the public SEO bridge routes such as `/book/:id`, `/author/:name`, and `/sitemap.xml`.
- `artifacts/accessibooks-next/` exists as a secondary web surface in the repo, but primary issue prioritization is based on the documented `artifacts/accessibooks/` app unless deployment intent changes.

## Dismissed categories
- (None yet)
