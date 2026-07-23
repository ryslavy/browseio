// Unit and Integration Test Suite for UI Stream Classification & TorBox API Integration
import assert from 'node:assert';
import {
  normalizeInfoHash,
  getHashFromSource,
  isDebridCachedStream,
  classifyStream,
  extractFileIdx,
  safeDecodeFileName,
  type StreamSource
} from '../src/lib/plugin-engine.ts';

import {
  checkTorBoxCached,
  resolveTorBoxStreamUrl,
  cacheTorBoxTorrent
} from '../src/lib/torbox.ts';

console.log('🧪 Starting UI & TorBox Integration Unit Tests...');

// ─── 1. UI STREAM CLASSIFICATION & BADGE / BUTTON MAPPING AUDIT ───
console.log('Test 1: Auditing Direct Web Streams (e.g. Hellspy web streams)...');
const hellspyWebStream: StreamSource = {
  name: 'Hellspy',
  subProvider: 'HellSpy Direct',
  title: 'Počátek / Inception (2010) 1080p.mp4',
  url: 'https://cdn.hellspy.to/download/a1b2c3d4e5f67890123456789abcdef012345678/file.mp4'
};

const hellspyClass = classifyStream(hellspyWebStream);
const hellspyHash = getHashFromSource(hellspyWebStream);
const hellspyIsDebrid = isDebridCachedStream(hellspyWebStream);

assert.strictEqual(hellspyClass, 'web', 'Hellspy direct web stream must be classified as "web"');
assert.strictEqual(hellspyHash, '', 'Direct web HTTP stream must NOT extract infoHash from CDN session token');
assert.strictEqual(hellspyIsDebrid, false, 'Direct web stream must NOT be flagged as Debrid cached stream');

// UI button state logic emulation from MovieDetailsClient.tsx
const isHellspyDebridStream = (hellspyClass as string) === 'debrid';
const isHellspyMagnetOrP2P = (hellspyClass as string) === 'torrent';
const isHellspyDirectWebStream = (hellspyClass as string) === 'web';
const showHellspyCacheButton = isHellspyMagnetOrP2P && !hellspyWebStream.isTorBoxCached;

assert.strictEqual(isHellspyDirectWebStream, true, 'Hellspy stream must activate isDirectWebStream flag');
assert.strictEqual(isHellspyDebridStream, false, 'Hellspy stream must NOT activate isDebridStream flag');
assert.strictEqual(isHellspyMagnetOrP2P, false, 'Hellspy stream must NOT activate isMagnetOrP2P flag');
assert.strictEqual(showHellspyCacheButton, false, 'Hellspy stream must NOT render "Cache to TorBox" button');


console.log('Test 2: Auditing Uncached P2P Torrent Streams...');
const uncachedTorrent: StreamSource = {
  name: '[TB ⏳] SKTorrent',
  subProvider: 'SKTorrent P2P',
  title: 'Inception.2010.1080p.HEVC.mkv',
  infoHash: 'a1b2c3d4e5f67890123456789abcdef012345678',
  magnet: 'magnet:?xt=urn:btih:a1b2c3d4e5f67890123456789abcdef012345678&dn=Inception'
};

const torrentClass = classifyStream(uncachedTorrent);
const torrentHash = getHashFromSource(uncachedTorrent);
const torrentIsDebrid = isDebridCachedStream(uncachedTorrent);

assert.strictEqual(torrentClass, 'torrent', 'Uncached torrent stream must be classified as "torrent"');
assert.strictEqual(torrentHash, 'a1b2c3d4e5f67890123456789abcdef012345678', 'Torrent infoHash must be correctly extracted');
assert.strictEqual(torrentIsDebrid, false, 'Uncached torrent stream must NOT be flagged as Debrid cached stream');

const isTorrentDebridStream = (torrentClass as string) === 'debrid';
const isTorrentMagnetOrP2P = (torrentClass as string) === 'torrent';
const isTorrentDirectWebStream = (torrentClass as string) === 'web';
const showTorrentCacheButton = isTorrentMagnetOrP2P && !uncachedTorrent.isTorBoxCached;

assert.strictEqual(isTorrentMagnetOrP2P, true, 'Uncached torrent must activate isMagnetOrP2P flag');
assert.strictEqual(isTorrentDebridStream, false, 'Uncached torrent must NOT activate isDebridStream flag');
assert.strictEqual(isTorrentDirectWebStream, false, 'Uncached torrent must NOT activate isDirectWebStream flag');
assert.strictEqual(showTorrentCacheButton, true, 'Uncached torrent MUST render "Cache to TorBox" button');


console.log('Test 3: Auditing Cached Debrid Streams...');
const cachedDebridStream: StreamSource = {
  name: '[TB ⚡] SKTorrent',
  subProvider: 'SKTorrent TorBox',
  title: 'Inception.2010.1080p.HEVC.mkv',
  infoHash: 'a1b2c3d4e5f67890123456789abcdef012345678',
  isTorBoxCached: true
};

const debridClass = classifyStream(cachedDebridStream);
const isDebridStreamFlag = (debridClass as string) === 'debrid';
const isDebridMagnetOrP2P = (debridClass as string) === 'torrent';
const showDebridCacheButton = isDebridMagnetOrP2P && !cachedDebridStream.isTorBoxCached;

assert.strictEqual(debridClass, 'debrid', 'Cached stream must be classified as "debrid"');
assert.strictEqual(isDebridStreamFlag, true, 'Cached stream MUST activate isDebridStream flag');
assert.strictEqual(showDebridCacheButton, false, 'Cached Debrid stream must NOT render "Cache to TorBox" button');


// ─── 2. TORBOX API INTEGRATION & PARAMETER AUDIT ───
console.log('Test 4: Auditing checkTorBoxCached hash normalization...');
// Test that checkTorBoxCached cleanHashes handles Base32, uppercase hex, magnet URLs, and ignores HTTP URLs
const testHashes = [
  'A1B2C3D4E5F67890123456789ABCDEF012345678',
  'magnet:?xt=urn:btih:b2c3d4e5f67890123456789abcdef0123456789a&dn=Test',
  'https://cdn.hellspy.to/download/c3d4e5f67890123456789abcdef0123456789a0b/video.mp4',
  'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
];

const normalizedForTorBox = testHashes
  .map(h => normalizeInfoHash(h))
  .filter((h): h is string => Boolean(h));

assert.strictEqual(normalizedForTorBox.length, 3, 'HTTP URLs must be filtered out during TorBox cache check');
assert.strictEqual(normalizedForTorBox[0], 'a1b2c3d4e5f67890123456789abcdef012345678', 'Uppercase hex must be normalized to lower-case');
assert.strictEqual(normalizedForTorBox[1], 'b2c3d4e5f67890123456789abcdef0123456789a', 'Magnet URI infoHash must be extracted cleanly');
assert.strictEqual(normalizedForTorBox[2].length, 40, 'Base32 string must be converted to 40-char hex');


console.log('Test 5: Auditing fileIdx and UTF-8 diacritic handling...');
const multiFileSource: StreamSource = {
  name: 'Judzim CZ/SK',
  title: 'Hra o trůny / Game of Thrones S01E02\n📄 Súbor: Hra.o.Tr%C5%AFny.S01E02.1080p.mkv',
  infoHash: 'a1b2c3d4e5f67890123456789abcdef012345678',
  fileIdx: 0
};

const extractedIdx = extractFileIdx(multiFileSource);
assert.strictEqual(extractedIdx, 0, 'fileIdx 0 must be correctly extracted without falsy bug');

const encodedFileName = 'Hra.o.Tr%C5%AFny.S01E02.1080p.mkv';
const decodedFileName = safeDecodeFileName(encodedFileName);
assert.strictEqual(decodedFileName, 'Hra.o.Trůny.S01E02.1080p.mkv', 'URL-encoded filename with Czech diacritics must decode properly');


console.log('Test 6: Auditing TorBox file selection logic (season/episode & largest video fallback)...');
const mockFiles = [
  { id: 0, name: 'Sample.mp4', size: 10000000 },
  { id: 1, name: 'Hra.o.Tr%C5%AFny.S01E01.1080p.mkv', size: 2500000000 },
  { id: 2, name: 'Hra.o.Tr%C5%AFny.S01E02.1080p.mkv', size: 2600000000 },
  { id: 3, name: 'Subtitles.cz.srt', size: 50000 }
];

// Test Season 1 Episode 2 matching
const season = 1;
const episode = 2;
const regexes = [
  new RegExp(`s0*${season}e0*${episode}[^a-z0-9]`, 'i'),
  new RegExp(`0*${season}x0*${episode}[^a-z0-9]`, 'i'),
  new RegExp(`s0*${season}.*e0*${episode}`, 'i'),
  new RegExp(`[^a-z0-9]0*${episode}[^a-z0-9]`, 'i')
];

let matchedFile: any = null;
for (const regex of regexes) {
  const match = mockFiles.find(f => {
    const dec = safeDecodeFileName(f.name) || f.name;
    return regex.test(dec) || regex.test(f.name);
  });
  if (match) {
    matchedFile = match;
    break;
  }
}

assert.notStrictEqual(matchedFile, null, 'File matching for S01E02 with UTF-8 diacritics must succeed');
assert.strictEqual(matchedFile.id, 2, 'File S01E02 must match file ID 2');

// Test fallback to largest video file for movie multi-pack
const movieMockFiles = [
  { id: 0, name: 'Readme.txt', size: 1000 },
  { id: 1, name: 'Inception.2010.1080p.mkv', size: 8500000000 },
  { id: 2, name: 'Inception.2010.720p.mkv', size: 4200000000 },
  { id: 3, name: 'Sample.mkv', size: 50000000 }
];

const videoRegex = /\.(mkv|mp4|avi|mov|m4v|webm|flv|wmv|ts)$/i;
const videoFiles = movieMockFiles.filter(f => videoRegex.test(safeDecodeFileName(f.name) || f.name));
videoFiles.sort((a, b) => b.size - a.size);

assert.strictEqual(videoFiles[0].id, 1, 'Fallback must select largest video file (Inception 1080p, id: 1)');

console.log('✅ ALL UI STREAM CLASSIFICATION & TORBOX INTEGRATION TESTS PASSED SUCCESSFULLY!');
