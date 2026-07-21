/* eslint-disable @typescript-eslint/no-explicit-any */
const HELLSPY_API_BASE = 'https://api.hellspy.to';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_RESULTS = 20;

function log(message: string) {
  if (typeof console !== 'undefined' && console.log) {
    console.log('[Hellspy] ' + message);
  }
}

function warn(message: string) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[Hellspy] ' + message);
  } else {
    log(message);
  }
}

function getSafeFetch() {
  if (typeof fetch === 'function') return fetch;
  if (typeof globalThis !== 'undefined' && globalThis.fetch) return globalThis.fetch;
  throw new Error('fetch API is not available in this runtime');
}

function formatBytes(bytes: number) {
  if (!bytes) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return bytes.toFixed(2) + ' ' + units[i];
}

function formatDuration(seconds: number) {
  if (!seconds) return '';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: (string | number)[] = [];
  if (hrs > 0) parts.push(hrs);
  parts.push(String(mins).padStart(2, '0'));
  parts.push(String(secs).padStart(2, '0'));
  return parts.join(':');
}

function cleanText(text: string) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
      const cinemetaType = type === 'tv' ? 'series' : 'movie';
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
              if (alt.iso_3166_1 === 'CZ' || alt.iso_3166_1 === 'SK') {
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
          if (alt.iso_3166_1 === 'CZ' || alt.iso_3166_1 === 'SK') {
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

export function buildSearchQueries(mediaInfo: MediaInfo, mediaType?: string, seasonNum?: number | string, episodeNum?: number | string): string[] {
  const queries: string[] = [];
  const titleVariants = [mediaInfo.title, mediaInfo.originalTitle].concat(mediaInfo.altTitles || []);

  const dedupedVariants: { full: string; short: string }[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < titleVariants.length; i++) {
    const v = titleVariants[i];
    if (!v) continue;
    const norm = cleanText(v);
    if (!seen[norm]) {
      seen[norm] = true;
      dedupedVariants.push({
        full: v.trim(),
        short: v.replace(/[:\-–—,\.]/g, ' ').replace(/\s+/g, ' ').trim()
      });
    }
  }

  function addQuery(list: string[], q: string) {
    if (!q) return;
    const clean = q.trim();
    if (clean.length > 0 && list.indexOf(clean) === -1) {
      list.push(clean);
    }
  }

  if (mediaType === 'movie') {
    for (let j = 0; j < dedupedVariants.length; j++) {
      const item = dedupedVariants[j];
      if (mediaInfo.year) {
        addQuery(queries, item.full + ' ' + mediaInfo.year);
        addQuery(queries, item.short + ' ' + mediaInfo.year);
      }
      addQuery(queries, item.full);
      addQuery(queries, item.short);
    }
  } else {
    const sPad = String(seasonNum || 1).padStart(2, '0');
    const ePad = String(episodeNum || 1).padStart(2, '0');

    for (let d = 0; d < dedupedVariants.length; d++) {
      const tvItem = dedupedVariants[d];
      addQuery(queries, tvItem.full + ' S' + sPad + 'E' + ePad);
      addQuery(queries, tvItem.short + ' S' + sPad + 'E' + ePad);
      addQuery(queries, tvItem.full + ' ' + seasonNum + 'x' + ePad);
      addQuery(queries, tvItem.short + ' ' + seasonNum + 'x' + ePad);
    }
  }

  return queries;
}

export function matchesMedia(videoTitle: string, mediaInfo: MediaInfo, mediaType?: string, seasonNum?: number | string, episodeNum?: number | string): boolean {
  const tNorm = cleanText(videoTitle);
  const mainNorm = cleanText(mediaInfo.title);
  const origNorm = cleanText(mediaInfo.originalTitle);

  let hasNameMatch = false;
  const names = [mainNorm, origNorm];
  if (mediaInfo.altTitles) {
    for (let a = 0; a < mediaInfo.altTitles.length; a++) {
      names.push(cleanText(mediaInfo.altTitles[a]));
    }
  }

  for (let i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    if (tNorm.indexOf(names[i]) !== -1) {
      hasNameMatch = true;
      break;
    }
  }

  if (!hasNameMatch) return false;

  if (mediaType === 'movie') {
    if (mediaInfo.year) {
      const yearInTitle = videoTitle.match(/\b(19|20)\d{2}\b/);
      if (yearInTitle) {
        const titleYear = parseInt(yearInTitle[0], 10);
        if (Math.abs(titleYear - parseInt(mediaInfo.year, 10)) > 1) return false;
      }
    }
    return true;
  } else {
    const s = parseInt(String(seasonNum || 1), 10);
    const e = parseInt(String(episodeNum || 1), 10);

    const sPad = String(s).padStart(2, '0');
    const ePad = String(e).padStart(2, '0');

    const epPatterns = [
      new RegExp('s' + sPad + 'e' + ePad + '\\b', 'i'),
      new RegExp('\\b' + s + 'x' + ePad + '\\b', 'i'),
      new RegExp('\\bs' + sPad + 'e' + e + '\\b', 'i'),
      new RegExp('\\b' + s + 'x' + e + '\\b', 'i'),
      new RegExp('e' + ePad + '\\b', 'i')
    ];

    let matchEp = false;
    for (let p = 0; p < epPatterns.length; p++) {
      if (epPatterns[p].test(tNorm)) {
        matchEp = true;
        break;
      }
    }

    if (matchEp) return true;

    const seasonPatterns = [
      new RegExp('s' + sPad + '\\b', 'i'),
      new RegExp('\\b' + s + '\\.\\s*seri', 'i'),
      new RegExp('\\b' + s + '\\s*seri', 'i'),
      new RegExp('\\b' + s + '\\.\\s*rad', 'i'),
      new RegExp('\\b' + s + '\\s*rad', 'i')
    ];

    let matchSeason = false;
    for (let sp = 0; sp < seasonPatterns.length; sp++) {
      if (seasonPatterns[sp].test(tNorm)) {
        matchSeason = true;
        break;
      }
    }

    if (matchSeason) {
      const otherEpMatch = tNorm.match(/e(\d+)\b|(\d+)x(\d+)\b/i);
      if (otherEpMatch) {
        const matchedEpNum = otherEpMatch[1] ? parseInt(otherEpMatch[1], 10) : parseInt(otherEpMatch[3], 10);
        if (matchedEpNum !== e) {
          return false;
        }
      }
      return true;
    }

    return false;
  }
}

function getQualityFromTitle(title: string): string {
  const norm = title.toLowerCase();
  if (norm.indexOf('2160p') !== -1 || norm.indexOf('4k') !== -1 || norm.indexOf('uhd') !== -1) return '4K';
  if (norm.indexOf('1440p') !== -1) return '1440p';
  if (norm.indexOf('1080p') !== -1 || norm.indexOf('fhd') !== -1) return '1080p';
  if (norm.indexOf('720p') !== -1 || /\bhd\b/.test(norm)) return '720p';
  if (norm.indexOf('576p') !== -1) return '576p';
  if (norm.indexOf('480p') !== -1) return '480p';
  return 'Unknown';
}

async function searchHellspy(query: string): Promise<any[]> {
  const url = HELLSPY_API_BASE + '/gw/search?query=' + encodeURIComponent(query) + '&offset=0&limit=64';
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json'
  };
  const safeFetch = getSafeFetch();
  try {
    const res = await safeFetch(url, { headers });
    if (!res.ok) throw new Error('Search failed: ' + res.status);
    const data = await res.json();
    return data.items || [];
  } catch (err: any) {
    warn('Search error for query "' + query + '": ' + err.message);
    return [];
  }
}

async function fetchVideoDetails(id: string | number, fileHash: string): Promise<any> {
  const url = HELLSPY_API_BASE + '/gw/video/' + id + '/' + fileHash;
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Origin': 'https://hellspy.to',
    'Referer': 'https://hellspy.to/'
  };
  const safeFetch = getSafeFetch();
  try {
    const res = await safeFetch(url, { headers });
    if (!res.ok) throw new Error('Details failed: ' + res.status);
    return await res.json();
  } catch (err: any) {
    warn('Details error for ID ' + id + ': ' + err.message);
    return null;
  }
}

function detectLanguages(title: string, subtitlesFromApi: any[], originalTitle?: string) {
  const titleLower = title.toLowerCase();
  const origLower = (originalTitle || '').toLowerCase();
  const audio: string[] = [];
  const subs: string[] = [];

  const isCzechProd = origLower.length > 3 &&
    (titleLower === origLower) &&
    !/\b(en|eng|english)\b/i.test(origLower);

  const hasCzDab = /\b(cz[\s\.\-]*(dab|dub)|cesk[yý]\s+(dab|dub)|dabing[\s\.\-]*(cz|cesk[yý]))/i.test(titleLower);
  const hasSkDab = /\b(sk[\s\.\-]*(dab|dub)|slovensk[yý]\s+(dab|dub)|dabing[\s\.\-]*(sk|slovensk[yý]))/i.test(titleLower);

  const hasCzSub = /\b(cztit|cz[\s\-\.]*tit(ulky)?|cesk[eé][\s\.\-]*titulky|titulky[\s\.\-]*cz)\b/i.test(titleLower);
  const hasSkSub = /\b(sktit|sk[\s\-\.]*tit(ulky)?|slovensk[eé][\s\.\-]*titulky|titulky[\s\.\-]*sk)\b/i.test(titleLower);

  const hasCzTag = /\b(cz|cze|ces|cesky|česky)\b/i.test(titleLower);
  const hasSkTag = /\b(sk|slo|slov|slovensky|slovenský)\b/i.test(titleLower);
  const hasGenericSubTag = /\b(titulky|subtitles|subs)\b/i.test(titleLower) && !hasCzSub && !hasSkSub;

  if (hasCzDab) {
    audio.push('CZ');
  } else if (hasSkDab) {
    audio.push('SK');
  } else if (isCzechProd) {
    audio.push('CZ');
  } else {
    if (hasCzTag && !hasCzSub) audio.push('CZ');
    if (hasSkTag && !hasSkSub && audio.indexOf('SK') === -1) audio.push('SK');
  }
  if (audio.length === 0) audio.push('EN');

  if (subtitlesFromApi && subtitlesFromApi.length > 0) {
    for (let i = 0; i < subtitlesFromApi.length; i++) {
      const lang = (subtitlesFromApi[i].language || '').toLowerCase();
      let label: string;
      if (lang === 'cze' || lang === 'cs' || lang === 'cz') label = 'CZ';
      else if (lang === 'sk' || lang === 'slo') label = 'SK';
      else if (lang === 'eng' || lang === 'en') label = 'EN';
      else label = lang.substring(0, 2).toUpperCase();
      if (subs.indexOf(label) === -1) subs.push(label);
    }
  }

  if (hasCzSub && subs.indexOf('CZ') === -1) subs.push('CZ');
  if (hasSkSub && subs.indexOf('SK') === -1) subs.push('SK');
  if (hasGenericSubTag && hasCzTag && subs.indexOf('CZ') === -1) subs.push('CZ');
  if (hasGenericSubTag && hasSkTag && subs.indexOf('SK') === -1) subs.push('SK');

  return { audio: audio, subtitles: subs };
}

export async function getStreams(input: any, mediaType?: string, seasonNum?: number | string, episodeNum?: number | string): Promise<any[]> {
  try {
    const request = parseMediaRequest(input, mediaType, seasonNum, episodeNum);

    log('Fetching ' + request.mediaType
      + (request.tmdbId ? ' TMDB:' + request.tmdbId : '')
      + (request.title ? ' "' + request.title + '"' : '')
      + (request.season ? ' S' + request.season + 'E' + request.episode : ''));

    const mediaInfo = await resolveMediaInfo(request);
    if (!mediaInfo || !mediaInfo.title) {
      warn('No title or TMDB metadata available; cannot search.');
      return [];
    }

    const queries = buildSearchQueries(mediaInfo, request.mediaType, request.season, request.episode);
    log('Searching queries: ' + queries.join(' | '));

    const resultsArray = await Promise.all(queries.map(q => searchHellspy(q)));

    const allItems: any[] = [];
    const idMap: Record<string, boolean> = {};
    for (let i = 0; i < resultsArray.length; i++) {
      const items = resultsArray[i];
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        if (!idMap[item.id]) {
          idMap[item.id] = true;
          allItems.push(item);
        }
      }
    }

    const matchedItems = allItems.filter(video => {
      return matchesMedia(video.title, mediaInfo, request.mediaType, request.season, request.episode);
    });

    log('Found ' + allItems.length + ' videos, matches: ' + matchedItems.length);
    if (matchedItems.length === 0) return [];

    const limitItems = matchedItems.slice(0, MAX_RESULTS);
    const detailsList: any[] = [];
    for (let k = 0; k < limitItems.length; k++) {
      const details = await fetchVideoDetails(limitItems[k].id, limitItems[k].fileHash);
      if (details) {
        detailsList.push(details);
      }
    }

    const streams: any[] = [];
    for (let d = 0; d < detailsList.length; d++) {
      const details = detailsList[d];
      if (!details || !details.conversions) continue;

      let playUrl: string | null = null;
      let convQuality = 'SD';
      const titleQuality = getQualityFromTitle(details.title);

      const keys = Object.keys(details.conversions);
      let bestKey: string | null = null;
      if (keys.indexOf('0') !== -1) {
        bestKey = '0';
      } else if (keys.length > 0) {
        keys.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
        bestKey = keys[0];
      }

      if (bestKey !== null) {
        playUrl = details.conversions[bestKey];
        if (titleQuality !== 'Unknown') {
          convQuality = titleQuality;
        } else {
          if (bestKey === '0') {
            convQuality = getQualityFromTitle(details.title);
          } else if (bestKey === '1080') {
            convQuality = '1080p';
          } else if (bestKey === '720') {
            convQuality = '720p';
          } else if (bestKey === '480') {
            convQuality = '480p';
          } else {
            convQuality = 'SD';
          }
        }
      }

      if (!playUrl) continue;

      const sizeStr = formatBytes(details.size);
      const durationStr = formatDuration(details.duration);
      const displayTitle = details.title;

      let subList: any[] = [];
      if (details.subtitles && details.subtitles.length > 0) {
        subList = details.subtitles.map((sub: any) => ({
          url: sub.url,
          language: sub.language || 'cze',
          name: sub.title || sub.language || 'Subtitles'
        }));
      }

      const langs = detectLanguages(displayTitle, subList, mediaInfo.originalTitle);
      let langString = '';
      const langArr: string[] = [];
      if (langs.audio.length > 0) langArr.push('🔊 ' + langs.audio.join('/'));
      if (langs.subtitles.length > 0) langArr.push('💬 ' + langs.subtitles.join('/'));
      langString = langArr.join(' | ');

      let qIcon = convQuality;
      if (convQuality === '4K' || convQuality === '1440p') qIcon = '🌟 ' + convQuality;
      else if (convQuality === '1080p' || convQuality === '720p') qIcon = '🎞️ ' + convQuality;
      else if (convQuality !== 'Unknown') qIcon = '📺 ' + convQuality;
      else qIcon = '📺 SD';

      const infoLines = [
        '🎬 Hellspy | 💾 ' + sizeStr,
        qIcon + (durationStr ? ' / ' + durationStr : ''),
        langString
      ].filter(Boolean);

      const name = '🇨🇿 Hellspy | ' + qIcon + (langArr.length > 0 ? ' | ' + langArr[0] : '');
      const title = displayTitle + '\n' + infoLines.join('\n');

      streams.push({
        name: name,
        title: title,
        size: title,
        description: title,
        url: playUrl,
        subtitles: subList,
        behaviorHints: {
          filename: details.filename || displayTitle,
          videoSize: details.size
        },
        _sortQuality: convQuality,
        _sortSizeBytes: details.size || 0
      });
    }

    streams.sort((a, b) => {
      const qualityOrder: Record<string, number> = { '4K': 6, '1440p': 5, '1080p': 4, '720p': 3, '576p': 2, '480p': 1, 'SD': 0, 'Unknown': 0 };
      const qualityDiff = (qualityOrder[b._sortQuality] || 0) - (qualityOrder[a._sortQuality] || 0);
      if (qualityDiff !== 0) return qualityDiff;
      return (b._sortSizeBytes || 0) - (a._sortSizeBytes || 0);
    });

    log('Returning ' + streams.length + ' direct streams');
    return streams.map((stream, index) => {
      const num = index + 1;
      const prefix = (num < 10 ? '0' + num : num) + '. ';
      return {
        name: prefix + stream.name,
        title: stream.title,
        size: stream.size,
        description: stream.description,
        url: stream.url,
        subtitles: stream.subtitles,
        behaviorHints: stream.behaviorHints
      };
    });
  } catch (error: any) {
    warn('Error: ' + error.message);
    return [];
  }
}

export async function onSettings() {
  return [];
}

const api = {
  getStreams,
  onSettings,
  search: getStreams,
  buildSearchQueries,
  matchesMedia
};

export default api;
