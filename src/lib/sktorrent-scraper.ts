/* eslint-disable @typescript-eslint/no-explicit-any */
const SKTORRENT_BASE = 'https://sktorrent.eu/torrent';
const SKTORRENT_TRACKER = 'http://ipv4announce.sktorrent.eu:6969/announce';

const ALL_CATEGORIES = [0];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MAX_PAGES = 1;
const MAX_RESULTS = 25;

function log(message: string) {
  if (typeof console !== 'undefined' && console.log) {
    console.log('[SkTorrent] ' + message);
  }
}

function warn(message: string) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[SkTorrent] ' + message);
  } else {
    log(message);
  }
}

function getSafeFetch() {
  if (typeof fetch === 'function') return fetch;
  if (typeof globalThis !== 'undefined' && globalThis.fetch) return globalThis.fetch;
  throw new Error('fetch API is not available in this runtime');
}

async function fetchText(url: string, cookie?: string | null) {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'cs,sk,en;q=0.8'
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  const safeFetch = getSafeFetch();
  const response = await safeFetch(url, { headers });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return await response.text();
}

function decodeHtml(text: string) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(html?: string | null) {
  return decodeHtml(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function normalizeText(text: string) {
  return decodeHtml(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toInt(value: any) {
  const number = parseInt(value, 10);
  return isNaN(number) ? null : number;
}

function firstValue(...args: any[]) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== undefined && args[i] !== null && args[i] !== '') {
      return args[i];
    }
  }
  return null;
}

function getQualityFromTitle(title: string) {
  const upper = String(title || '').toUpperCase();
  if (/\b(2160P|4K|UHD)\b/.test(upper)) return '4K';
  if (/\b(1440P|2K)\b/.test(upper)) return '1440p';
  if (/\b(1080P|FHD|FULLHD)\b/.test(upper)) return '1080p';
  if (/\b(720P|HDTV|WEBRIP|WEB-DL|HD)\b/.test(upper)) return '720p';
  if (/\b(576P|DVDRIP|DVD)\b/.test(upper)) return '576p';
  if (/\b480P\b/.test(upper)) return '480p';
  if (/\b(CAM|TS|HDCAM)\b/.test(upper)) return 'CAM';
  return 'Unknown';
}

function getSourceFromTitle(title: string) {
  const upper = String(title || '').toUpperCase();
  if (/\b(WEB-DL|WEBDL)\b/.test(upper)) return 'WEB-DL';
  if (/\b(WEBRIP|WEB-RIP)\b/.test(upper)) return 'WEBRip';
  if (/\b(BLURAY|BDRIP|BRRIP|BDREMUX|REMUX)\b/.test(upper)) return 'BluRay';
  if (/\b(HDTV)\b/.test(upper)) return 'HDTV';
  if (/\b(DVDRIP|DVD)\b/.test(upper)) return 'DVD';
  if (/\b(CAM|TS|HDCAM)\b/.test(upper)) return 'CAM';
  return null;
}

function getCodecFromTitle(title: string) {
  const upper = String(title || '').toUpperCase();
  if (/\b(HEVC|H265|H\.265|X265)\b/.test(upper)) return 'HEVC';
  if (/\b(H264|H\.264|X264|AVC)\b/.test(upper)) return 'H.264';
  if (/\b(AV1)\b/.test(upper)) return 'AV1';
  if (/\b(XVID|DIVX)\b/.test(upper)) return 'Xvid';
  return null;
}

function getHdrFromTitle(title: string) {
  const upper = String(title || '').toUpperCase();
  if (/\b(DOLBY\s*VISION|DV)\b/.test(upper)) return 'DV';
  if (/\bHDR10\+?\b/.test(upper)) return upper.indexOf('HDR10+') !== -1 ? 'HDR10+' : 'HDR10';
  if (/\bHDR\b/.test(upper)) return 'HDR';
  return null;
}

function parseSizeBytes(size: string) {
  const match = String(size || '').match(/(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|kb|b)\b/i);
  if (!match) return 0;

  const value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  if (unit === 'tb') return value * 1024 * 1024 * 1024 * 1024;
  if (unit === 'gb') return value * 1024 * 1024 * 1024;
  if (unit === 'mb') return value * 1024 * 1024;
  if (unit === 'kb') return value * 1024;
  return value;
}

function extractLanguages(block: string, title: string) {
  const languages: string[] = [];
  const seen: Record<string, boolean> = {};

  function add(lang: string) {
    const l = String(lang || '').toUpperCase();
    if (l && !seen[l]) {
      seen[l] = true;
      languages.push(l);
    }
  }

  const flagRegex = /\/flag\/([a-z]{2})\.png/ig;
  let flagMatch: RegExpExecArray | null;
  while ((flagMatch = flagRegex.exec(block)) !== null) {
    if (flagMatch[1] === 'gb') add('EN');
    else add(flagMatch[1]);
  }

  const titleLangMatch = String(title || '').match(/\(([A-Z]{2}(?:\/[A-Z]{2}){0,5})\)/g);
  if (titleLangMatch) {
    for (let i = 0; i < titleLangMatch.length; i++) {
      titleLangMatch[i].replace(/[()]/g, '').split('/').forEach(add);
    }
  }

  return languages;
}

function cleanTorrentTitle(title: string, categoryName?: string | null) {
  let cleaned = decodeHtml(title)
    .replace(/^Stiahni si\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (categoryName && cleaned.toLowerCase().indexOf(categoryName.toLowerCase()) === 0) {
    cleaned = cleaned.slice(categoryName.length).trim();
  }

  return cleaned;
}

function extractYear(text: string) {
  const match = String(text || '').match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

function buildMagnet(infoHash: string, displayName?: string) {
  const hash = String(infoHash || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(hash)) return null;

  return 'magnet:?xt=urn:btih:' + hash
    + '&dn=' + encodeURIComponent(displayName || 'SkTorrent')
    + '&tr=' + encodeURIComponent(SKTORRENT_TRACKER);
}

function buildTorrentSources() {
  return ['tracker:' + SKTORRENT_TRACKER];
}

export function parseTorrentBlocks(html: string) {
  const results: any[] = [];
  const cellRegex = /<td\b[^>]*class\s*=\s*["']?lista["']?[^>]*>([\s\S]*?)(?=<td\b[^>]*class\s*=\s*["']?lista["']?|<\/tr>|<\/table>|$)/ig;
  let match: RegExpExecArray | null;

  while ((match = cellRegex.exec(html)) !== null) {
    const block = match[1];
    const idMatch = block.match(/details\.php\?[^"\s>]*?id=([a-f0-9]{40})/i);
    if (!idMatch) continue;

    const detailAnchor = block.match(/<a\b[^>]*href\s*=\s*["']?details\.php[^>]*>([\s\S]*?)<\/a>/i);
    const titleAttr = detailAnchor && detailAnchor[0].match(/\btitle\s*=\s*["']([^"']+)["']/i);
    const categoryName = stripTags((block.match(/<a\b[^>]*href\s*=\s*["']?torrents_v2\.php\?category=\d+[^>]*>[\s\S]*?<b>([\s\S]*?)<\/b>/i) || [])[1]);
    let title = stripTags(detailAnchor && detailAnchor[1]);
    if (!title && titleAttr) title = titleAttr[1].replace(/^Stiahni si\s+/i, '');
    title = cleanTorrentTitle(title, categoryName);
    if (!title) continue;

    const sizeMatch = block.match(/Velkost\s+([^|<]+)/i);
    const addedMatch = block.match(/Pridany\s+([^<|]+)/i);
    const seedsMatch = block.match(/Odosielaju\s*:\s*(\d+)/i);
    const peersMatch = block.match(/Stahuju\s*:\s*(\d+)/i);
    const categoryMatch = block.match(/torrents_v2\.php\?category=(\d+)/i);
    const detailUrlMatch = block.match(/href\s*=\s*["']?(details\.php\?[^"\s>]+)/i);
    const size = sizeMatch ? decodeHtml(sizeMatch[1]).trim() : 'Unknown';

    results.push({
      infoHash: idMatch[1].toLowerCase(),
      title: title,
      size: size,
      sizeBytes: parseSizeBytes(size),
      seeds: seedsMatch ? parseInt(seedsMatch[1], 10) : 0,
      peers: peersMatch ? parseInt(peersMatch[1], 10) : 0,
      categoryId: categoryMatch ? parseInt(categoryMatch[1], 10) : null,
      categoryName: categoryName || null,
      added: addedMatch ? decodeHtml(addedMatch[1]).trim() : null,
      languages: extractLanguages(block, title),
      detailUrl: detailUrlMatch ? SKTORRENT_BASE + '/' + detailUrlMatch[1] : null,
      downloadUrl: SKTORRENT_BASE + '/download.php?id=' + idMatch[1].toLowerCase()
    });
  }

  return results;
}

function getSkTorrentCredentials(request: any) {
  const globalSettings = (typeof globalThis !== 'undefined' && (globalThis as any).SCRAPER_SETTINGS) || {};
  const uid = request.uid ||
    (request.settings && (request.settings.uid || request.settings.username || request.settings.user)) ||
    (request.config && (request.config.uid || request.config.user_id || request.config.username)) ||
    globalSettings.uid ||
    globalSettings.username ||
    globalSettings.user ||
    null;
  const pass = request.pass ||
    (request.settings && (request.settings.pass || request.settings.password)) ||
    (request.config && (request.config.pass || request.config.password)) ||
    globalSettings.pass ||
    globalSettings.password ||
    null;
  return { uid: uid, pass: pass };
}

function parseMediaRequest(input: any, mediaType?: any, seasonNum?: any, episodeNum?: any) {
  let request: any = {};

  if (input && typeof input === 'object') {
    request = { ...input };
  } else {
    request.tmdbId = input;
    request.mediaType = mediaType;
    request.season = seasonNum;
    request.episode = episodeNum;
  }

  if (mediaType && typeof mediaType === 'object') {
    request = Object.assign({}, mediaType, request);
  }

  let id = firstValue(request.tmdbId, request.tmdb_id, request.id, request.movieId, request.tvId);
  if (typeof id === 'string') {
    const isImdb = id.indexOf('tt') !== -1;
    if (isImdb) {
      const imdbMatch = id.match(/(?:imdb[:/])?(tt\d+)/i);
      if (imdbMatch) id = imdbMatch[1];
    } else {
      const tmdbMatch = id.match(/(?:tmdb[:/])?(\d+)/i);
      if (tmdbMatch) id = tmdbMatch[1];
    }
  }

  let type = String(firstValue(request.mediaType, request.type, request.kind, mediaType, 'movie')).toLowerCase();
  if (type === 'series' || type === 'show') type = 'tv';
  if (type !== 'tv') type = 'movie';

  const parsed = {
    tmdbId: id ? String(id) : null,
    mediaType: type,
    title: firstValue(request.title, request.name, request.movieTitle, request.showTitle),
    originalTitle: firstValue(request.originalTitle, request.original_title, request.originalName, request.original_name),
    year: toInt(firstValue(request.year, request.releaseYear)),
    season: toInt(firstValue(request.season, request.seasonNum, request.seasonNumber, seasonNum)),
    episode: toInt(firstValue(request.episode, request.episodeNum, request.episodeNumber, episodeNum))
  };

  return Object.assign({}, request, parsed);
}

export async function resolveMediaInfo(request: any) {
  if (request.title) {
    return request;
  }
  if (!request.tmdbId) {
    warn('No tmdbId or title provided to resolveMediaInfo.');
    return null;
  }

  const tmdbApiKey = (typeof globalThis !== 'undefined' && (globalThis as any).TMDB_API_KEY) ||
    '4219e299c89411838049ab0dab19ebd5';

  const type = request.mediaType === 'tv' ? 'tv' : 'movie';
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
      const year = meta.year ? parseInt(meta.year, 10) : null;
      const tmdbId = meta.moviedb_id;

      if (tmdbId) {
        const tmdbUrl = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '?api_key=' + tmdbApiKey + '&language=cs-CZ&append_to_response=translations,alternative_titles';
        log('Fetching Czech translation from TMDB for ID: ' + tmdbId);
        const tmdbRes = await safeFetch(tmdbUrl);
        if (tmdbRes.ok) {
          const tmdbData = await tmdbRes.json();
          let czTitle: string | null = null;
          let skTitle: string | null = null;
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
          czTitle = czTitle || skTitle || tmdbData.title || tmdbData.name || name;
          const resolved = {
            title: czTitle,
            originalTitle: name,
            year: year || (tmdbData.release_date || tmdbData.first_air_date ? parseInt((tmdbData.release_date || tmdbData.first_air_date).split('-')[0], 10) : null),
            tmdbId: tmdbId
          };
          log('Resolved metadata: "' + resolved.title + '" / "' + resolved.originalTitle + '" (' + resolved.year + ')');
          return resolved;
        }
      }
      const resolvedFallback = {
        title: name,
        originalTitle: name,
        year: year
      };
      log('Resolved metadata: "' + resolvedFallback.title + '" / "' + resolvedFallback.originalTitle + '" (' + resolvedFallback.year + ')');
      return resolvedFallback;
    } else {
      const tmdbUrl = 'https://api.themoviedb.org/3/' + type + '/' + request.tmdbId + '?api_key=' + tmdbApiKey + '&language=cs-CZ&append_to_response=translations,alternative_titles';
      log('Fetching from TMDB for numeric ID: ' + request.tmdbId);
      const res = await safeFetch(tmdbUrl);
      if (!res.ok) throw new Error('TMDB HTTP ' + res.status);
      const data = await res.json();
      if (!data) return null;
      let title = data.title || data.name || null;
      const originalTitle = data.original_title || data.original_name || title;
      const releaseDate = data.release_date || data.first_air_date || null;
      const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null;

      let czTitle: string | null = null;
      let skTitle: string | null = null;
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
      const resolved = {
        title: title,
        originalTitle: originalTitle,
        year: year,
        tmdbId: request.tmdbId
      };
      log('Resolved metadata: "' + resolved.title + '" / "' + resolved.originalTitle + '" (' + resolved.year + ')');
      return resolved;
    }
  } catch (error: any) {
    warn('Failed to resolve metadata: ' + error.message);
    return {
      title: request.title || 'Unknown',
      originalTitle: request.title || 'Unknown',
      year: ''
    };
  }
}

function addQuery(queries: string[], value: string) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (clean && queries.indexOf(clean) === -1) queries.push(clean);
}

function stripDiacritics(str: string) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function shortTitle(str: string, words?: number) {
  const w = words || 3;
  return stripDiacritics(str).split(/\s+/).slice(0, w).join(' ');
}

export function buildSearchQueries(mediaInfo: any, mediaType?: string, seasonNum?: number | string, episodeNum?: number | string): string[] {
  const queries: string[] = [];

  const titleSet: string[] = [];
  function addTitle(t: string) {
    const trimmed = String(t || '').trim();
    if (trimmed && titleSet.indexOf(trimmed) === -1) titleSet.push(trimmed);
  }
  addTitle(mediaInfo.title);
  addTitle(mediaInfo.originalTitle);
  const cleanOriginal = String(mediaInfo.originalTitle || '').replace(/[':]/g, '');
  addTitle(cleanOriginal);
  addTitle(stripDiacritics(mediaInfo.title));

  const variants: { short: string; full: string }[] = [];
  for (let i = 0; i < titleSet.length; i++) {
    const full = titleSet[i];
    const slashParts = full.split('/').map(p => p.trim()).filter(Boolean);
    const parts = slashParts.length > 1 ? slashParts : [full];
    for (let k = 0; k < parts.length; k++) {
      const part = parts[k];
      const sh = shortTitle(part, 3);
      variants.push({ short: sh, full: part });
    }
  }

  const seen: Record<string, boolean> = {};
  const dedupedVariants: { short: string; full: string }[] = [];
  for (let vi = 0; vi < variants.length; vi++) {
    const key = variants[vi].full;
    if (!seen[key]) { seen[key] = true; dedupedVariants.push(variants[vi]); }
  }

  if (mediaType === 'tv' && seasonNum && episodeNum) {
    const sPad = String(seasonNum).padStart(2, '0');
    const ePad = String(episodeNum).padStart(2, '0');

    for (let d = 0; d < dedupedVariants.length; d++) {
      addQuery(queries, dedupedVariants[d].full + ' S' + sPad + 'E' + ePad);
      addQuery(queries, dedupedVariants[d].full + ' ' + seasonNum + 'x' + ePad);
      addQuery(queries, dedupedVariants[d].short + ' S' + sPad + 'E' + ePad);
      addQuery(queries, dedupedVariants[d].short + ' ' + seasonNum + 'x' + ePad);
    }

    for (let c = 0; c < dedupedVariants.length; c++) {
      addQuery(queries, dedupedVariants[c].full + ' S' + sPad);
      addQuery(queries, dedupedVariants[c].full + ' ' + seasonNum + '. serie');
      addQuery(queries, dedupedVariants[c].full + ' ' + seasonNum);
      addQuery(queries, dedupedVariants[c].short + ' S' + sPad);
      addQuery(queries, dedupedVariants[c].short + ' ' + seasonNum + '. serie');
      addQuery(queries, dedupedVariants[c].short + ' ' + seasonNum);
    }

    for (let e = 0; e < dedupedVariants.length; e++) {
      addQuery(queries, dedupedVariants[e].full);
      addQuery(queries, dedupedVariants[e].short);
    }
  } else {
    for (let g = 0; g < dedupedVariants.length; g++) {
      if (mediaInfo.year) {
        addQuery(queries, dedupedVariants[g].full + ' ' + mediaInfo.year);
        addQuery(queries, dedupedVariants[g].short + ' ' + mediaInfo.year);
      }
    }
    for (let f = 0; f < dedupedVariants.length; f++) {
      addQuery(queries, dedupedVariants[f].full);
      addQuery(queries, dedupedVariants[f].short);
    }
  }

  return queries.slice(0, 24);
}

function cleanTitle(title: string) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseSeasonEpisode(title: string, targetSeason: number, targetEpisode: number) {
  const clean = cleanTitle(title);
  let season: number | null = null;
  let episode: number | null = null;

  const matchEpRange = clean.match(/\bs(\d{1,2})\s*[_.-]?\s*e(\d{1,3})\s*-\s*e?(\d{1,3})\b/);
  if (matchEpRange) {
    const sEpRange = parseInt(matchEpRange[1], 10);
    const startEpRange = parseInt(matchEpRange[2], 10);
    const endEpRange = parseInt(matchEpRange[3], 10);
    if (sEpRange === targetSeason && targetEpisode >= startEpRange && targetEpisode <= endEpRange) {
      return { season: sEpRange, episode: targetEpisode };
    }
  }

  const matchXEpRange = clean.match(/\b(\d{1,2})\s*x\s*(\d{1,3})\s*-\s*x?(\d{1,3})\b/);
  if (matchXEpRange) {
    const sXEpRange = parseInt(matchXEpRange[1], 10);
    const startXEpRange = parseInt(matchXEpRange[2], 10);
    const endXEpRange = parseInt(matchXEpRange[3], 10);
    if (sXEpRange === targetSeason && targetEpisode >= startXEpRange && targetEpisode <= endXEpRange) {
      return { season: sXEpRange, episode: targetEpisode };
    }
  }

  const matchSE = clean.match(/\bs(\d{1,2})\s*[_.-]?\s*e(\d{1,3})\b/);
  if (matchSE) {
    season = parseInt(matchSE[1], 10);
    episode = parseInt(matchSE[2], 10);
    return { season: season, episode: episode };
  }

  const matchX = clean.match(/\b(\d{1,2})\s*x\s*(\d{1,3})\b/);
  if (matchX) {
    const sX = parseInt(matchX[1], 10);
    const eX = parseInt(matchX[2], 10);
    if (sX < 100 && eX < 1000) {
      return { season: sX, episode: eX };
    }
  }

  const matchCzRange1 = clean.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\s*\.?\s*(?:rada|serie|sezona)\b/);
  if (matchCzRange1) {
    const startCz1 = parseInt(matchCzRange1[1], 10);
    const endCz1 = parseInt(matchCzRange1[2], 10);
    if (targetSeason >= startCz1 && targetSeason <= endCz1) {
      return { season: targetSeason, episode: null };
    }
  }
  const matchCzRange2 = clean.match(/\b(?:rada|serie|sezona)\s*(\d{1,2})\s*-\s*(\d{1,2})\b/);
  if (matchCzRange2) {
    const startCz2 = parseInt(matchCzRange2[1], 10);
    const endCz2 = parseInt(matchCzRange2[2], 10);
    if (targetSeason >= startCz2 && targetSeason <= endCz2) {
      return { season: targetSeason, episode: null };
    }
  }

  const matchRange = clean.match(/\bs(\d{1,2})\s*-\s*s?(\d{1,2})\b/);
  if (matchRange) {
    const startRange = parseInt(matchRange[1], 10);
    const endRange = parseInt(matchRange[2], 10);
    if (targetSeason >= startRange && targetSeason <= endRange) {
      return { season: targetSeason, episode: null };
    }
  }

  const matchCzSeason = clean.match(/\b(?:(\d{1,2})\s*\.\s*(?:rada|serie|sezona))|(?:(?:rada|serie|sezona)\s*(\d{1,2}))\b/);
  if (matchCzSeason) {
    season = parseInt(matchCzSeason[1] || matchCzSeason[2], 10);
  }

  const matchCzEpisode = clean.match(/\b(?:(\d{1,3})\s*\.\s*(?:dil|epizoda|cast))|(?:(?:dil|epizoda|cast)\s*(\d{1,3}))\b/);
  if (matchCzEpisode) {
    episode = parseInt(matchCzEpisode[1] || matchCzEpisode[2], 10);
  }

  if (season !== null || episode !== null) {
    return { season: season, episode: episode };
  }

  const matchSeasonOnly = clean.match(/\b(?:s|season)\s*(\d{1,2})\b/);
  if (matchSeasonOnly) {
    season = parseInt(matchSeasonOnly[1], 10);
  }

  return { season: season, episode: episode };
}

function matchesMedia(torrent: any, mediaInfo: any, mediaType?: string, seasonNum?: number, episodeNum?: number) {
  const torrentParts = String(torrent.title || '').split('/').map(p => p.trim());
  const torrentNorms = torrentParts.map(p => normalizeText(p));
  const fullNorm = normalizeText(torrent.title);
  if (torrentNorms.indexOf(fullNorm) === -1) torrentNorms.push(fullNorm);

  const candidates = [normalizeText(mediaInfo.title), normalizeText(mediaInfo.originalTitle)].filter(Boolean);

  let titleMatched = false;

  function isSubString(sub: string, full: string) {
    if (!sub) return false;
    if (full === sub) return true;
    const escaped = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escaped + '\\b').test(full);
  }

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    for (let n = 0; n < torrentNorms.length; n++) {
      const titleNorm = torrentNorms[n];
      if (titleNorm === candidate || isSubString(candidate, titleNorm) || isSubString(titleNorm, candidate)) {
        titleMatched = true;
        break;
      }
    }
    if (titleMatched) break;
    const words = candidate.split(' ').filter(word => word.length > 2);
    let hits = 0;
    for (let j = 0; j < words.length; j++) {
      if (isSubString(words[j], fullNorm)) hits++;
    }
    if (words.length > 0 && hits >= Math.max(1, Math.ceil(words.length * 0.6))) {
      titleMatched = true;
      break;
    }
  }

  if (!titleMatched) return false;

  if (mediaInfo.year && mediaType !== 'tv') {
    const torrentYear = extractYear(torrent.title);
    if (torrentYear && Math.abs(torrentYear - mediaInfo.year) > 1) return false;
  }

  if (mediaType === 'tv' && seasonNum && episodeNum) {
    const parsed = parseSeasonEpisode(torrent.title, seasonNum, episodeNum);
    if (parsed.season !== null && parsed.episode !== null) {
      return parsed.season === seasonNum && parsed.episode === episodeNum;
    } else if (parsed.season !== null && parsed.episode === null) {
      return parsed.season === seasonNum;
    } else if (parsed.season === null && parsed.episode !== null) {
      return parsed.episode === episodeNum && (seasonNum === 1 || seasonNum === null);
    }
    return false;
  }

  return true;
}

function categoryMatchesMedia(torrent: any, mediaType?: string) {
  const category = normalizeText(torrent.categoryName || '');
  if (!category) return true;

  if (mediaType === 'tv') {
    return category.indexOf('serial') !== -1 || category.indexOf('seri') !== -1 || category.indexOf('tv') !== -1 || category.indexOf('dokum') !== -1;
  }

  return category.indexOf('film') !== -1 || category.indexOf('dokum') !== -1 || category.indexOf('uhd') !== -1;
}

async function searchCategory(query: string, category: number, page: number, cookie?: string | null) {
  const url = SKTORRENT_BASE + '/torrents_v2.php?search=' + encodeURIComponent(query)
    + '&category=' + encodeURIComponent(category) + '&zaner=&active=0&order=data&by=DESC&page=' + encodeURIComponent(page);
  try {
    const text = await fetchText(url, cookie);
    return parseTorrentBlocks(text);
  } catch (error: any) {
    warn('Search failed (' + query + ', category ' + category + ', page ' + page + '): ' + error.message);
    return [];
  }
}

async function searchAllCategories(queries: string[], categories: number[], cookie: string | null, mediaInfo: any, mediaType?: string, seasonNum?: number, episodeNum?: number) {
  const tasks: (() => Promise<any[]>)[] = [];

  for (let q = 0; q < queries.length; q++) {
    for (let c = 0; c < categories.length; c++) {
      for (let p = 0; p < MAX_PAGES; p++) {
        ((query, category, page) => {
          tasks.push(() => searchCategory(query, category, page, cookie));
        })(queries[q], categories[c], p);
      }
    }
  }

  const merged: any[] = [];
  const seen: Record<string, boolean> = {};
  const MIN_RESULTS = 25;

  for (let i = 0; i < tasks.length; i++) {
    if (merged.length >= MIN_RESULTS) {
      break;
    }
    try {
      const list = await tasks[i]();
      for (let j = 0; j < list.length; j++) {
        const item = list[j];
        if (!seen[item.infoHash]) {
          seen[item.infoHash] = true;
          if (categoryMatchesMedia(item, mediaType) && matchesMedia(item, mediaInfo, mediaType, seasonNum, episodeNum)) {
            merged.push(item);
          }
        }
      }
    } catch (e: any) {
      warn('Task search error: ' + e.message);
    }
  }

  return merged;
}

function buildStreamName(torrent: any, quality: string) {
  let qIcon = quality;
  if (quality === '4K' || quality === '1440p') qIcon = '🌟 ' + quality;
  else if (quality === '1080p' || quality === '720p') qIcon = '🎞️ ' + quality;
  else if (quality !== 'Unknown') qIcon = '📺 ' + quality;
  else qIcon = '📺 SD';

  const audioLangs = torrent.langs ? torrent.langs.audio : [];
  const parts = ['🇸🇰 SkTorrent', qIcon];
  if (audioLangs.length > 0) parts.push('🔊 ' + audioLangs[0]);
  return parts.join(' | ');
}

function buildInfoLines(torrent: any, quality: string, source: string | null, codec: string | null, hdr: string | null) {
  let qIcon = quality;
  if (quality === '4K' || quality === '1440p') qIcon = '🌟 ' + quality;
  else if (quality === '1080p' || quality === '720p') qIcon = '🎞️ ' + quality;
  else if (quality !== 'Unknown') qIcon = '📺 ' + quality;
  else qIcon = '📺 SD';

  const technical = [qIcon, source, codec, hdr].filter(Boolean).join(' / ');
  let catIcon = '🎬';
  let catName = 'Video';
  if (torrent.categoryName) {
    catName = torrent.categoryName;
    const catLower = catName.toLowerCase();
    if (catLower.indexOf('seri') !== -1 || catLower.indexOf('tv') !== -1) catIcon = '📺';
    else if (catLower.indexOf('hr') !== -1) catIcon = '🎮';
    else if (catLower.indexOf('hudb') !== -1) catIcon = '🎵';
    else if (catLower.indexOf('knih') !== -1 || catLower.indexOf('časop') !== -1) catIcon = '📚';
    else if (catLower.indexOf('xxx') !== -1) catIcon = '🔞';
  }

  const firstLine = catIcon + ' ' + catName + (torrent.added ? ' | 📅 ' + torrent.added : '');
  const availability = [
    torrent.size && torrent.size !== 'Unknown' ? '💾 ' + torrent.size : null,
    '🟢 ' + (torrent.seeds || 0) + ' Seedů'
  ].filter(Boolean).join(' | ');

  const langArr: string[] = [];
  if (torrent.langs && torrent.langs.audio.length > 0) langArr.push('🔊 ' + torrent.langs.audio.join('/'));
  if (torrent.langs && torrent.langs.subtitles.length > 0) langArr.push('💬 ' + torrent.langs.subtitles.join('/'));
  const meta = langArr.length > 0 ? langArr.join(' | ') : null;

  return [firstLine, availability, technical, meta].filter(Boolean);
}

function buildStreamTitle(displayTitle: string, infoLines: (string | null)[]) {
  return [displayTitle].concat(infoLines.filter((l): l is string => l !== null)).join('\n');
}

function detectTorrentLanguages(torrent: any, mediaInfo: any) {
  const titleLower = String(torrent.title || '').toLowerCase();
  const origLower = String(mediaInfo.originalTitle || '').toLowerCase();
  const audio: string[] = [];
  const tit: string[] = [];

  const isCzechProd = (titleLower === origLower) && origLower.length > 3 && !/\b(en|eng|english)\b/i.test(titleLower);

  const hasCzDab = /\b(cz[\s.\-]*(dab|dub)|(česk[ýé]|cesk[ye])[\s.]+(dab|dub)|dabing[\s.]+(cz|česk[ýé]|cesk[ye]))/i.test(titleLower);
  const hasSkDab = /\b(sk[\s.\-]*(dab|dub)|(slovensk[ýé]|slovensk[ye])[\s.]+(dab|dub)|dabing[\s.]+(sk|slovensk[ýé]|slovensk[ye]))/i.test(titleLower);
  const hasCzTag = /\b(cz|cze|ces|cesky|česky|ceske|české)\b/i.test(titleLower);
  const hasSkTag = /\b(sk|sl|slo|slov|slovensky|slovenský)\b/i.test(titleLower);
  const hasSubTag = /\b(titulky|tit|cztit|sktit|subtitles|subs|cz-tit|sk-tit)\b/i.test(titleLower);

  const flags: string[] = torrent.languages || [];
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === 'CZ' || flags[i] === 'SK' || flags[i] === 'EN') {
      if (audio.indexOf(flags[i]) === -1) audio.push(flags[i]);
    }
  }

  if (hasCzDab && audio.indexOf('CZ') === -1) audio.push('CZ');
  if (hasSkDab && audio.indexOf('SK') === -1) audio.push('SK');
  if (isCzechProd && audio.indexOf('CZ') === -1) audio.push('CZ');

  if (hasCzTag && !hasSubTag && audio.indexOf('CZ') === -1 && !isCzechProd) audio.push('CZ');
  if (hasSkTag && !hasSubTag && audio.indexOf('SK') === -1 && !isCzechProd) audio.push('SK');

  if (audio.length === 0) {
    audio.push('EN');
  }

  if (hasSubTag) {
    if (tit.indexOf('CZ') === -1 && /\b(cz|cze|cesky|česky|cztit|cz-tit)\b/i.test(titleLower)) tit.push('CZ');
    if (tit.indexOf('SK') === -1 && /\b(sk|slo|slovensky|slovenský|sktit|sk-tit)\b/i.test(titleLower)) tit.push('SK');
    if (tit.indexOf('EN') === -1 && /\b(en|eng|english|sub|subs|subtitles)\b/i.test(titleLower) && titleLower.indexOf('cztit') === -1) tit.push('EN');
  }

  return { audio: audio, subtitles: tit };
}

function torrentsToStreams(torrents: any[], mediaInfo: any, mediaType?: string, seasonNum?: number, episodeNum?: number) {
  const streams: any[] = [];

  for (let i = 0; i < torrents.length; i++) {
    const torrent = torrents[i];
    if (!categoryMatchesMedia(torrent, mediaType)) continue;
    if (!matchesMedia(torrent, mediaInfo, mediaType, seasonNum, episodeNum)) continue;

    const magnet = buildMagnet(torrent.infoHash, torrent.title);
    if (!magnet) continue;

    const quality = getQualityFromTitle(torrent.title);
    const source = getSourceFromTitle(torrent.title);
    const codec = getCodecFromTitle(torrent.title);
    const hdr = getHdrFromTitle(torrent.title);
    let displayTitle = torrent.title;
    if (mediaType === 'tv' && seasonNum && episodeNum) {
      displayTitle = (mediaInfo.title || 'Serial') + ' S'
        + String(seasonNum).padStart(2, '0') + 'E' + String(episodeNum).padStart(2, '0')
        + ' - ' + torrent.title;
    }

    torrent.langs = detectTorrentLanguages(torrent, mediaInfo);

    const infoLines = buildInfoLines(torrent, quality, source, codec, hdr);

    streams.push({
      name: buildStreamName(torrent, quality),
      title: buildStreamTitle(displayTitle, infoLines),
      size: buildStreamTitle(displayTitle, infoLines),
      description: buildStreamTitle(displayTitle, infoLines),
      infoHash: torrent.infoHash,
      sources: buildTorrentSources(),
      behaviorHints: {
        filename: torrent.title,
        videoSize: torrent.sizeBytes
      },
      _sortQuality: quality,
      _sortSeeds: torrent.seeds || 0,
      _sortSizeBytes: torrent.sizeBytes || 0
    });
  }

  streams.sort((a, b) => {
    const qualityOrder: Record<string, number> = { '4K': 6, '1440p': 5, '1080p': 4, '720p': 3, '576p': 2, '480p': 1, 'CAM': 0, 'Unknown': 0 };
    const qualityDiff = (qualityOrder[b._sortQuality] || 0) - (qualityOrder[a._sortQuality] || 0);
    if (qualityDiff !== 0) return qualityDiff;
    const seedDiff = (b._sortSeeds || 0) - (a._sortSeeds || 0);
    if (seedDiff !== 0) return seedDiff;
    return (b._sortSizeBytes || 0) - (a._sortSizeBytes || 0);
  });

  return streams.slice(0, MAX_RESULTS).map((stream, index) => {
    const num = index + 1;
    const prefix = (num < 10 ? '0' + num : num) + '. ';
    const magnet = buildMagnet(stream.infoHash, stream.behaviorHints.filename);
    return {
      name: prefix + stream.name,
      title: stream.title,
      size: stream.size,
      description: stream.description,
      infoHash: stream.infoHash,
      sources: stream.sources,
      url: magnet,
      behaviorHints: stream.behaviorHints
    };
  });
}

export async function getStreams(input: any, mediaType?: any, seasonNum?: any, episodeNum?: any) {
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

    const credentials = getSkTorrentCredentials(request);
    const cookie = credentials.uid && credentials.pass ? 'uid=' + credentials.uid + '; pass=' + credentials.pass : null;

    const categories = ALL_CATEGORIES;
    const queries = buildSearchQueries(mediaInfo, request.mediaType, request.season, request.episode);
    log('Searching: ' + queries.join(' | ') + (cookie ? ' (authenticated)' : ''));

    const torrents = await searchAllCategories(queries, categories, cookie, mediaInfo, request.mediaType, request.season, request.episode);
    const streams = torrentsToStreams(torrents, mediaInfo, request.mediaType, request.season, request.episode);
    log('Found ' + streams.length + ' magnet stream(s)');
    return streams;
  } catch (error: any) {
    warn('Error: ' + error.message);
    return [];
  }
}

export async function onSettings() {
  return [
    {
      key: 'uid',
      type: 'text',
      title: 'SkTorrent UID',
      required: false
    },
    {
      key: 'pass',
      type: 'password',
      title: 'SkTorrent Password',
      required: false
    }
  ];
}

const api = {
  getStreams,
  onSettings,
  search: getStreams,
  parseTorrentBlocks,
  buildSearchQueries,
  normalizeText
};

export default api;
