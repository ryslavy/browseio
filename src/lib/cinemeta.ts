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
  genres?: string[];
  poster?: string;
  background?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  videos?: Episode[];
}

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
    const res = await fetch(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`);
    const data = await res.json();
    return data.metas || [];
  } catch (error) {
    console.error('Error searching:', error);
    return [];
  }
}

export async function getMetaDetails(type: string, id: string): Promise<MetaItem | null> {
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`);
    const data = await res.json();
    return data.meta || null;
  } catch (error) {
    console.error('Error fetching meta details:', error);
    return null;
  }
}
