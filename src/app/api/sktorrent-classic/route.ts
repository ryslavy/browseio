import { NextResponse } from 'next/server';
import { getStreams } from '@/lib/sktorrent-scraper';

interface StreamItem {
  name?: string;
  title?: unknown;
  url?: string | null;
  infoHash?: unknown;
  size?: unknown;
  seeders?: unknown;
  behaviorHints?: {
    size?: unknown;
    seeders?: unknown;
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, type, season, episode, uid, pass } = body;

    if (!uid || !pass) {
      return NextResponse.json({ streams: [] });
    }

    const streams = await getStreams({ 
      id, 
      type, 
      season, 
      episode,
      uid,
      pass
    });
    
    const formattedStreams = streams.map((s: StreamItem) => {
      const magnet = s.url && s.url.startsWith('magnet') ? s.url : undefined;
      const infoHash = (typeof s.infoHash === 'string' && s.infoHash) || (magnet ? new URLSearchParams(magnet.split('?')[1]).get('xt')?.replace('urn:btih:', '') : '');
      return {
        name: 'SKTorrent',
        title: String(s.title || (s.name ? `${s.name}\n⚙️ SKTorrent` : '⚙️ SKTorrent')),
        url: s.url,
        magnet: magnet,
        infoHash: infoHash,
        size: String(s.size || s.behaviorHints?.size || 'Unknown'),
        seeders: Number(s.seeders || s.behaviorHints?.seeders || 0)
      };
    });

    return NextResponse.json({ streams: formattedStreams });

  } catch (error) {
    console.error('SKTorrent Classic API error:', error);
    return NextResponse.json({ error: 'Chyba při komunikaci se SKTorrent' }, { status: 500 });
  }
}
