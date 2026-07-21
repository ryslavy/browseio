## 2026-07-21T10:48:20Z
You are teamwork_preview_worker_m3, an implementation and QA subagent.
Your working directory is: e:\User\AppData\Desktop\Projekt2\.agents\teamwork_preview_worker_m3

MANDATORY INTEGRITY WARNING: DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
1. Review `PROJECT.md` at `e:\User\AppData\Desktop\Projekt2\.agents\orchestrator\PROJECT.md` and `e:\User\AppData\Desktop\Projekt2\.agents\teamwork_preview_explorer_m1_3\handoff.md`.
2. Implement R2 Robust Sorting and Filtering for Movies & Series:
   - Create modular catalog components under `src/components/catalog/`:
     - `SortDropdown.tsx`: UI selector for all sort modes (`popularity`, `rating_desc`, `rating_asc`, `release_desc`, `release_asc`, `title_asc`, `title_desc`).
     - `FilterBar.tsx`: Genre pills filter and search input.
     - `CatalogHeader.tsx`: Title and Media Type toggle (`movie` vs `series`).
     - `MovieGrid.tsx`: Responsive CSS grid displaying catalog cards with empty state.
     - `MovieCard.tsx`: Media item card displaying poster, IMDb rating badge, release year, title, and key using `movie.id`.
   - Update `src/app/page.tsx`:
     - Synchronize all search/filter/sort parameters (`type`, `genre`, `sort`, `q`) with Next.js `useSearchParams()` and `useRouter()` to support bookmarking, deep-linking, and back/forward navigation.
     - Wrap search-params dependent catalog component inside `<Suspense>` boundary to maintain Next.js 16 App Router compliance.
     - Connect `src/lib/catalog-sorter.ts` functions (`sortCatalogItems`, `filterCatalogItems`).
     - Implement candidate pool pre-fetching buffer when custom sorting is active (pre-fetch multiple pages up to 50 items so highest-rated or newest items are correctly placed at top of list).
3. Run verification commands:
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm test`
4. Update `progress.md` in your working directory and submit a detailed handoff report in `e:\User\AppData\Desktop\Projekt2\.agents\teamwork_preview_worker_m3\handoff.md`.
5. Send a message to the orchestrator (conversation ID: 17751f8b-cdd0-4e13-8c53-6769689be40c) when finished.
