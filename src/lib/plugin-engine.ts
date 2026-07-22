// Universal Plugin & Addon Engine for BrowseIO
// Supports Stremio Addons, Nuvio Plugins, and Custom HTTP Scrapers

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
  url?: string;
  magnet?: string;
  infoHash?: string;
  size?: string;
  seeders?: number;
  isTorBoxCached?: boolean;
  headers?: Record<string, string>;
}

const STORAGE_KEY = 'browseio_installed_plugins';

// Default built-in plugins (Torrentio Stremio Addon)
const DEFAULT_PLUGINS: PluginManifest[] = [
  {
    id: 'torrentio',
    name: 'Torrentio',
    version: '1.0.0',
    description: 'Official Torrentio Stremio Addon for high-speed torrent streams',
    type: 'stremio',
    manifestUrl: 'https://torrentio.strem.fun/manifest.json',
    enabled: true,
    isBuiltIn: true,
  },
];

export function getInstalledPlugins(): PluginManifest[] {
  if (typeof window === 'undefined') return DEFAULT_PLUGINS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PLUGINS));
      return DEFAULT_PLUGINS;
    }
    const parsed: PluginManifest[] = JSON.parse(raw);
    
    // Ensure built-in plugins exist
    const pluginIds = new Set(parsed.map(p => p.id));
    let updated = [...parsed];
    let changed = false;

    DEFAULT_PLUGINS.forEach(dp => {
      if (!pluginIds.has(dp.id)) {
        updated.push(dp);
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
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
    throw new Error(`Plugin URL is unreachable (${res.status})`);
  }

  const manifest = await res.json();
  if (!manifest.id || !manifest.name) {
    throw new Error('Invalid plugin manifest: missing id or name');
  }

  const isNuvio = Boolean(manifest.nuvio) || Boolean(manifest.pluginType === 'nuvio');

  const newPlugin: PluginManifest = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version || '1.0.0',
    description: manifest.description || 'Custom addon',
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
  episode?: number
): Promise<StreamSource[]> {
  if (!plugin.enabled) return [];

  try {
    const baseUrl = plugin.manifestUrl.replace('/manifest.json', '').replace(/\/$/, '');
    const streamId = type === 'series' && season && episode ? `${id}:${season}:${episode}` : id;
    const requestUrl = `${baseUrl}/stream/${type}/${streamId}.json`;

    const res = await fetch(requestUrl);
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
        headers: s.behaviorHints?.proxyHeaders?.request
      };
    });
  } catch (e) {
    console.error(`Error fetching streams from plugin ${plugin.name}:`, e);
    return [];
  }
}
