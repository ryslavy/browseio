// sktonline.js - online.sktorrent.eu direct mp4 stream scraper for Nuvio
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

// Pure ES5 syntax, zero external dependencies (no Cheerio required)

function log(msg) {
  if (typeof console !== 'undefined' && console.log) {
    console.log('[SKTonline] ' + msg);
  }
}

function warn(msg) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[SKTonline] ' + msg);
  }
}

function getSafeFetch() {
  if (typeof fetch === 'function') return fetch;
  if (typeof globalThis !== 'undefined' && globalThis.fetch) return globalThis.fetch;
  if (typeof window !== 'undefined' && window.fetch) return window.fetch;
  if (typeof global !== 'undefined' && global.fetch) return global.fetch;
  throw new Error('fetch API is not available in this runtime');
}

function sleepSync(ms) {
  var start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait
  }
}

function pad(num, size) {
  var s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

function removeDiacritics(str) {
  if (!str) return '';
  try {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (e) {
    var map = {
      'á': 'a', 'č': 'c', 'ď': 'd', 'é': 'e', 'ě': 'e', 'í': 'i', 'ň': 'n', 'ó': 'o', 'ř': 'r', 'š': 's', 'ť': 't', 'ú': 'u', 'ů': 'u', 'ý': 'y', 'ž': 'z',
      'Á': 'A', 'Č': 'C', 'Ď': 'D', 'É': 'E', 'Ě': 'E', 'Í': 'I', 'Ň': 'N', 'Ó': 'O', 'Ř': 'R', 'Š': 'S', 'Ť': 'T', 'Ú': 'U', 'Ů': 'U', 'Ý': 'Y', 'Ž': 'Z',
      'ä': 'a', 'ô': 'o', 'ľ': 'l', 'ĺ': 'l', 'ŕ': 'r', 'ä': 'a', 'Ö': 'O', 'ö': 'o', 'Ü': 'U', 'ü': 'u', 'ß': 'ss'
    };
    var res = '';
    for (var i = 0; i < str.length; i++) {
      res += map[str[i]] || str[i];
    }
    return res;
  }
}

function shortenTitle(title, wordCount) {
  if (!wordCount) wordCount = 3;
  return title.split(/\s+/).slice(0, wordCount).join(" ");
}

function detectLanguages(title, subtitles, originalTitle) {
  var titleLower = title.toLowerCase();
  var origLower = (originalTitle || '').toLowerCase();
  var audio = [];
  var tit = [];

  var isCzechProd = (titleLower === origLower) && origLower.length > 3 && !/\b(en|eng|english)\b/i.test(titleLower);

  var hasCzDab = /\b(cz[\s.\-]*(dab|dub)|(česk[ýé]|cesk[ye])[\s.]+(dab|dub)|dabing[\s.]+(cz|česk[ýé]|cesk[ye]))/i.test(titleLower);
  var hasSkDab = /\b(sk[\s.\-]*(dab|dub)|(slovensk[ýé]|slovensk[ye])[\s.]+(dab|dub)|dabing[\s.]+(sk|slovensk[ýé]|slovensk[ye]))/i.test(titleLower);
  var hasCzTag = /\b(cz|cze|ces|cesky|česky|ceske|české)\b/i.test(titleLower);
  var hasSkTag = /\b(sk|sl|slo|slov|slovensky|slovenský)\b/i.test(titleLower);
  var hasSubTag = /\b(titulky|tit|cztit|sktit|subtitles|subs|cz-tit|sk-tit)\b/i.test(titleLower);

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
    if (/\b(en|eng|english|orig)\b/i.test(titleLower)) audio.push('EN');
    else audio.push('EN');
  }

  if (subtitles && subtitles.length > 0) {
    for (var i = 0; i < subtitles.length; i++) {
      var lang = (subtitles[i].language || '').toLowerCase();
      var label = lang;
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

function formatStream(label, titleText, originalTitle) {
  var quality = /1080p/i.test(label) ? "1080p" :
    /720p|HD/i.test(label) ? "720p" :
      /480p|SD/i.test(label) ? "480p" :
        /360p|LD/i.test(label) ? "360p" : "SD";

  var qIcon = quality;
  if (quality === '1080p' || quality === '720p') qIcon = '🎞️ ' + quality;
  else qIcon = '📺 ' + quality;

  var langs = detectLanguages(titleText, [], originalTitle);
  var langString = '';
  var langArr = [];
  if (langs.audio.length > 0) langArr.push('🔊 ' + langs.audio.join('/'));
  if (langs.subtitles.length > 0) langArr.push('💬 ' + langs.subtitles.join('/'));
  langString = langArr.join(' | ');

  var infoLines = [
    '🎬 SkT Online | 🕒 Online Stream',
    qIcon + ' / MP4',
    langString
  ].filter(Boolean);

  var name = '🇸🇰 SkT Online | ' + qIcon + (langArr.length > 0 ? ' | ' + langArr[0] : '');
  var title = titleText + '\n' + infoLines.join('\n');

  return { name: name, title: title };
}

function decodeHtml(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

async function resolveMediaInfo(request) {
  if (request.title) {
    return {
      title: request.title,
      originalTitle: request.originalTitle || request.title,
      year: request.year || '',
      altTitles: request.altTitles || []
    };
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
      var cinemetaType = request.mediaType === 'tv' ? 'series' : 'movie';
      var cinemetaUrl = 'https://v3-cinemeta.strem.io/meta/' + cinemetaType + '/' + request.tmdbId + '.json';
      log('Fetching metadata from Cinemeta: ' + cinemetaUrl);
      var res = await safeFetch(cinemetaUrl);
      if (!res.ok) throw new Error('Cinemeta HTTP ' + res.status);
      var data = await res.json();
      if (!data || !data.meta) throw new Error('Empty Cinemeta metadata');
      var meta = data.meta;
      var name = meta.name;
      var year = meta.year ? String(meta.year) : '';
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
          var altTitles = [];
          if (tmdbData.alternative_titles && (tmdbData.alternative_titles.titles || tmdbData.alternative_titles.results)) {
            var list = tmdbData.alternative_titles.titles || tmdbData.alternative_titles.results;
            for (var j = 0; j < list.length; j++) {
              var alt = list[j];
              if (alt.iso_3166_1 === 'CZ' || alt.iso_3166_1 === 'SK' || alt.iso_3166_1 === 'US' || alt.iso_3166_1 === 'GB') {
                altTitles.push(alt.title);
              }
            }
          }
          var tmdbYear = '';
          if (tmdbData.release_date) tmdbYear = tmdbData.release_date.split('-')[0];
          else if (tmdbData.first_air_date) tmdbYear = tmdbData.first_air_date.split('-')[0];

          return {
            title: czTitle,
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
      var tmdbUrl = 'https://api.themoviedb.org/3/' + type + '/' + request.tmdbId + '?api_key=' + tmdbApiKey + '&language=cs-CZ&append_to_response=translations,alternative_titles';
      log('Fetching from TMDB for numeric ID: ' + request.tmdbId);
      var res = await safeFetch(tmdbUrl);
      if (!res.ok) throw new Error('TMDB HTTP ' + res.status);
      var data = await res.json();
      if (!data) return null;
      var title = data.title || data.name || data.original_title || data.original_name;
      var originalTitle = data.original_title || data.original_name || title;
      var year = '';
      if (data.release_date) {
        year = data.release_date.split('-')[0];
      } else if (data.first_air_date) {
        year = data.first_air_date.split('-')[0];
      }

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

      var altTitles = [];
      if (data.alternative_titles && (data.alternative_titles.titles || data.alternative_titles.results)) {
        var list = data.alternative_titles.titles || data.alternative_titles.results;
        for (var j = 0; j < list.length; j++) {
          var alt = list[j];
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
  } catch (error) {
    warn('Failed to resolve metadata: ' + error.message);
    return {
      title: request.title || 'Unknown',
      originalTitle: request.title || 'Unknown',
      year: '',
      altTitles: []
    };
  }
}

function buildSearchQueries(meta, request) {
  var queries = [];
  var cleanTitle = meta.title.replace(/\(.*?\)/g, '').replace(/[:\-–—,\.]/g, ' ').replace(/\s+/g, ' ').trim();
  var origTitle = meta.originalTitle.replace(/\(.*?\)/g, '').replace(/[:\-–—,\.]/g, ' ').replace(/\s+/g, ' ').trim();

  var titles = [cleanTitle];
  if (origTitle && origTitle !== cleanTitle) {
    titles.push(origTitle);
  }

  for (var i = 0; i < titles.length; i++) {
    var t = titles[i];
    if (request.mediaType === 'tv' && request.season && request.episode) {
      var epTag = 'S' + pad(request.season, 2) + 'E' + pad(request.episode, 2);
      queries.push(t + ' ' + epTag);
    } else {
      if (meta.year) {
        queries.push(t + ' ' + meta.year);
      } else {
        queries.push(t);
      }
    }
  }

  var uniqueQueries = [];
  for (var j = 0; j < queries.length; j++) {
    var q = queries[j].trim();
    if (q && uniqueQueries.indexOf(q) === -1) {
      uniqueQueries.push(q);
    }
  }
  return uniqueQueries;
}

async function searchOnlineVideos(query) {
  var url = 'https://online.sktorrent.eu/search/videos?search_query=' + encodeURIComponent(query);
  var headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity',
    'Range': 'bytes=0-'
  };

  log('Searching: ' + query);
  var safeFetch = getSafeFetch();
  try {
    var res = await safeFetch(url, { headers: headers });
    if (!res.ok) throw new Error('Search HTTP ' + res.status);
    var html = await res.text();
    if (!html) return [];
    var links = [];
    var linkRegex = /\/video\/(\d+)/gi;
    var match;
    while ((match = linkRegex.exec(html)) !== null) {
      var id = match[1];
      if (links.indexOf(id) === -1) {
        links.push(id);
      }
    }
    log('Found ' + links.length + ' video IDs for query: ' + query);
    return links;
  } catch (err) {
    warn('Search failed for "' + query + '": ' + err.message);
    return [];
  }
}

async function extractStreamsFromVideoId(videoId, meta) {
  var url = 'https://online.sktorrent.eu/video/' + videoId;
  var headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity',
    'Range': 'bytes=0-'
  };

  log('Extracting video detail: ' + videoId);
  var safeFetch = getSafeFetch();
  try {
    var res = await safeFetch(url, { headers: headers });
    if (!res.ok) throw new Error('Detail HTTP ' + res.status);
    var html = await res.text();
    if (!html) return [];

    var titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    var titleText = titleMatch ? decodeHtml(titleMatch[1].trim()) : 'Unknown';
    titleText = titleText.replace(/\s*-\s*SkTonline\s*/gi, '');

    var streams = [];

    var sourceRegex = /<source\s+([^>]*)/gi;
    var srcMatch;
    while ((srcMatch = sourceRegex.exec(html)) !== null) {
      var attrs = srcMatch[1];
      var urlMatch = attrs.match(/src=["']([^"']+)["']/i);
      if (urlMatch) {
        var src = urlMatch[1];
        if (src.indexOf('.mp4') !== -1) {
          src = src.replace(/([^:])\/\/+/g, '$1/');
          var labelMatch = attrs.match(/label=["']([^"']+)["']/i);
          var label = labelMatch ? labelMatch[1] : 'Unknown';

          var formatted = formatStream(label, titleText, meta ? meta.originalTitle : null);

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
  } catch (err) {
    warn('Detail extraction failed for ID ' + videoId + ': ' + err.message);
    return [];
  }
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
  return request;
}

async function getStreams(input, mediaType, season, episode) {
  try {
    var request = parseMediaRequest(input, mediaType, season, episode);
    var meta = await resolveMediaInfo(request);
    if (!meta) return [];
    var queries = buildSearchQueries(meta, request);
    var allStreams = [];

    for (var index = 0; index < queries.length; index++) {
      if (allStreams.length >= 15) break;
      var query = queries[index];
      if (index > 0) {
        sleepSync(500);
      }
      try {
        var videoIds = await searchOnlineVideos(query);
        if (videoIds.length === 0) continue;

        var streamsList = [];
        for (var dIndex = 0; dIndex < Math.min(videoIds.length, 6); dIndex++) {
          if (dIndex > 0) {
            sleepSync(500);
          }
          try {
            var resStreams = await extractStreamsFromVideoId(videoIds[dIndex], meta);
            for (var s = 0; s < resStreams.length; s++) {
              streamsList.push(resStreams[s]);
            }
          } catch (err) {
            // Ignore details errors
          }
        }

        for (var k = 0; k < streamsList.length; k++) {
          allStreams.push(streamsList[k]);
        }
        if (allStreams.length > 0) {
          break;
        }
      } catch (err) {
        warn('Search step failed: ' + err.message);
      }
    }

    log('Returning ' + allStreams.length + ' streams to Nuvio.');
    return allStreams.map(function (stream, index) {
      var num = index + 1;
      var prefix = (num < 10 ? '0' + num : num) + '. ';
      return {
        name: prefix + stream.name,
        title: stream.title,
        url: stream.url,
        behaviorHints: stream.behaviorHints
      };
    });
  } catch (err) {
    warn('getStreams crashed: ' + err.message);
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getStreams: getStreams
  };
}
