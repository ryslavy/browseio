/**
 * Pure TypeScript Media Stream Prober (Zero External Dependencies)
 * 
 * Inspects Matroska (MKV / WebM) EBML headers and MP4 (ISO BMFF) boxes
 * directly from binary buffer chunks (first ~256KB - 512KB via HTTP Range Request).
 * Detects exact audio tracks, channels (5.1 / 7.1 / Stereo), language codes (CZ, SK, EN...),
 * video codecs (HEVC, AVC, AV1, VP9), and embedded subtitle tracks.
 */

export interface ProbedAudioTrack {
  id: number;
  trackNumber?: number;
  codec: string;
  lang: string;
  langName: string;
  label: string;
  channels?: number;
  channelsDesc?: string;
  title?: string;
  isDefault?: boolean;
}

export interface ProbedVideoTrack {
  id: number;
  codec: string;
  width?: number;
  height?: number;
  resolution?: string;
  title?: string;
}

export interface ProbedSubtitleTrack {
  id: number;
  trackNumber?: number;
  codec: string;
  lang: string;
  langName: string;
  label: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface MediaProbeResult {
  success: boolean;
  container: 'matroska' | 'mp4' | 'hls' | 'unknown';
  video: ProbedVideoTrack[];
  audio: ProbedAudioTrack[];
  subtitles: ProbedSubtitleTrack[];
  hasMultiAudio: boolean;
  error?: string;
}

// ISO 639-2 / ISO 639-1 Language Dictionary (Czech & English friendly names)
const ISO_LANG_MAP: Record<string, { nameCs: string; nameEn: string; code: string }> = {
  cze: { nameCs: 'Čeština', nameEn: 'Czech', code: 'cs' },
  ces: { nameCs: 'Čeština', nameEn: 'Czech', code: 'cs' },
  cs: { nameCs: 'Čeština', nameEn: 'Czech', code: 'cs' },
  slo: { nameCs: 'Slovenština', nameEn: 'Slovak', code: 'sk' },
  slk: { nameCs: 'Slovenština', nameEn: 'Slovak', code: 'sk' },
  sk: { nameCs: 'Slovenština', nameEn: 'Slovak', code: 'sk' },
  eng: { nameCs: 'Angličtina', nameEn: 'English', code: 'en' },
  en: { nameCs: 'Angličtina', nameEn: 'English', code: 'en' },
  ger: { nameCs: 'Němčina', nameEn: 'German', code: 'de' },
  deu: { nameCs: 'Němčina', nameEn: 'German', code: 'de' },
  de: { nameCs: 'Němčina', nameEn: 'German', code: 'de' },
  fre: { nameCs: 'Francouzština', nameEn: 'French', code: 'fr' },
  fra: { nameCs: 'Francouzština', nameEn: 'French', code: 'fr' },
  fr: { nameCs: 'Francouzština', nameEn: 'French', code: 'fr' },
  spa: { nameCs: 'Španělština', nameEn: 'Spanish', code: 'es' },
  es: { nameCs: 'Španělština', nameEn: 'Spanish', code: 'es' },
  ita: { nameCs: 'Italština', nameEn: 'Italian', code: 'it' },
  it: { nameCs: 'Italština', nameEn: 'Italian', code: 'it' },
  rus: { nameCs: 'Ruština', nameEn: 'Russian', code: 'ru' },
  ru: { nameCs: 'Ruština', nameEn: 'Russian', code: 'ru' },
  pol: { nameCs: 'Polština', nameEn: 'Polish', code: 'pl' },
  pl: { nameCs: 'Polština', nameEn: 'Polish', code: 'pl' },
  jpn: { nameCs: 'Japonština', nameEn: 'Japanese', code: 'ja' },
  ja: { nameCs: 'Japonština', nameEn: 'Japanese', code: 'ja' },
  und: { nameCs: 'Neznámý jazyk', nameEn: 'Undetermined', code: 'und' },
};

export function getLanguageName(isoLang?: string, preferCs: boolean = true): { name: string; code: string } {
  if (!isoLang) return { name: preferCs ? 'Výchozí' : 'Default', code: 'und' };
  const key = isoLang.toLowerCase().trim();
  const entry = ISO_LANG_MAP[key];
  if (entry) {
    return { name: preferCs ? entry.nameCs : entry.nameEn, code: entry.code };
  }
  return { name: isoLang.toUpperCase(), code: key.slice(0, 2) };
}

export function formatChannelCount(channels?: number): string {
  if (!channels || channels <= 0) return '';
  if (channels === 1) return 'Mono';
  if (channels === 2) return '2.0 Stereo';
  if (channels === 6) return '5.1';
  if (channels === 8) return '7.1';
  return `${channels} ch`;
}

export function formatCodecName(codecId?: string): string {
  if (!codecId) return 'Audio';
  const c = codecId.toUpperCase();
  if (c.includes('EAC3') || c.includes('EC-3')) return 'E-AC3';
  if (c.includes('AC3') || c.includes('AC-3')) return 'AC3';
  if (c.includes('TRUEHD')) return 'TrueHD';
  if (c.includes('DTS-HD') || c.includes('DTSHD')) return 'DTS-HD';
  if (c.includes('DTS')) return 'DTS';
  if (c.includes('AAC') || c.includes('MP4A')) return 'AAC';
  if (c.includes('OPUS')) return 'Opus';
  if (c.includes('VORBIS')) return 'Vorbis';
  if (c.includes('FLAC')) return 'FLAC';
  if (c.includes('HEVC') || c.includes('H265') || c.includes('HVC1')) return 'HEVC (H.265)';
  if (c.includes('AVC') || c.includes('H264') || c.includes('AVC1')) return 'AVC (H.264)';
  if (c.includes('AV1') || c.includes('AV01')) return 'AV1';
  if (c.includes('VP9')) return 'VP9';
  if (c.includes('UTF8') || c.includes('SUBRIP') || c.includes('SRT')) return 'SRT';
  if (c.includes('ASS') || c.includes('SSA')) return 'ASS';
  if (c.includes('PGS') || c.includes('HDMV')) return 'PGS';
  return codecId.replace(/^[AVS]_/, '');
}

/**
 * Reads variable length integer (VINT) from EBML buffer.
 */
function readEbmlVint(buffer: Uint8Array, offset: number, maskLength: boolean = true): { value: number; length: number } | null {
  if (offset >= buffer.length) return null;
  const firstByte = buffer[offset];
  let length = 0;
  let mask = 0x80;

  for (let i = 1; i <= 8; i++) {
    if ((firstByte & mask) !== 0) {
      length = i;
      break;
    }
    mask >>= 1;
  }

  if (length === 0 || offset + length > buffer.length) return null;

  let value = maskLength ? (firstByte & (mask - 1)) : firstByte;
  for (let i = 1; i < length; i++) {
    value = (value * 256) + buffer[offset + i];
  }

  return { value, length };
}

/**
 * Reads EBML element ID (preserves the length indicator bits).
 */
function readEbmlId(buffer: Uint8Array, offset: number): { id: number; length: number } | null {
  const vint = readEbmlVint(buffer, offset, false);
  if (!vint) return null;
  return { id: vint.value, length: vint.length };
}

/**
 * Reads unsigned integer from buffer of given size.
 */
function readUint(buffer: Uint8Array, offset: number, size: number): number {
  let val = 0;
  for (let i = 0; i < size && offset + i < buffer.length; i++) {
    val = (val * 256) + buffer[offset + i];
  }
  return val;
}

/**
 * Reads UTF-8 string from buffer.
 */
function readString(buffer: Uint8Array, offset: number, size: number): string {
  try {
    const slice = buffer.subarray(offset, Math.min(buffer.length, offset + size));
    return new TextDecoder('utf-8', { fatal: false }).decode(slice).replace(/\0+$/, '').trim();
  } catch {
    return '';
  }
}

/**
 * Pure TypeScript EBML Parser for Matroska (.mkv / .webm)
 */
export function parseEbmlMatroska(buffer: Uint8Array): MediaProbeResult {
  const result: MediaProbeResult = {
    success: false,
    container: 'matroska',
    video: [],
    audio: [],
    subtitles: [],
    hasMultiAudio: false,
  };

  // Check EBML Header Signature (0x1A 0x45 0xDF 0xA3)
  if (buffer.length < 4 || buffer[0] !== 0x1A || buffer[1] !== 0x45 || buffer[2] !== 0xDF || buffer[3] !== 0xA3) {
    return { ...result, error: 'Not a valid Matroska EBML header' };
  }

  let offset = 0;
  const maxLen = buffer.length;

  while (offset < maxLen) {
    const idInfo = readEbmlId(buffer, offset);
    if (!idInfo) break;
    offset += idInfo.length;

    const sizeInfo = readEbmlVint(buffer, offset, true);
    if (!sizeInfo) break;
    offset += sizeInfo.length;

    const elemId = idInfo.id;
    const elemSize = sizeInfo.value;

    // 0x1654AE6B = Tracks Container
    if (elemId === 0x1654AE6B) {
      const tracksEnd = Math.min(maxLen, offset + elemSize);
      let trackOffset = offset;

      while (trackOffset < tracksEnd) {
        const tIdInfo = readEbmlId(buffer, trackOffset);
        if (!tIdInfo) break;
        trackOffset += tIdInfo.length;

        const tSizeInfo = readEbmlVint(buffer, trackOffset, true);
        if (!tSizeInfo) break;
        trackOffset += tSizeInfo.length;

        const trackElemId = tIdInfo.id;
        const trackElemSize = tSizeInfo.value;

        // 0xAE = TrackEntry
        if (trackElemId === 0xAE) {
          const entryEnd = Math.min(tracksEnd, trackOffset + trackElemSize);
          let entryOffset = trackOffset;

          let trackType = 0; // 1 = video, 2 = audio, 17 = subtitle
          let trackNumber = 0;
          let codecId = '';
          let language = '';
          let name = '';
          let isDefault = true;
          let isForced = false;
          let channels = 2;
          let width = 0;
          let height = 0;

          while (entryOffset < entryEnd) {
            const fIdInfo = readEbmlId(buffer, entryOffset);
            if (!fIdInfo) break;
            entryOffset += fIdInfo.length;

            const fSizeInfo = readEbmlVint(buffer, entryOffset, true);
            if (!fSizeInfo) break;
            entryOffset += fSizeInfo.length;

            const fieldId = fIdInfo.id;
            const fieldSize = fSizeInfo.value;

            if (fieldId === 0x83) {
              // TrackType
              trackType = readUint(buffer, entryOffset, fieldSize);
            } else if (fieldId === 0xD7) {
              // TrackNumber
              trackNumber = readUint(buffer, entryOffset, fieldSize);
            } else if (fieldId === 0x86) {
              // CodecID
              codecId = readString(buffer, entryOffset, fieldSize);
            } else if (fieldId === 0x22B59C) {
              // Language
              language = readString(buffer, entryOffset, fieldSize);
            } else if (fieldId === 0x536E) {
              // Name / Title
              name = readString(buffer, entryOffset, fieldSize);
            } else if (fieldId === 0x88) {
              // FlagDefault
              isDefault = readUint(buffer, entryOffset, fieldSize) === 1;
            } else if (fieldId === 0x55AA) {
              // FlagForced
              isForced = readUint(buffer, entryOffset, fieldSize) === 1;
            } else if (fieldId === 0xE1) {
              // Audio Settings sub-elements
              let aOffset = entryOffset;
              const aEnd = Math.min(entryEnd, entryOffset + fieldSize);
              while (aOffset < aEnd) {
                const aId = readEbmlId(buffer, aOffset);
                if (!aId) break;
                aOffset += aId.length;
                const aSize = readEbmlVint(buffer, aOffset, true);
                if (!aSize) break;
                aOffset += aSize.length;
                if (aId.id === 0x9F) {
                  // Channels
                  channels = readUint(buffer, aOffset, aSize.value);
                }
                aOffset += aSize.value;
              }
            } else if (fieldId === 0xE0) {
              // Video Settings sub-elements
              let vOffset = entryOffset;
              const vEnd = Math.min(entryEnd, entryOffset + fieldSize);
              while (vOffset < vEnd) {
                const vId = readEbmlId(buffer, vOffset);
                if (!vId) break;
                vOffset += vId.length;
                const vSize = readEbmlVint(buffer, vOffset, true);
                if (!vSize) break;
                vOffset += vSize.length;
                if (vId.id === 0xB0) width = readUint(buffer, vOffset, vSize.value);
                if (vId.id === 0xBA) height = readUint(buffer, vOffset, vSize.value);
                vOffset += vSize.value;
              }
            }

            entryOffset += fieldSize;
          }

          // Classify parsed track
          const langInfo = getLanguageName(language || 'und');
          const codecPretty = formatCodecName(codecId);

          if (trackType === 1) {
            // Video Track
            result.video.push({
              id: result.video.length,
              codec: codecPretty,
              width,
              height,
              resolution: width && height ? `${width}x${height}` : undefined,
              title: name || undefined,
            });
          } else if (trackType === 2) {
            // Audio Track
            const chDesc = formatChannelCount(channels);
            const labelParts = [langInfo.name, codecPretty, chDesc].filter(Boolean);
            const label = name ? `${name} (${labelParts.join(', ')})` : labelParts.join(' ');

            result.audio.push({
              id: result.audio.length,
              trackNumber,
              codec: codecPretty,
              lang: langInfo.code,
              langName: langInfo.name,
              label,
              channels,
              channelsDesc: chDesc,
              title: name || undefined,
              isDefault,
            });
          } else if (trackType === 17) {
            // Subtitle Track
            const label = name ? `${name} (${langInfo.name})` : `${langInfo.name} ${isForced ? '(Forced)' : ''} [${codecPretty}]`.trim();

            result.subtitles.push({
              id: result.subtitles.length,
              trackNumber,
              codec: codecPretty,
              lang: langInfo.code,
              langName: langInfo.name,
              label,
              title: name || undefined,
              isDefault,
              isForced,
            });
          }
        }

        trackOffset += trackElemSize;
      }

      result.success = true;
      result.hasMultiAudio = result.audio.length > 1;
      return result;
    }

    // Advance to next top-level element
    if (elemId === 0x18538067) {
      // Step into Segment
      continue;
    } else {
      offset += elemSize;
    }
  }

  result.success = result.video.length > 0 || result.audio.length > 0;
  result.hasMultiAudio = result.audio.length > 1;
  return result;
}

/**
 * Pure TypeScript MP4 (ISO Base Media File Format) Parser
 */
export function parseMp4Boxes(buffer: Uint8Array): MediaProbeResult {
  const result: MediaProbeResult = {
    success: false,
    container: 'mp4',
    video: [],
    audio: [],
    subtitles: [],
    hasMultiAudio: false,
  };

  let offset = 0;
  const maxLen = buffer.length;

  while (offset + 8 <= maxLen) {
    const size = readUint(buffer, offset, 4);
    const type = readString(buffer, offset + 4, 4);

    if (size < 8) break;

    // moov atom contains movie tracks
    if (type === 'moov') {
      const moovEnd = Math.min(maxLen, offset + size);
      let moovOffset = offset + 8;

      while (moovOffset + 8 <= moovEnd) {
        const trakSize = readUint(buffer, moovOffset, 4);
        const trakType = readString(buffer, moovOffset + 4, 4);

        if (trakType === 'trak') {
          const trakEnd = Math.min(moovEnd, moovOffset + trakSize);
          let subOffset = moovOffset + 8;
          let handlerType = '';
          let langCode = 'und';
          let codecFourcc = '';

          while (subOffset + 8 <= trakEnd) {
            const boxSize = readUint(buffer, subOffset, 4);
            const boxType = readString(buffer, subOffset + 4, 4);

            if (boxType === 'mdia') {
              let mdiaOffset = subOffset + 8;
              const mdiaEnd = Math.min(trakEnd, subOffset + boxSize);

              while (mdiaOffset + 8 <= mdiaEnd) {
                const innerSize = readUint(buffer, mdiaOffset, 4);
                const innerType = readString(buffer, mdiaOffset + 4, 4);

                if (innerType === 'hdlr') {
                  // Handler type at offset + 16 (vide, soun, sbtl)
                  handlerType = readString(buffer, mdiaOffset + 16, 4).toLowerCase();
                } else if (innerType === 'mdhd') {
                  // ISO-639-2 packed language code
                  const version = buffer[mdiaOffset + 8];
                  const langOffset = version === 1 ? mdiaOffset + 36 : mdiaOffset + 28;
                  if (langOffset + 2 <= mdiaEnd) {
                    const packed = (buffer[langOffset] << 8) | buffer[langOffset + 1];
                    const c1 = String.fromCharCode(((packed >> 10) & 0x1F) + 0x60);
                    const c2 = String.fromCharCode(((packed >> 5) & 0x1F) + 0x60);
                    const c3 = String.fromCharCode((packed & 0x1F) + 0x60);
                    langCode = `${c1}${c2}${c3}`;
                  }
                } else if (innerType === 'minf') {
                  // Scan for stsd sample entries
                  const minfSlice = buffer.subarray(mdiaOffset, Math.min(mdiaEnd, mdiaOffset + innerSize));
                  const minfStr = new TextDecoder('latin1').decode(minfSlice);
                  const codecs = ['mp4a', 'ac-3', 'ec-3', 'dtsc', 'dtsl', 'avc1', 'hvc1', 'hev1', 'av01', 'vp09', 'tx3g'];
                  for (const c of codecs) {
                    if (minfStr.includes(c)) {
                      codecFourcc = c;
                      break;
                    }
                  }
                }

                mdiaOffset += innerSize > 0 ? innerSize : 8;
              }
            }

            subOffset += boxSize > 0 ? boxSize : 8;
          }

          const langInfo = getLanguageName(langCode);
          const codecPretty = formatCodecName(codecFourcc);

          if (handlerType === 'vide') {
            result.video.push({
              id: result.video.length,
              codec: codecPretty || 'H.264/HEVC',
            });
          } else if (handlerType === 'soun') {
            result.audio.push({
              id: result.audio.length,
              codec: codecPretty || 'AAC',
              lang: langInfo.code,
              langName: langInfo.name,
              label: `${langInfo.name} ${codecPretty ? `(${codecPretty})` : ''}`.trim(),
            });
          } else if (handlerType === 'sbtl' || handlerType === 'subt') {
            result.subtitles.push({
              id: result.subtitles.length,
              codec: codecPretty || 'Timed Text',
              lang: langInfo.code,
              langName: langInfo.name,
              label: `${langInfo.name} Subtitles`,
            });
          }
        }

        moovOffset += trakSize > 0 ? trakSize : 8;
      }

      result.success = true;
      result.hasMultiAudio = result.audio.length > 1;
      return result;
    }

    offset += size;
  }

  result.success = result.video.length > 0 || result.audio.length > 0;
  result.hasMultiAudio = result.audio.length > 1;
  return result;
}

/**
 * Universal Stream Prober:
 * 1. Fetches first ~384 KB of video stream via HTTP Range Request.
 * 2. Parses binary container (MKV or MP4).
 * 3. Returns detailed media tracks with 0 external dependencies.
 */
export async function probeMediaStream(url: string, rangeBytes: number = 393216): Promise<MediaProbeResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      success: false,
      container: 'unknown',
      video: [],
      audio: [],
      subtitles: [],
      hasMultiAudio: false,
      error: 'Invalid or non-HTTP URL',
    };
  }

  // If HLS adaptive manifest
  if (url.includes('.m3u8') || url.includes('/hls/')) {
    return {
      success: true,
      container: 'hls',
      video: [{ id: 0, codec: 'HLS Stream' }],
      audio: [],
      subtitles: [],
      hasMultiAudio: false,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    // Try direct range fetch first, fallback to internal proxy if CORS blocks
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Range: `bytes=0-${rangeBytes}` },
        signal: controller.signal,
      });
    } catch {
      // Fallback to internal server proxy range
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      res = await fetch(proxyUrl, {
        headers: { Range: `bytes=0-${rangeBytes}` },
        signal: controller.signal,
      });
    }
    clearTimeout(timeoutId);

    if (!res.ok && res.status !== 206 && res.status !== 200) {
      return {
        success: false,
        container: 'unknown',
        video: [],
        audio: [],
        subtitles: [],
        hasMultiAudio: false,
        error: `HTTP status ${res.status}`,
      };
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = new Uint8Array(arrayBuf);

    // 1. Try Matroska EBML first
    if (buffer.length >= 4 && buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
      return parseEbmlMatroska(buffer);
    }

    // 2. Try MP4 ISO BMFF
    if (buffer.length >= 8) {
      const type = String.fromCharCode(buffer[4], buffer[5], buffer[6], buffer[7]);
      if (type === 'ftyp' || type === 'moov' || type === 'free' || type === 'mdat') {
        return parseMp4Boxes(buffer);
      }
    }

    // 3. Fallback scan for Matroska signature in the first 1024 bytes
    for (let i = 0; i < Math.min(1024, buffer.length - 4); i++) {
      if (buffer[i] === 0x1A && buffer[i + 1] === 0x45 && buffer[i + 2] === 0xDF && buffer[i + 3] === 0xA3) {
        return parseEbmlMatroska(buffer.subarray(i));
      }
    }

    return {
      success: false,
      container: 'unknown',
      video: [],
      audio: [],
      subtitles: [],
      hasMultiAudio: false,
      error: 'Unrecognized container format',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      container: 'unknown',
      video: [],
      audio: [],
      subtitles: [],
      hasMultiAudio: false,
      error: msg,
    };
  }
}
