import assert from 'node:assert';
import {
  detectAudioCodecs,
  isUnsupportedAudioCodec,
  getAudioCodecWarning,
  generateExternalPlayerUrl,
  createVideoPlayerFallbackState,
} from '../src/lib/video-player-helpers.ts';

console.log('🧪 Starting Video Player Audio Fallback & Protocol Unit Tests...');

// 1. Audio Codec Detection Tests
console.log('Testing Audio Codec Detection...');

assert.deepStrictEqual(
  detectAudioCodecs('Inception.2010.1080p.AC3.x264.mkv'),
  ['AC3'],
  'AC3 signature should be correctly detected'
);

assert.deepStrictEqual(
  detectAudioCodecs('Avatar.2009.4K.DTS-HD.MA.5.1.mkv'),
  ['DTS-HD', 'DTS'],
  'DTS-HD signature should be detected'
);

assert.deepStrictEqual(
  detectAudioCodecs('Interstellar.2014.2160p.EAC3.DD5.1.mkv'),
  ['EAC3', 'DD5.1'],
  'EAC3 and DD5.1 signatures should be detected'
);

assert.deepStrictEqual(
  detectAudioCodecs('Dune.Part.Two.2024.TrueHD.Atmos.7.1.mkv'),
  ['TrueHD', 'Dolby'],
  'TrueHD and Dolby signatures should be detected'
);

assert.deepStrictEqual(
  detectAudioCodecs('Standard.Video.2024.1080p.AAC.2.0.mp4'),
  [],
  'Supported browser audio (AAC) should return empty array'
);

assert.strictEqual(
  isUnsupportedAudioCodec('Movie.Dolby.Digital.5.1.mkv'),
  true,
  'isUnsupportedAudioCodec should return true for Dolby streams'
);

assert.strictEqual(
  isUnsupportedAudioCodec('Movie.AAC.mp4'),
  false,
  'isUnsupportedAudioCodec should return false for AAC streams'
);

// 2. Audio Warning Message Tests
console.log('Testing Audio Warning Banner Text...');

const ac3DtsWarning = getAudioCodecWarning('Movie.AC3.DTS.mkv');
assert.strictEqual(
  ac3DtsWarning,
  '⚠️ Audio AC3 / DTS Detected - Browser native playback may be silent',
  'AC3 / DTS warning text must match expected requirement string'
);

const singleCodecWarning = getAudioCodecWarning('Movie.AC3.mkv');
assert.strictEqual(
  singleCodecWarning,
  '⚠️ Audio AC3 Detected - Browser native playback may be silent',
  'Single codec warning text should include detected codec'
);

// 3. External Player Protocol URL Generator Tests
console.log('Testing External Player Protocol URL Generators...');

const testVideoUrl = 'https://cdn.example.com/streams/video.mkv';

assert.strictEqual(
  generateExternalPlayerUrl('potplayer', testVideoUrl),
  'potplayer://https://cdn.example.com/streams/video.mkv',
  'PotPlayer URL scheme must start with potplayer://'
);

assert.strictEqual(
  generateExternalPlayerUrl('vlc', testVideoUrl),
  'vlc://https://cdn.example.com/streams/video.mkv',
  'VLC URL scheme must start with vlc://'
);

assert.strictEqual(
  generateExternalPlayerUrl('mpv', testVideoUrl),
  'mpv://https://cdn.example.com/streams/video.mkv',
  'MPV URL scheme must start with mpv://'
);

assert.strictEqual(
  generateExternalPlayerUrl('infuse', testVideoUrl),
  'infuse://https://cdn.example.com/streams/video.mkv',
  'Infuse URL scheme must start with infuse://'
);

// Graceful handling of already prefixed scheme URLs
assert.strictEqual(
  generateExternalPlayerUrl('potplayer', 'potplayer://https://cdn.example.com/video.mp4'),
  'potplayer://https://cdn.example.com/video.mp4',
  'Already prefixed scheme URL should not duplicate potplayer://'
);

// 4. Fallback State Management Tests
console.log('Testing Fallback State Handler...');

const fallbackState = createVideoPlayerFallbackState(
  'https://cdn.example.com/movie.mkv',
  'Matrix.1999.TrueHD.Atmos'
);

assert.strictEqual(fallbackState.hasError, false, 'Initial state hasError should be false');
assert.strictEqual(fallbackState.isAudioUnsupported, true, 'isAudioUnsupported should be true for TrueHD');
assert.strictEqual(fallbackState.retryCount, 0, 'Initial retryCount should be 0');
assert.ok(fallbackState.audioWarning.includes('TrueHD'), 'audioWarning should mention TrueHD');

console.log('✅ ALL VIDEO PLAYER AUDIO FALLBACK & PROTOCOL TESTS PASSED SUCCESSFULLY!');
