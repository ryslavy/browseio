import { getCurrentLanguage } from '@/lib/i18n';

export interface Episode {
  id: string; // e.g., "tt123456:1:1"
  title: string;
  season: number;
  episode: number;
  released?: string;
  thumbnail?: string;
}

export interface MetaItem {
  id: string;
  type: string;
  name: string;
  czTitle?: string;
  originalTitle?: string;
  genres?: string[];
  poster?: string;
  background?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  videos?: Episode[];
}

const TMDB_API_KEY = '4219e299c89411838049ab0dab19ebd5';
const extIdCache = new Map<string, string | null>();

export async function getCatalog(type: 'movie' | 'series', category: string = 'top', skip: number = 0): Promise<MetaItem[]> {
  try {
    const extras: string[] = [];
    if (category && category !== 'top') {
      extras.push(`genre=${encodeURIComponent(category)}`);
    }
    if (skip > 0) {
      extras.push(`skip=${skip}`);
    }

    const extraPath = extras.length > 0 ? `/${extras.join('&')}` : '';
    const url = `https://v3-cinemeta.strem.io/catalog/${type}/top${extraPath}.json`;

    const res = await fetch(url);
    const data = await res.json();
    const metas: MetaItem[] = data.metas || [];

    const lang = getCurrentLanguage();
    if (lang === 'cs' && metas.length > 0) {
      const enriched = await Promise.all(
        metas.map(async (item) => {
          if (!item.id || !item.id.startsWith('tt')) return item;
          try {
            const tmdbType = type === 'series' ? 'tv' : 'movie';
            const tmdbUrl = `https://api.themoviedb.org/3/find/${item.id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=cs-CZ`;
            const tmdbRes = await fetch(tmdbUrl).then(r => r.json());
            const matchedObj = (tmdbRes.movie_results && tmdbRes.movie_results[0]) || (tmdbRes.tv_results && tmdbRes.tv_results[0]);
            if (matchedObj) {
              const czTitle = matchedObj.title || matchedObj.name;
              const origTitle = matchedObj.original_title || matchedObj.original_name;
              return {
                ...item,
                czTitle: czTitle || item.czTitle,
                originalTitle: origTitle || item.name,
              };
            }
          } catch {
            // Silently fallback to original item
          }
          return item;
        })
      );
      return enriched;
    }

    return metas;
  } catch (error) {
    console.error('Error fetching catalog:', error);
    return [];
  }
}

export async function searchCinemeta(query: string, type: 'movie' | 'series' = 'movie'): Promise<MetaItem[]> {
  try {
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    const lang = getCurrentLanguage();
    const tmdbLang = lang === 'cs' ? 'cs-CZ' : 'en-US';
    
    // Single parallel round-trip for Cinemeta search + TMDB search
    const [cinemetaRes, tmdbRes] = await Promise.allSettled([
      fetch(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_API_KEY}&language=${tmdbLang}&query=${encodeURIComponent(query)}`).then(r => r.json())
    ]);

    const cinemetaMetas: MetaItem[] = cinemetaRes.status === 'fulfilled' && cinemetaRes.value?.metas ? cinemetaRes.value.metas : [];
    const tmdbResults: any[] = tmdbRes.status === 'fulfilled' && tmdbRes.value?.results ? tmdbRes.value.results.slice(0, 10) : [];

    // Map TMDB search results instantly without secondary network calls
    const tmdbMetas: MetaItem[] = tmdbResults.map(item => {
      const year = (item.release_date || item.first_air_date || '').split('-')[0];
      const czName = item.title || item.name;
      const origName = item.original_title || item.original_name;

      // Try to find matching IMDb ID from cinemetaMetas if available
      const cinemetaMatch = cinemetaMetas.find(cm => 
        cm.name?.toLowerCase() === czName?.toLowerCase() || 
        cm.name?.toLowerCase() === origName?.toLowerCase()
      );

      return {
        id: cinemetaMatch ? cinemetaMatch.id : `tmdb_${item.id}`,
        type: type,
        name: czName || origName,
        czTitle: czName,
        originalTitle: origName,
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
        background: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : undefined,
        description: item.overview || '',
        releaseInfo: year,
        imdbRating: item.vote_average ? String(item.vote_average.toFixed(1)) : undefined
      };
    });

    // Merge TMDB metas (Czech search matches) first, then Cinemeta search results, avoiding duplicates
    const seenIds = new Set<string>();
    const mergedMetas: MetaItem[] = [];

    for (const item of tmdbMetas) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        mergedMetas.push(item);
      }
    }

    for (const item of cinemetaMetas) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        mergedMetas.push(item);
      }
    }

    return mergedMetas;
  } catch (error) {
    console.error('Error searching:', error);
    return [];
  }
}

export async function getMetaDetails(type: string, id: string): Promise<MetaItem | null> {
  try {
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    let realId = id;

    // If ID is tmdb_12345, resolve the IMDb ID first
    if (id.startsWith('tmdb_')) {
      const numericId = id.replace('tmdb_', '');
      try {
        const extRes = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${numericId}/external_ids?api_key=${TMDB_API_KEY}`).then(r => r.json());
        if (extRes?.imdb_id) {
          realId = extRes.imdb_id;
        }
      } catch (e) {
        console.error('Failed to resolve TMDB external ID:', e);
      }
    }

    const isImdb = realId.startsWith('tt');
    const tmdbUrl = isImdb
      ? `https://api.themoviedb.org/3/find/${realId}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=cs-CZ`
      : `https://api.themoviedb.org/3/${tmdbType}/${realId}?api_key=${TMDB_API_KEY}&language=cs-CZ`;

    const [cinemetaRes, tmdbRes] = await Promise.allSettled([
      fetch(`https://v3-cinemeta.strem.io/meta/${type}/${realId}.json`).then(r => r.json()),
      fetch(tmdbUrl).then(r => r.json())
    ]);

    const meta: MetaItem | null = cinemetaRes.status === 'fulfilled' ? cinemetaRes.value?.meta || null : null;
    
    let czTitle: string | undefined;
    let originalTitle: string | undefined;

    if (tmdbRes.status === 'fulfilled' && tmdbRes.value) {
      const tmdbData = tmdbRes.value;
      let matchedObj = tmdbData;
      if (isImdb) {
        matchedObj = (tmdbData.movie_results && tmdbData.movie_results[0]) || (tmdbData.tv_results && tmdbData.tv_results[0]) || null;
      }
      if (matchedObj) {
        czTitle = matchedObj.title || matchedObj.name;
        originalTitle = matchedObj.original_title || matchedObj.original_name;
      }
    }

    if (!meta) {
      return {
        id: realId,
        type: type,
        name: czTitle || originalTitle || realId,
        czTitle: czTitle,
        originalTitle: originalTitle
      };
    }

    return {
      ...meta,
      czTitle: czTitle || meta.czTitle,
      originalTitle: originalTitle || meta.originalTitle || meta.name
    };
  } catch (error) {
    console.error('Error fetching meta details:', error);
    return null;
  }
}
