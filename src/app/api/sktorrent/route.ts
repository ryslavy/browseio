import { NextResponse } from 'next/server';
import { getStreams } from '@/lib/sktonline-scraper';

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
    
    const formattedStreams = streams.map((s: StreamItem) => {
      return {
        name: 'SKTOnline',
        title: s.name + '\n' + (s.title ? s.title.split('\n')[0] : '') + '\n⚙️ SKTOnline',
        url: s.url,
        size: 'Unknown',
        seeders: 0
      };
    });

    return NextResponse.json({ streams: formattedStreams });

  } catch (error) {
    console.error('SKTOnline API error:', error);
    return NextResponse.json({ error: 'Chyba při komunikaci se SKTOnline' }, { status: 500 });
  }
}
