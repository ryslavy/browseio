# E2E Test Suite Infrastructure Specification (TEST_INFRA.md)

## Overview
This document specifies the 4-tier opaque-box and programmatic test infrastructure for BrowseIO, a Next.js 16 streaming application. The test suite covers catalog operations, sorting/filtering utilities, media type filters, API route contracts, boundary/edge cases, multi-feature combinations, and end-to-end user playback mounting workflows.

---

## Methodology & Architecture

The test suite is structured into 4 sequential tiers of verification:

```
┌─────────────────────────────────────────────────────────┐
│ Tier 1: Feature Coverage                                │
│ - Cinemeta API Client Contract                          │
│ - Pure Catalog Sorter & Filter Utility                  │
│ - Media Type Filter (Movies vs Series)                  │
│ - API Route Contracts (TorBox, Proxy, Transcode, HLS)   │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Tier 2: Boundary & Corner Cases                         │
│ - Missing / Null Metadata (genres, posters, synopses)   │
│ - Unparseable Ratings ("N/A", undefined, non-numeric)   │
│ - Non-Standard Release Years ("2008-2013", undefined)   │
│ - Uncached Torrents & Empty Hashes                      │
│ - Malformed / Missing Parameters on API Endpoints       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Tier 3: Cross-Feature Combinations                      │
│ - Type + Genre + Sort Mode + Search Query Matrix        │
│ - Monotonicity Verification for Sort Invariants         │
│ - Cascading Filter-Sorter Pipeline                      │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Tier 4: Real-World User Scenarios                       │
│ - End-to-End User Path: Browse -> Filter -> Sort        │
│ - Item Selection -> Stream Source Resolution            │
│ - TorBox Debrid Check / Direct Proxy / HLS Mount        │
└─────────────────────────────────────────────────────────┘
```

---

## 4-Tier Test Suite Specification

### Tier 1: Feature Coverage
1. **Catalog API Client Contract (`src/lib/cinemeta.ts`)**
   - Verify `getCatalog(type, genre, skip)` returns array of `MetaItem` with required properties (`id`, `type`, `name`).
   - Verify `searchCinemeta(query, type)` returns search results from Cinemeta API.
   - Verify `getMetaDetails(type, id)` retrieves item details.

2. **Catalog Sorting Utility (`src/lib/catalog-sorter.ts`)**
   - Verify `parseImdbRating` extracts numeric floating point ratings from valid string values.
   - Verify `parseReleaseYear` extracts 4-digit start year from release strings.
   - Verify `sortCatalogItems` handles all 7 sort modes (`popularity`, `rating_desc`, `rating_asc`, `release_desc`, `release_asc`, `title_asc`, `title_desc`).

3. **Media Type & Genre Filtering**
   - Verify `filterCatalogItems` filters items by `type: 'movie'` vs `type: 'series'`.
   - Verify `filterCatalogItems` filters items by `genre` (case-insensitive array search).
   - Verify `filterCatalogItems` filters items by `searchQuery` against `name` and `description`.

4. **API Route Contracts**
   - `/api/torbox`: Verify POST payload contracts for `action: 'check'` and `action: 'resolve'`.
   - `/api/proxy`: Verify request contract requires `url` query parameter.
   - `/api/hls/[...slug]`: Verify 404 response when slug is empty or file missing.

---

### Tier 2: Boundary & Corner Cases
1. **Empty Metadata Objects**
   - Test handling of items with `genres: undefined`, `description: undefined`, `poster: undefined`.
   - Ensure filter functions do not throw TypeError on nullish fields.

2. **Missing or Unparseable Ratings & Release Years**
   - Test `parseImdbRating` with `undefined`, `null`, `"N/A"`, `""`, `"Invalid"`.
   - Test `parseReleaseYear` with `undefined`, `"N/A"`, `"2008-2013"`, `"TBA"`.
   - Verify sorting items with missing ratings/years places missing values at the end predictably without `NaN` comparison errors.

3. **Uncached Torrents & Empty Hash Arrays**
   - Test TorBox `checkTorBoxCached` with empty array `[]` returning empty set.
   - Test TorBox `checkTorBoxCached` with non-cached hashes.
   - Test `/api/torbox` HTTP POST with empty body or missing parameters.

4. **Bad / Malformed HTTP Endpoint Inputs**
   - Test `/api/proxy?url=` with missing URL parameter returns HTTP 400.
   - Test `/api/hls/nonexistent-session/index.m3u8` returns HTTP 404.

---

### Tier 3: Cross-Feature Combinations
1. **Multi-Criteria Filter + Sort Combinations**
   - Combine `type: 'movie'`, `genre: 'Action'`, `searchQuery: 'Dark'`, `sortMode: 'rating_desc'`.
   - Combine `type: 'series'`, `genre: 'Drama'`, `sortMode: 'release_desc'`.

2. **Mathematical Invariant Assertions (Monotonicity)**
   - For `rating_desc`: Ensure `rating(item[i]) >= rating(item[i+1])` for all `i`.
   - For `rating_asc`: Ensure `rating(item[i]) <= rating(item[i+1])` for all `i`.
   - For `release_desc`: Ensure `year(item[i]) >= year(item[i+1])` for all `i`.
   - For `title_asc`: Ensure `item[i].name <= item[i+1].name` lexicographically.

---

### Tier 4: Real-World Scenarios
1. **User Discovery to Stream Mount Flow**
   - Step 1: User initializes catalog browse for `movie`.
   - Step 2: User applies genre filter (`Sci-Fi`) and search query (`Interstellar`).
   - Step 3: User sorts results by `rating_desc`.
   - Step 4: System picks top candidate item (`tt0816692`).
   - Step 5: User triggers stream source check for target magnet/hash via `/api/torbox`.
   - Step 6: System generates stream playback parameters (`url` / `/api/proxy` / HLS transcoder `/api/transcode` payload).
   - Step 7: Validate stream URL mounting contract parameters for player initialization.

---

## Test Execution Infrastructure
The test runner is programmatically executable via:
```bash
node scripts/run-e2e-tests.js
```
or via `npm test`.

Exit Codes:
- `0`: All test suites passed successfully.
- `1`: One or more test assertions failed.
