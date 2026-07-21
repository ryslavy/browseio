/* eslint-disable @typescript-eslint/no-explicit-any */
function log(msg: string) {
  if (typeof console !== 'undefined' && console.log) {
    console.log('[SKTonline] ' + msg);
  }
}

function warn(msg: string) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[SKTonline] ' + msg);
  }
}

function getSafeFetch() {
  if (typeof fetch === 'function') return fetch;
  if (typeof globalThis !== 'undefined' && globalThis.fetch) return globalThis.fetch;
  throw new Error('fetch API is not available in this runtime');
}

function sleepSync(ms: number) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait
  }
}

function getProxiedUrl(url: string) {
  if (typeof window !== 'undefined') {
    return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
  }
  return url;
}

function pad(num: number | string, size: number) {
  let s = num + '';
  while (s.length < size) s = '0' + s;
  return s;
}

function detectLanguages(title: string, subtitles?: any[], originalTitle?: string) {
  const titleLower = title.toLowerCase();
  const origLower = (originalTitle || '').toLowerCase();
  const audio: string[] = [];
  const tit: string[] = [];

  const isCzechProd = (titleLower === origLower) && origLower.length > 3 && !/\b(en|eng|english)\b/i.test(titleLower);

  const hasCzDab = /\b(cz[\s.\-]*(dab|dub)|(česk[ýé]|cesk[ye])[\s.]+(dab|dub)|dabing[\s.]+(cz|česk[ýé]|cesk[ye]))/i.test(titleLower);
  const hasSkDab = /\b(sk[\s.\-]*(dab|dub)|(slovensk[ýé]|slovensk[ye])[\s.]+(dab|dub)|dabing[\s.]+(sk|slovensk[ýé]|slovensk[ye]))/i.test(titleLower);
  const hasCzTag = /\b(cz|cze|ces|cesky|česky|ceske|české)\b/i.test(titleLower);
  const hasSkTag = /\b(sk|sl|slo|slov|slovensky|slovenský)\b/i.test(titleLower);
  const hasSubTag = /\b(titulky|tit|cztit|sktit|subtitles|subs|cz-tit|sk-tit)\b/i.test(titleLower);

  if (hasCzDab) audio.push('CZ');
  else if (hasSkDab) audio.push('SK');
  else if (isCzechProd) audio.push('CZ');
  else {
    if (hasCzTag) {
      if (!hasSubTag || /\bcz\s*dab\b/i.test(titleLower)) audio.push('CZ');
    }
    if (hasSkTag) {
      if (!hasSubTag || /\bsk\s*dab\b/i.test(titleLower)) audio.push('SK');
    }
  }

  if (audio.length === 0) {
    audio.push('EN');
  }

  if (subtitles && subtitles.length > 0) {
    for (let i = 0; i < subtitles.length; i++) {
      const lang = (subtitles[i].language || '').toLowerCase();
      let label = lang;
      if (lang === 'cze' || lang === 'cz') label = 'CZ';
      else if (lang === 'sk' || lang === 'slo') label = 'SK';
      else if (lang === 'eng' || lang === 'en') label = 'EN';
      else label = lang.substring(0, 2).toUpperCase();
      if (tit.indexOf(label) === -1) tit.push(label);
    }
  }

  if (hasSubTag) {
    if (tit.indexOf('CZ') === -1 && /\b(cz|cze|cesky|česky|cztit|cz-tit)\b/i.test(titleLower)) tit.push('CZ');
    if (tit.indexOf('SK') === -1 && /\b(sk|slo|slovensky|slovenský|sktit|sk-tit)\b/i.test(titleLower)) tit.push('SK');
    if (tit.indexOf('EN') === -1 && /\b(en|eng|english|sub|subs|subtitles)\b/i.test(titleLower) && titleLower.indexOf('cztit') === -1) tit.push('EN');
  }

  return { audio: audio, subtitles: tit };
}

function formatStream(label: string, titleText: string, originalTitle?: string | null) {
  const quality = /1080p/i.test(label) ? '1080p' :
    /720p|HD/i.test(label) ? '720p' :
      /480p|SD/i.test(label) ? '480p' :
        /360p|LD/i.test(label) ? '360p' : 'SD';

  let qIcon = quality;
  if (quality === '1080p' || quality === '720p') qIcon = '🎞️ ' + quality;
  else qIcon = '📺 ' + quality;

  const langs = detectLanguages(titleText, [], originalTitle || undefined);
  const langArr: string[] = [];
  if (langs.audio.length > 0) langArr.push('🔊 ' + langs.audio.join('/'));
  if (langs.subtitles.length > 0) langArr.push('💬 ' + langs.subtitles.join('/'));
  const langString = langArr.join(' | ');

  const infoLines = [
    '🎬 SkT Online | 🕒 Online Stream',
    qIcon + ' / MP4',
    langString
  ].filter(Boolean);

  const name = '🇸🇰 SkT Online | ' + qIcon + (langArr.length > 0 ? ' | ' + langArr[0] : '');
  const title = titleText + '\n' + infoLines.join('\n');

  return { name: name, title: title };
}

function decodeHtml(text: string) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

export interface MediaRequest {
  tmdbId?: string | number;
  mediaType?: string;
  season?: number | string;
  episode?: number | string;
  title?: string;
  originalTitle?: string;
  year?: string | number;
  altTitles?: string[];
  [key: string]: any;
}

export interface MediaInfo {
  title: string;
  originalTitle: string;
  year: string;
  altTitles: string[];
}

export async function resolveMediaInfo(request: MediaRequest): Promise<MediaInfo | null> {
  if (request.title) {
    return {
      title: request.title,
      originalTitle: request.originalTitle || request.title,
      year: request.year ? String(request.year) : '',
      altTitles: request.altTitles || []
    };
  }
  if (!request.tmdbId) {
    warn('No tmdbId or title provided to resolveMediaInfo.');
    return null;
  }

  const tmdbApiKey = (typeof globalThis !== 'undefined' && (globalThis as any).TMDB_API_KEY) ||
    '4219e299c89411838049ab0dab19ebd5';

  const type = (request.mediaType === 'tv' || request.mediaType === 'series') ? 'tv' : 'movie';
  const isImdb = String(request.tmdbId).startsWith('tt');
  const safeFetch = getSafeFetch();

  try {
    if (isImdb) {
      const cinemetaType = (request.mediaType === 'tv' || request.mediaType === 'series') ? 'series' : 'movie';
      const cinemetaUrl = 'https://v3-cinemeta.strem.io/meta/' + cinemetaType + '/' + request.tmdbId + '.json';
      log('Fetching metadata from Cinemeta: ' + cinemetaUrl);
      const res = await safeFetch(cinemetaUrl);
      if (!res.ok) throw new Error('Cinemeta HTTP ' + res.status);
      const data = await res.json();
      if (!data || !data.meta) throw new Error('Empty Cinemeta metadata');
      const meta = data.meta;
      const name = meta.name;
      const year = meta.year ? String(meta.year) : '';
      const tmdbId = meta.moviedb_id;

      if (tmdbId) {
        const tmdbUrl = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '?api_key=' + tmdbApiKey + '&language=cs-CZ&append_to_response=translations,alternative_titles';
        log('Fetching Czech translation from TMDB for ID: ' + tmdbId);
        const tmdbRes = await safeFetch(tmdbUrl);
        if (tmdbRes.ok) {
          const tmdbData = await tmdbRes.json();
          let czTitle = '';
          let skTitle = '';
          if (tmdbData.translations && tmdbData.translations.translations) {
            const trans = tmdbData.translations.translations;
            for (let i = 0; i < trans.length; i++) {
              const t = trans[i];
              if (t.data) {
                if (t.iso_639_1 === 'cs' && (t.data.title || t.data.name)) {
                  czTitle = t.data.title || t.data.name;
                } else if (t.iso_639_1 === 'sk' && (t.data.title || t.data.name)) {
                  skTitle = t.data.title || t.data.name;
                }
              }
            }
          }
          const finalTitle = czTitle || skTitle || tmdbData.title || tmdbData.name || name;
          const altTitles: string[] = [];
          if (tmdbData.alternative_titles && (tmdbData.alternative_titles.titles || tmdbData.alternative_titles.results)) {
            const list = tmdbData.alternative_titles.titles || tmdbData.alternative_titles.results;
            for (let j = 0; j < list.length; j++) {
              const alt = list[j];
              if (alt.iso_3166_1 === 'CZ' || alt.iso_3166_1 === 'SK' || alt.iso_3166_1 === 'US' || alt.iso_3166_1 === 'GB') {
                altTitles.push(alt.title);
              }
            }
          }
          let tmdbYear = '';
          if (tmdbData.release_date) tmdbYear = tmdbData.release_date.split('-')[0];
          else if (tmdbData.first_air_date) tmdbYear = tmdbData.first_air_date.split('-')[0];

          return {
            title: finalTitle,
            originalTitle: name,
            year: tmdbYear || year,
            altTitles: altTitles
          };
        }
      }
      return {
        title: name,
        originalTitle: name,
        year: year,
        altTitles: []
      };
    } else {
      const tmdbUrl = 'https://api.themoviedb.org/3/' + type + '/' + request.tmdbId + '?api_key=' + tmdbApiKey + '&language=cs-CZ&append_to_response=translations,alternative_titles';
      log('Fetching from TMDB for numeric ID: ' + request.tmdbId);
      const res = await safeFetch(tmdbUrl);
      if (!res.ok) throw new Error('TMDB HTTP ' + res.status);
      const data = await res.json();
      if (!data) return null;
      let title = data.title || data.name || data.original_title || data.original_name;
      const originalTitle = data.original_title || data.original_name || title;
      let year = '';
      if (data.release_date) {
        year = data.release_date.split('-')[0];
      } else if (data.first_air_date) {
        year = data.first_air_date.split('-')[0];
      }

      let czTitle = '';
      let skTitle = '';
      if (data.translations && data.translations.translations) {
        const trans = data.translations.translations;
        for (let i = 0; i < trans.length; i++) {
          const t = trans[i];
          if (t.data) {
            if (t.iso_639_1 === 'cs' && (t.data.title || t.data.name)) {
              czTitle = t.data.title || t.data.name;
            } else if (t.iso_639_1 === 'sk' && (t.data.title || t.data.name)) {
              skTitle = t.data.title || t.data.name;
            }
          }
        }
      }
      title = czTitle || skTitle || title;

      const altTitles: string[] = [];
      if (data.alternative_titles && (data.alternative_titles.titles || data.alternative_titles.results)) {
        const list = data.alternative_titles.titles || data.alternative_titles.results;
        for (let j = 0; j < list.length; j++) {
          const alt = list[j];
          if (alt.iso_3166_1 === 'CZ' || alt.iso_3166_1 === 'SK' || alt.iso_3166_1 === 'US' || alt.iso_3166_1 === 'GB') {
            altTitles.push(alt.title);
          }
        }
      }

      return {
        title: title,
        originalTitle: originalTitle,
        year: year,
        altTitles: altTitles
      };
    }
  } catch (error: any) {
    warn('Failed to resolve metadata: ' + error.message);
    return {
      title: request.title || 'Unknown',
      originalTitle: request.title || 'Unknown',
      year: '',
      altTitles: []
    };
  }
}

export function buildSearchQueries(meta: MediaInfo, request: MediaRequest): string[] {
  const queries: string[] = [];
  const cleanTitle = meta.title.replace(/\(.*?\)/g, '').replace(/[:\-–—,\.]/g, ' ').replace(/\s+/g, ' ').trim();
  const origTitle = meta.originalTitle.replace(/\(.*?\)/g, '').replace(/[:\-–—,\.]/g, ' ').replace(/\s+/g, ' ').trim();

  const titles = [cleanTitle];
  if (origTitle && origTitle !== cleanTitle) {
    titles.push(origTitle);
  }

  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    if ((request.mediaType === 'tv' || request.mediaType === 'series') && request.season && request.episode) {
      const epTag = 'S' + pad(request.season, 2) + 'E' + pad(request.episode, 2);
      queries.push(t + ' ' + epTag);
    } else {
      if (meta.year) {
        queries.push(t + ' ' + meta.year);
      } else {
        queries.push(t);
      }
    }
  }

  const uniqueQueries: string[] = [];
  for (let j = 0; j < queries.length; j++) {
    const q = queries[j].trim();
    if (q && uniqueQueries.indexOf(q) === -1) {
      uniqueQueries.push(q);
    }
  }
  return uniqueQueries;
}

async function searchOnlineVideos(query: string): Promise<string[]> {
  const url = 'https://online.sktorrent.eu/search/videos?search_query=' + encodeURIComponent(query);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity',
    'Range': 'bytes=0-'
  };

  log('Searching: ' + query);
  const safeFetch = getSafeFetch();
  try {
    const res = await safeFetch(getProxiedUrl(url), { headers });
    if (!res.ok) throw new Error('Search HTTP ' + res.status);
    const html = await res.text();
    if (!html) return [];
    const links: string[] = [];
    const linkRegex = /\/video\/(\d+)/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(html)) !== null) {
      const id = match[1];
      if (links.indexOf(id) === -1) {
        links.push(id);
      }
    }
    log('Found ' + links.length + ' video IDs for query: ' + query);
    return links;
  } catch (err: any) {
    warn('Search failed for "' + query + '": ' + err.message);
    return [];
  }
}

async function extractStreamsFromVideoId(videoId: string, meta?: MediaInfo | null): Promise<any[]> {
  const url = 'https://online.sktorrent.eu/video/' + videoId;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity',
    'Range': 'bytes=0-'
  };

  log('Extracting video detail: ' + videoId);
  const safeFetch = getSafeFetch();
  try {
    const res = await safeFetch(getProxiedUrl(url), { headers });
    if (!res.ok) throw new Error('Detail HTTP ' + res.status);
    const html = await res.text();
    if (!html) return [];

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let titleText = titleMatch ? decodeHtml(titleMatch[1].trim()) : 'Unknown';
    titleText = titleText.replace(/\s*-\s*SkTonline\s*/gi, '');

    const streams: any[] = [];

    const sourceRegex = /<source\s+([^>]*)/gi;
    let srcMatch: RegExpExecArray | null;
    while ((srcMatch = sourceRegex.exec(html)) !== null) {
      const attrs = srcMatch[1];
      const urlMatch = attrs.match(/src=["']([^"']+)["']/i);
      if (urlMatch) {
        let src = urlMatch[1];
        if (src.indexOf('.mp4') !== -1) {
          src = src.replace(/([^:])\/\/+/g, '$1/');
          const labelMatch = attrs.match(/label=["']([^"']+)["']/i);
          const label = labelMatch ? labelMatch[1] : 'Unknown';

          const formatted = formatStream(label, titleText, meta ? meta.originalTitle : null);

          streams.push({
            name: formatted.name,
            title: formatted.title,
            url: src,
            behaviorHints: {
              filename: titleText + '.mp4'
            }
          });
        }
      }
    }
    return streams;
  } catch (err: any) {
    warn('Detail extraction failed for ID ' + videoId + ': ' + err.message);
    return [];
  }
}

function parseMediaRequest(input: any, mediaType?: string, seasonNum?: number | string, episodeNum?: number | string): MediaRequest {
  let request: MediaRequest = {};
  if (input && typeof input === 'object') {
    request = { ...input };
  } else {
    request.tmdbId = input;
    request.mediaType = mediaType;
    request.season = seasonNum;
    request.episode = episodeNum;
  }
  return request;
}

export async function getStreams(input: any, mediaType?: string, season?: number | string, episode?: number | string): Promise<any[]> {
  try {
    const request = parseMediaRequest(input, mediaType, season, episode);
    const meta = await resolveMediaInfo(request);
    if (!meta) return [];
    const queries = buildSearchQueries(meta, request);
    const allStreams: any[] = [];

    for (let index = 0; index < queries.length; index++) {
      if (allStreams.length >= 15) break;
      const query = queries[index];
      if (index > 0) {
        sleepSync(500);
      }
      try {
        const videoIds = await searchOnlineVideos(query);
        if (videoIds.length === 0) continue;

        const streamsList: any[] = [];
        for (let dIndex = 0; dIndex < Math.min(videoIds.length, 6); dIndex++) {
          if (dIndex > 0) {
            sleepSync(500);
          }
          try {
            const resStreams = await extractStreamsFromVideoId(videoIds[dIndex], meta);
            for (let s = 0; s < resStreams.length; s++) {
              streamsList.push(resStreams[s]);
            }
          } catch {
            // Ignore details errors
          }
        }

        for (let k = 0; k < streamsList.length; k++) {
          allStreams.push(streamsList[k]);
        }
        if (allStreams.length > 0) {
          break;
        }
      } catch (err: any) {
        warn('Search step failed: ' + err.message);
      }
    }

    log('Returning ' + allStreams.length + ' streams to Nuvio.');
    return allStreams.map((stream, index) => {
      const num = index + 1;
      const prefix = (num < 10 ? '0' + num : num) + '. ';
      return {
        name: prefix + stream.name,
        title: stream.title,
        url: stream.url,
        behaviorHints: stream.behaviorHints
      };
    });
  } catch (err: any) {
    warn('getStreams crashed: ' + err.message);
    return [];
  }
}

const api = {
  getStreams
};

export default api;
