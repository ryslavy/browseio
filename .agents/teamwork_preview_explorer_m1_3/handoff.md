# Handoff Report: Catalog Data & R2 Sorting & Filtering Exploration

## 1. Observation

### Code Base & Data Sources Inspected
- **Catalog Data Model & API Helper**: `src/lib/cinemeta.ts`
  - `MetaItem` interface (lines 10–21):
    ```typescript
    export interface MetaItem {
      id: string;          // IMDb ID (e.g., "tt0111161")
      type: string;        // "movie" | "series"
      name: string;        // Title
      genres?: string[];   // Array of strings (e.g. ["Drama", "Crime"])
      poster?: string;     // URL string
      background?: string; // Fanart URL string
      description?: string;// Synopsis string
      releaseInfo?: string;// Release year/range string (e.g. "1994", "2008-2013")
      imdbRating?: string; // Rating string (e.g. "9.3")
      videos?: Episode[];  // Series episode list
    }
    ```
  - API functions:
    - `getCatalog(type, category = 'top', skip = 0)` (lines 23–43): Fetches from `https://v3-cinemeta.strem.io/catalog/${type}/top${extraPath}.json` where `extraPath` appends `/genre=${genre}&skip=${skip}`.
    - `searchCinemeta(query, type)` (lines 45–54): Fetches from `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${query}.json`.
    - `getMetaDetails(type, id)` (lines 56–65): Fetches item details from `https://v3-cinemeta.strem.io/meta/${type}/${id}.json`.

- **Main Page & Grid UI Component**: `src/app/page.tsx`
  - Client component (`'use client'`).
  - State variables (lines 8–14): `movies`, `loading`, `loadingMore`, `searchQuery`, `type`, `genre`, `hasMore`.
  - Fetching & Pagination:
    - `loadInitial` (lines 23–30): Fetches `getCatalog(type, genre, 0)`.
    - `loadMore` (lines 32–54): Appends next batch at `skip = movies.length`, deduplicating by `m.id`.
    - `IntersectionObserver` (lines 56–69): Observes `sentinelRef` div to trigger `loadMore()` on scroll.
  - Controls & Layout:
    - Media type toggle (lines 99–112): Buttons for `movie` and `series`.
    - Genre pills (lines 114–134): Renders fixed array of genres (`MOVIE_GENRES` / `SERIES_GENRES`).
    - Search input form (lines 137–151): Submits search to `searchCinemeta(searchQuery, type)`.
    - Grid layout (lines 161–169): CSS Grid with `repeat(auto-fill, minmax(200px, 1fr))`.
    - Inline component `MovieCard` (lines 182–217): Displays poster, name, releaseInfo, and imdbRating.

- **Streaming & Detail Pages**:
  - `src/app/movie/[type]/[id]/page.tsx`: Movie/series details, episode selection, stream sources aggregation (Torrentio, SKTorrent, Hellspy, SKTorrent-Classic, TorBox cache check).
  - `src/app/player/page.tsx`: Embedded WebTor player / Plyr player / local HLS transcoder stream wrapper.
  - `src/app/settings/page.tsx`: LocalStorage configuration for TorBox API key, SKTorrent credentials, and player preference.

- **Project Config & Dependencies**: `package.json`
  - Next.js version: `16.2.10` (App Router model, React 19).

---

## 2. Logic Chain

1. **Observation**: `src/lib/cinemeta.ts` relies exclusively on Cinemeta v3 HTTP catalog endpoints (`v3-cinemeta.strem.io/catalog/${type}/top...`).
2. **Observation**: Cinemeta API catalog endpoints return media items ordered by default Cinemeta popularity ("top"). Cinemeta API does NOT accept URL params for sorting (e.g. `sortBy=rating`).
3. **Observation**: `src/app/page.tsx` manages all catalog filtering (type, genre, search) in React component local state (`useState`). No URL query string state synchronization exists (`useSearchParams` / `useRouter` is unused).
4. **Inference**: Page refresh or back-navigation from media details resets user selection back to default `movie`, `top` genre, empty search query.
5. **Observation**: Current UI in `src/app/page.tsx` provides zero UI controls for sorting (e.g. by IMDb rating, release year, title).
6. **Inference**: To satisfy requirement R2 (robust sorting & filtering by rating, release date, title, genre, type: movie vs series), sorting must be processed over fetched data pools using robust client-side parsing routines, while state should be synchronized with Next.js URL query params.

---

## 3. Caveats

1. **Cinemeta API Backend Limitations**:
   - Cinemeta API does not perform server-side sorting by rating, year, or title.
   - Search requests (`search=${query}`) on Cinemeta do not support pagination (`skip`) or genre combination on Cinemeta's backend.
2. **Data Parsing Discrepancies**:
   - `imdbRating`: Optional string (e.g., `"9.3"`, `"7.0"`, or undefined/missing). Sorting requires safe numeric parsing: `parseFloat(item.imdbRating) || 0`.
   - `releaseInfo`: Optional string, may be a single year (`"1994"`), a year range (`"2008-2013"`), or missing (`"N/A"`). Sorting requires regex year extraction: `parseInt(item.releaseInfo?.match(/\d{4}/)?.[0] || '0', 10)`.
   - `genres`: Array of strings or undefined.
3. **Infinite Scroll vs Sorted Dataset**:
   - When user selects "Sort by Rating (High to Low)", sorting only the currently loaded page (10 items) will miss higher-rated movies in subsequent pages.
   - Solution: When a custom sort (Rating / Year / Title) is active, pre-fetch a larger candidate pool (e.g. 50–100 items across initial pages) before sorting & displaying.

---

## 4. Conclusion

To fulfill requirement R2 cleanly, the following architecture is proposed:

### Proposed Architecture for R2 Sorting & Filtering

1. **URL-Driven State Management**:
   - Refactor `app/page.tsx` state to derive from Next.js `useSearchParams()`.
   - Search parameters:
     - `type`: `'movie'` | `'series'` (default: `'movie'`)
     - `genre`: string (default: `'top'`)
     - `sort`: `'popularity'` | `'rating_desc'` | `'rating_asc'` | `'release_desc'` | `'release_asc'` | `'title_asc'` | `'title_desc'` (default: `'popularity'`)
     - `q`: search query string (optional)
   - Enable deep-linking, bookmarking, and seamless browser back/forward navigation.

2. **Dedicated Pure Utility (`src/lib/catalog-sorter.ts`)**:
   - Create sorting and filtering helpers:
     - `parseImdbRating(rating?: string): number`
     - `parseReleaseYear(releaseInfo?: string): number`
     - `sortCatalogItems(items: MetaItem[], sortOption: SortMode): MetaItem[]`
     - `filterCatalogItems(items: MetaItem[], options: FilterOptions): MetaItem[]`

3. **Component Refactoring**:
   - Split monolithic `app/page.tsx` into modular components under `src/components/catalog/`:
     - `CatalogHeader.tsx`: Title & media type toggle (`movie` vs `series`).
     - `FilterBar.tsx`: Genre pills & search input.
     - `SortDropdown.tsx`: Dropdown menu for sort order (Rating, Release Date, Title, Popularity).
     - `MovieGrid.tsx`: CSS Grid displaying cards.
     - `MovieCard.tsx`: Reusable media item card with poster fallback, IMDb rating pill, release year pill, and key fix (using `movie.id` as primary key).

4. **Data Buffer Strategy for Infinite Scroll**:
   - Maintain a raw catalog buffer in memory (`allFetchedMovies`).
   - Derive displayed movies via `useMemo`: `const displayedMovies = useMemo(() => sortCatalogItems(filterCatalogItems(allFetchedMovies, filters), sortMode), [allFetchedMovies, filters, sortMode])`.
   - When non-default sort is active, fetch multiple batches up front (e.g., 50 items) so highest-rated or newest items across top results are correctly placed at top of list.

---

## 5. Verification Method

To independently verify the implementation after M3 implementation:

1. **Build & Type Checking**:
   - Run `npx tsc --noEmit` to verify type safety of `MetaItem` and sorting interfaces.
   - Run `npm run build` to ensure no hydration or Next.js build errors occur.

2. **Sorting Verification Scenarios**:
   - **Sort by Rating (Desc)**: Verify items are sorted strictly by IMDb rating descending (e.g., 9.3 -> 9.2 -> 9.0 -> 8.5).
   - **Sort by Release Date (Desc)**: Verify items are sorted strictly by extracted release year descending (e.g., 2026 -> 2025 -> 2024).
   - **Sort by Title (Asc)**: Verify items are sorted alphabetically (A-Z).
   - **Type Switching**: Toggle between "Filmy" and "Seriály" and verify catalog type updates in URL and view.
   - **URL Persistence**: Reload page with query string `?type=series&genre=Action&sort=rating_desc` and confirm UI restores correct state.
