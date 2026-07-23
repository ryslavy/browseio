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

var HELLSPY_API_BASE = 'https://api.hellspy.to';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var MAX_RESULTS = 20;

function log(message) {
  if (typeof console !== 'undefined' && console.log) {
    console.log('[Hellspy] ' + message);
  }
}

function warn(message) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[Hellspy] ' + message);
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

function formatBytes(bytes) {
  if (!bytes) return 'Unknown size';
  var units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return bytes.toFixed(2) + ' ' + units[i];
}

function formatDuration(seconds) {
  if (!seconds) return '';
  var hrs = Math.floor(seconds / 3600);
  var mins = Math.floor((seconds % 3600) / 60);
  var secs = seconds % 60;
  var parts = [];
  if (hrs > 0) parts.push(hrs);
  parts.push(String(mins).padStart(2, '0'));
  parts.push(String(secs).padStart(2, '0'));
  return parts.join(':');
}

function cleanText(text) {
  if (!text) return '';
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
    '4219e299c89411838049ab0dab19ebd5';

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
              if (alt.iso_3166_1 === 'CZ' || alt.iso_3166_1 === 'SK') {
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

function buildSearchQueries(mediaInfo, mediaType, seasonNum, episodeNum) {
  var queries = [];
  var titleVariants = [mediaInfo.title, mediaInfo.originalTitle].concat(mediaInfo.altTitles || []);

  var dedupedVariants = [];
  var seen = {};
  for (var i = 0; i < titleVariants.length; i++) {
    var v = titleVariants[i];
    if (!v) continue;
    var norm = cleanText(v);
    if (!seen[norm]) {
      seen[norm] = true;
      dedupedVariants.push({
        full: v.trim(),
        short: v.replace(/[:\-–—,\.]/g, ' ').replace(/\s+/g, ' ').trim()
      });
    }
  }

  function addQuery(list, q) {
    if (!q) return;
    var clean = q.trim();
    if (clean.length > 0 && list.indexOf(clean) === -1) {
      list.push(clean);
    }
  }

  if (mediaType === 'movie') {
    for (var j = 0; j < dedupedVariants.length; j++) {
      var item = dedupedVariants[j];
      if (mediaInfo.year) {
        addQuery(queries, item.full + ' ' + mediaInfo.year);
        addQuery(queries, item.short + ' ' + mediaInfo.year);
      }
      addQuery(queries, item.full);
      addQuery(queries, item.short);
    }
  } else {
    var sPad = String(seasonNum || 1).padStart(2, '0');
    var ePad = String(episodeNum || 1).padStart(2, '0');

    for (var d = 0; d < dedupedVariants.length; d++) {
      var tvItem = dedupedVariants[d];
      addQuery(queries, tvItem.full + ' S' + sPad + 'E' + ePad);
      addQuery(queries, tvItem.short + ' S' + sPad + 'E' + ePad);
      addQuery(queries, tvItem.full + ' ' + seasonNum + 'x' + ePad);
      addQuery(queries, tvItem.short + ' ' + seasonNum + 'x' + ePad);
    }
  }

  return queries;
}

function matchesMedia(videoTitle, mediaInfo, mediaType, seasonNum, episodeNum) {
  var tNorm = cleanText(videoTitle);
  var mainNorm = cleanText(mediaInfo.title);
  var origNorm = cleanText(mediaInfo.originalTitle);

  var hasNameMatch = false;
  var names = [mainNorm, origNorm];
  if (mediaInfo.altTitles) {
    for (var a = 0; a < mediaInfo.altTitles.length; a++) {
      names.push(cleanText(mediaInfo.altTitles[a]));
    }
  }

  for (var i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    if (tNorm.indexOf(names[i]) !== -1) {
      hasNameMatch = true;
      break;
    }
  }

  if (!hasNameMatch) return false;

  if (mediaType === 'movie') {
    if (mediaInfo.year) {
      // Only reject if a year IS found in the title and it doesn't match.
      // If the file has no year in its name, allow it through.
      var yearInTitle = videoTitle.match(/\b(19|20)\d{2}\b/);
      if (yearInTitle) {
        var titleYear = parseInt(yearInTitle[0], 10);
        if (Math.abs(titleYear - parseInt(mediaInfo.year, 10)) > 1) return false;
      }
    }
    return true;
  } else {
    var s = parseInt(seasonNum, 10);
    var e = parseInt(episodeNum, 10);

    var sPad = String(s).padStart(2, '0');
    var ePad = String(e).padStart(2, '0');

    var epPatterns = [
      new RegExp('s' + sPad + 'e' + ePad + '\\b', 'i'),
      new RegExp('\\b' + s + 'x' + ePad + '\\b', 'i'),
      new RegExp('\\bs' + sPad + 'e' + e + '\\b', 'i'),
      new RegExp('\\b' + s + 'x' + e + '\\b', 'i'),
      new RegExp('e' + ePad + '\\b', 'i')
    ];

    var matchEp = false;
    for (var p = 0; p < epPatterns.length; p++) {
      if (epPatterns[p].test(tNorm)) {
        matchEp = true;
        break;
      }
    }

    if (matchEp) return true;

    var seasonPatterns = [
      new RegExp('s' + sPad + '\\b', 'i'),
      new RegExp('\\b' + s + '\\.\\s*seri', 'i'),
      new RegExp('\\b' + s + '\\s*seri', 'i'),
      new RegExp('\\b' + s + '\\.\\s*rad', 'i'),
      new RegExp('\\b' + s + '\\s*rad', 'i')
    ];

    var matchSeason = false;
    for (var sp = 0; sp < seasonPatterns.length; sp++) {
      if (seasonPatterns[sp].test(tNorm)) {
        matchSeason = true;
        break;
      }
    }

    if (matchSeason) {
      var otherEpMatch = tNorm.match(/e(\d+)\b|(\d+)x(\d+)\b/i);
      if (otherEpMatch) {
        var matchedEpNum = otherEpMatch[1] ? parseInt(otherEpMatch[1], 10) : parseInt(otherEpMatch[3], 10);
        if (matchedEpNum !== e) {
          return false;
        }
      }
      return true;
    }

    return false;
  }
}

function getQualityFromTitle(title) {
  var norm = title.toLowerCase();
  if (norm.indexOf('2160p') !== -1 || norm.indexOf('4k') !== -1 || norm.indexOf('uhd') !== -1) return '4K';
  if (norm.indexOf('1440p') !== -1) return '1440p';
  if (norm.indexOf('1080p') !== -1 || norm.indexOf('fhd') !== -1) return '1080p';
  // Use word boundary for 'hd' to avoid false matches (shader, shadow...)
  if (norm.indexOf('720p') !== -1 || /\bhd\b/.test(norm)) return '720p';
  if (norm.indexOf('576p') !== -1) return '576p';
  if (norm.indexOf('480p') !== -1) return '480p';
  return 'Unknown';
}

async function searchHellspy(query) {
  var url = HELLSPY_API_BASE + '/gw/search?query=' + encodeURIComponent(query) + '&offset=0&limit=64';
  var headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json'
  };
  var safeFetch = getSafeFetch();
  try {
    var res = await safeFetch(url, { headers: headers });
    if (!res.ok) throw new Error('Search failed: ' + res.status);
    var data = await res.json();
    return data.items || [];
  } catch (err) {
    warn('Search error for query "' + query + '": ' + err.message);
    return [];
  }
}

async function fetchVideoDetails(id, fileHash) {
  var url = HELLSPY_API_BASE + '/gw/video/' + id + '/' + fileHash;
  var headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Origin': 'https://hellspy.to',
    'Referer': 'https://hellspy.to/'
  };
  var safeFetch = getSafeFetch();
  try {
    var res = await safeFetch(url, { headers: headers });
    if (!res.ok) throw new Error('Details failed: ' + res.status);
    return await res.json();
  } catch (err) {
    warn('Details error for ID ' + id + ': ' + err.message);
    return null;
  }
}

function detectLanguages(title, subtitlesFromApi, originalTitle) {
  var titleLower = title.toLowerCase();
  var origLower = (originalTitle || '').toLowerCase();
  var audio = [];
  var subs = [];

  // Czech/Slovak production check: same title as original and not English
  var isCzechProd = origLower.length > 3 &&
    (titleLower === origLower) &&
    !/\b(en|eng|english)\b/i.test(origLower);

  // Explicit dubbing markers - highest priority
  var hasCzDab = /\b(cz[\s\.\-]*(dab|dub)|cesk[yý]\s+(dab|dub)|dabing[\s\.\-]*(cz|cesk[yý]))/i.test(titleLower);
  var hasSkDab = /\b(sk[\s\.\-]*(dab|dub)|slovensk[yý]\s+(dab|dub)|dabing[\s\.\-]*(sk|slovensk[yý]))/i.test(titleLower);

  // Explicit subtitle-only markers
  var hasCzSub = /\b(cztit|cz[\s\-\.]*tit(ulky)?|cesk[eé][\s\.\-]*titulky|titulky[\s\.\-]*cz)\b/i.test(titleLower);
  var hasSkSub = /\b(sktit|sk[\s\-\.]*tit(ulky)?|slovensk[eé][\s\.\-]*titulky|titulky[\s\.\-]*sk)\b/i.test(titleLower);

  // Generic language tags (ambiguous - could be audio or subs depending on context)
  var hasCzTag = /\b(cz|cze|ces|cesky|česky)\b/i.test(titleLower);
  var hasSkTag = /\b(sk|slo|slov|slovensky|slovenský)\b/i.test(titleLower);
  var hasGenericSubTag = /\b(titulky|subtitles|subs)\b/i.test(titleLower) && !hasCzSub && !hasSkSub;

  // --- Audio detection ---
  if (hasCzDab) {
    audio.push('CZ');
  } else if (hasSkDab) {
    audio.push('SK');
  } else if (isCzechProd) {
    audio.push('CZ');
  } else {
    // Generic tag without explicit subtitle marker = treat as audio
    if (hasCzTag && !hasCzSub) audio.push('CZ');
    if (hasSkTag && !hasSkSub && audio.indexOf('SK') === -1) audio.push('SK');
  }
  if (audio.length === 0) audio.push('EN');

  // --- Subtitle detection (API data takes priority over title analysis) ---
  if (subtitlesFromApi && subtitlesFromApi.length > 0) {
    for (var i = 0; i < subtitlesFromApi.length; i++) {
      var lang = (subtitlesFromApi[i].language || '').toLowerCase();
      var label;
      if (lang === 'cze' || lang === 'cs' || lang === 'cz') label = 'CZ';
      else if (lang === 'sk' || lang === 'slo') label = 'SK';
      else if (lang === 'eng' || lang === 'en') label = 'EN';
      else label = lang.substring(0, 2).toUpperCase();
      if (subs.indexOf(label) === -1) subs.push(label);
    }
  }

  // Title-based subtitle detection
  if (hasCzSub && subs.indexOf('CZ') === -1) subs.push('CZ');
  if (hasSkSub && subs.indexOf('SK') === -1) subs.push('SK');
  // Generic sub tag + CZ/SK generic tag = probably subtitles
  if (hasGenericSubTag && hasCzTag && subs.indexOf('CZ') === -1) subs.push('CZ');
  if (hasGenericSubTag && hasSkTag && subs.indexOf('SK') === -1) subs.push('SK');

  return { audio: audio, subtitles: subs };
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

    var queries = buildSearchQueries(mediaInfo, request.mediaType, request.season, request.episode);
    log('Searching queries: ' + queries.join(' | '));

    // Run all search queries in parallel for speed
    var resultsArray = await Promise.all(queries.map(function (q) { return searchHellspy(q); }));

    var allItems = [];
    var idMap = {};
    for (var i = 0; i < resultsArray.length; i++) {
      var items = resultsArray[i];
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (!idMap[item.id]) {
          idMap[item.id] = true;
          allItems.push(item);
        }
      }
    }

    var matchedItems = allItems.filter(function (video) {
      return matchesMedia(video.title, mediaInfo, request.mediaType, request.season, request.episode);
    });

    log('Found ' + allItems.length + ' videos, matches: ' + matchedItems.length);
    if (matchedItems.length === 0) return [];

    var limitItems = matchedItems.slice(0, MAX_RESULTS);
    var detailsList = [];
    for (var k = 0; k < limitItems.length; k++) {
      var details = await fetchVideoDetails(limitItems[k].id, limitItems[k].fileHash);
      if (details) {
        detailsList.push(details);
      }
    }

    var streams = [];
    for (var d = 0; d < detailsList.length; d++) {
      var details = detailsList[d];
      if (!details || !details.conversions) continue;

      var playUrl = null;
      var convQuality = 'SD';
      var titleQuality = getQualityFromTitle(details.title);

      var keys = Object.keys(details.conversions);
      var bestKey = null;
      if (keys.indexOf('0') !== -1) {
        bestKey = '0';
      } else if (keys.length > 0) {
        keys.sort(function (a, b) {
          return parseInt(b, 10) - parseInt(a, 10);
        });
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

      var sizeStr = formatBytes(details.size);
      var durationStr = formatDuration(details.duration);
      var displayTitle = details.title;

      var subList = [];
      if (details.subtitles && details.subtitles.length > 0) {
        subList = details.subtitles.map(function (sub) {
          return {
            url: sub.url,
            language: sub.language || 'cze',
            name: sub.title || sub.language || 'Subtitles'
          };
        });
      }

      var langs = detectLanguages(displayTitle, subList, mediaInfo.originalTitle);
      var langString = '';
      var langArr = [];
      if (langs.audio.length > 0) langArr.push('🔊 ' + langs.audio.join('/'));
      if (langs.subtitles.length > 0) langArr.push('💬 ' + langs.subtitles.join('/'));
      langString = langArr.join(' | ');

      var qIcon = convQuality;
      if (convQuality === '4K' || convQuality === '1440p') qIcon = '🌟 ' + convQuality;
      else if (convQuality === '1080p' || convQuality === '720p') qIcon = '🎞️ ' + convQuality;
      else if (convQuality !== 'Unknown') qIcon = '📺 ' + convQuality;
      else qIcon = '📺 SD';

      var infoLines = [
        '🎬 Hellspy | 💾 ' + sizeStr,
        qIcon + (durationStr ? ' / ' + durationStr : ''),
        langString
      ].filter(Boolean);

      var name = '🇨🇿 Hellspy | ' + qIcon + (langArr.length > 0 ? ' | ' + langArr[0] : '');
      var title = displayTitle + '\n' + infoLines.join('\n');

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

    streams.sort(function (a, b) {
      var qualityOrder = { '4K': 6, '1440p': 5, '1080p': 4, '720p': 3, '576p': 2, '480p': 1, 'SD': 0, 'Unknown': 0 };
      var qualityDiff = (qualityOrder[b._sortQuality] || 0) - (qualityOrder[a._sortQuality] || 0);
      if (qualityDiff !== 0) return qualityDiff;
      return (b._sortSizeBytes || 0) - (a._sortSizeBytes || 0);
    });

    log('Returning ' + streams.length + ' direct streams');
    return streams.map(function (stream, index) {
      var num = index + 1;
      var prefix = (num < 10 ? '0' + num : num) + '. ';
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
  } catch (error) {
    warn('Error: ' + error.message);
    return [];
  }
}

function onSettings() {
  return Promise.resolve([]);
}

var api = {
  getStreams: getStreams,
  onSettings: onSettings,
  search: getStreams,
  buildSearchQueries: buildSearchQueries,
  matchesMedia: matchesMedia
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.getStreams = getStreams;
  globalThis.hellspy = api;
}
