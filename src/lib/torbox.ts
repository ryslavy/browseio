// TorBox Debrid API client for BrowseIO

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

export async function checkTorBoxCached(hashes: string[], apiKey?: string): Promise<Set<string>> {
  const cachedHashes = new Set<string>();
  if (!hashes || hashes.length === 0) return cachedHashes;

  try {
    const hashList = hashes.join(',');
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${TORBOX_API_BASE}/torrents/checkcached?hash=${hashList}&format=object`, {
      headers
    });

    if (!res.ok) return cachedHashes;
    const json: TorBoxCachedResponse = await res.json();

    if (json.success && json.data) {
      Object.keys(json.data).forEach(hash => {
        if (json.data[hash]) {
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
    // 1. Create/Add Torrent on TorBox
    const bodyData = new URLSearchParams();
    bodyData.append('magnet', magnet);
    bodyData.append('seed', '1');
    bodyData.append('allow_zip', 'false');

    const createRes = await fetch(`${TORBOX_API_BASE}/torrents/createtorrent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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

    // We removed the `createstream` endpoint because TorBox transcodes and heavily compresses 4K streams to 720p/1080p.
    // Instead, we go straight to `requestdl` which provides the raw 100% original quality file (which we can then transcode locally without losing video quality).

    // If this is a series and we have a target season/episode, find the exact file_id
    let fileIdQuery = '';
    if (season !== undefined && episode !== undefined) {
      try {
        const listRes = await fetch(`${TORBOX_API_BASE}/torrents/mylist`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const listJson = await listRes.json();
        if (listJson.success && listJson.data) {
          const torrent = listJson.data.find((t: any) => t.id === torrentId);
          if (torrent && torrent.files && Array.isArray(torrent.files)) {
            const regexes = [
              new RegExp(`s0*${season}e0*${episode}[^a-z0-9]`, 'i'),
              new RegExp(`0*${season}x0*${episode}[^a-z0-9]`, 'i'),
              // More relaxed: S01.E02 or similar
              new RegExp(`s0*${season}.*e0*${episode}`, 'i'),
              // Fallback just episode number if nothing else matches (dangerous but better than nothing)
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

    // 3. Fallback to direct Request Download/Stream Link
    const dlRes = await fetch(`${TORBOX_API_BASE}/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}${fileIdQuery}`);
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

    const res = await fetch(`${TORBOX_API_BASE}/torrents/createtorrent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
