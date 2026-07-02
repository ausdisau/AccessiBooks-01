---
name: Seeder-inflated dev catalog
description: Dev books table has 1M+ auto-seeded rows; implications for indexing, sitemaps, and any query touching books
---

# Seeder-inflated dev catalog

The api-server runs an auto-seeder on boot ("[Auto-Seeder] Started seeding: librivox, gutenberg, openlibrary, internetarchive") that resumes from DB progress and keeps growing the catalogue. The dev `books` table went from ~3k to 1.16M+ published rows (504k+ distinct authors) and continues to grow.

**Why it matters:**
- Any unindexed predicate on `books` is a multi-second seq scan. Assume nothing is fast at this scale; EXPLAIN before shipping public routes.
- Seeded rows contain junk: `author`/`genre` values can exceed 2.7KB, which makes **btree index creation FAIL** ("index row size exceeds btree version 4 maximum 2704"). Use `USING hash` indexes for exact-equality lookups on these columns instead — hash stores fixed-size codes and has no row-size limit (equality-only).
- Anything that enumerates the catalogue (sitemaps, exports, feeds) must be capped/paginated — full-catalogue enumeration builds 100MB+ payloads (OOM/DoS) and breaks external protocol caps (sitemap = 50k URLs/file).

**How to apply:** when adding queries or public pages over `books`, use exact-equality predicates backed by existing hash indexes (`idx_books_author_hash`, `idx_books_genre_hash`) or the status/reading-level btrees, cap result enumeration, and cache rendered payloads (not just row arrays).
