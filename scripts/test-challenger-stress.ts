// Adversarial Stress Test Harness for BrowseIO Milestone 5
// Created by teamwork_preview_challenger

import assert from 'node:assert';
import {
  normalizeInfoHash,
  getHashFromSource,
  isDebridCachedStream,
  classifyStream,
  base32ToHex,
  extractFileIdx,
  safeDecodeFileName,
  type StreamSource
} from '../src/lib/plugin-engine.ts';

import {
  checkTorBoxCached,
} from '../src/lib/torbox.ts';

import {
  detectAudioCodecs,
  isUnsupportedAudioCodec,
  getAudioCodecWarning,
  generateExternalPlayerUrl,
  createVideoPlayerFallbackState,
  UNSUPPORTED_AUDIO_CODECS,
  type AudioCodecTag
} from '../src/lib/video-player-helpers.ts';

console.log('⚡ Starting Adversarial Stress Test Harness for BrowseIO (Milestone 5)...');

let totalTests = 0;
let passedTests = 0;

function runTest(description: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${description}`);
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: STREAM CLASSIFICATION EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 1: Stream Classification Edge Cases ---');

runTest('CDN URLs with 40-char hex tokens evaluate to "web"', () => {
  const cdnUrls = [
    'https://cdn.hellspy.to/download/a1b2c3d4e5f67890123456789abcdef012345678/file.mp4',
    'https://storage.provider.cz/stream/0123456789abcdef0123456789abcdef01234567?auth=true',
    'http://server1.net/video/A1B2C3D4E5F67890123456789ABCDEF012345678/movie.mkv'
  ];

  for (const url of cdnUrls) {
    const stream: StreamSource = {
      name: 'Hellspy Web Direct',
      title: 'Počátek.2010.1080p.mp4',
      url
    };

    assert.strictEqual(normalizeInfoHash(url), '', `CDN URL ${url} must NOT extract hex token as infoHash`);
    assert.strictEqual(getHashFromSource(stream), '', `Stream with URL ${url} must return empty hash`);
    assert.strictEqual(isDebridCachedStream(stream), false, `CDN stream must NOT be flagged as Debrid`);
    assert.strictEqual(classifyStream(stream), 'web', `CDN stream must evaluate to "web"`);
  }
});

runTest('Magnet URLs with xt=urn:btih:... and tracker parameters evaluate to "torrent"', () => {
  const magnets = [
    'magnet:?xt=urn:btih:a1b2c3d4e5f67890123456789abcdef012345678&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&dn=Test.Movie.1080p',
    'magnet:?xt=urn:btih:A1B2C3D4E5F67890123456789ABCDEF012345678&tr=http%3A%2F%2Ftracker.cz%2Fannounce',
    'magnet:?tr=udp%3A%2F%2Ftracker.org&xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=Inception'
  ];

  const expectedHashes = [
    'a1b2c3d4e5f67890123456789abcdef012345678',
    'a1b2c3d4e5f67890123456789abcdef012345678',
    '1234567890abcdef1234567890abcdef12345678'
  ];

  magnets.forEach((mag, i) => {
    const stream: StreamSource = {
      name: 'P2P Tracker Stream',
      title: 'Inception (2010)',
      magnet: mag
    };

    const norm = normalizeInfoHash(mag);
    assert.strictEqual(norm, expectedHashes[i], `Magnet ${i} should extract normalized hex infoHash`);
    assert.strictEqual(getHashFromSource(stream), expectedHashes[i], `getHashFromSource should return infoHash for magnet ${i}`);
    assert.strictEqual(classifyStream(stream), 'torrent', `Magnet ${i} must evaluate to "torrent"`);
  });
});

runTest('Base32 32-character infoHashes convert cleanly to 40-char hex torrent infoHash', () => {
  // Valid RFC 4648 Base32 contains A-Z and 2-7 (32 chars)
  const validBase32 = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const hexFromBase32 = base32ToHex(validBase32);
  
  assert.strictEqual(typeof hexFromBase32, 'string', 'Hex output must be string');
  assert.strictEqual(hexFromBase32.length, 40, 'Converted hex must be 40 characters long');
  assert.strictEqual(/^[0-9a-f]{40}$/.test(hexFromBase32), true, 'Converted hex must contain only lowercase hex chars');

  const normBase32Direct = normalizeInfoHash(validBase32);
  assert.strictEqual(normBase32Direct, hexFromBase32, 'normalizeInfoHash on raw 32-char Base32 must return converted 40-char hex');

  const magnetBase32 = `magnet:?xt=urn:btih:${validBase32}&dn=Base32TestMovie`;
  const normMagnetBase32 = normalizeInfoHash(magnetBase32);
  assert.strictEqual(normMagnetBase32, hexFromBase32, 'normalizeInfoHash on magnet with 32-char Base32 must return converted 40-char hex');

  const streamBase32: StreamSource = {
    name: 'Base32 Stream',
    title: 'Movie.2024.1080p',
    infoHash: validBase32
  };
  assert.strictEqual(getHashFromSource(streamBase32), hexFromBase32, 'getHashFromSource must resolve Base32 infoHash');
  assert.strictEqual(classifyStream(streamBase32), 'torrent', 'Base32 torrent stream must evaluate to "torrent"');

  // Verify invalid Base32 (containing non-RFC4648 chars like 0, 1, 8, 9) returns empty string cleanly
  assert.strictEqual(base32ToHex('MZXW6YTBOI23456789ABCDEF01234567'), '', 'Invalid Base32 with digits 8, 9, 0, 1 must return empty string');
});

runTest('Debrid cached streams with badges vs uncached badges', () => {
  const cachedBadgeNames = [
    '[TB ⚡] SKTorrent',
    '[RD+] Torrentio',
    '[RD ⚡] RealDebrid',
    '[TB+] TorBox',
    '[AD+] AllDebrid',
    '[DL+] DebridLink',
    '[PM+] Premiumize',
    'SKTorrent ⚡ RealDebrid'
  ];

  const uncachedBadgeNames = [
    '[TB] SKTorrent',
    '[TB ⏳] SKTorrent P2P',
    '[RD ⏳] RealDebrid Uncached',
    'SKTorrent P2P Direct',
    '[SKT] Uncached Stream'
  ];

  for (const name of cachedBadgeNames) {
    const stream: StreamSource = {
      name,
      title: 'Inception.2010.1080p.mkv',
      infoHash: 'a1b2c3d4e5f67890123456789abcdef012345678'
    };

    assert.strictEqual(isDebridCachedStream(stream), true, `Stream with name "${name}" MUST be marked as Debrid cached`);
    assert.strictEqual(classifyStream(stream), 'debrid', `Stream with name "${name}" MUST evaluate to "debrid"`);
  }

  for (const name of uncachedBadgeNames) {
    const stream: StreamSource = {
      name,
      title: 'Inception.2010.1080p.mkv',
      infoHash: 'a1b2c3d4e5f67890123456789abcdef012345678'
    };

    assert.strictEqual(isDebridCachedStream(stream), false, `Stream with name "${name}" MUST NOT be marked as Debrid cached`);
    assert.strictEqual(classifyStream(stream), 'torrent', `Stream with name "${name}" with infoHash MUST evaluate to "torrent"`);
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: TORBOX API PARAMETER FORMATTING & HELPERS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 2: TorBox API Parameter Formatting & Helpers ---');

runTest('fileIdx index parsing handles 0, strings, undefined, and behaviorHints', () => {
  assert.strictEqual(extractFileIdx({ fileIdx: 0 }), 0, 'fileIdx 0 as number must evaluate to 0 (not undefined/falsy bug)');
  assert.strictEqual(extractFileIdx({ fileIdx: '0' }), 0, 'fileIdx "0" as string must evaluate to 0');
  assert.strictEqual(extractFileIdx({ file_index: 0 }), 0, 'file_index 0 must evaluate to 0');
  assert.strictEqual(extractFileIdx({ file_index: '3' }), 3, 'file_index "3" must evaluate to 3');
  assert.strictEqual(extractFileIdx({ fileIndex: 5 }), 5, 'fileIndex 5 must evaluate to 5');
  assert.strictEqual(extractFileIdx({ behaviorHints: { fileIdx: 0 } }), 0, 'behaviorHints.fileIdx 0 must evaluate to 0');
  assert.strictEqual(extractFileIdx({ behaviorHints: { fileIdx: '2' } }), 2, 'behaviorHints.fileIdx "2" must evaluate to 2');
  assert.strictEqual(extractFileIdx({ title: 'No index' }), undefined, 'Object without file index must return undefined');
});

runTest('UTF-8 diacritic filename decoding (Počátek, Súbor, Czech/Slovak chars)', () => {
  assert.strictEqual(safeDecodeFileName('Po%C4%8D%C3%A1tek'), 'Počátek', 'Po%C4%8D%C3%A1tek should decode to Počátek');
  assert.strictEqual(safeDecodeFileName('S%C3%BAbor'), 'Súbor', 'S%C3%BAbor should decode to Súbor');
  assert.strictEqual(safeDecodeFileName('Hra.o.Tr%C5%AFny.S01E02.1080p.mkv'), 'Hra.o.Trůny.S01E02.1080p.mkv', 'Czech diacritics in episode name should decode properly');
  assert.strictEqual(safeDecodeFileName('Already Decoded Počátek.mp4'), 'Already Decoded Počátek.mp4', 'Already decoded text should remain unchanged');
  assert.strictEqual(safeDecodeFileName(undefined), undefined, 'Undefined input returns undefined');
});

runTest('Multi-file pack video selection logic (season/episode & largest video fallback)', () => {
  const packFiles = [
    { id: 0, name: 'Sample.mkv', size: 20000000 },
    { id: 1, name: 'Po%C4%8D%C3%A1tek.S01E01.1080p.mkv', size: 3000000000 },
    { id: 2, name: 'Po%C4%8D%C3%A1tek.S01E02.1080p.mkv', size: 3100000000 },
    { id: 3, name: 'Subtitles.srt', size: 100000 }
  ];

  // Test S01E02 matching with diacritics
  const s = 1;
  const e = 2;
  const regexes = [
    new RegExp(`s0*${s}e0*${e}[^a-z0-9]`, 'i'),
    new RegExp(`0*${s}x0*${e}[^a-z0-9]`, 'i'),
    new RegExp(`s0*${s}.*e0*${e}`, 'i'),
    new RegExp(`[^a-z0-9]0*${e}[^a-z0-9]`, 'i')
  ];

  let matchedFile: any = null;
  for (const rx of regexes) {
    const match = packFiles.find(f => {
      const dec = safeDecodeFileName(f.name) || f.name;
      return rx.test(dec) || rx.test(f.name);
    });
    if (match) {
      matchedFile = match;
      break;
    }
  }

  assert.notStrictEqual(matchedFile, null, 'Episode S01E02 file match should not be null');
  assert.strictEqual(matchedFile.id, 2, 'Matched file ID for S01E02 must be 2');

  // Test Movie Multi-Pack Largest Video Fallback
  const moviePack = [
    { id: 0, name: 'N%C3%A1vod.txt', size: 5000 },
    { id: 1, name: 'Po%C4%8D%C3%A1tek.2010.720p.mkv', size: 4500000000 },
    { id: 2, name: 'Po%C4%8D%C3%A1tek.2010.1080p.REMUX.mkv', size: 25000000000 },
    { id: 3, name: 'Sample.mp4', size: 50000000 }
  ];

  const videoRegex = /\.(mkv|mp4|avi|mov|m4v|webm|flv|wmv|ts)$/i;
  const videoCandidates = moviePack.filter(f => videoRegex.test(safeDecodeFileName(f.name) || f.name));
  videoCandidates.sort((a, b) => b.size - a.size);

  assert.strictEqual(videoCandidates[0].id, 2, 'Fallback should select the 1080p REMUX file (ID 2, size 25GB)');
});


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: VIDEO PLAYER AUDIO FALLBACK & PROTOCOL URLS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Section 3: Video Player Audio Fallback & Protocol URLs ---');

runTest('Audio codec detection for ALL 7 audio formats', () => {
  const formats: { codec: AudioCodecTag; sampleTitle: string; expected: AudioCodecTag[] }[] = [
    { codec: 'AC3', sampleTitle: 'Inception.2010.1080p.AC3.5.1.mkv', expected: ['AC3'] },
    { codec: 'EAC3', sampleTitle: 'Dune.Part.Two.2024.EAC3.Atmos.mkv', expected: ['EAC3'] },
    { codec: 'DTS', sampleTitle: 'Oppenheimer.2023.DTS.5.1.mkv', expected: ['DTS'] },
    { codec: 'DTS-HD', sampleTitle: 'Avatar.2009.4K.DTS-HD.MA.7.1.mkv', expected: ['DTS-HD', 'DTS'] },
    { codec: 'DD5.1', sampleTitle: 'Blade.Runner.2049.DD5.1.x264.mkv', expected: ['DD5.1'] },
    { codec: 'Dolby', sampleTitle: 'Interstellar.2014.Dolby.Digital.Plus.mkv', expected: ['Dolby'] },
    { codec: 'TrueHD', sampleTitle: 'The.Dark.Knight.2008.TrueHD.7.1.mkv', expected: ['TrueHD'] }
  ];

  for (const item of formats) {
    const detected = detectAudioCodecs(item.sampleTitle);
    assert.strictEqual(
      isUnsupportedAudioCodec(item.sampleTitle),
      true,
      `isUnsupportedAudioCodec must return true for ${item.codec}`
    );
    assert.strictEqual(
      detected.includes(item.codec),
      true,
      `detectAudioCodecs for "${item.sampleTitle}" must include ${item.codec}`
    );
  }

  // Verify all 7 codecs exist in UNSUPPORTED_AUDIO_CODECS array constant
  for (const codec of ['AC3', 'EAC3', 'DTS', 'DTS-HD', 'DD5.1', 'Dolby', 'TrueHD'] as const) {
    assert.strictEqual(
      (UNSUPPORTED_AUDIO_CODECS as readonly string[]).includes(codec),
      true,
      `UNSUPPORTED_AUDIO_CODECS array must include codec "${codec}"`
    );
  }

  // Supported browser audio (AAC / MP3 / Opus / Vorbis)
  assert.deepStrictEqual(detectAudioCodecs('Movie.2024.1080p.AAC.2.0.mp4'), [], 'AAC codec must return empty array');
  assert.strictEqual(isUnsupportedAudioCodec('Movie.2024.1080p.AAC.2.0.mp4'), false, 'AAC codec is supported');
});

runTest('External player protocol URL generator for all 4 players and prefix deduplication', () => {
  const testUrl = 'https://cdn.browseio.app/stream/video.mkv';

  assert.strictEqual(generateExternalPlayerUrl('potplayer', testUrl), `potplayer://${testUrl}`, 'PotPlayer scheme should match');
  assert.strictEqual(generateExternalPlayerUrl('vlc', testUrl), `vlc://${testUrl}`, 'VLC scheme should match');
  assert.strictEqual(generateExternalPlayerUrl('mpv', testUrl), `mpv://${testUrl}`, 'MPV scheme should match');
  assert.strictEqual(generateExternalPlayerUrl('infuse', testUrl), `infuse://${testUrl}`, 'Infuse scheme should match');

  // Test already-prefixed scheme URLs
  assert.strictEqual(
    generateExternalPlayerUrl('vlc', 'vlc://https://cdn.browseio.app/stream/video.mkv'),
    'vlc://https://cdn.browseio.app/stream/video.mkv',
    'vlc:// scheme must NOT be duplicated'
  );
  assert.strictEqual(
    generateExternalPlayerUrl('potplayer', 'potplayer://https://cdn.browseio.app/stream/video.mkv'),
    'potplayer://https://cdn.browseio.app/stream/video.mkv',
    'potplayer:// scheme must NOT be duplicated'
  );
  assert.strictEqual(
    generateExternalPlayerUrl('mpv', 'mpv://https://cdn.browseio.app/stream/video.mkv'),
    'mpv://https://cdn.browseio.app/stream/video.mkv',
    'mpv:// scheme must NOT be duplicated'
  );
  assert.strictEqual(
    generateExternalPlayerUrl('infuse', 'infuse://https://cdn.browseio.app/stream/video.mkv'),
    'infuse://https://cdn.browseio.app/stream/video.mkv',
    'infuse:// scheme must NOT be duplicated'
  );
});

runTest('createVideoPlayerFallbackState creates proper initial state for audio warnings', () => {
  const state = createVideoPlayerFallbackState('https://cdn.example.com/stream.mkv', 'Inception.2010.TrueHD.Atmos');
  assert.strictEqual(state.hasError, false);
  assert.strictEqual(state.isAudioUnsupported, true);
  assert.strictEqual(state.detectedCodecs.includes('TrueHD'), true);
  assert.strictEqual(state.detectedCodecs.includes('Dolby'), true);
  assert.strictEqual(getAudioCodecWarning('Inception.2010.AC3.DTS.mkv'), '⚠️ Audio AC3 / DTS Detected - Browser native playback may be silent');
});

console.log(`\n🎉 ADVERSARIAL STRESS TEST HARNESS COMPLETED SUCCESSFULLY! (${passedTests}/${totalTests} tests passed)\n`);
