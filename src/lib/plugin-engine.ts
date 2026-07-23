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

export interface StreamSource {
  name: string;
  pluginId?: string;
  pluginName?: string;
  subProvider?: string;
  title: string;
  url?: string | null;
  magnet?: string;
  infoHash?: string;
  size?: string;
  seeders?: number;
  isTorBoxCached?: boolean;
  headers?: Record<string, string>;
  subtitles?: any[];
  behaviorHints?: any;
}

function base32ToHex(base32: string): string {
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

export function normalizeInfoHash(hashOrMagnet?: string): string {
  if (!hashOrMagnet) return '';
  const clean = hashOrMagnet.trim();
  
  const hexMatch = clean.match(/\b([a-fA-F0-9]{40})\b/);
  if (hexMatch) return hexMatch[1].toLowerCase();

  const btihMatch = clean.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  if (btihMatch) {
    const raw = btihMatch[1];
    if (raw.length === 40) return raw.toLowerCase();
    if (raw.length === 32) return base32ToHex(raw);
  }

  if (/^[a-zA-Z2-7]{32}$/.test(clean)) {
    return base32ToHex(clean);
  }

  return '';
}

export function isDebridCachedStream(s: Partial<StreamSource>): boolean {
  if (s.isTorBoxCached) return true;

  // 1. Direct HTTP/HTTPS stream link from a Debrid service/proxy (not magnet and not .torrent file)
  if (s.url && /^https?:\/\//i.test(s.url) && !s.url.toLowerCase().endsWith('.torrent')) {
    const urlLower = s.url.toLowerCase();
    if (
      urlLower.includes('real-debrid') ||
      urlLower.includes('torbox') ||
      urlLower.includes('alldebrid') ||
      urlLower.includes('debrid-link') ||
      urlLower.includes('premiumize') ||
      urlLower.includes('/debrid/')
    ) {
      return true;
    }
  }

  // 2. Title, name, subProvider, pluginName or behaviorHints contains Debrid indicators
  const combined = `${s.name || ''} ${s.title || ''} ${s.subProvider || ''} ${s.pluginName || ''}`;
  
  if (
    /\[?(RD\+?|TB\+?|AD\+?|DL\+?|PM\+?)\]?/i.test(combined) ||
    /⚡|debrid|real-debrid|torbox|alldebrid|cached/i.test(combined) ||
    s.behaviorHints?.cached === true
  ) {
    return true;
  }

  return false;
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
  // 1. Try direct fetch first (most Stremio addons support CORS natively)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) return res;
  } catch (e) {
    console.warn(`[Stremio] Direct fetch failed for ${url.slice(0, 60)}..., trying CORS proxies`);
  }

  // 2. Fallback to CORS proxies with longer timeout
  const customProxy = typeof window !== 'undefined' ? localStorage.getItem('custom_cors_proxy') : null;
  const corsProxies: ((u: string) => string)[] = [];

  if (customProxy && customProxy.trim()) {
    const cp = customProxy.trim();
    corsProxies.push((u: string) => cp.endsWith('=') || cp.endsWith('?') ? `${cp}${encodeURIComponent(u)}` : `${cp}/${u}`);
  }

  corsProxies.push(
    (u: string) => `https://cors.eu.org/${u}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  );

  for (const proxyFn of corsProxies) {
    try {
      const proxiedUrl = proxyFn(url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
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

              // 1. Try object argument signature first (allows scrapers to skip redundant title resolution)
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

                  const magnet = s.url && s.url.startsWith('magnet:') ? s.url : (s.magnet || undefined);
                  const infoHash = normalizeInfoHash(s.infoHash || s.behaviorHints?.infoHash || magnet || (s.url && s.url.startsWith('magnet:') ? s.url : undefined));

                  const cleanScraperName = scraper.name ? scraper.name.replace(/^[^\w\s\u00C0-\u024F]+/, '').trim() : plugin.name;
                  const rawSubName = s.name || cleanScraperName || plugin.name;

                  const streamObj: StreamSource = {
                    name: rawSubName,
                    pluginId: plugin.id,
                    pluginName: plugin.name,
                    subProvider: rawSubName,
                    title: namePart,
                    url: s.url && !s.url.startsWith('magnet:') ? s.url : undefined,
                    magnet: magnet,
                    infoHash: infoHash || undefined,
                    size: size,
                    seeders: seeders,
                    headers: s.behaviorHints?.proxyHeaders?.request,
                    subtitles: s.subtitles,
                    behaviorHints: s.behaviorHints
                  };

                  streamObj.isTorBoxCached = isDebridCachedStream(streamObj);

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

      const magnet = s.url && s.url.startsWith('magnet:') ? s.url : (s.magnet || undefined);
      const infoHash = normalizeInfoHash(s.infoHash || s.behaviorHints?.infoHash || magnet || (s.url && s.url.startsWith('magnet:') ? s.url : undefined));

      const subName = s.name ? String(s.name).split('\n')[0] : plugin.name;

      const streamObj: StreamSource = {
        name: subName,
        pluginId: plugin.id,
        pluginName: plugin.name,
        subProvider: subName,
        title: namePart,
        url: s.url && !s.url.startsWith('magnet:') ? s.url : undefined,
        magnet: magnet,
        infoHash: infoHash || undefined,
        size: size,
        seeders: seeders,
        headers: s.behaviorHints?.proxyHeaders?.request,
        subtitles: s.subtitles,
        behaviorHints: s.behaviorHints
      };

      streamObj.isTorBoxCached = isDebridCachedStream(streamObj);

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
