/**
 * Video Player Audio Codec Detection & External Player Protocol Helpers
 */

export const UNSUPPORTED_AUDIO_CODECS = [
  'AC3',
  'EAC3',
  'DTS',
  'DTS-HD',
  'DD5.1',
  'Dolby',
  'TrueHD',
] as const;

export type AudioCodecTag = (typeof UNSUPPORTED_AUDIO_CODECS)[number];

export interface VideoPlayerFallbackState {
  hasError: boolean;
  errorMessage: string;
  detectedCodecs: AudioCodecTag[];
  isAudioUnsupported: boolean;
  audioWarning: string;
  retryCount: number;
}

/**
 * Detects unsupported browser audio codecs from title, filename, or stream URL descriptors.
 */
export function detectAudioCodecs(text?: string | null): AudioCodecTag[] {
  if (!text || typeof text !== 'string') return [];
  const detected = new Set<AudioCodecTag>();

  // EAC3 / E-AC-3 / E-AC3 / EAC-3
  if (/\b(E-?AC-?3|EAC3)\b/i.test(text)) {
    detected.add('EAC3');
  } else if (/\b(AC-?3)\b/i.test(text)) {
    // AC3 / AC-3 / AC 3
    detected.add('AC3');
  }

  // DTS-HD / DTS-MA / DTS-X vs DTS / DTS5.1
  if (/\b(DTS-?HD|DTS-?MA|DTS-?X)\b/i.test(text)) {
    detected.add('DTS-HD');
    detected.add('DTS');
  } else if (/\b(DTS5?\.?1?|DTS)\b/i.test(text)) {
    detected.add('DTS');
  }

  // DD5.1 / DD 5.1 / DD+ / DD+5.1 / DD
  if (/\b(DD\+?5?\.?1?|DD\+)\b/i.test(text)) {
    detected.add('DD5.1');
  }

  // TrueHD / True-HD / True HD
  if (/\b(TRUE-?HD)\b/i.test(text)) {
    detected.add('TrueHD');
  }

  // Dolby / Dolby Digital / Dolby Atmos / Atmos
  if (/\b(DOLBY|ATMOS)\b/i.test(text)) {
    detected.add('Dolby');
  }

  return Array.from(detected);
}

/**
 * Returns true if text contains signatures of unsupported browser audio codecs.
 */
export function isUnsupportedAudioCodec(text?: string | null): boolean {
  return detectAudioCodecs(text).length > 0;
}

/**
 * Generates warning message for unsupported audio codecs.
 */
export function getAudioCodecWarning(text?: string | null): string {
  const codecs = detectAudioCodecs(text);
  if (codecs.length === 0) {
    return '⚠️ Audio AC3 / DTS Detected - Browser native playback may be silent';
  }
  const codecStr = codecs.join(' / ');
  return `⚠️ Audio ${codecStr} Detected - Browser native playback may be silent`;
}

/**
 * Generates protocol scheme URL for external media players (PotPlayer, VLC, MPV, Infuse).
 */
export function generateExternalPlayerUrl(
  player: 'potplayer' | 'vlc' | 'mpv' | 'infuse' | string,
  rawUrl: string
): string {
  if (!rawUrl) return '';
  // Strip any existing protocol scheme prefix if already present
  const cleanUrl = rawUrl.replace(/^(potplayer|vlc|mpv|infuse):\/\//i, '');
  const targetPlayer = player.toLowerCase();

  switch (targetPlayer) {
    case 'potplayer':
      return `potplayer://${cleanUrl}`;
    case 'vlc':
      return `vlc://${cleanUrl}`;
    case 'mpv':
      return `mpv://${cleanUrl}`;
    case 'infuse':
      return `infuse://${cleanUrl}`;
    default:
      return `${targetPlayer}://${cleanUrl}`;
  }
}

/**
 * Creates initial state object for video player fallback and error management.
 */
export function createVideoPlayerFallbackState(
  src: string,
  title?: string,
  extraText?: string
): VideoPlayerFallbackState {
  const combinedText = [title, extraText, src].filter(Boolean).join(' ');
  const detectedCodecs = detectAudioCodecs(combinedText);
  const isAudioUnsupported = detectedCodecs.length > 0;
  const audioWarning = getAudioCodecWarning(combinedText);

  return {
    hasError: false,
    errorMessage: '',
    detectedCodecs,
    isAudioUnsupported,
    audioWarning,
    retryCount: 0,
  };
}
