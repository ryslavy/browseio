/**
 * E2E & Unit Test Suite for BrowseIO
 * Run with: npm test (node --experimental-strip-types scripts/run-e2e-tests.ts)
 */

import {
  normalizeInfoHash,
  base32ToHex,
  getHashFromSource,
  isDebridCachedStream,
  classifyStream,
  safeDecodeFileName,
  extractFileIdx,
  type StreamSource
} from '../src/lib/plugin-engine.ts';

import {
  detectAudioCodecs,
  isUnsupportedAudioCodec,
  getAudioCodecWarning,
  generateExternalPlayerUrl,
  createVideoPlayerFallbackState,
  convertSrtToVtt,
  normalizeSubtitles,
  detectStreamDubbing
} from '../src/lib/video-player-helpers.ts';

import {
  getLanguageName,
  formatCodecName,
  formatChannelCount,
  parseEbmlMatroska
} from '../src/lib/media-prober.ts';

import {
  filterCatalogItems,
  sortCatalogItems,
  parseImdbRating,
  parseReleaseYear
} from '../src/lib/catalog-sorter.ts';

import { t, CS_TRANSLATIONS, EN_TRANSLATIONS } from '../src/lib/i18n.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

function assertEquals<T>(actual: T, expected: T, testName: string) {
  const isMatch = JSON.stringify(actual) === JSON.stringify(expected);
  if (isMatch) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}\n      Expected: ${JSON.stringify(expected)}\n      Received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function runTests() {
  console.log('🚀 Running BrowseIO Core Test Suite...\n');

  // ==========================================
  // 1. InfoHash & Magnet Normalization Tests
  // ==========================================
  console.log('📦 1. Testing InfoHash & Magnet Normalization...');
  
  const sample40Hex = '4b22c7fd128a38c4c794cf21d8b1394f71a9da5e';
  assertEquals(
    normalizeInfoHash(sample40Hex),
    sample40Hex,
    'Normalizes raw 40-character hex string'
  );

  const sampleMagnet = `magnet:?xt=urn:btih:${sample40Hex}&dn=Inception.2010.1080p.mkv`;
  assertEquals(
    normalizeInfoHash(sampleMagnet),
    sample40Hex,
    'Extracts hex hash from magnet link with urn:btih'
  );

  const base32Hash = 'JJRMO7YSRE4MJR4UZ4Q5RMI5J5Y2TXS6';
  const expectedHexFromBase32 = base32ToHex(base32Hash);
  assertEquals(
    normalizeInfoHash(`magnet:?xt=urn:btih:${base32Hash}`),
    expectedHexFromBase32,
    'Converts 32-character base32 hash to 40-char hex'
  );

  assertEquals(
    normalizeInfoHash('https://hellspy.to/stream/direct-video.mp4'),
    '',
    'Does not extract false positive hash from direct web video URL'
  );

  assertEquals(
    getHashFromSource({ infoHash: sample40Hex }),
    sample40Hex,
    'Extracts hash directly from infoHash property'
  );

  assertEquals(
    getHashFromSource({ behaviorHints: { infoHash: sample40Hex } }),
    sample40Hex,
    'Extracts hash from Stremio behaviorHints.infoHash'
  );

  // ==========================================
  // 2. Stream Classification & Debrid Tests
  // ==========================================
  console.log('\n⚡ 2. Testing Stream Classification & Debrid Detection...');

  const directWebStream: StreamSource = {
    name: 'HellSpy',
    title: 'Inception 1080p Web',
    url: 'https://cdn.hellspy.cz/video/12345/stream.mp4',
    capabilities: { isWebOnly: true, supportsDebrid: false }
  };
  assertEquals(classifyStream(directWebStream), 'web', 'Classifies web-only source as "web"');

  const p2pTorrentStream: StreamSource = {
    name: 'Torrentio',
    title: 'Inception.2010.1080p.BluRay.x264',
    magnet: sampleMagnet,
    infoHash: sample40Hex,
    seeders: 45
  };
  assertEquals(classifyStream(p2pTorrentStream), 'torrent', 'Classifies un-cached torrent as "torrent"');

  const debridStreamTB: StreamSource = {
    name: '[TB+] Torrentio',
    title: 'Inception 1080p ⚡ Instant Debrid',
    url: 'https://api.torbox.app/v1/download/stream123',
    infoHash: sample40Hex
  };
  assert(isDebridCachedStream(debridStreamTB), 'Detects TorBox cached stream indicator [TB+]');
  assertEquals(classifyStream(debridStreamTB), 'debrid', 'Classifies resolved Debrid stream as "debrid"');

  const debridStreamRD: StreamSource = {
    name: '[RD+] Torrentio',
    title: 'Inception 4K UHD [RD+]',
    url: 'https://download.real-debrid.com/d/xyz/movie.mkv',
    infoHash: sample40Hex
  };
  assert(isDebridCachedStream(debridStreamRD), 'Detects Real-Debrid cached stream indicator [RD+]');
  assertEquals(classifyStream(debridStreamRD), 'debrid', 'Classifies Real-Debrid stream as "debrid"');

  const debridStreamTBAlt: StreamSource = {
    name: 'Torrentio',
    title: 'Inception 1080p [TB ⚡]',
    magnet: sampleMagnet,
    infoHash: sample40Hex
  };
  assert(isDebridCachedStream(debridStreamTBAlt), 'Detects TorBox [TB ⚡] in title');
  assertEquals(classifyStream(debridStreamTBAlt), 'debrid', 'Classifies [TB ⚡] as "debrid"');

  const debridStreamTBDirectUrl: StreamSource = {
    name: 'TorBox',
    title: 'Inception 1080p',
    url: 'https://api.torbox.app/v1/api/torrents/requestdl?token=abc&file_id=1',
    infoHash: sample40Hex
  };
  assert(isDebridCachedStream(debridStreamTBDirectUrl), 'Detects TorBox direct requestdl URL');
  assertEquals(classifyStream(debridStreamTBDirectUrl), 'debrid', 'Classifies TorBox requestdl as "debrid"');

  const debridStreamTBCachedObj: StreamSource = {
    name: 'Torrentio',
    title: 'Inception 1080p',
    magnet: sampleMagnet,
    infoHash: sample40Hex,
    isTorBoxCached: true
  };
  assert(isDebridCachedStream(debridStreamTBCachedObj), 'Detects isTorBoxCached: true flag');
  assertEquals(classifyStream(debridStreamTBCachedObj), 'debrid', 'Classifies isTorBoxCached: true as "debrid"');

  // ==========================================
  // 3. Stremio & Nuvio Scraper Helpers Tests
  // ==========================================
  console.log('\n🧩 3. Testing Stremio & Nuvio Scraper Helpers...');

  assertEquals(safeDecodeFileName('Avatar%20Way%20of%20Water.mkv'), 'Avatar Way of Water.mkv', 'Safely decodes URI encoded file names');
  assertEquals(extractFileIdx({ fileIdx: 2 }), 2, 'Extracts fileIdx number');
  assertEquals(extractFileIdx({ file_index: '4' }), 4, 'Extracts file_index string');
  assertEquals(extractFileIdx({ behaviorHints: { fileIdx: 7 } }), 7, 'Extracts fileIdx from behaviorHints');

  // ==========================================
  // 4. Video Player & Audio Codecs Tests
  // ==========================================
  console.log('\n🎬 4. Testing Video Player & Audio Codec Detection...');

  const dtsTitle = 'Dune.Part.Two.2024.1080p.BluRay.DTS-HD.MA.5.1';
  const detectedDts = detectAudioCodecs(dtsTitle);
  assert(detectedDts.includes('DTS') || detectedDts.includes('DTS-HD'), 'Detects DTS audio codec in title');
  assert(isUnsupportedAudioCodec(dtsTitle), 'Flags DTS as unsupported for browser HTML5');

  const ac3Title = 'Matrix.1999.UHD.Remux.AC3.5.1.Dual.Cz';
  const detectedAc3 = detectAudioCodecs(ac3Title);
  assert(detectedAc3.includes('AC3'), 'Detects AC3 audio codec in title');

  const cleanMp4Title = 'Cosmos.Laundromat.2015.1080p.AAC.mp4';
  assertEquals(detectAudioCodecs(cleanMp4Title), [], 'AAC is supported and returns no codec warnings');

  const fallbackState = createVideoPlayerFallbackState('https://example.com/video.mkv', dtsTitle);
  assert(fallbackState.isAudioUnsupported, 'Fallback state correctly marks unsupported audio');
  assert(fallbackState.audioWarning.includes('DTS'), 'Generates descriptive audio warning');
  assert(getAudioCodecWarning(dtsTitle).includes('DTS'), 'getAudioCodecWarning returns formatted warning');

  // External Player URLs
  assertEquals(
    generateExternalPlayerUrl('potplayer', 'https://stream.example.com/video.mp4'),
    'potplayer://https://stream.example.com/video.mp4',
    'Generates potplayer:// scheme URL'
  );
  assertEquals(
    generateExternalPlayerUrl('vlc', 'https://stream.example.com/video.mp4'),
    'vlc://https://stream.example.com/video.mp4',
    'Generates vlc:// scheme URL'
  );
  assertEquals(
    generateExternalPlayerUrl('mpv', 'https://stream.example.com/video.mp4'),
    'mpv://https://stream.example.com/video.mp4',
    'Generates mpv:// scheme URL'
  );
  assertEquals(
    generateExternalPlayerUrl('infuse', 'https://stream.example.com/video.mp4'),
    'infuse://https://stream.example.com/video.mp4',
    'Generates infuse:// scheme URL'
  );

  // Subtitle Conversion & Normalization Tests
  const sampleSrt = `1\n00:00:01,500 --> 00:00:04,000\nAhoj světe!\n`;
  const convertedVtt = convertSrtToVtt(sampleSrt);
  assert(convertedVtt.startsWith('WEBVTT'), 'convertSrtToVtt adds WEBVTT header');
  assert(convertedVtt.includes('00:00:01.500 --> 00:00:04.000'), 'convertSrtToVtt converts comma to period timestamp');

  const rawSubs = [
    { url: 'https://example.com/sub_cs.vtt', lang: 'cs', label: 'Čeština' },
    { src: 'https://example.com/sub_en.srt', srclang: 'en', default: true }
  ];
  const normalized = normalizeSubtitles(rawSubs);
  assertEquals(normalized.length, 2, 'normalizeSubtitles normalizes 2 subtitle entries');
  assertEquals(normalized[0].lang, 'cs', 'Preserves lang attribute');
  assert(Boolean(normalized[1].default), 'Preserves default flag on subtitle');

  // Dubbing Detection Tests
  assertEquals(detectStreamDubbing('Inception.2010.1080p.CZ.Dabing.mkv'), 'cz', 'Detects Czech dubbing');
  assertEquals(detectStreamDubbing('Inception.2010.720p.SK.Dabing.avi'), 'sk', 'Detects Slovak dubbing');
  assertEquals(detectStreamDubbing('Inception.2010.1080p.Dual-Audio.Cz.En.mkv'), 'dual', 'Detects Dual/Multi audio');
  assertEquals(detectStreamDubbing('Inception.2010.1080p.BluRay.x264.English'), 'en', 'Detects English audio');

  // ==========================================
  // 5. Catalog Sorter & Filter Tests
  // ==========================================
  console.log('\n📊 5. Testing Catalog Filtering & Sorting...');

  assertEquals(parseImdbRating('8.8'), 8.8, 'Parses numeric IMDb rating');
  assertEquals(parseImdbRating('N/A'), 0, 'Parses N/A rating to 0');
  assertEquals(parseReleaseYear('2024'), 2024, 'Parses 4-digit release year');
  assertEquals(parseReleaseYear('2008-2013'), 2008, 'Parses start year from range');

  const sampleMovies = [
    { id: '1', type: 'movie', name: 'The Shawshank Redemption', releaseInfo: '1994', imdbRating: '9.3', genres: ['Drama'] },
    { id: '2', type: 'movie', name: 'The Dark Knight', releaseInfo: '2008', imdbRating: '9.0', genres: ['Action', 'Crime', 'Drama'] },
    { id: '3', type: 'series', name: 'Breaking Bad', releaseInfo: '2008-2013', imdbRating: '9.5', genres: ['Crime', 'Drama'] },
    { id: '4', type: 'movie', name: 'Interstellar', releaseInfo: '2014', imdbRating: '8.7', genres: ['Adventure', 'Drama', 'Sci-Fi'] },
  ];

  const filteredMovies = filterCatalogItems(sampleMovies, { type: 'movie', genre: 'Action' });
  assertEquals(filteredMovies.length, 1, 'Filters catalog by media type and genre');
  assertEquals(filteredMovies[0].name, 'The Dark Knight', 'Matched Action movie');

  const sortedByRating = sortCatalogItems(sampleMovies, 'rating_desc');
  assertEquals(sortedByRating[0].name, 'Breaking Bad', 'Sorts by rating descending');

  const sortedByYear = sortCatalogItems(sampleMovies, 'release_desc');
  assertEquals(sortedByYear[0].name, 'Interstellar', 'Sorts by newest release year');

  // ==========================================
  // 6. i18n Translation System Tests
  // ==========================================
  console.log('\n🌐 6. Testing i18n Translation System...');

  assert(Boolean(t('nav.home')), 'Translates nav.home');
  assert(Boolean(t('streams.title')), 'Translates streams.title');
  assert(Boolean(t('catalog.movies')), 'Translates catalog.movies');
  assert(Boolean(t('player.subtitles')), 'Translates player.subtitles');
  assert(Boolean(t('player.stream_switcher')), 'Translates player.stream_switcher');
  assert(Boolean(t('player.error_unsupported_title')), 'Translates player.error_unsupported_title');
  assert(Boolean(t('player.multi_audio_note')), 'Translates player.multi_audio_note');

  // Verify 100% dictionary key parity between CS and EN
  const csKeys = Object.keys(CS_TRANSLATIONS);
  const enKeys = Object.keys(EN_TRANSLATIONS);
  assertEquals(csKeys.length, enKeys.length, `CS and EN translation maps have identical key count (${csKeys.length})`);

  for (const k of csKeys) {
    assert(Boolean(EN_TRANSLATIONS[k]), `EN translation map has key "${k}"`);
  }
  for (const k of enKeys) {
    assert(Boolean(CS_TRANSLATIONS[k]), `CS translation map has key "${k}"`);
  }

  // ==========================================
  // 7. Pure TypeScript Media Prober Tests
  // ==========================================
  console.log('\n🔬 7. Testing Pure TS Media Prober...');

  // ISO Language Mapping
  assertEquals(getLanguageName('cze').name, 'Čeština', 'Maps cze to Čeština');
  assertEquals(getLanguageName('ces').name, 'Čeština', 'Maps ces to Čeština');
  assertEquals(getLanguageName('slo').name, 'Slovenština', 'Maps slo to Slovenština');
  assertEquals(getLanguageName('eng').name, 'Angličtina', 'Maps eng to Angličtina');
  assertEquals(getLanguageName('eng', false).name, 'English', 'Maps eng to English in EN mode');

  // Codec Name Formatting
  assertEquals(formatCodecName('A_AC3'), 'AC3', 'Formats A_AC3 to AC3');
  assertEquals(formatCodecName('A_EAC3'), 'E-AC3', 'Formats A_EAC3 to E-AC3');
  assertEquals(formatCodecName('A_DTS'), 'DTS', 'Formats A_DTS to DTS');
  assertEquals(formatCodecName('V_MPEGH/ISO/HEVC'), 'HEVC (H.265)', 'Formats HEVC codec ID');
  assertEquals(formatCodecName('V_MPEG4/ISO/AVC'), 'AVC (H.264)', 'Formats AVC codec ID');

  // Channel Count Formatting
  assertEquals(formatChannelCount(2), '2.0 Stereo', 'Formats 2 channels as 2.0 Stereo');
  assertEquals(formatChannelCount(6), '5.1', 'Formats 6 channels as 5.1');
  assertEquals(formatChannelCount(8), '7.1', 'Formats 8 channels as 7.1');

  // Synthetic EBML Parser Validation
  const mockEbml = new Uint8Array([
    0x1A, 0x45, 0xDF, 0xA3, 0x8B, 0x42, 0x82, 0x88, 0x6D, 0x61, 0x74, 0x72, 0x6F, 0x73, 0x6B, 0x61,
    0x18, 0x53, 0x80, 0x67, 0xFF,
    0x16, 0x54, 0xAE, 0x6B, 0x80 + 27,
    // TrackEntry (0xAE, len 25)
    0xAE, 0x80 + 25,
    0x83, 0x81, 0x02, // TrackType: 2 (Audio)
    0xD7, 0x81, 0x01, // TrackNumber: 1
    0x86, 0x85, 0x41, 0x5F, 0x41, 0x43, 0x33, // CodecID: A_AC3
    0x22, 0xB5, 0x9C, 0x83, 0x63, 0x7A, 0x65, // Language: cze
    0xE1, 0x83, 0x9F, 0x81, 0x06 // Audio: Channels 6 (5.1)
  ]);
  const parsedRes = parseEbmlMatroska(mockEbml);
  assert(parsedRes.success, 'parseEbmlMatroska parsed valid EBML header');
  assertEquals(parsedRes.audio.length, 1, 'Extracted 1 audio track from EBML');
  assertEquals(parsedRes.audio[0]?.codec, 'AC3', 'Extracted AC3 codec from EBML');
  assertEquals(parsedRes.audio[0]?.langName, 'Čeština', 'Extracted Čeština language from EBML');
  assertEquals(parsedRes.audio[0]?.channelsDesc, '5.1', 'Extracted 5.1 channel layout from EBML');

  console.log('\n==========================================');
  console.log(`🎉 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('==========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
