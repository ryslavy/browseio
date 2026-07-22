// Universal Plugin & Addon Engine for BrowseIO
// Supports Stremio Addons & Nuvio Executable JS Plugins via dynamic CORS-enabled module runner

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

export async function installPluginFromUrl(urlInput: string): Promise<PluginManifest> {
  let cleanUrl = urlInput.trim();

  if (cleanUrl.startsWith('stremio://')) {
    cleanUrl = cleanUrl.replace('stremio://', 'https://');
  }

  if (!cleanUrl.endsWith('.json') && !cleanUrl.includes('manifest.json')) {
    cleanUrl = cleanUrl.endsWith('/') ? `${cleanUrl}manifest.json` : `${cleanUrl}/manifest.json`;
  }

  const res = await fetch(cleanUrl);
  if (!res.ok) {
    throw new Error(`Doplněk na zadané URL neodpovídá (HTTP ${res.status})`);
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

const corsFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  if (urlStr.startsWith('/') || urlStr.includes('themoviedb.org') || urlStr.includes('strem.io') || urlStr.includes('localhost')) {
    return fetch(input, init);
  }

  const corsProxies = [
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  ];

  for (const proxyFn of corsProxies) {
    try {
      const proxiedUrl = proxyFn(urlStr);
      const res = await fetch(proxiedUrl, init);
      if (res.ok) return res;
    } catch (e) {
      console.warn('CORS proxy failed, trying fallback:', e);
    }
  }

  return fetch(input, init);
};

export async function fetchStreamsFromPlugin(
  plugin: PluginManifest,
  type: string,
  id: string,
  season?: number,
  episode?: number,
  title?: string
): Promise<StreamSource[]> {
  if (!plugin.enabled) return [];

  const baseUrl = plugin.manifestUrl.replace('/manifest.json', '').replace(/\/$/, '');

  // Handle Nuvio Executable JS Plugins
  if (plugin.type === 'nuvio' || plugin.manifestUrl.includes('scrapelord')) {
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
              fetch: { value: corsFetch, writable: true, configurable: true }
            });

            const runner = new Function('module', 'exports', 'globalThis', 'fetch', code);
            runner(mod, mod.exports, customGlobalThis, corsFetch);

            if (typeof mod.exports.getStreams === 'function') {
              const raw = await mod.exports.getStreams({
                tmdbId: id,
                mediaType: type === 'series' ? 'tv' : 'movie',
                season: season,
                episode: episode,
                title: title
              });

              if (Array.isArray(raw)) {
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
                  const infoHash = s.infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : undefined);

                  const cleanScraperName = scraper.name ? scraper.name.replace(/^[^\w\s\u00C0-\u024F]+/, '').trim() : plugin.name;

                  results.push({
                    name: cleanScraperName || plugin.name,
                    title: namePart,
                    url: s.url && !s.url.startsWith('magnet:') ? s.url : undefined,
                    magnet: magnet,
                    infoHash: infoHash,
                    size: size,
                    seeders: seeders,
                    headers: s.behaviorHints?.proxyHeaders?.request,
                    subtitles: s.subtitles,
                    behaviorHints: s.behaviorHints
                  });
                });
              }
            }
          } catch (err) {
            console.error(`Error running scraper ${scraper.name}:`, err);
          }
        })
      );

      return results;
    } catch (e) {
      console.error(`Error executing Nuvio plugin ${plugin.name}:`, e);
      return [];
    }
  }

  // Handle Stremio Addons
  try {
    const streamId = type === 'series' && season && episode ? `${id}:${season}:${episode}` : id;
    const requestUrl = `${baseUrl}/stream/${type}/${streamId}.json`;

    const res = await corsFetch(requestUrl);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.streams || !Array.isArray(data.streams)) return [];

    return data.streams.map((s: any) => {
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
      const infoHash = s.infoHash || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : undefined);

      return {
        name: s.name || plugin.name,
        title: namePart,
        url: s.url && !s.url.startsWith('magnet:') ? s.url : undefined,
        magnet: magnet,
        infoHash: infoHash,
        size: size,
        seeders: seeders,
        headers: s.behaviorHints?.proxyHeaders?.request,
        subtitles: s.subtitles,
        behaviorHints: s.behaviorHints
      };
    });
  } catch (e) {
    console.error(`Error fetching streams from plugin ${plugin.name}:`, e);
    return [];
  }
}
