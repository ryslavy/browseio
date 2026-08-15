'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { getCatalog, searchCinemeta, MetaItem } from '@/lib/cinemeta';
import { filterCatalogItems, sortCatalogItems, SortMode } from '@/lib/catalog-sorter';
import { CatalogHeader } from '@/components/catalog/CatalogHeader';
import { FilterBar } from '@/components/catalog/FilterBar';
import { SortDropdown } from '@/components/catalog/SortDropdown';
import { MovieGrid } from '@/components/catalog/MovieGrid';
import { useI18n } from '@/lib/i18n';
import MovieDetailsClient from '@/components/MovieDetailsClient';
import SettingsPage from '@/app/settings/page';
import LandingPage from '@/components/LandingPage';

const MOVIE_GENRES = [
  'top',
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Sport',
  'Thriller',
  'War',
  'Western',
];

const SERIES_GENRES = [
  'top',
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Sport',
  'Thriller',
  'War',
  'Western',
  'Reality-TV',
];

function CatalogContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();

  // Helper to parse URL params cleanly from window or Next.js searchParams
  const getSearchParams = useCallback(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams(searchParams ? searchParams.toString() : '');
  }, [searchParams]);

  const initialSp = getSearchParams();
  const [mediaType, setMediaType] = useState<'movie' | 'series'>(() => 
    (initialSp.get('type') === 'series' ? 'series' : 'movie') as 'movie' | 'series'
  );
  const [currentGenre, setCurrentGenre] = useState<string>(() => initialSp.get('genre') || 'top');
  const [currentSort, setCurrentSort] = useState<SortMode>(() => (initialSp.get('sort') as SortMode) || 'popularity');
  const [searchQuery, setSearchQuery] = useState<string>(() => initialSp.get('q') || '');

  // Synchronize internal state when searchParams or popstate changes (e.g. from Back/Forward or Navbar links)
  useEffect(() => {
    const handleUrlSync = () => {
      const sp = getSearchParams();
      const nextType = (sp.get('type') === 'series' ? 'series' : 'movie') as 'movie' | 'series';
      const nextGenre = sp.get('genre') || 'top';
      const nextSort = (sp.get('sort') as SortMode) || 'popularity';
      const nextQ = sp.get('q') || '';

      setMediaType(nextType);
      setCurrentGenre(nextGenre);
      setCurrentSort(nextSort);
      setSearchQuery(nextQ);
    };

    handleUrlSync();
    window.addEventListener('popstate', handleUrlSync);
    return () => window.removeEventListener('popstate', handleUrlSync);
  }, [searchParams, getSearchParams]);

  const [rawMovies, setRawMovies] = useState<MetaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchReqId = useRef(0);

  // URL state synchronization helper (safe for GitHub Pages with basePath and Vercel)
  const updateUrlParams = useCallback(
    (updates: { type?: 'movie' | 'series'; genre?: string; sort?: SortMode; q?: string }) => {
      const nextType = updates.type !== undefined ? updates.type : mediaType;
      const nextGenre = updates.genre !== undefined ? updates.genre : (updates.type !== undefined ? 'top' : currentGenre);
      const nextSort = updates.sort !== undefined ? updates.sort : currentSort;
      const nextQ = updates.q !== undefined ? updates.q : searchQuery;

      setMediaType(nextType);
      setCurrentGenre(nextGenre);
      setCurrentSort(nextSort);
      setSearchQuery(nextQ);

      if (typeof window !== 'undefined') {
        const sp = new URLSearchParams(window.location.search);
        sp.set('view', 'catalog');
        sp.set('type', nextType);

        if (nextGenre && nextGenre !== 'top') {
          sp.set('genre', nextGenre);
        } else {
          sp.delete('genre');
        }

        if (nextSort && nextSort !== 'popularity') {
          sp.set('sort', nextSort);
        } else {
          sp.delete('sort');
        }

        if (nextQ && nextQ.trim()) {
          sp.set('q', nextQ.trim());
        } else {
          sp.delete('q');
        }

        const currentPath = window.location.pathname;
        const qs = sp.toString();
        const newUrl = qs ? `${currentPath}?${qs}` : currentPath;
        window.history.replaceState(null, '', newUrl);
      }
    },
    [mediaType, currentGenre, currentSort, searchQuery]
  );

  const currentGenres = mediaType === 'movie' ? MOVIE_GENRES : SERIES_GENRES;

  // Primary Data Fetching Effect with Candidate Pool Pre-fetching
  useEffect(() => {
    const reqId = ++fetchReqId.current;
    let isCancelled = false;

    const loadData = async () => {
      setLoading(true);
      setHasMore(true);

      // Case 1: Search query active
      if (searchQuery.trim()) {
        const results = await searchCinemeta(searchQuery.trim(), mediaType);
        if (!isCancelled && reqId === fetchReqId.current) {
          setRawMovies(results);
          setHasMore(false);
          setLoading(false);
        }
        return;
      }

      // Case 2: Custom sorting active -> Pre-fetch candidate pool up to 50 items
      if (currentSort !== 'popularity') {
        let pool: MetaItem[] = [];
        const existingIds = new Set<string>();
        let currentSkip = 0;
        let canFetchMore = true;

        while (pool.length < 50 && canFetchMore && !isCancelled) {
          const batch = await getCatalog(mediaType, currentGenre, currentSkip);
          if (isCancelled || reqId !== fetchReqId.current) return;

          if (!batch || batch.length === 0) {
            canFetchMore = false;
            break;
          }

          const newItems = batch.filter((m) => !existingIds.has(m.id));
          if (newItems.length === 0) {
            canFetchMore = false;
            break;
          }

          newItems.forEach((m) => existingIds.add(m.id));
          pool = [...pool, ...newItems];
          currentSkip += batch.length;

          if (batch.length < 10) {
            canFetchMore = false;
          }
        }

        if (!isCancelled && reqId === fetchReqId.current) {
          setRawMovies(pool);
          setHasMore(canFetchMore);
          setLoading(false);
        }
        return;
      }

      // Case 3: Default popularity sorting -> Load initial 1 page
      const initialBatch = await getCatalog(mediaType, currentGenre, 0);
      if (!isCancelled && reqId === fetchReqId.current) {
        setRawMovies(initialBatch);
        setHasMore(initialBatch.length >= 10);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [mediaType, currentGenre, searchQuery, currentSort]);

  // Infinite Scroll Pagination Handler
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || searchQuery) return;
    setLoadingMore(true);

    const nextSkip = rawMovies.length;
    const batch = await getCatalog(mediaType, currentGenre, nextSkip);

    if (!batch || batch.length === 0) {
      setHasMore(false);
      setLoadingMore(false);
      return;
    }

    setRawMovies((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newUnique = batch.filter((m) => !existingIds.has(m.id));
      if (newUnique.length === 0 || batch.length < 10) {
        setHasMore(false);
      }
      return [...prev, ...newUnique];
    });

    setLoadingMore(false);
  }, [loading, loadingMore, hasMore, searchQuery, rawMovies.length, mediaType, currentGenre]);

  // Intersection Observer setup for Infinite Scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && hasMore && !searchQuery) {
          loadMore();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, searchQuery, loadMore]);

  // Derived Filtered & Sorted Movie List
  const displayedMovies = useMemo(() => {
    const filtered = filterCatalogItems(rawMovies, {
      type: mediaType,
      genre: searchQuery ? undefined : currentGenre,
      searchQuery: undefined,
    });
    return sortCatalogItems(filtered, currentSort);
  }, [rawMovies, mediaType, currentGenre, searchQuery, currentSort]);

  // UI Change Handlers
  const handleTypeChange = (newType: 'movie' | 'series') => {
    updateUrlParams({ type: newType, genre: 'top' });
  };

  const handleGenreChange = (newGenre: string) => {
    updateUrlParams({ genre: newGenre });
  };

  const handleSortChange = (newSort: SortMode) => {
    updateUrlParams({ sort: newSort });
  };

  const handleSearchSubmit = (newQuery: string) => {
    updateUrlParams({ q: newQuery });
  };

  const headerTitle = searchQuery
    ? (loading ? `${t('catalog.searching')} "${searchQuery}"...` : `${t('catalog.search_results')} "${searchQuery}"`)
    : `${currentGenre === 'top' ? t('catalog.popular') : (t(`genre.${currentGenre}`) || currentGenre)} ${mediaType === 'movie' ? t('catalog.movies').toLowerCase() : t('catalog.series').toLowerCase()}`;

  return (
    <div className="fade-in">
      <CatalogHeader type={mediaType} onTypeChange={handleTypeChange} />

      <FilterBar
        currentGenre={currentGenre}
        genres={currentGenres}
        searchQuery={searchQuery}
        onGenreChange={handleGenreChange}
        onSearchSubmit={handleSearchSubmit}
        loading={loading}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <h2 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {loading && searchQuery && <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>}
          {headerTitle}
        </h2>

        <SortDropdown currentSort={currentSort} onSortChange={handleSortChange} />
      </div>

      <MovieGrid movies={displayedMovies} defaultType={mediaType} loading={loading} />

      <div
        ref={sentinelRef}
        style={{ height: '40px', margin: '2rem 0', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
      >
        {loadingMore && <div className="spinner" style={{ width: '30px', height: '30px' }}></div>}
      </div>
    </div>
  );
}

/**
 * Reactive Current View Hook:
 * Dynamically reacts to Next.js App Router pathname & searchParams changes
 * so navigating via <Link href="/"> or <Link href="/settings"> or <Link href="/movie/...">
 * instantly switches view without requiring full page reloads or popstate events.
 */
function useCurrentView() {
  const [view, setView] = useState<{ type: 'landing' | 'catalog' | 'settings' | 'movie'; mediaType?: string; id?: string }>({ type: 'landing' });
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    function updateView() {
      if (typeof window === 'undefined') return;

      const path = typeof window !== 'undefined' ? window.location.pathname : (pathname || '/');
      const search = typeof window !== 'undefined' ? window.location.search : (searchParams ? searchParams.toString() : '');
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const sp = new URLSearchParams(search);

      // 1. Explicit Landing Page View (?view=landing)
      if (sp.get('view') === 'landing') {
        setView({ type: 'landing' });
        return;
      }

      // 2. Settings View
      if (path.includes('/settings') || hash.includes('settings') || sp.get('page') === 'settings') {
        setView({ type: 'settings' });
        return;
      }

      // 2. Direct Query Parameter View (?type=movie&id=550)
      const idParam = sp.get('id');
      if (idParam) {
        setView({ type: 'movie', mediaType: sp.get('type') || 'movie', id: idParam });
        return;
      }

      // 3. GitHub Pages 404 Redirect Handler (?p=movie/...)
      const redirectPath = sp.get('p');
      let effectivePath = path;
      if (redirectPath) {
        const decodedPath = redirectPath.replace(/~and~/g, '&');
        effectivePath = '/' + decodedPath;
      }

      // 4. Pathname / Hash Match (/movie/type/id)
      const movieMatch = effectivePath.match(/\/movie\/([^/]+)\/([^/]+)/) || hash.match(/movie\/([^/]+)\/([^/]+)/);
      if (movieMatch) {
        setView({ type: 'movie', mediaType: movieMatch[1], id: movieMatch[2] });
        return;
      }

      // 5. Explicit Catalog View (?view=catalog or ?type=... or ?genre=... or ?q=... or ?sort=...)
      if (sp.get('view') === 'catalog' || sp.has('type') || sp.has('genre') || sp.has('q') || sp.has('sort')) {
        setView({ type: 'catalog' });
        return;
      }

      // 6. Default Landing Page View (when visiting root URL /)
      setView({ type: 'landing' });
    }

    updateView();

    window.addEventListener('popstate', updateView);
    window.addEventListener('hashchange', updateView);

    return () => {
      window.removeEventListener('popstate', updateView);
      window.removeEventListener('hashchange', updateView);
    };
  }, [pathname, searchParams]);

  return view;
}

function HomeContent() {
  const view = useCurrentView();

  if (view.type === 'landing') {
    return <LandingPage />;
  }

  if (view.type === 'settings') {
    return <SettingsPage />;
  }

  if (view.type === 'movie' && view.id) {
    return <MovieDetailsClient type={view.mediaType || 'movie'} id={view.id} />;
  }

  return <CatalogContent />;
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner"></div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
