// TorBox Debrid API client for BrowseIO
// Supports direct fetch and CORS proxy fallback with token query parameters to avoid CORS preflight failures.

const TORBOX_API_BASE = 'https://api.torbox.app/v1/api';

export interface TorBoxCachedResponse {
  success: boolean;
  detail: string;
  data: {
    [hash: string]: {
      name?: string;
      size?: number;
      files?: {
        name: string;
        size: number;
      }[];
    } | boolean;
  };
}

/**
 * Smart fetch for TorBox API:
 * 1. Tries direct browser fetch.
 * 2. If direct fetch fails (CORS error / network error), falls back to configured CORS proxies.
 */
async function torboxFetch(url: string, init?: RequestInit): Promise<Response> {
  // 1. Direct fetch
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) return res;
  } catch (e) {
    console.warn(`[TorBox] Direct fetch failed for ${url.slice(0, 60)}..., trying CORS proxies`);
  }

  // 2. CORS Proxy Fallbacks
  const customProxy = typeof window !== 'undefined' ? localStorage.getItem('custom_cors_proxy') : null;
  const corsProxies: ((u: string) => string)[] = [];

  if (customProxy && customProxy.trim()) {
    const cp = customProxy.trim();
    corsProxies.push((u: string) => cp.endsWith('=') || cp.endsWith('?') ? `${cp}${encodeURIComponent(u)}` : `${cp}/${u}`);
  }

  corsProxies.push(
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  );

  for (const proxyFn of corsProxies) {
    try {
      const proxiedUrl = proxyFn(url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(proxiedUrl, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return res;
    } catch (e) {
      // Try next
    }
  }

  throw new Error(`TORBOX_FETCH_FAILED: ${url}`);
}

export async function checkTorBoxCached(hashes: string[], apiKey?: string): Promise<Set<string>> {
  const cachedHashes = new Set<string>();
  if (!hashes || hashes.length === 0) return cachedHashes;

  try {
    // TorBox checkcached accepts up to 100 hashes comma-separated
    const hashList = hashes.join(',');
    const tokenQuery = apiKey ? `&token=${encodeURIComponent(apiKey)}` : '';
    const targetUrl = `${TORBOX_API_BASE}/torrents/checkcached?hash=${hashList}&format=object${tokenQuery}`;

    const res = await torboxFetch(targetUrl);
    const json: TorBoxCachedResponse = await res.json();

    if (json && json.data) {
      Object.keys(json.data).forEach(hash => {
        const val = json.data[hash];
        if (val) {
          cachedHashes.add(hash.toLowerCase());
        }
      });
    }
  } catch (error) {
    console.error('TorBox checkCached error:', error);
  }

  return cachedHashes;
}

export async function resolveTorBoxStreamUrl(magnetOrHash: string, apiKey: string, season?: number, episode?: number): Promise<string | null> {
  if (!apiKey) return null;

  const magnet = magnetOrHash.startsWith('magnet:') ? magnetOrHash : `magnet:?xt=urn:btih:${magnetOrHash}`;

  try {
    // 1. Create/Add Torrent on TorBox (using token in query parameter to avoid CORS preflight issues)
    const bodyData = new URLSearchParams();
    bodyData.append('magnet', magnet);
    bodyData.append('seed', '1');
    bodyData.append('allow_zip', 'false');

    const targetUrl = `${TORBOX_API_BASE}/torrents/createtorrent?token=${encodeURIComponent(apiKey)}`;

    const createRes = await torboxFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyData
    });

    const createJson = await createRes.json();
    if (!createJson.success || !createJson.data) {
      console.error('TorBox createtorrent failed:', createJson);
      return null;
    }

    const torrentId = createJson.data?.torrent_id || createJson.data?.id || (typeof createJson.data === 'number' || typeof createJson.data === 'string' ? createJson.data : null);

    if (!torrentId) {
      console.error('TorBox torrentId not found in createtorrent response:', createJson);
      return null;
    }

    // 2. If series with specific season/episode, find target file_id
    let fileIdQuery = '';
    if (season !== undefined && episode !== undefined) {
      try {
        const listUrl = `${TORBOX_API_BASE}/torrents/mylist?token=${encodeURIComponent(apiKey)}`;
        const listRes = await torboxFetch(listUrl);
        const listJson = await listRes.json();

        if (listJson.success && listJson.data && Array.isArray(listJson.data)) {
          const torrent = listJson.data.find((t: any) => t.id === torrentId || t.torrent_id === torrentId);
          if (torrent && torrent.files && Array.isArray(torrent.files)) {
            const regexes = [
              new RegExp(`s0*${season}e0*${episode}[^a-z0-9]`, 'i'),
              new RegExp(`0*${season}x0*${episode}[^a-z0-9]`, 'i'),
              new RegExp(`s0*${season}.*e0*${episode}`, 'i'),
              new RegExp(`[^a-z0-9]0*${episode}[^a-z0-9]`, 'i')
            ];

            for (const regex of regexes) {
              const match = torrent.files.find((f: any) => regex.test(f.name));
              if (match) {
                fileIdQuery = `&file_id=${match.id}`;
                break;
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to find specific file_id for TorBox stream:', e);
      }
    }

    // 3. Request Download / Direct Stream Link
    const dlUrl = `${TORBOX_API_BASE}/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torrentId}${fileIdQuery}`;
    const dlRes = await torboxFetch(dlUrl);
    const dlJson = await dlRes.json();

    if (dlJson.success && dlJson.data) {
      if (typeof dlJson.data === 'string') return dlJson.data;
      if (dlJson.data.url) return dlJson.data.url;
      if (dlJson.data.download_url) return dlJson.data.download_url;
    }
  } catch (error) {
    console.error('TorBox resolveStreamUrl error:', error);
  }

  return null;
}

export async function cacheTorBoxTorrent(magnetOrHash: string, apiKey: string): Promise<{ success: boolean; message: string }> {
  if (!apiKey) return { success: false, message: 'Chybí TorBox API klíč' };
  const magnetUrl = magnetOrHash.startsWith('magnet:') ? magnetOrHash : `magnet:?xt=urn:btih:${magnetOrHash}`;

  try {
    const bodyData = new URLSearchParams();
    bodyData.append('magnet', magnetUrl);
    bodyData.append('seed', '1');
    bodyData.append('allow_zip', 'false');

    const targetUrl = `${TORBOX_API_BASE}/torrents/createtorrent?token=${encodeURIComponent(apiKey)}`;

    const res = await torboxFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyData
    });

    const json = await res.json();
    if (json.success) {
      return { success: true, message: json.detail || 'Torrent byl přidán do TorBoxu ke stažení!' };
    } else {
      return { success: false, message: json.detail || 'Nepodařilo se přidat torrent do TorBoxu' };
    }
  } catch (error: any) {
    return { success: false, message: error.message || 'Chyba při komunikaci s TorBox API' };
  }
}
