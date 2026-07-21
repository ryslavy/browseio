import type { MetaItem } from './cinemeta.ts';

export type SortMode =
  | 'popularity'
  | 'rating_desc'
  | 'rating_asc'
  | 'release_desc'
  | 'release_asc'
  | 'title_asc'
  | 'title_desc';

export interface FilterOptions {
  type?: 'movie' | 'series';
  genre?: string;
  searchQuery?: string;
}

/**
 * Safely parses IMDb rating string into a numeric value.
 * Handles strings like "9.3", "7.5/10", "N/A", undefined, empty strings.
 */
export function parseImdbRating(rating?: string): number {
  if (!rating || typeof rating !== 'string') return 0;
  const match = rating.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  return isNaN(val) ? 0 : val;
}

/**
 * Safely parses release year from strings like "1994", "2008-2013", "2020-", undefined, "N/A".
 * Extracts the primary 4-digit start year.
 */
export function parseReleaseYear(releaseInfo?: string): number {
  if (!releaseInfo || typeof releaseInfo !== 'string') return 0;
  const match = releaseInfo.match(/\b(19|20)\d{2}\b/) || releaseInfo.match(/\b\d{4}\b/);
  if (!match) return 0;
  const year = parseInt(match[0], 10);
  return isNaN(year) ? 0 : year;
}

/**
 * Filters a catalog of MetaItem objects according to provided options.
 */
export function filterCatalogItems(items: MetaItem[], options: FilterOptions): MetaItem[] {
  if (!items || !Array.isArray(items)) return [];

  return items.filter(item => {
    // Media type filter
    if (options.type && item.type !== options.type) {
      return false;
    }

    // Genre filter (ignore 'top' as category default)
    if (options.genre && options.genre.toLowerCase() !== 'top') {
      const targetGenre = options.genre.toLowerCase();
      const itemGenres = item.genres?.map(g => g.toLowerCase()) || [];
      if (!itemGenres.some(g => g === targetGenre || g.includes(targetGenre))) {
        return false;
      }
    }

    // Search query filter
    if (options.searchQuery && options.searchQuery.trim() !== '') {
      const q = options.searchQuery.trim().toLowerCase();
      const nameMatch = item.name?.toLowerCase().includes(q);
      const descMatch = item.description?.toLowerCase().includes(q);
      if (!nameMatch && !descMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sorts catalog items according to the requested SortMode.
 * Returns a new array, preserving immutability of the source list.
 */
export function sortCatalogItems(items: MetaItem[], sortMode: SortMode): MetaItem[] {
  if (!items || !Array.isArray(items)) return [];

  const copy = [...items];

  switch (sortMode) {
    case 'rating_desc':
      return copy.sort((a, b) => parseImdbRating(b.imdbRating) - parseImdbRating(a.imdbRating));

    case 'rating_asc':
      return copy.sort((a, b) => parseImdbRating(a.imdbRating) - parseImdbRating(b.imdbRating));

    case 'release_desc':
      return copy.sort((a, b) => parseReleaseYear(b.releaseInfo) - parseReleaseYear(a.releaseInfo));

    case 'release_asc':
      return copy.sort((a, b) => parseReleaseYear(a.releaseInfo) - parseReleaseYear(b.releaseInfo));

    case 'title_asc':
      return copy.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

    case 'title_desc':
      return copy.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base' }));

    case 'popularity':
    default:
      return copy;
  }
}
