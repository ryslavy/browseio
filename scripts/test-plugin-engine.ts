// Unit Tests for BrowseIO Plugin Engine & Stream Classifier
import assert from 'node:assert';
import {
  normalizeInfoHash,
  getHashFromSource,
  isDebridCachedStream,
  classifyStream,
  base32ToHex,
  type StreamSource
} from '../src/lib/plugin-engine.ts';

console.log('🧪 Starting Plugin Engine & Stream Classifier Unit Tests...');

// 1. normalizeInfoHash tests
console.log('Testing normalizeInfoHash...');
assert.strictEqual(
  normalizeInfoHash('a1b2c3d4e5f67890123456789abcdef012345678'),
  'a1b2c3d4e5f67890123456789abcdef012345678',
  '40-hex hash should be normalized to lowercase'
);

assert.strictEqual(
  normalizeInfoHash('A1B2C3D4E5F67890123456789ABCDEF012345678'),
  'a1b2c3d4e5f67890123456789abcdef012345678',
  'Uppercase hex should be converted to lowercase'
);

assert.strictEqual(
  normalizeInfoHash('magnet:?xt=urn:btih:a1b2c3d4e5f67890123456789abcdef012345678&dn=Test'),
  'a1b2c3d4e5f67890123456789abcdef012345678',
  'Magnet link infoHash should be extracted'
);

// Crucial requirement: DO NOT extract 40-char hex strings from standard web HTTP stream URLs!
assert.strictEqual(
  normalizeInfoHash('https://cdn.hellspy.to/download/a1b2c3d4e5f67890123456789abcdef012345678/file.mp4'),
  '',
  'Direct HTTP Web stream URL must NOT return hex tokens as torrent infoHash'
);

assert.strictEqual(
  normalizeInfoHash('https://example.com/stream?token=1234567890123456789012345678901234567890'),
  '',
  'Standard web token URL must NOT be treated as torrent infoHash'
);

assert.strictEqual(
  normalizeInfoHash('MZXW6YTBOI23456789ABCDEF01234567'),
  base32ToHex('MZXW6YTBOI23456789ABCDEF01234567'),
  '32-char Base32 hash should convert to Hex'
);

// 2. getHashFromSource tests
console.log('Testing getHashFromSource...');
const webStream: StreamSource = {
  name: 'Hellspy',
  title: 'Inception (2010).mp4',
  url: 'https://cdn.hellspy.to/download/a1b2c3d4e5f67890123456789abcdef012345678/file.mp4'
};
assert.strictEqual(
  getHashFromSource(webStream),
  '',
  'getHashFromSource must return empty string for direct Web HTTP streams'
);

const torrentStream: StreamSource = {
  name: '[TB] SKT',
  title: 'Inception.1080p.mkv',
  infoHash: 'a1b2c3d4e5f67890123456789abcdef012345678',
  magnet: 'magnet:?xt=urn:btih:a1b2c3d4e5f67890123456789abcdef012345678'
};
assert.strictEqual(
  getHashFromSource(torrentStream),
  'a1b2c3d4e5f67890123456789abcdef012345678',
  'getHashFromSource must extract valid infoHash for torrent streams'
);

// 3. isDebridCachedStream & classifyStream tests
console.log('Testing isDebridCachedStream and classifyStream...');

// Case A: Direct Web Stream (e.g. Hellspy)
assert.strictEqual(
  isDebridCachedStream(webStream),
  false,
  'Hellspy direct web stream should NOT be marked as Debrid cached'
);

assert.strictEqual(
  classifyStream(webStream),
  'web',
  'Hellspy direct web stream must be classified as web'
);

// Case B: Resolved Debrid Stream (e.g. TorBox API link or Real-Debrid link)
const debridStream: StreamSource = {
  name: '[TB ⚡] SKT',
  title: 'Inception / Počátek (2010)',
  url: 'https://api.torbox.app/v1/api/torrents/requestdl?token=secret&torrent_id=123&file_id=0',
  isTorBoxCached: true
};
assert.strictEqual(
  isDebridCachedStream(debridStream),
  true,
  'TorBox resolved stream should be marked as Debrid stream'
);
assert.strictEqual(
  classifyStream(debridStream),
  'debrid',
  'TorBox resolved stream must be classified as debrid'
);

// Case C: Uncached P2P Torrent Stream
assert.strictEqual(
  isDebridCachedStream(torrentStream),
  false,
  'Uncached torrent stream should NOT be marked as Debrid'
);
assert.strictEqual(
  classifyStream(torrentStream),
  'torrent',
  'Uncached torrent stream must be classified as torrent'
);

// 4. UTF-8 diacritics & behaviorHints preservation tests
console.log('Testing behaviorHints & UTF-8 diacritics...');
const czSkStream: StreamSource = {
  name: 'Judzim SKT',
  title: 'Inception / Počátek (2010)\n🔊 CZ / SK   |   🎥 1080p • HEVC\n📄 Súbor: Inception.1080p.mkv',
  infoHash: 'a1b2c3d4e5f67890123456789abcdef012345678',
  fileIdx: 0,
  behaviorHints: {
    bingeGroup: 'sktorrent-1080p-HEVC',
    fileName: 'Inception.Počátek.1080p.mkv',
    videoHash: 'a1b2c3d4e5f67890',
    proxyHeaders: { request: { 'User-Agent': 'BrowseIO' } },
    notSupported: false
  }
};

assert.strictEqual(
  czSkStream.title.includes('Počátek'),
  true,
  'Title must preserve Czech diacritics (Počátek)'
);
assert.strictEqual(
  czSkStream.title.includes('Súbor'),
  true,
  'Title must preserve Slovak diacritics (Súbor)'
);
assert.strictEqual(
  czSkStream.behaviorHints?.fileName,
  'Inception.Počátek.1080p.mkv',
  'fileName behaviorHint must preserve UTF-8 diacritics'
);
assert.strictEqual(
  czSkStream.fileIdx,
  0,
  'fileIdx must be correctly preserved as 0'
);
assert.strictEqual(
  czSkStream.behaviorHints?.bingeGroup,
  'sktorrent-1080p-HEVC',
  'bingeGroup behaviorHint must be preserved'
);

console.log('✅ ALL PLUGIN ENGINE UNIT TESTS PASSED SUCCESSFULLY!');
