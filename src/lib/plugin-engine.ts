// Universal Plugin & Addon Engine for BrowseIO
// Supports Stremio Addons & Nuvio Executable JS Plugins with progressive loading & strict CORS fast-fail
import * as cheerio from 'cheerio';

export interface PluginManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  icon?: string;
  type: 'stremio' | 'nuvio' | 'custom';
  manifestUrl: string;
  enabled: boolean;
  isBuiltIn?: boolean;
}

export interface BehaviorHints {
  proxyHeaders?: {
    request?: Record<string, string>;
    response?: Record<string, string>;
    [key: string]: any;
  };
  notSupported?: boolean;
  fileName?: string;
  videoHash?: string;
  bingeGroup?: string;
  infoHash?: string;
  cached?: boolean;
  fileIdx?: number;
  [key: string]: any;
}

export interface StreamSource {
  name: string;
  pluginId?: string;
  pluginName?: string;
  subProvider?: string;
  title: string;
  url?: string | null;
  magnet?: string;
  infoHash?: string;
  fileIdx?: number;
  type?: 'web' | 'debrid' | 'torrent';
  size?: string;
  seeders?: number;
  isTorBoxCached?: boolean;
  headers?: Record<string, string>;
  subtitles?: any[];
  behaviorHints?: BehaviorHints;
  capabilities?: {
    supportsDebrid?: boolean;
    isWebOnly?: boolean;
  };
}

export function base32ToHex(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';
  const upper = base32.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const val = alphabet.indexOf(upper[i]);
    if (val === -1) return '';
    bits += val.toString(2).padStart(5, '0');
  }
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    const chunk = bits.substring(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex.toLowerCase();
}

/**
 * Normalizes a torrent infoHash or magnet string into a clean 40-character lower-case hex hash.
 * DO NOT extract 40-char hex strings from standard web HTTP stream URLs (e.g. Hellspy direct URLs).
 */
export function normalizeInfoHash(hashOrMagnet?: string): string {
  if (!hashOrMagnet) return '';
  const clean = hashOrMagnet.trim();
  if (!clean) return '';

  // 1. Check for urn:btih: pattern anywhere
  const btihMatch = clean.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  if (btihMatch) {
    const raw = btihMatch[1];
    if (raw.length === 40) return raw.toLowerCase();
    if (raw.length === 32) return base32ToHex(raw);
  }

  // 2. Check for explicit hash parameters in URLs or strings (e.g. ?hash=..., ?btih=..., /hash/...)
  const paramMatch = clean.match(/(?:hash|btih|infohash)[=/:]+([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  if (paramMatch) {
    const raw = paramMatch[1];
    if (raw.length === 40) return raw.toLowerCase();
    if (raw.length === 32) return base32ToHex(raw);
  }

  // 3. If it's an HTTP/HTTPS URL
  if (/^https?:\/\//i.test(clean)) {
    // Avoid extracting hashes from direct video streams (e.g. hellspy, direct mp4/mkv/m3u8 URLs)
    const isDirectVideoMedia = /\.(mp4|mkv|m3u8|avi|mov|flv|webm)(\?.*)?$/i.test(clean) || /hellspy|sktonline/i.test(clean);
    if (!isDirectVideoMedia) {
      const urlHexMatch = clean.match(/\/([a-fA-F0-9]{40})(?:\.torrent|\/|\?|$)/i) || clean.match(/\b([a-fA-F0-9]{40})\b/);
      if (urlHexMatch) {
        return urlHexMatch[1].toLowerCase();
      }
    }
    return '';
  }

  // 4. Standalone 40-character hex hash or 32-character base32 hash
  const hexMatch = clean.match(/\b([a-fA-F0-9]{40})\b/);
  if (hexMatch) return hexMatch[1].toLowerCase();

  if (/^[a-zA-Z2-7]{32}$/.test(clean)) {
    return base32ToHex(clean);
  }

  return '';
}

/**
 * Safely extracts a torrent infoHash from a StreamSource.
 * Only extracts if explicitly provided via infoHash property, behaviorHints, magnet URI, or torrent stream descriptor.
 */
export function getHashFromSource(s: Partial<StreamSource>): string {
  if (!s) return '';
  if (s.infoHash) {
    const norm = normalizeInfoHash(s.infoHash);
    if (norm) return norm;
  }
  if (s.behaviorHints?.infoHash) {
    const norm = normalizeInfoHash(s.behaviorHints.infoHash);
    if (norm) return norm;
  }
  if (s.magnet) {
    const norm = normalizeInfoHash(s.magnet);
    if (norm) return norm;
  }
  if (s.url) {
    const norm = normalizeInfoHash(s.url);
    if (norm) return norm;
  }
  return '';
}

/**
 * Checks if a stream is a resolved Debrid HTTP stream (Real-Debrid, TorBox, AllDebrid, etc.)
 */
export function isDebridCachedStream(s: any): boolean {
  if (!s) return false;
  if (s.isTorBoxCached || s.isDebrid || s.cached) return true;
  if (s.behaviorHints?.cached === true || s.behaviorHints?.isDebrid === true) return true;

  const urlStr = s.url || s.link || s.streamUrl;
  const isHttpUrl = Boolean(urlStr && /^https?:\/\//i.test(urlStr) && !urlStr.toLowerCase().endsWith('.torrent'));

  const streamText = `${s.subProvider || ''} ${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.rawName || ''} ${s.pluginName || ''}`;

  // Exclude explicitly UNCACHED indicators (e.g. [RD-] or [RD ⏳] or "uncached")
  const isExplicitlyUncached = /\[(RD|TB|AD|DL|PM|Debrid)-?\]\s*(uncached|non-cached|⏳|❌)/i.test(streamText) || /\b(uncached|non-cached)\b/i.test(streamText);
  if (isExplicitlyUncached) {
    return false;
  }

  // 1. If an HTTP URL is provided alongside an infoHash or magnet in a torrent addon stream, it has been resolved by Debrid
  if (isHttpUrl && (s.infoHash || s.magnet || s.behaviorHints?.infoHash)) {
    return true;
  }

  // 2. Direct HTTP/HTTPS stream link from a Debrid resolver domain/path
  if (isHttpUrl) {
    const urlLower = urlStr.toLowerCase();
    if (
      urlLower.includes('real-debrid') ||
      urlLower.includes('realdebrid') ||
      urlLower.includes('torbox') ||
      urlLower.includes('alldebrid') ||
      urlLower.includes('debrid-link') ||
      urlLower.includes('premiumize') ||
      urlLower.includes('pikpak') ||
      urlLower.includes('offcloud') ||
      urlLower.includes('easydebrid') ||
      urlLower.includes('/debrid/') ||
      urlLower.includes('/rd/') ||
      urlLower.includes('/tb/') ||
      urlLower.includes('/ad/') ||
      urlLower.includes('/pm/') ||
      urlLower.includes('/dl/')
    ) {
      return true;
    }
  }

  // 3. Check stream text for Debrid status indicators ([RD+], [RD ⚡], [TB+], [AD+], [PM+], [DL+], ⚡, etc.)
  if (
    /\[(RD|TB|AD|DL|PM|PikPak|Debrid|RealDebrid|TorBox|AllDebrid|Premiumize|Offcloud|EasyDebrid)(\+|\s*⚡|\s*Download|\s*Cached)?\]/i.test(streamText) ||
    /\[(RD|TB|AD|DL|PM)\s*(\+|\b|⚡)\]/i.test(streamText) ||
    /\b(RD\+|TB\+|AD\+|DL\+|PM\+)\b/i.test(streamText) ||
    /\b(RD|TB|AD|DL|PM)\s*⚡/i.test(streamText) ||
    /⚡\s*(RD|TB|AD|Debrid|TorBox|RealDebrid)/i.test(streamText) ||
    /⚡\s*(Instant|Cached|Debrid)/i.test(streamText)
  ) {
    return true;
  }

  return false;
}

/**
 * Classifies a stream source as 'web', 'debrid', or 'torrent'.
 * - 'web': Direct Web HTTP links (e.g. Hellspy web streams, mp4/m3u8 URLs)
 * - 'debrid': Resolved Debrid HTTP streams from Real-Debrid, TorBox, AllDebrid, etc.
 * - 'torrent': P2P Torrents containing explicit infoHash, magnet link, or Stremio torrent properties
 */
export function classifyStream(s: Partial<StreamSource>): 'web' | 'debrid' | 'torrent' {
  if (s.capabilities?.isWebOnly) {
    return 'web';
  }

  if (isDebridCachedStream(s)) {
    return 'debrid';
  }

  const hash = getHashFromSource(s);
  const isTorrent = Boolean(
    hash ||
    s.magnet ||
    s.infoHash ||
    (s.url && (s.url.startsWith('magnet:') || s.url.toLowerCase().endsWith('.torrent'))) ||
    s.type === 'torrent'
  );

  if (isTorrent) {
    return 'torrent';
  }

  if (s.url && /^https?:\/\//i.test(s.url)) {
    return 'web';
  }

  return 'web';
}

export function safeDecodeFileName(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  try {
    if (fileName.includes('%')) {
      return decodeURIComponent(fileName);
    }
  } catch (e) {
    // Return original if URI malformed
  }
  return fileName;
}

export function extractFileIdx(s: any): number | undefined {
  if (typeof s.fileIdx === 'number') return s.fileIdx;
  if (typeof s.fileIdx === 'string' && !isNaN(parseInt(s.fileIdx, 10))) return parseInt(s.fileIdx, 10);
  if (typeof s.file_index === 'number') return s.file_index;
  if (typeof s.file_index === 'string' && !isNaN(parseInt(s.file_index, 10))) return parseInt(s.file_index, 10);
  if (typeof s.fileIndex === 'number') return s.fileIndex;
  if (typeof s.fileIndex === 'string' && !isNaN(parseInt(s.fileIndex, 10))) return parseInt(s.fileIndex, 10);
  if (typeof s.behaviorHints?.fileIdx === 'number') return s.behaviorHints.fileIdx;
  if (typeof s.behaviorHints?.fileIdx === 'string' && !isNaN(parseInt(s.behaviorHints.fileIdx, 10))) return parseInt(s.behaviorHints.fileIdx, 10);
  return undefined;
}

const STORAGE_KEY = 'browseio_installed_plugins';

// NO built-in default plugins to comply with regulations.
const DEFAULT_PLUGINS: PluginManifest[] = [];

export function getInstalledPlugins(): PluginManifest[] {
  if (typeof window === 'undefined') return DEFAULT_PLUGINS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PLUGINS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load plugins:', e);
    return DEFAULT_PLUGINS;
  }
}

export function savePlugins(plugins: PluginManifest[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins));
}

/**
 * Polyfilled require helper for browser execution of Nuvio scrapers.
 */
const customRequire = (moduleName: string) => {
  if (moduleName && moduleName.includes('cheerio')) return cheerio;
  return {};
};

/**
 * Fetches a URL with direct fetch attempt first (3.5s timeout) followed by CORS proxy fallbacks.
 */
const corsFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Skip proxying for known safe origins
  if (urlStr.startsWith('/') || urlStr.includes('themoviedb.org') || urlStr.includes('localhost')) {
    return fetch(input, init);
  }

  // 1. Check if user configured a custom CORS proxy in Settings
  const customProxy = typeof window !== 'undefined' ? localStorage.getItem('custom_cors_proxy') : null;
  if (customProxy && customProxy.trim()) {
    const cp = customProxy.trim();
    const proxiedUrl = cp.endsWith('=') || cp.endsWith('?') ? `${cp}${encodeURIComponent(urlStr)}` : `${cp}/${urlStr}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(proxiedUrl, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return res;
    } catch (e) {
      // Ignore, fallback
    }
  }

  // 2. Direct fetch attempt first (3.5s timeout) — works for sktorrent.eu, hellspy, etc.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(input, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) return res;
  } catch (e) {
    // Direct fetch restricted by CORS or timed out, fallback to proxy list
  }

  // 3. Fallback CORS proxy list
  const corsProxies: ((u: string) => string)[] = [
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://cors.eu.org/${u}`,
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
  ];

  for (const proxyFn of corsProxies) {
    try {
      const proxiedUrl = proxyFn(urlStr);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(proxiedUrl, {
        ...init,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) return res;
    } catch (e) {
      // Fast fail, try next proxy
    }
  }

  throw new Error(`CORS_FETCH_FAILED: ${urlStr}`);
};

/**
 * Smart fetch for Stremio addons: tries direct fetch first (Stremio addons
 * typically set Access-Control-Allow-Origin: *), then falls back to CORS proxies.
 * Has an 8s timeout since Stremio responses can be large.
 */
const stremioFetch = async (url: string): Promise<Response> => {
  // 1. Try fast direct fetch first (Stremio addons support CORS natively) with 2.5s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) return res;
  } catch (e) {
    // Fast fail direct fetch, try proxies immediately
  }

  // 2. Fallback to CORS proxies with fast timeouts
  const customProxy = typeof window !== 'undefined' ? localStorage.getItem('custom_cors_proxy') : null;
  const corsProxies: ((u: string) => string)[] = [];

  if (customProxy && customProxy.trim()) {
    const cp = customProxy.trim();
    corsProxies.push((u: string) => cp.endsWith('=') || cp.endsWith('?') ? `${cp}${encodeURIComponent(u)}` : `${cp}/${u}`);
  }

  corsProxies.push(
    (u: string) => `/api/proxy?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://cors.eu.org/${u}`
  );

  for (const proxyFn of corsProxies) {
    try {
      const proxiedUrl = proxyFn(url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(proxiedUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return res;
    } catch (e) {
      // Try next proxy
    }
  }

  throw new Error(`STREMIO_FETCH_FAILED: ${url}`);
};

export async function installPluginFromUrl(urlInput: string): Promise<PluginManifest> {
  let cleanUrl = urlInput.trim();

  if (cleanUrl.startsWith('stremio://')) {
    cleanUrl = cleanUrl.replace('stremio://', 'https://');
  }

  if (!cleanUrl.endsWith('.json') && !cleanUrl.includes('manifest.json')) {
    cleanUrl = cleanUrl.endsWith('/') ? `${cleanUrl}manifest.json` : `${cleanUrl}/manifest.json`;
  }

  let res: Response;
  try {
    res = await stremioFetch(cleanUrl);
  } catch {
    throw new Error(`Doplněk na zadané URL neodpovídá.`);
  }

  const text = await res.text();
  let manifest: any = {};

  try {
    manifest = JSON.parse(text);
  } catch (e) {
    try {
      let fixedText = text.trim().replace(/,\s*$/, '');
      if (!fixedText.endsWith('}')) {
        if (!fixedText.includes(']')) fixedText += ']}';
        else fixedText += '}';
      }
      manifest = JSON.parse(fixedText);
    } catch {
      const nameMatch = text.match(/"name"\s*:\s*"([^"]+)"/);
      const idMatch = text.match(/"id"\s*:\s*"([^"]+)"/);
      manifest = {
        id: idMatch ? idMatch[1] : `nuvio_${Date.now()}`,
        name: nameMatch ? nameMatch[1] : 'Nuvio Plugin',
        nuvio: true
      };
    }
  }

  const id = manifest.id || (manifest.scrapers && manifest.scrapers[0]?.id) || `plugin_${Date.now()}`;
  const name = manifest.name || (manifest.scrapers && manifest.scrapers[0]?.name) || 'Klientský Doplněk';
  const isNuvio = Boolean(manifest.nuvio) || Boolean(manifest.scrapers) || Boolean(manifest.pluginType === 'nuvio');

  const newPlugin: PluginManifest = {
    id: id,
    name: name,
    version: manifest.version || '1.0.0',
    description: manifest.description || (manifest.scrapers && manifest.scrapers[0]?.description) || 'Doplněk pro načítání streamů',
    icon: manifest.icon || manifest.logo,
    type: isNuvio ? 'nuvio' : 'stremio',
    manifestUrl: cleanUrl,
    enabled: true,
    isBuiltIn: false,
  };

  const existing = getInstalledPlugins();
  const filtered = existing.filter(p => p.id !== newPlugin.id);
  const updated = [...filtered, newPlugin];
  savePlugins(updated);

  return newPlugin;
}

export async function fetchStreamsFromPlugin(
  plugin: PluginManifest,
  type: string,
  id: string,
  season?: number,
  episode?: number,
  title?: string,
  onPartialStreams?: (streams: StreamSource[]) => void
): Promise<StreamSource[]> {
  if (!plugin.enabled) return [];

  const baseUrl = plugin.manifestUrl.replace('/manifest.json', '').replace(/\/$/, '');

  // ─── Handle Nuvio Executable JS Plugins ───
  if (plugin.type === 'nuvio' || plugin.manifestUrl.includes('scrapelord') || plugin.manifestUrl.includes('Nuvio')) {
    try {
      const mRes = await corsFetch(plugin.manifestUrl);
      if (!mRes.ok) return [];
      const manifest = await mRes.json();
      const scrapers = manifest.scrapers || [];
      if (!Array.isArray(scrapers) || scrapers.length === 0) return [];

      const results: StreamSource[] = [];

      await Promise.allSettled(
        scrapers.map(async scraper => {
          if (scraper.enabled === false) return;
          try {
            const jsUrl = `${baseUrl}/${scraper.filename}`;
            const jsRes = await corsFetch(jsUrl);
            if (!jsRes.ok) return;

            const code = await jsRes.text();
            const mod: any = { exports: {} };

            const customGlobalThis = Object.create(globalThis, {
              fetch: { value: corsFetch, writable: true, configurable: true },
              cheerio: { value: cheerio, writable: true, configurable: true },
              require: { value: customRequire, writable: true, configurable: true },
              TMDB_API_KEY: { value: '4219e299c89411838049ab0dab19ebd5', writable: true, configurable: true }
            });

            const runner = new Function('module', 'exports', 'globalThis', 'fetch', 'require', 'cheerio', code);
            runner(mod, mod.exports, customGlobalThis, corsFetch, customRequire, cheerio);

            const getStreamsFn = mod.exports.getStreams || customGlobalThis.getStreams;

            if (typeof getStreamsFn === 'function') {
              const targetType = type === 'series' ? 'tv' : 'movie';
              let raw: any = null;

              // 1. Try object argument signature first
              try {
                raw = await getStreamsFn({
                  tmdbId: id,
                  mediaType: targetType,
                  season: season,
                  episode: episode,
                  title: title
                });
              } catch (e1) {
                // Ignore object error, try positional signature
              }

              // 2. Fallback to positional arguments signature: (id, targetType, season, episode, title)
              if (!Array.isArray(raw) || raw.length === 0) {
                try {
                  raw = await getStreamsFn(id, targetType, season, episode, title);
                } catch (e2) {
                  // Ignore
                }
              }

              if (Array.isArray(raw) && raw.length > 0) {
                const scraperStreams: StreamSource[] = [];
                raw.forEach((s: any) => {
                  const rawTitle = s.title || s.name || scraper.name || plugin.name;
                  const titleParts = String(rawTitle).split('\n');
                  const namePart = titleParts[0];
                  const infoPart = titleParts.length > 1 ? titleParts[titleParts.length - 1] : '';

                  let seeders = s.seeders || 0;
                  let size = s.size || 'Unknown';

                  const seedMatch = infoPart.match(/👤 (\d+)/);
                  if (seedMatch) seeders = parseInt(seedMatch[1], 10);

                  const sizeMatch = infoPart.match(/💾 ([0-9.]+ [A-Z]+)/);
                  if (sizeMatch) size = sizeMatch[1];

                  const urlStr = s.url || s.link || s.streamUrl || s.downloadUrl || s.file;
                  const magnet = (urlStr && urlStr.startsWith('magnet:')) ? urlStr : (s.magnet || undefined);
                  
                  const explicitHash = s.infoHash || s.hash || s.btih || s.behaviorHints?.infoHash;
                  const infoHash = explicitHash ? normalizeInfoHash(explicitHash) : (magnet ? normalizeInfoHash(magnet) : undefined);
                  const finalMagnet = magnet || (infoHash ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(namePart || 'Torrent')}` : undefined);
                  const fileIdx = extractFileIdx(s);

                  const cleanScraperName = scraper.name ? scraper.name.replace(/^[^\w\s\u00C0-\u024F\u0100-\u017F\u0180-\u024F]+/, '').trim() : plugin.name;
                  const rawNameStr = s.name ? String(s.name) : (cleanScraperName || plugin.name);
                  const rawSubName = rawNameStr.replace(/\n+/g, ' ').trim();

                  const isWebOnly = /hellspy|sktonline/i.test(scraper.id || '') || /hellspy|sktonline/i.test(scraper.name || '');
                  const supportsDebrid = !isWebOnly;

                  const behaviorHints: BehaviorHints = {
                    ...(s.behaviorHints || {}),
                    ...(s.behaviorHints?.proxyHeaders ? { proxyHeaders: s.behaviorHints.proxyHeaders } : {}),
                    ...(s.behaviorHints?.notSupported !== undefined ? { notSupported: s.behaviorHints.notSupported } : {}),
                    ...(s.behaviorHints?.fileName ? { fileName: safeDecodeFileName(s.behaviorHints.fileName) } : {}),
                    ...(s.behaviorHints?.videoHash ? { videoHash: s.behaviorHints.videoHash } : {}),
                    ...(s.behaviorHints?.bingeGroup ? { bingeGroup: s.behaviorHints.bingeGroup } : {}),
                    ...(fileIdx !== undefined ? { fileIdx: fileIdx } : {})
                  };

                  const streamObj: StreamSource = {
                    name: rawSubName,
                    pluginId: plugin.id,
                    pluginName: plugin.name,
                    subProvider: rawSubName,
                    title: namePart,
                    url: urlStr && !urlStr.startsWith('magnet:') ? urlStr : undefined,
                    magnet: finalMagnet,
                    infoHash: infoHash || undefined,
                    fileIdx: fileIdx,
                    size: size,
                    seeders: seeders,
                    headers: s.behaviorHints?.proxyHeaders?.request || s.headers,
                    subtitles: s.subtitles,
                    behaviorHints: behaviorHints,
                    capabilities: {
                      supportsDebrid,
                      isWebOnly
                    }
                  };

                  streamObj.isTorBoxCached = isDebridCachedStream(s) || isDebridCachedStream(streamObj);
                  streamObj.type = classifyStream(streamObj);

                  scraperStreams.push(streamObj);
                  results.push(streamObj);
                });

                if (onPartialStreams) {
                  onPartialStreams(scraperStreams);
                }
              }
            }
          } catch (err) {
            console.error(`Scraper ${scraper.name} failed or timed out:`, err);
          }
        })
      );

      return results;
    } catch (e) {
      console.error(`Error executing Nuvio plugin ${plugin.name}:`, e);
      return [];
    }
  }

  // ─── Handle Stremio Addons (direct fetch → CORS proxy fallback) ───
  try {
    const streamId = type === 'series' && season && episode ? `${id}:${season}:${episode}` : id;
    const requestUrl = `${baseUrl}/stream/${type}/${streamId}.json`;

    console.log(`[Stremio] Fetching streams: ${requestUrl}`);

    const res = await stremioFetch(requestUrl);
    const data = await res.json();

    if (!data.streams || !Array.isArray(data.streams)) {
      console.warn(`[Stremio] No streams array in response from ${plugin.name}`);
      return [];
    }

    console.log(`[Stremio] ${plugin.name} returned ${data.streams.length} streams`);

    const streams: StreamSource[] = data.streams.map((s: any) => {
      const rawTitle = s.title || s.name || plugin.name;
      const titleParts = String(rawTitle).split('\n');
      const namePart = titleParts[0];
      const infoPart = titleParts.length > 1 ? titleParts[titleParts.length - 1] : '';

      let seeders = s.seeders || 0;
      let size = s.size || 'Unknown';

      const seedMatch = infoPart.match(/👤 (\d+)/);
      if (seedMatch) seeders = parseInt(seedMatch[1], 10);

      const sizeMatch = infoPart.match(/💾 ([0-9.]+ [A-Z]+)/);
      if (sizeMatch) size = sizeMatch[1];

      const urlStr = s.url || s.link || s.streamUrl;
      const magnet = (urlStr && urlStr.startsWith('magnet:')) ? urlStr : (s.magnet || undefined);

      const explicitHash = s.infoHash || s.hash || s.btih || s.behaviorHints?.infoHash;
      const infoHash = explicitHash ? normalizeInfoHash(explicitHash) : (magnet ? normalizeInfoHash(magnet) : undefined);
      const finalMagnet = magnet || (infoHash ? `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(namePart || 'Torrent')}` : undefined);
      const fileIdx = extractFileIdx(s);

      const rawNameStr = s.name ? String(s.name) : plugin.name;
      const subName = rawNameStr.replace(/\n+/g, ' ').trim();

      const isWebOnly = /hellspy|sktonline/i.test(plugin.id);
      const supportsDebrid = !isWebOnly;

      const behaviorHints: BehaviorHints = {
        ...(s.behaviorHints || {}),
        ...(s.behaviorHints?.proxyHeaders ? { proxyHeaders: s.behaviorHints.proxyHeaders } : {}),
        ...(s.behaviorHints?.notSupported !== undefined ? { notSupported: s.behaviorHints.notSupported } : {}),
        ...(s.behaviorHints?.fileName ? { fileName: safeDecodeFileName(s.behaviorHints.fileName) } : {}),
        ...(s.behaviorHints?.videoHash ? { videoHash: s.behaviorHints.videoHash } : {}),
        ...(s.behaviorHints?.bingeGroup ? { bingeGroup: s.behaviorHints.bingeGroup } : {}),
        ...(fileIdx !== undefined ? { fileIdx: fileIdx } : {})
      };

      const streamObj: StreamSource = {
        name: subName,
        pluginId: plugin.id,
        pluginName: plugin.name,
        subProvider: subName,
        title: namePart,
        url: urlStr && !urlStr.startsWith('magnet:') ? urlStr : undefined,
        magnet: finalMagnet,
        infoHash: infoHash || undefined,
        fileIdx: fileIdx,
        size: size,
        seeders: seeders,
        headers: s.behaviorHints?.proxyHeaders?.request,
        subtitles: s.subtitles,
        behaviorHints: behaviorHints,
        capabilities: {
          supportsDebrid,
          isWebOnly
        }
      };

      streamObj.isTorBoxCached = isDebridCachedStream(s) || isDebridCachedStream(streamObj);
      streamObj.type = classifyStream(streamObj);

      return streamObj;
    });

    if (onPartialStreams && streams.length > 0) {
      onPartialStreams(streams);
    }

    return streams;
  } catch (e) {
    console.error(`[Stremio] Error fetching streams from ${plugin.name}:`, e);
    return [];
  }
}
