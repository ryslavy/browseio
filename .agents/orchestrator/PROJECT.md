# Project: Next.js Streaming Application Refactor & Feature Enhancement

## Architecture
- Next.js Streaming App with:
  - Local FFmpeg HLS transcoder (`src/app/api/transcode/route.ts`, `src/app/api/hls/[...slug]/route.ts`)
  - Webtor P2P player integration (`@webtor/player-sdk-js`, `src/app/player/page.tsx`)
  - TorBox torrent caching API / logic (`src/lib/torbox.ts`, `src/app/api/torbox/route.ts`)
  - Movies & Series catalog display (`src/lib/cinemeta.ts`, `src/app/page.tsx`, `src/components/catalog/`)
- Target improvements:
  - Architecture audit, code cleanup, component optimization
  - Robust sorting and filtering (by rating, release date, title, genre, type: movie vs series)
  - Ensure zero hydration mismatches, zero build errors, zero OOM errors
  - Maintain core playback functions (local FFmpeg HLS, Webtor, TorBox)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Codebase Exploration & Architectural Audit | Investigate Next.js setup, docs in node_modules, component tree, API routes, streaming logic (FFmpeg, Webtor, TorBox), data models, state management | None | DONE |
| 2 | E2E Testing Infrastructure Setup | Establish opaque-box test suite (Tiers 1-4) for catalog, sorting/filtering, and playback verification (`TEST_INFRA.md`, test runner) | M1 | DONE |
| 3 | Sorting & Filtering System Implementation | Add sorting/filtering for movies & series with UI controls, query param sync, and pure sorter logic | M1, M2 | DONE |
| 4 | Architecture Optimization & Code Refactoring | Refactor scraper dynamic imports, fix ESLint config, add SSRF proxy guard, optimize image rendering, add stale HLS cleanup | M1, M3 | DONE |
| 5 | E2E Verification & Adversarial Coverage Hardening | Run all E2E test tiers (1-5), perform security remediation, verify core playback functionality, run forensic audit | M2, M3, M4 | DONE |

## Interface Contracts
### Sorting & Filtering ↔ Catalog UI (`src/lib/catalog-sorter.ts`)
- Sorting modes: `'popularity'` | `'rating_desc'` | `'rating_asc'` | `'release_desc'` | `'release_asc'` | `'title_asc'` | `'title_desc'`
- Filter options: `{ type?: 'movie' | 'series', genre?: string, searchQuery?: string }`
- Helper signatures:
  - `parseImdbRating(rating?: string): number`
  - `parseReleaseYear(releaseInfo?: string): number`
  - `sortCatalogItems(items: MetaItem[], sortMode: SortMode): MetaItem[]`
  - `filterCatalogItems(items: MetaItem[], options: FilterOptions): MetaItem[]`

### Streaming Player ↔ Transcoder / Webtor / TorBox APIs
- Interface for stream source selector (TorBox, Webtor, Local FFmpeg HLS)
- TorBox cache check API: `POST /api/torbox` `{ action: 'check', hashes: string[] }`
- TorBox resolution API: `POST /api/torbox` `{ action: 'resolve', magnet: string }`
- FFmpeg Transcoder API: `POST /api/transcode` `{ sessionId: string, magnet?: string, url?: string }`
- HLS Serving API: `GET /api/hls/[sessionId]/index.m3u8`

## Code Layout
- `src/app/`
  - `page.tsx` — Main catalog page (URL param sync, Suspense boundary, pre-fetch buffer)
  - `layout.tsx` — Root layout with navigation
  - `movie/[type]/[id]/page.tsx` — Movie/series details and stream selection
  - `player/page.tsx` — Embedded player component
  - `settings/page.tsx` — Configuration settings
  - `api/` — API route handlers (`transcode`, `hls`, `torbox`, `proxy`, `hellspy`, `sktorrent`, `sktorrent-classic`)
- `src/lib/`
  - `cinemeta.ts` — Cinemeta catalog API client
  - `torrentio.ts` — Torrentio stream source client
  - `torbox.ts` — TorBox debrid REST client
  - `catalog-sorter.ts` — Pure catalog sorting & filtering utility
- `src/components/catalog/` — Modular catalog components (`CatalogHeader`, `FilterBar`, `SortDropdown`, `MovieGrid`, `MovieCard`)
