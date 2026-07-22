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
    return data.metas || [];
  } catch (error) {
    console.error('Error fetching catalog:', error);
    return [];
  }
}

export async function searchCinemeta(query: string, type: 'movie' | 'series' = 'movie'): Promise<MetaItem[]> {
  try {
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    
    // Fetch Cinemeta search + TMDB Czech search in parallel
    const [cinemetaRes, tmdbRes] = await Promise.allSettled([
      fetch(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_API_KEY}&language=cs-CZ&query=${encodeURIComponent(query)}`).then(r => r.json())
    ]);

    const cinemetaMetas: MetaItem[] = cinemetaRes.status === 'fulfilled' && cinemetaRes.value?.metas ? cinemetaRes.value.metas : [];
    const tmdbResults: any[] = tmdbRes.status === 'fulfilled' && tmdbRes.value?.results ? tmdbRes.value.results.slice(0, 5) : [];

    // Resolve IMDb IDs for top TMDB search results using in-memory cache
    const tmdbMetas: MetaItem[] = [];
    if (tmdbResults.length > 0) {
      const extIds = await Promise.allSettled(
        tmdbResults.map(item => {
          const cacheKey = `${tmdbType}_${item.id}`;
          if (extIdCache.has(cacheKey)) {
            return Promise.resolve({ imdb_id: extIdCache.get(cacheKey) });
          }
          return fetch(`https://api.themoviedb.org/3/${tmdbType}/${item.id}/external_ids?api_key=${TMDB_API_KEY}`)
            .then(r => r.json())
            .then(data => {
              const id = data?.imdb_id || null;
              extIdCache.set(cacheKey, id);
              return { imdb_id: id };
            });
        })
      );

      for (let i = 0; i < tmdbResults.length; i++) {
        const item = tmdbResults[i];
        const extRes = extIds[i];
        const imdbId = extRes.status === 'fulfilled' && extRes.value?.imdb_id ? extRes.value.imdb_id : null;
        
        if (imdbId) {
          const year = (item.release_date || item.first_air_date || '').split('-')[0];
          const czName = item.title || item.name;
          const origName = item.original_title || item.original_name;
          tmdbMetas.push({
            id: imdbId,
            type: type,
            name: czName || origName,
            czTitle: czName,
            originalTitle: origName,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
            background: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : undefined,
            description: item.overview || '',
            releaseInfo: year,
            imdbRating: item.vote_average ? String(item.vote_average.toFixed(1)) : undefined
          });
        }
      }
    }

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
    const isImdb = id.startsWith('tt');
    const tmdbUrl = isImdb
      ? `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=cs-CZ`
      : `https://api.themoviedb.org/3/${tmdbType}/${id}?api_key=${TMDB_API_KEY}&language=cs-CZ`;

    const [cinemetaRes, tmdbRes] = await Promise.allSettled([
      fetch(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`).then(r => r.json()),
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
      if (czTitle || originalTitle) {
        return {
          id: id,
          type: type,
          name: czTitle || originalTitle || id,
          czTitle: czTitle,
          originalTitle: originalTitle
        };
      }
      return null;
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
