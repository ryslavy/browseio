// Polyfills for engine compatibility (QuickJS / Nuvio Desktop)
if (!String.prototype.startsWith) {
  String.prototype.startsWith = function (search, pos) {
    return this.substr(pos || 0, search.length) === search;
  };
}
if (!String.prototype.padStart) {
  String.prototype.padStart = function (targetLength, padString) {
    targetLength = targetLength >> 0;
    padString = String(typeof padString !== 'undefined' ? padString : ' ');
    if (this.length > targetLength) {
      return String(this);
    } else {
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length);
      }
      return padString.slice(0, targetLength) + String(this);
    }
  };
}
if (!Object.assign) {
  Object.assign = function (target) {
    if (target === undefined || target === null) {
      throw new TypeError('Cannot convert undefined or null to object');
    }
    var to = Object(target);
    for (var index = 1; index < arguments.length; index++) {
      var nextSource = arguments[index];
      if (nextSource !== undefined && nextSource !== null) {
        for (var nextKey in nextSource) {
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }
    }
    return to;
  };
}

var SKTORRENT_BASE = 'https://sktorrent.eu/torrent';
var SKTORRENT_TRACKER = 'http://ipv4announce.sktorrent.eu:6969/announce';

var ALL_CATEGORIES = [0];

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
var MAX_PAGES = 1;
var MAX_RESULTS = 25;
var SEARCH_CONCURRENCY = 6;

function log(message) {
  if (typeof console !== 'undefined' && console.log) {
    console.log('[SkTorrent] ' + message);
  }
}

function warn(message) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[SkTorrent] ' + message);
  } else {
    log(message);
  }
}

function getSafeFetch() {
  if (typeof fetch === 'function') return fetch;
  if (typeof globalThis !== 'undefined' && globalThis.fetch) return globalThis.fetch;
  if (typeof window !== 'undefined' && window.fetch) return window.fetch;
  if (typeof global !== 'undefined' && global.fetch) return global.fetch;
  throw new Error('fetch API is not available in this runtime');
}

async function fetchText(url, cookie) {
  var headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'cs,sk,en;q=0.8'
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  var safeFetch = getSafeFetch();
  var response = await safeFetch(url, { headers: headers });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return await response.text();
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function (_, code) {
      return String.fromCharCode(parseInt(code, 10));
    })
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, code) {
      return String.fromCharCode(parseInt(code, 16));
    });
}

function stripTags(html) {
  return decodeHtml(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeText(text) {
  return decodeHtml(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toInt(value) {
  var number = parseInt(value, 10);
  return isNaN(number) ? null : number;
}

function firstValue() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
      return arguments[i];
    }
  }
  return null;
}

function getQualityFromTitle(title) {
  var upper = String(title || '').toUpperCase();
  if (/\b(2160P|4K|UHD)\b/.test(upper)) return '4K';
  if (/\b(1440P|2K)\b/.test(upper)) return '1440p';
  if (/\b(1080P|FHD|FULLHD)\b/.test(upper)) return '1080p';
  if (/\b(720P|HDTV|WEBRIP|WEB-DL|HD)\b/.test(upper)) return '720p';
  if (/\b(576P|DVDRIP|DVD)\b/.test(upper)) return '576p';
  if (/\b480P\b/.test(upper)) return '480p';
  if (/\b(CAM|TS|HDCAM)\b/.test(upper)) return 'CAM';
  return 'Unknown';
}

function getSourceFromTitle(title) {
  var upper = String(title || '').toUpperCase();
  if (/\b(WEB-DL|WEBDL)\b/.test(upper)) return 'WEB-DL';
  if (/\b(WEBRIP|WEB-RIP)\b/.test(upper)) return 'WEBRip';
  if (/\b(BLURAY|BDRIP|BRRIP|BDREMUX|REMUX)\b/.test(upper)) return 'BluRay';
  if (/\b(HDTV)\b/.test(upper)) return 'HDTV';
  if (/\b(DVDRIP|DVD)\b/.test(upper)) return 'DVD';
  if (/\b(CAM|TS|HDCAM)\b/.test(upper)) return 'CAM';
  return null;
}

function getCodecFromTitle(title) {
  var upper = String(title || '').toUpperCase();
  if (/\b(HEVC|H265|H\.265|X265)\b/.test(upper)) return 'HEVC';
  if (/\b(H264|H\.264|X264|AVC)\b/.test(upper)) return 'H.264';
  if (/\b(AV1)\b/.test(upper)) return 'AV1';
  if (/\b(XVID|DIVX)\b/.test(upper)) return 'Xvid';
  return null;
}

function getHdrFromTitle(title) {
  var upper = String(title || '').toUpperCase();
  if (/\b(DOLBY\s*VISION|DV)\b/.test(upper)) return 'DV';
  if (/\bHDR10\+?\b/.test(upper)) return upper.indexOf('HDR10+') !== -1 ? 'HDR10+' : 'HDR10';
  if (/\bHDR\b/.test(upper)) return 'HDR';
  return null;
}

function parseSizeBytes(size) {
  var match = String(size || '').match(/(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|kb|b)\b/i);
  if (!match) return 0;

  var value = parseFloat(match[1].replace(',', '.'));
  var unit = match[2].toLowerCase();
  if (unit === 'tb') return value * 1024 * 1024 * 1024 * 1024;
  if (unit === 'gb') return value * 1024 * 1024 * 1024;
  if (unit === 'mb') return value * 1024 * 1024;
  if (unit === 'kb') return value * 1024;
  return value;
}

function extractLanguages(block, title) {
  var languages = [];
  var seen = {};

  function add(lang) {
    lang = String(lang || '').toUpperCase();
    if (lang && !seen[lang]) {
      seen[lang] = true;
      languages.push(lang);
    }
  }

  var flagRegex = /\/flag\/([a-z]{2})\.png/ig;
  var flagMatch;
  while ((flagMatch = flagRegex.exec(block)) !== null) {
    if (flagMatch[1] === 'gb') add('EN');
    else add(flagMatch[1]);
  }

  var titleLangMatch = String(title || '').match(/\(([A-Z]{2}(?:\/[A-Z]{2}){0,5})\)/g);
  if (titleLangMatch) {
    for (var i = 0; i < titleLangMatch.length; i++) {
      titleLangMatch[i].replace(/[()]/g, '').split('/').forEach(add);
    }
  }

  return languages;
}

function cleanTorrentTitle(title, categoryName) {
  var cleaned = decodeHtml(title)
    .replace(/^Stiahni si\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (categoryName && cleaned.toLowerCase().indexOf(categoryName.toLowerCase()) === 0) {
    cleaned = cleaned.slice(categoryName.length).trim();
  }

  return cleaned;
}

function extractYear(text) {
  var match = String(text || '').match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

function buildMagnet(infoHash, displayName) {
  var hash = String(infoHash || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(hash)) return null;

  return 'magnet:?xt=urn:btih:' + hash
    + '&dn=' + encodeURIComponent(displayName || 'SkTorrent')
    + '&tr=' + encodeURIComponent(SKTORRENT_TRACKER);
}

function buildTorrentSources() {
  return ['tracker:' + SKTORRENT_TRACKER];
}

function parseTorrentBlocks(html) {
  var results = [];
  var cellRegex = /<td\b[^>]*class\s*=\s*["']?lista["']?[^>]*>([\s\S]*?)(?=<td\b[^>]*class\s*=\s*["']?lista["']?|<\/tr>|<\/table>|$)/ig;
  var match;

  while ((match = cellRegex.exec(html)) !== null) {
    var block = match[1];
    var idMatch = block.match(/details\.php\?[^"\s>]*?id=([a-f0-9]{40})/i);
    if (!idMatch) continue;

    var detailAnchor = block.match(/<a\b[^>]*href\s*=\s*["']?details\.php[^>]*>([\s\S]*?)<\/a>/i);
    var titleAttr = detailAnchor && detailAnchor[0].match(/\btitle\s*=\s*["']([^"']+)["']/i);
    var categoryName = stripTags((block.match(/<a\b[^>]*href\s*=\s*["']?torrents_v2\.php\?category=\d+[^>]*>[\s\S]*?<b>([\s\S]*?)<\/b>/i) || [])[1]);
    var title = stripTags(detailAnchor && detailAnchor[1]);
    if (!title && titleAttr) title = titleAttr[1].replace(/^Stiahni si\s+/i, '');
    title = cleanTorrentTitle(title, categoryName);
    if (!title) continue;

    var sizeMatch = block.match(/Velkost\s+([^|<]+)/i);
    var addedMatch = block.match(/Pridany\s+([^<|]+)/i);
    var seedsMatch = block.match(/Odosielaju\s*:\s*(\d+)/i);
    var peersMatch = block.match(/Stahuju\s*:\s*(\d+)/i);
    var categoryMatch = block.match(/torrents_v2\.php\?category=(\d+)/i);
    var detailUrlMatch = block.match(/href\s*=\s*["']?(details\.php\?[^"\s>]+)/i);
    var size = sizeMatch ? decodeHtml(sizeMatch[1]).trim() : 'Unknown';

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

function getSkTorrentCredentials(request) {
  var globalSettings = (typeof globalThis !== 'undefined' && globalThis.SCRAPER_SETTINGS) || {};
  var uid = request.uid ||
    (request.settings && (request.settings.uid || request.settings.username || request.settings.user)) ||
    (request.config && (request.config.uid || request.config.user_id || request.config.username)) ||
    globalSettings.uid ||
    globalSettings.username ||
    globalSettings.user ||
    null;
  var pass = request.pass ||
    (request.settings && (request.settings.pass || request.settings.password)) ||
    (request.config && (request.config.pass || request.config.password)) ||
    globalSettings.pass ||
    globalSettings.password ||
    null;
  return { uid: uid, pass: pass };
}

function parseMediaRequest(input, mediaType, seasonNum, episodeNum) {
  var request = {};

  if (input && typeof input === 'object') {
    request = input;
  } else {
    request.tmdbId = input;
    request.mediaType = mediaType;
    request.season = seasonNum;
    request.episode = episodeNum;
  }

  if (mediaType && typeof mediaType === 'object') {
    request = Object.assign({}, mediaType, request);
  }

  var id = firstValue(request.tmdbId, request.tmdb_id, request.id, request.movieId, request.tvId);
  if (typeof id === 'string') {
    var isImdb = id.indexOf('tt') !== -1;
    if (isImdb) {
      var imdbMatch = id.match(/(?:imdb[:/])?(tt\d+)/i);
      if (imdbMatch) id = imdbMatch[1];
    } else {
      var tmdbMatch = id.match(/(?:tmdb[:/])?(\d+)/i);
      if (tmdbMatch) id = tmdbMatch[1];
    }
  }

  var type = String(firstValue(request.mediaType, request.type, request.kind, mediaType, 'movie')).toLowerCase();
  if (type === 'series' || type === 'show') type = 'tv';
  if (type !== 'tv') type = 'movie';

  var parsed = {
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

async function resolveMediaInfo(request) {
  if (request.title) {
    return request;
  }
  if (!request.tmdbId) {
    warn('No tmdbId or title provided to resolveMediaInfo.');
    return null;
  }

  var tmdbApiKey = (typeof TMDB_API_KEY !== 'undefined' && TMDB_API_KEY) ||
    (typeof globalThis !== 'undefined' && globalThis.TMDB_API_KEY) ||
    '4219e299c89411838049ab0dab19ebd5'; // Fallback API key

  var type = request.mediaType === 'tv' ? 'tv' : 'movie';
  var isImdb = String(request.tmdbId).startsWith('tt');
  var safeFetch = getSafeFetch();

  try {
    if (isImdb) {
      var cinemetaType = type === 'tv' ? 'series' : 'movie';
      var cinemetaUrl = 'https://v3-cinemeta.strem.io/meta/' + cinemetaType + '/' + request.tmdbId + '.json';
      log('Fetching metadata from Cinemeta: ' + cinemetaUrl);
      var res = await safeFetch(cinemetaUrl);
      if (!res.ok) throw new Error('Cinemeta HTTP ' + res.status);
      var data = await res.json();
      if (!data || !data.meta) throw new Error('Empty Cinemeta metadata');
      var meta = data.meta;
      var name = meta.name;
      var year = meta.year ? parseInt(meta.year, 10) : null;
      var tmdbId = meta.moviedb_id;

      if (tmdbId) {
        var tmdbUrl = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '?api_key=' + tmdbApiKey + '&language=cs-CZ&append_to_response=translations,alternative_titles';
        log('Fetching Czech translation from TMDB for ID: ' + tmdbId);
        var tmdbRes = await safeFetch(tmdbUrl);
        if (tmdbRes.ok) {
          var tmdbData = await tmdbRes.json();
          var czTitle = null;
          var skTitle = null;
          if (tmdbData.translations && tmdbData.translations.translations) {
            var trans = tmdbData.translations.translations;
            for (var i = 0; i < trans.length; i++) {
              var t = trans[i];
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
          var resolved = {
            title: czTitle,
            originalTitle: name,
            year: year || (tmdbData.release_date || tmdbData.first_air_date ? parseInt((tmdbData.release_date || tmdbData.first_air_date).split('-')[0], 10) : null),
            tmdbId: tmdbId
          };
          log('Resolved metadata: "' + resolved.title + '" / "' + resolved.originalTitle + '" (' + resolved.year + ')');
          return resolved;
        }
      }
      var resolvedFallback = {
        title: name,
        originalTitle: name,
        year: year
      };
      log('Resolved metadata: "' + resolvedFallback.title + '" / "' + resolvedFallback.originalTitle + '" (' + resolvedFallback.year + ')');
      return resolvedFallback;
    } else {
      var tmdbUrl = 'https://api.themoviedb.org/3/' + type + '/' + request.tmdbId + '?api_key=' + tmdbApiKey + '&language=cs-CZ&append_to_response=translations,alternative_titles';
      log('Fetching from TMDB for numeric ID: ' + request.tmdbId);
      var res = await safeFetch(tmdbUrl);
      if (!res.ok) throw new Error('TMDB HTTP ' + res.status);
      var data = await res.json();
      if (!data) return null;
      var title = data.title || data.name || null;
      var originalTitle = data.original_title || data.original_name || title;
      var releaseDate = data.release_date || data.first_air_date || null;
      var year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null;

      var czTitle = null;
      var skTitle = null;
      if (data.translations && data.translations.translations) {
        var trans = data.translations.translations;
        for (var i = 0; i < trans.length; i++) {
          var t = trans[i];
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
      var resolved = {
        title: title,
        originalTitle: originalTitle,
        year: year,
        tmdbId: request.tmdbId
      };
      log('Resolved metadata: "' + resolved.title + '" / "' + resolved.originalTitle + '" (' + resolved.year + ')');
      return resolved;
    }
  } catch (error) {
    warn('Failed to resolve metadata: ' + error.message);
    return {
      title: request.title || 'Unknown',
      originalTitle: request.title || 'Unknown',
      year: ''
    };
  }
}


function addQuery(queries, value) {
  value = String(value || '').replace(/\s+/g, ' ').trim();
  if (value && queries.indexOf(value) === -1) queries.push(value);
}

function stripDiacritics(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function shortTitle(str, words) {
  words = words || 3;
  return stripDiacritics(str).split(/\s+/).slice(0, words).join(' ');
}

function buildSearchQueries(mediaInfo, mediaType, seasonNum, episodeNum) {
  var queries = [];

  // Collect all title variants (CZ/SK, original, without punctuation)
  var titleSet = [];
  function addTitle(t) {
    t = String(t || '').trim();
    if (t && titleSet.indexOf(t) === -1) titleSet.push(t);
  }
  addTitle(mediaInfo.title);
  addTitle(mediaInfo.originalTitle);
  // Strip punctuation like apostrophes/colons: "Clarkson's Farm" -> "Clarksons Farm"
  var cleanOriginal = String(mediaInfo.originalTitle || '').replace(/[':]/g, '');
  addTitle(cleanOriginal);
  // Strip diacritics from CZ title
  addTitle(stripDiacritics(mediaInfo.title));

  // For each title, build short (first 3 words, no diacritics) and full variants
  var variants = []; // [ { short, full } ]
  for (var i = 0; i < titleSet.length; i++) {
    var full = titleSet[i];
    var slashParts = full.split('/').map(function (p) { return p.trim(); }).filter(Boolean);
    var parts = slashParts.length > 1 ? slashParts : [full];
    for (var k = 0; k < parts.length; k++) {
      var part = parts[k];
      var sh = shortTitle(part, 3);
      variants.push({ short: sh, full: part });
    }
  }

  // Deduplicate variants by full title
  var seen = {};
  var dedupedVariants = [];
  for (var vi = 0; vi < variants.length; vi++) {
    var key = variants[vi].full;
    if (!seen[key]) { seen[key] = true; dedupedVariants.push(variants[vi]); }
  }

  if (mediaType === 'tv' && seasonNum && episodeNum) {
    var sPad = String(seasonNum).padStart(2, '0');
    var ePad = String(episodeNum).padStart(2, '0');

    // Priority 1: Specific episode (e.g. "Rick and Morty S01E01", "Rick and Morty 1x01")
    for (var d = 0; d < dedupedVariants.length; d++) {
      addQuery(queries, dedupedVariants[d].full + ' S' + sPad + 'E' + ePad);
      addQuery(queries, dedupedVariants[d].full + ' ' + seasonNum + 'x' + ePad);
      addQuery(queries, dedupedVariants[d].short + ' S' + sPad + 'E' + ePad);
      addQuery(queries, dedupedVariants[d].short + ' ' + seasonNum + 'x' + ePad);
    }

    // Priority 2: Season packs (e.g. "Rick and Morty S01", "Rick and Morty 1. serie", "Rick and Morty 1")
    for (var c = 0; c < dedupedVariants.length; c++) {
      addQuery(queries, dedupedVariants[c].full + ' S' + sPad);
      addQuery(queries, dedupedVariants[c].full + ' ' + seasonNum + '. serie');
      addQuery(queries, dedupedVariants[c].full + ' ' + seasonNum);
      addQuery(queries, dedupedVariants[c].short + ' S' + sPad);
      addQuery(queries, dedupedVariants[c].short + ' ' + seasonNum + '. serie');
      addQuery(queries, dedupedVariants[c].short + ' ' + seasonNum);
    }

    // Priority 3: Broad search (e.g. "Rick and Morty") - only as absolute fallback
    for (var e = 0; e < dedupedVariants.length; e++) {
      addQuery(queries, dedupedVariants[e].full);
      addQuery(queries, dedupedVariants[e].short);
    }
  } else {
    // Movies / no episode: search by year first, then bare title
    for (var g = 0; g < dedupedVariants.length; g++) {
      if (mediaInfo.year) {
        addQuery(queries, dedupedVariants[g].full + ' ' + mediaInfo.year);
        addQuery(queries, dedupedVariants[g].short + ' ' + mediaInfo.year);
      }
    }
    for (var f = 0; f < dedupedVariants.length; f++) {
      addQuery(queries, dedupedVariants[f].full);
      addQuery(queries, dedupedVariants[f].short);
    }
  }

  return queries.slice(0, 24);
}

function cleanTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseSeasonEpisode(title, targetSeason, targetEpisode) {
  var clean = cleanTitle(title);
  var season = null;
  var episode = null;

  // 1. Episode range: S01E01-E05, S01E01-05
  var matchEpRange = clean.match(/\bs(\d{1,2})\s*[_.-]?\s*e(\d{1,3})\s*-\s*e?(\d{1,3})\b/);
  if (matchEpRange) {
    var sEpRange = parseInt(matchEpRange[1], 10);
    var startEpRange = parseInt(matchEpRange[2], 10);
    var endEpRange = parseInt(matchEpRange[3], 10);
    if (sEpRange === targetSeason && targetEpisode >= startEpRange && targetEpisode <= endEpRange) {
      return { season: sEpRange, episode: targetEpisode };
    }
  }

  // 2. Episode range with X: 1x01-05, 1x01-x05
  var matchXEpRange = clean.match(/\b(\d{1,2})\s*x\s*(\d{1,3})\s*-\s*x?(\d{1,3})\b/);
  if (matchXEpRange) {
    var sXEpRange = parseInt(matchXEpRange[1], 10);
    var startXEpRange = parseInt(matchXEpRange[2], 10);
    var endXEpRange = parseInt(matchXEpRange[3], 10);
    if (sXEpRange === targetSeason && targetEpisode >= startXEpRange && targetEpisode <= endXEpRange) {
      return { season: sXEpRange, episode: targetEpisode };
    }
  }

  // 3. Check S01E01 / S01.E01 / S01_E01 / S01 E01 / S1 E1
  var matchSE = clean.match(/\bs(\d{1,2})\s*[_.-]?\s*e(\d{1,3})\b/);
  if (matchSE) {
    season = parseInt(matchSE[1], 10);
    episode = parseInt(matchSE[2], 10);
    return { season: season, episode: episode };
  }

  // 4. Check 1x02 / 01x02 / 1 x 2
  var matchX = clean.match(/\b(\d{1,2})\s*x\s*(\d{1,3})\b/);
  if (matchX) {
    var sX = parseInt(matchX[1], 10);
    var eX = parseInt(matchX[2], 10);
    if (sX < 100 && eX < 1000) {
      return { season: sX, episode: eX };
    }
  }

  // 5. Check Czech/Slovak season range: 1-35. serie / 1-35 serie / serie 1-35 / 1.-35. rada
  var matchCzRange1 = clean.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\s*\.?\s*(?:rada|serie|sezona)\b/);
  if (matchCzRange1) {
    var startCz1 = parseInt(matchCzRange1[1], 10);
    var endCz1 = parseInt(matchCzRange1[2], 10);
    if (targetSeason >= startCz1 && targetSeason <= endCz1) {
      return { season: targetSeason, episode: null };
    }
  }
  var matchCzRange2 = clean.match(/\b(?:rada|serie|sezona)\s*(\d{1,2})\s*-\s*(\d{1,2})\b/);
  if (matchCzRange2) {
    var startCz2 = parseInt(matchCzRange2[1], 10);
    var endCz2 = parseInt(matchCzRange2[2], 10);
    if (targetSeason >= startCz2 && targetSeason <= endCz2) {
      return { season: targetSeason, episode: null };
    }
  }

  // 6. Check season range: S01-S03, S1-S3, S01-3
  var matchRange = clean.match(/\bs(\d{1,2})\s*-\s*s?(\d{1,2})\b/);
  if (matchRange) {
    var startRange = parseInt(matchRange[1], 10);
    var endRange = parseInt(matchRange[2], 10);
    if (targetSeason >= startRange && targetSeason <= endRange) {
      return { season: targetSeason, episode: null };
    }
  }

  // 7. Check Czech/Slovak words: "rada", "serie", "sezona"
  var matchCzSeason = clean.match(/\b(?:(\d{1,2})\s*\.\s*(?:rada|serie|sezona))|(?:(?:rada|serie|sezona)\s*(\d{1,2}))\b/);
  if (matchCzSeason) {
    season = parseInt(matchCzSeason[1] || matchCzSeason[2], 10);
  }

  var matchCzEpisode = clean.match(/\b(?:(\d{1,3})\s*\.\s*(?:dil|epizoda|cast))|(?:(?:dil|epizoda|cast)\s*(\d{1,3}))\b/);
  if (matchCzEpisode) {
    episode = parseInt(matchCzEpisode[1] || matchCzEpisode[2], 10);
  }

  if (season !== null || episode !== null) {
    return { season: season, episode: episode };
  }

  // 8. Check for standalone season indicator for season packs, e.g. "S01", "S1", "Season 1"
  var matchSeasonOnly = clean.match(/\b(?:s|season)\s*(\d{1,2})\b/);
  if (matchSeasonOnly) {
    season = parseInt(matchSeasonOnly[1], 10);
  }

  return { season: season, episode: episode };
}

function matchesMedia(torrent, mediaInfo, mediaType, seasonNum, episodeNum) {
  // Torrent titles on sktorrent often look like "Czech Title / Original Title S01E01..."
  // Normalize each slash-separated part of the torrent title individually
  var torrentParts = String(torrent.title || '').split('/').map(function (p) { return p.trim(); });
  var torrentNorms = torrentParts.map(function (p) { return normalizeText(p); });
  // Also include the full normalized title
  var fullNorm = normalizeText(torrent.title);
  if (torrentNorms.indexOf(fullNorm) === -1) torrentNorms.push(fullNorm);

  var candidates = [normalizeText(mediaInfo.title), normalizeText(mediaInfo.originalTitle)].filter(Boolean);

  var titleMatched = false;

  function isSubString(sub, full) {
    if (!sub) return false;
    if (full === sub) return true;
    var escaped = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escaped + '\\b').test(full);
  }

  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    for (var n = 0; n < torrentNorms.length; n++) {
      var titleNorm = torrentNorms[n];
      if (titleNorm === candidate || isSubString(candidate, titleNorm) || isSubString(titleNorm, candidate)) {
        titleMatched = true;
        break;
      }
    }
    if (titleMatched) break;
    // Word-overlap check on the full normalized torrent title
    var words = candidate.split(' ').filter(function (word) { return word.length > 2; });
    var hits = 0;
    for (var j = 0; j < words.length; j++) {
      if (isSubString(words[j], fullNorm)) hits++;
    }
    if (words.length > 0 && hits >= Math.max(1, Math.ceil(words.length * 0.6))) {
      titleMatched = true;
      break;
    }
  }

  if (!titleMatched) return false;

  // Only use year check for movies — TV shows have episodes airing years after premiere
  if (mediaInfo.year && mediaType !== 'tv') {
    var torrentYear = extractYear(torrent.title);
    if (torrentYear && Math.abs(torrentYear - mediaInfo.year) > 1) return false;
  }

  if (mediaType === 'tv' && seasonNum && episodeNum) {
    var parsed = parseSeasonEpisode(torrent.title, seasonNum, episodeNum);
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

function categoryMatchesMedia(torrent, mediaType) {
  var category = normalizeText(torrent.categoryName || '');
  if (!category) return true;

  if (mediaType === 'tv') {
    return category.indexOf('serial') !== -1 || category.indexOf('seri') !== -1 || category.indexOf('tv') !== -1 || category.indexOf('dokum') !== -1;
  }

  return category.indexOf('film') !== -1 || category.indexOf('dokum') !== -1 || category.indexOf('uhd') !== -1;
}

async function searchCategory(query, category, page, cookie) {
  var url = SKTORRENT_BASE + '/torrents_v2.php?search=' + encodeURIComponent(query)
    + '&category=' + encodeURIComponent(category) + '&zaner=&active=0&order=data&by=DESC&page=' + encodeURIComponent(page);
  try {
    var text = await fetchText(url, cookie);
    return parseTorrentBlocks(text);
  } catch (error) {
    warn('Search failed (' + query + ', category ' + category + ', page ' + page + '): ' + error.message);
    return [];
  }
}

async function searchAllCategories(queries, categories, cookie, mediaInfo, mediaType, seasonNum, episodeNum) {
  var tasks = [];

  for (var q = 0; q < queries.length; q++) {
    for (var c = 0; c < categories.length; c++) {
      for (var p = 0; p < MAX_PAGES; p++) {
        (function (query, category, page) {
          tasks.push(function () { return searchCategory(query, category, page, cookie); });
        })(queries[q], categories[c], p);
      }
    }
  }

  var merged = [];
  var seen = {};
  var MIN_RESULTS = 25;

  for (var i = 0; i < tasks.length; i++) {
    if (merged.length >= MIN_RESULTS) {
      break;
    }
    try {
      var list = await tasks[i]();
      for (var j = 0; j < list.length; j++) {
        var item = list[j];
        if (!seen[item.infoHash]) {
          seen[item.infoHash] = true;
          // Filter valid matches inline so we don't abort early due to junk
          if (categoryMatchesMedia(item, mediaType) && matchesMedia(item, mediaInfo, mediaType, seasonNum, episodeNum)) {
            merged.push(item);
          }
        }
      }
    } catch (e) {
      warn('Task search error: ' + e.message);
    }
  }

  return merged;
} function buildStreamName(torrent, quality, source, codec) {
  var qIcon = quality;
  if (quality === '4K' || quality === '1440p') qIcon = '🌟 ' + quality;
  else if (quality === '1080p' || quality === '720p') qIcon = '🎞️ ' + quality;
  else if (quality !== 'Unknown') qIcon = '📺 ' + quality;
  else qIcon = '📺 SD';

  var audioLangs = torrent.langs ? torrent.langs.audio : [];
  var parts = ['🇸🇰 SkTorrent', qIcon];
  if (audioLangs.length > 0) parts.push('🔊 ' + audioLangs[0]);
  return parts.join(' | ');
}

function buildInfoLines(torrent, quality, source, codec, hdr) {
  var qIcon = quality;
  if (quality === '4K' || quality === '1440p') qIcon = '🌟 ' + quality;
  else if (quality === '1080p' || quality === '720p') qIcon = '🎞️ ' + quality;
  else if (quality !== 'Unknown') qIcon = '📺 ' + quality;
  else qIcon = '📺 SD';

  var technical = [qIcon, source, codec, hdr].filter(Boolean).join(' / ');
  var catIcon = '🎬';
  var catName = 'Video';
  if (torrent.categoryName) {
    catName = torrent.categoryName;
    var catLower = catName.toLowerCase();
    if (catLower.indexOf('seri') !== -1 || catLower.indexOf('tv') !== -1) catIcon = '📺';
    else if (catLower.indexOf('hr') !== -1) catIcon = '🎮';
    else if (catLower.indexOf('hudb') !== -1) catIcon = '🎵';
    else if (catLower.indexOf('knih') !== -1 || catLower.indexOf('časop') !== -1) catIcon = '📚';
    else if (catLower.indexOf('xxx') !== -1) catIcon = '🔞';
  }

  var firstLine = catIcon + ' ' + catName + (torrent.added ? ' | 📅 ' + torrent.added : '');
  var availability = [
    torrent.size && torrent.size !== 'Unknown' ? '💾 ' + torrent.size : null,
    '🟢 ' + (torrent.seeds || 0) + ' Seedů'
  ].filter(Boolean).join(' | ');

  var langArr = [];
  if (torrent.langs && torrent.langs.audio.length > 0) langArr.push('🔊 ' + torrent.langs.audio.join('/'));
  if (torrent.langs && torrent.langs.subtitles.length > 0) langArr.push('💬 ' + torrent.langs.subtitles.join('/'));
  var meta = langArr.length > 0 ? langArr.join(' | ') : null;

  return [firstLine, availability, technical, meta].filter(Boolean);
}

function buildStreamTitle(displayTitle, infoLines) {
  return [displayTitle].concat(infoLines).join('\n');
}

function detectTorrentLanguages(torrent, mediaInfo) {
  var titleLower = String(torrent.title || '').toLowerCase();
  var origLower = String(mediaInfo.originalTitle || '').toLowerCase();
  var audio = [];
  var tit = [];

  var isCzechProd = (titleLower === origLower) && origLower.length > 3 && !/\b(en|eng|english)\b/i.test(titleLower);

  var hasCzDab = /\b(cz[\s.\-]*(dab|dub)|(česk[ýé]|cesk[ye])[\s.]+(dab|dub)|dabing[\s.]+(cz|česk[ýé]|cesk[ye]))/i.test(titleLower);
  var hasSkDab = /\b(sk[\s.\-]*(dab|dub)|(slovensk[ýé]|slovensk[ye])[\s.]+(dab|dub)|dabing[\s.]+(sk|slovensk[ýé]|slovensk[ye]))/i.test(titleLower);
  var hasCzTag = /\b(cz|cze|ces|cesky|česky|ceske|české)\b/i.test(titleLower);
  var hasSkTag = /\b(sk|sl|slo|slov|slovensky|slovenský)\b/i.test(titleLower);
  var hasSubTag = /\b(titulky|tit|cztit|sktit|subtitles|subs|cz-tit|sk-tit)\b/i.test(titleLower);

  // Parse from flags matched earlier
  var flags = torrent.languages || [];
  for (var i = 0; i < flags.length; i++) {
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
    if (/\b(en|eng|english|orig)\b/i.test(titleLower)) audio.push('EN');
    else audio.push('EN');
  }

  if (hasSubTag) {
    if (tit.indexOf('CZ') === -1 && /\b(cz|cze|cesky|česky|cztit|cz-tit)\b/i.test(titleLower)) tit.push('CZ');
    if (tit.indexOf('SK') === -1 && /\b(sk|slo|slovensky|slovenský|sktit|sk-tit)\b/i.test(titleLower)) tit.push('SK');
    if (tit.indexOf('EN') === -1 && /\b(en|eng|english|sub|subs|subtitles)\b/i.test(titleLower) && titleLower.indexOf('cztit') === -1) tit.push('EN');
  }

  return { audio: audio, subtitles: tit };
}

function torrentsToStreams(torrents, mediaInfo, mediaType, seasonNum, episodeNum) {
  var streams = [];

  for (var i = 0; i < torrents.length; i++) {
    var torrent = torrents[i];
    if (!categoryMatchesMedia(torrent, mediaType)) continue;
    if (!matchesMedia(torrent, mediaInfo, mediaType, seasonNum, episodeNum)) continue;

    var magnet = buildMagnet(torrent.infoHash, torrent.title);
    if (!magnet) continue;

    var quality = getQualityFromTitle(torrent.title);
    var source = getSourceFromTitle(torrent.title);
    var codec = getCodecFromTitle(torrent.title);
    var hdr = getHdrFromTitle(torrent.title);
    var displayTitle = torrent.title;
    if (mediaType === 'tv' && seasonNum && episodeNum) {
      displayTitle = (mediaInfo.title || 'Serial') + ' S'
        + String(seasonNum).padStart(2, '0') + 'E' + String(episodeNum).padStart(2, '0')
        + ' - ' + torrent.title;
    }

    torrent.langs = detectTorrentLanguages(torrent, mediaInfo);

    var infoLines = buildInfoLines(torrent, quality, source, codec, hdr);

    streams.push({
      name: buildStreamName(torrent, quality, source, codec),
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

  streams.sort(function (a, b) {
    var qualityOrder = { '4K': 6, '1440p': 5, '1080p': 4, '720p': 3, '576p': 2, '480p': 1, 'CAM': 0, 'Unknown': 0 };
    var qualityDiff = (qualityOrder[b._sortQuality] || 0) - (qualityOrder[a._sortQuality] || 0);
    if (qualityDiff !== 0) return qualityDiff;
    var seedDiff = (b._sortSeeds || 0) - (a._sortSeeds || 0);
    if (seedDiff !== 0) return seedDiff;
    return (b._sortSizeBytes || 0) - (a._sortSizeBytes || 0);
  });

  return streams.slice(0, MAX_RESULTS).map(function (stream, index) {
    var num = index + 1;
    var prefix = (num < 10 ? '0' + num : num) + '. ';
    var magnet = buildMagnet(stream.infoHash, stream.behaviorHints.filename);
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

async function getStreams(input, mediaType, seasonNum, episodeNum) {
  try {
    var request = parseMediaRequest(input, mediaType, seasonNum, episodeNum);

    log('Fetching ' + request.mediaType
      + (request.tmdbId ? ' TMDB:' + request.tmdbId : '')
      + (request.title ? ' "' + request.title + '"' : '')
      + (request.season ? ' S' + request.season + 'E' + request.episode : ''));

    var mediaInfo = await resolveMediaInfo(request);
    if (!mediaInfo || !mediaInfo.title) {
      warn('No title or TMDB metadata available; cannot search.');
      return [];
    }

    var credentials = getSkTorrentCredentials(request);
    var cookie = credentials.uid && credentials.pass ? 'uid=' + credentials.uid + '; pass=' + credentials.pass : null;

    var categories = ALL_CATEGORIES;
    var queries = buildSearchQueries(mediaInfo, request.mediaType, request.season, request.episode);
    log('Searching: ' + queries.join(' | ') + (cookie ? ' (authenticated)' : ''));

    var torrents = await searchAllCategories(queries, categories, cookie, mediaInfo, request.mediaType, request.season, request.episode);
    var streams = torrentsToStreams(torrents, mediaInfo, request.mediaType, request.season, request.episode);
    log('Found ' + streams.length + ' magnet stream(s)');
    return streams;
  } catch (error) {
    warn('Error: ' + error.message);
    return [];
  }
}

async function onSettings() {
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

var api = {
  getStreams: getStreams,
  onSettings: onSettings,
  search: getStreams,
  parseTorrentBlocks: parseTorrentBlocks,
  buildSearchQueries: buildSearchQueries,
  normalizeText: normalizeText
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
  globalThis.sktorrent = api;
}
