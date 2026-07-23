'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { getCatalog, searchCinemeta, MetaItem } from '@/lib/cinemeta';
import { filterCatalogItems, sortCatalogItems, SortMode } from '@/lib/catalog-sorter';
import { CatalogHeader } from '@/components/catalog/CatalogHeader';
import { FilterBar } from '@/components/catalog/FilterBar';
import { SortDropdown } from '@/components/catalog/SortDropdown';
import { MovieGrid } from '@/components/catalog/MovieGrid';
import { t, i18nEventTarget } from '@/lib/i18n';
import MovieDetailsClient from '@/components/MovieDetailsClient';
import SettingsPage from '@/app/settings/page';

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [, setLangTick] = useState(0);

  useEffect(() => {
    const handleLangChange = () => setLangTick(t => t + 1);
    if (i18nEventTarget) {
      i18nEventTarget.addEventListener('languageChange', handleLangChange);
    }
    return () => {
      if (i18nEventTarget) {
        i18nEventTarget.removeEventListener('languageChange', handleLangChange);
      }
    };
  }, []);

  // URL State derivation
  const typeParam = (searchParams.get('type') === 'series' ? 'series' : 'movie') as 'movie' | 'series';
  const genreParam = searchParams.get('genre') || 'top';
  const sortParam = (searchParams.get('sort') as SortMode) || 'popularity';
  const qParam = searchParams.get('q') || '';

  const [rawMovies, setRawMovies] = useState<MetaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchReqId = useRef(0);

  // URL state synchronization helper
  const updateUrlParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, val]) => {
        if (
          val === undefined ||
          val === '' ||
          (key === 'genre' && val === 'top') ||
          (key === 'sort' && val === 'popularity')
        ) {
          params.delete(key);
        } else {
          params.set(key, val);
        }
      });
      const query = params.toString();
      const newUrl = query ? `${pathname}?${query}` : pathname;
      router.replace(newUrl);
    },
    [searchParams, router, pathname]
  );

  const currentGenres = typeParam === 'movie' ? MOVIE_GENRES : SERIES_GENRES;

  // Primary Data Fetching Effect with Candidate Pool Pre-fetching
  useEffect(() => {
    const reqId = ++fetchReqId.current;
    let isCancelled = false;

    const loadData = async () => {
      setLoading(true);
      setHasMore(true);

      // Case 1: Search query active
      if (qParam.trim()) {
        const results = await searchCinemeta(qParam.trim(), typeParam);
        if (!isCancelled && reqId === fetchReqId.current) {
          setRawMovies(results);
          setHasMore(false);
          setLoading(false);
        }
        return;
      }

      // Case 2: Custom sorting active -> Pre-fetch candidate pool up to 50 items
      if (sortParam !== 'popularity') {
        let pool: MetaItem[] = [];
        const existingIds = new Set<string>();
        let currentSkip = 0;
        let canFetchMore = true;

        while (pool.length < 50 && canFetchMore && !isCancelled) {
          const batch = await getCatalog(typeParam, genreParam, currentSkip);
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
      const initialBatch = await getCatalog(typeParam, genreParam, 0);
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
  }, [typeParam, genreParam, qParam, sortParam]);

  // Infinite Scroll Pagination Handler
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || qParam) return;
    setLoadingMore(true);

    const nextSkip = rawMovies.length;
    const batch = await getCatalog(typeParam, genreParam, nextSkip);

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
  }, [loading, loadingMore, hasMore, qParam, rawMovies.length, typeParam, genreParam]);

  // Intersection Observer setup for Infinite Scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && hasMore && !qParam) {
          loadMore();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, qParam, loadMore]);

  // Derived Filtered & Sorted Movie List
  const displayedMovies = useMemo(() => {
    const filtered = filterCatalogItems(rawMovies, {
      type: typeParam,
      genre: qParam ? undefined : genreParam,
      searchQuery: undefined,
    });
    return sortCatalogItems(filtered, sortParam);
  }, [rawMovies, typeParam, genreParam, qParam, sortParam]);

  // UI Change Handlers
  const handleTypeChange = (newType: 'movie' | 'series') => {
    updateUrlParams({ type: newType, genre: undefined });
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

  const headerTitle = qParam
    ? (loading ? `${t('catalog.searching')} "${qParam}"...` : `${t('catalog.search_results')} "${qParam}"`)
    : `${genreParam === 'top' ? t('catalog.popular') : (t(`genre.${genreParam}`) || genreParam)} ${typeParam === 'movie' ? t('catalog.movies').toLowerCase() : t('catalog.series').toLowerCase()}`;

  return (
    <div className="fade-in">
      <CatalogHeader type={typeParam} onTypeChange={handleTypeChange} />

      <FilterBar
        currentGenre={genreParam}
        genres={currentGenres}
        searchQuery={qParam}
        onGenreChange={handleGenreChange}
        onSearchSubmit={handleSearchSubmit}
        type={typeParam}
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
          {loading && qParam && <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>}
          {headerTitle}
        </h2>

        <SortDropdown currentSort={sortParam} onSortChange={handleSortChange} />
      </div>

      <MovieGrid movies={displayedMovies} defaultType={typeParam} loading={loading} />

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
  const [view, setView] = useState<{ type: 'catalog' | 'settings' | 'movie'; mediaType?: string; id?: string }>({ type: 'catalog' });
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    function updateView() {
      if (typeof window === 'undefined') return;

      let path = pathname || window.location.pathname;
      const search = searchParams ? searchParams.toString() : window.location.search;
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const sp = new URLSearchParams(search);

      // GitHub Pages 404 Redirect Handler (?p=movie/...)
      const redirectPath = sp.get('p');
      let effectivePath = path;
      if (redirectPath) {
        const decodedPath = redirectPath.replace(/~and~/g, '&');
        effectivePath = '/' + decodedPath;

        // Clean the ?p=... parameter from browser history so clicking <Link href="/"> works cleanly
        sp.delete('p');
        const cleanSearch = sp.toString();
        const basePath = window.location.pathname.replace(/\/?$/, '');
        const cleanUrl = (basePath || '') + (cleanSearch ? `?${cleanSearch}` : '') + hash;
        window.history.replaceState(null, '', cleanUrl || '/');
      }

      if (effectivePath.includes('/settings') || hash.includes('settings') || sp.get('page') === 'settings') {
        setView({ type: 'settings' });
        return;
      }

      const movieMatch = effectivePath.match(/\/movie\/([^/]+)\/([^/]+)/) || hash.match(/movie\/([^/]+)\/([^/]+)/);
      if (movieMatch) {
        setView({ type: 'movie', mediaType: movieMatch[1], id: movieMatch[2] });
        return;
      }

      const idParam = sp.get('id');
      if (idParam) {
        setView({ type: 'movie', mediaType: sp.get('type') || 'movie', id: idParam });
        return;
      }

      setView({ type: 'catalog' });
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
