import { NextResponse } from 'next/server';
import { getStreams } from '@/lib/hellspy-scraper';

interface StreamItem {
  name: string;
  title: string;
  url?: string | null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, type, season, episode } = body;

    const streams = await getStreams(id, type, season, episode);
    
    // Format streams for our frontend (we use name, title, infoHash/magnet, size, seeders, etc.)
    const formattedStreams = streams.map((s: StreamItem) => {
      const sizeMatch = s.title ? s.title.match(/💾 ([0-9.]+ [A-Z]+)/) : null;
      const size = sizeMatch ? sizeMatch[1] : 'Unknown';
      
      return {
        name: 'Hellspy',
        title: s.name + '\n' + (s.title ? s.title.split('\n')[0] : '') + '\n⚙️ Hellspy',
        url: s.url,
        size: size,
        seeders: 0
      };
    });

    return NextResponse.json({ streams: formattedStreams });

  } catch (error) {
    console.error('Hellspy API error:', error);
    return NextResponse.json({ error: 'Chyba při komunikaci s Hellspy' }, { status: 500 });
  }
}
