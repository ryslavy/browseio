// TorBox Debrid API client for BrowseIO
// Proxies TorBox API requests through working CORS proxies (https://cors.eu.org/) to bypass browser CORS origin restrictions.

import { normalizeInfoHash, safeDecodeFileName } from './plugin-engine';

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

export interface TorBoxFileItem {
  id?: number | string;
  file_id?: number | string;
  name?: string;
  short_name?: string;
  absolute_path?: string;
  size?: number;
}

export interface TorBoxTorrentItem {
  id?: number | string;
  torrent_id?: number | string;
  name?: string;
  files?: TorBoxFileItem[];
}

/**
 * Smart fetch for TorBox API:
 * Tries custom proxy first, then cors.eu.org, then direct fetch.
 * Passes Authorization: Bearer header.
 */
async function torboxFetch(url: string, init?: RequestInit, apiKey?: string): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {})
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const customProxy = typeof window !== 'undefined' ? localStorage.getItem('custom_cors_proxy') : null;
  const isGithubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  // 1. Try Custom CORS proxy first if configured (essential for GitHub Pages)
  if (customProxy && customProxy.trim()) {
    const cp = customProxy.trim();
    const proxiedUrl = cp.endsWith('=') || cp.endsWith('?') ? `${cp}${encodeURIComponent(url)}` : `${cp}/${url}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(proxiedUrl, { ...init, headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status < 500) return res;
    } catch {
      // Fallback
    }
  }

  // 2. Direct fetch attempt (works on localhost / non-CORS blocked origins)
  if (!isGithubPages) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { ...init, headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status < 500) return res;
    } catch {
      // Fallback to proxy
    }
  }

  // 3. Local universal server proxy (for self-hosted or Vercel Node backend)
  const corsProxies: ((u: string) => string)[] = [];
  if (!isGithubPages) {
    corsProxies.push((u: string) => `/api/proxy?url=${encodeURIComponent(u)}`);
  }

  corsProxies.push(
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://cors.eu.org/${u}`
  );

  for (const proxyFn of corsProxies) {
    try {
      const proxiedUrl = proxyFn(url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(proxiedUrl, { ...init, headers, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.status < 500) return res;
    } catch {
      // Try next proxy
    }
  }

  throw new Error(`TORBOX_FETCH_FAILED: ${url}`);
}

/**
 * Normalizes input infoHashes and queries TorBox checkcached API endpoint.
 * Returns a Set of lower-case 40-character hex infoHashes that are cached on TorBox.
 */
export async function checkTorBoxCached(hashes: string[], apiKey?: string): Promise<Set<string>> {
  const cachedHashes = new Set<string>();
  if (!apiKey || !apiKey.trim() || !hashes || hashes.length === 0) return cachedHashes;

  const cleanHashes = Array.from(
    new Set(
      hashes
        .map(h => normalizeInfoHash(h))
        .filter((h): h is string => Boolean(h))
    )
  );

  if (cleanHashes.length === 0) return cachedHashes;

  try {
    const hashList = cleanHashes.join(',');
    const targetUrl = `${TORBOX_API_BASE}/torrents/checkcached?hash=${hashList}&format=object`;

    const res = await torboxFetch(targetUrl, { method: 'GET' }, apiKey);
    const json: TorBoxCachedResponse = await res.json();

    if (json && json.data) {
      Object.keys(json.data).forEach(hash => {
        const val = json.data[hash];
        if (val) {
          const normKey = normalizeInfoHash(hash) || hash.toLowerCase();
          cachedHashes.add(normKey);
        }
      });
    }
  } catch (error) {
    console.error('TorBox checkCached error:', error);
  }

  return cachedHashes;
}

/**
 * Resolves a stream direct play URL from TorBox for a given magnet or infoHash.
 * Handles 40-char hex, magnet URLs, season/episode matching, fileIdx, UTF-8 diacritics, and largest video fallback.
 */
export async function resolveTorBoxStreamUrl(
  magnetOrHash: string,
  apiKey: string,
  season?: number,
  episode?: number,
  fileIdx?: number
): Promise<string | null> {
  if (!apiKey || !magnetOrHash || !magnetOrHash.trim()) return null;
  const normHash = normalizeInfoHash(magnetOrHash);
  if (!magnetOrHash.startsWith('magnet:') && !normHash) return null;

  let magnet = magnetOrHash;
  if (!magnet.startsWith('magnet:')) {
    magnet = normHash ? `magnet:?xt=urn:btih:${normHash}` : magnetOrHash;
  }

  try {
    const bodyData = new URLSearchParams();
    bodyData.append('magnet', magnet);
    bodyData.append('seed', '1');
    bodyData.append('allow_zip', 'false');

    const createUrl = `${TORBOX_API_BASE}/torrents/createtorrent`;
    const createRes = await torboxFetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyData
    }, apiKey);

    const createJson = await createRes.json();
    let torrentId = createJson?.data?.torrent_id || createJson?.data?.id || (typeof createJson?.data === 'number' || typeof createJson?.data === 'string' ? createJson.data : null);

    // If createtorrent failed or torrent already exists, lookup in user's mylist by hash
    if (!torrentId && normHash) {
      try {
        const listUrl = `${TORBOX_API_BASE}/torrents/mylist`;
        const listRes = await torboxFetch(listUrl, { method: 'GET' }, apiKey);
        const listJson = await listRes.json();
        if (listJson.success && Array.isArray(listJson.data)) {
          const matchedTorrent = listJson.data.find((t: { hash?: string; id?: string | number }) => t.hash && t.hash.toLowerCase() === normHash.toLowerCase());
          if (matchedTorrent) {
            torrentId = matchedTorrent.id || matchedTorrent.torrent_id;
          }
        }
      } catch {
        // Fallback to null
      }
    }

    if (!torrentId) {
      console.error('TorBox torrentId not found in response:', createJson);
      return null;
    }

    let fileIdQuery = '';

    try {
      const listUrl = `${TORBOX_API_BASE}/torrents/mylist`;
      const listRes = await torboxFetch(listUrl, { method: 'GET' }, apiKey);
      const listJson = await listRes.json();

      if (listJson.success && listJson.data && Array.isArray(listJson.data)) {
        const torrent = listJson.data.find((t: TorBoxTorrentItem) => t.id === torrentId || t.torrent_id === torrentId);
        if (torrent && torrent.files && Array.isArray(torrent.files) && torrent.files.length > 0) {
          let selectedFile: TorBoxFileItem | null = null;

          // 1. If explicit fileIdx is provided
          if (typeof fileIdx === 'number' && fileIdx >= 0) {
            selectedFile = torrent.files.find((f: TorBoxFileItem) => f.id === fileIdx || f.id === String(fileIdx) || f.file_id === fileIdx) || null;
            if (!selectedFile && torrent.files[fileIdx]) {
              selectedFile = torrent.files[fileIdx];
            }
          }

          // 2. If season and episode are specified
          if (!selectedFile && season !== undefined && episode !== undefined) {
            const regexes = [
              new RegExp(`s0*${season}e0*${episode}[^a-z0-9]`, 'i'),
              new RegExp(`0*${season}x0*${episode}[^a-z0-9]`, 'i'),
              new RegExp(`s0*${season}.*e0*${episode}`, 'i'),
              new RegExp(`[^a-z0-9]0*${episode}[^a-z0-9]`, 'i'),
              new RegExp(`e0*${episode}[^a-z0-9]`, 'i')
            ];

            for (const regex of regexes) {
              const match = torrent.files.find((f: TorBoxFileItem) => {
                const rawName = f.name || f.short_name || f.absolute_path || '';
                const decodedName = safeDecodeFileName(rawName) || rawName;
                return regex.test(decodedName) || regex.test(rawName);
              });
              if (match) {
                selectedFile = match;
                break;
              }
            }
          }

          // 3. Fallback: largest video file selection for multi-file torrent packs
          if (!selectedFile && torrent.files.length > 1) {
            const videoRegex = /\.(mkv|mp4|avi|mov|m4v|webm|flv|wmv|ts)$/i;
            const videoFiles = torrent.files.filter((f: TorBoxFileItem) => {
              const decoded = safeDecodeFileName(f.name) || f.name || '';
              return videoRegex.test(decoded);
            });

            const candidateFiles = videoFiles.length > 0 ? videoFiles : torrent.files;
            candidateFiles.sort((a: TorBoxFileItem, b: TorBoxFileItem) => (b.size || 0) - (a.size || 0));
            selectedFile = candidateFiles[0];
          }

          if (selectedFile && selectedFile.id !== undefined) {
            fileIdQuery = `&file_id=${selectedFile.id}`;
          }
        }
      }
    } catch (e) {
      console.error('Failed to select file_id for TorBox stream:', e);
    }

    const dlUrl = `${TORBOX_API_BASE}/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torrentId}${fileIdQuery}`;
    const dlRes = await torboxFetch(dlUrl, { method: 'GET' }, apiKey);
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

/**
 * Universally adds a torrent or magnet link to user's TorBox account via POST createtorrent.
 */
export async function cacheTorBoxTorrent(magnetOrHash: string, apiKey: string): Promise<{ success: boolean; message: string }> {
  if (!apiKey) return { success: false, message: 'Chybí TorBox API klíč' };

  let magnetUrl = magnetOrHash;
  if (!magnetUrl.startsWith('magnet:')) {
    const normHash = normalizeInfoHash(magnetOrHash);
    magnetUrl = normHash ? `magnet:?xt=urn:btih:${normHash}` : magnetOrHash;
  }

  try {
    const bodyData = new URLSearchParams();
    bodyData.append('magnet', magnetUrl);
    bodyData.append('seed', '1');
    bodyData.append('allow_zip', 'false');

    const targetUrl = `${TORBOX_API_BASE}/torrents/createtorrent`;

    const res = await torboxFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyData
    }, apiKey);

    const json = await res.json();
    if (json.success) {
      return { success: true, message: json.detail || 'Torrent byl úspěšně přidán do TorBoxu!' };
    } else {
      return { success: false, message: json.detail || json.error || 'Nepodařilo se přidat torrent do TorBoxu' };
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Chyba při komunikaci s TorBox API';
    return { success: false, message: errMsg };
  }
}
