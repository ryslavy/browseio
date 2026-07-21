import { NextResponse } from 'next/server';
import { checkTorBoxCached, resolveTorBoxStreamUrl } from '@/lib/torbox';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, hashes, magnet, apiKey, season, episode } = body;

    if (action === 'check') {
      const cached = await checkTorBoxCached(hashes || [], apiKey);
      return NextResponse.json({ cached: Array.from(cached) });
    }

    if (action === 'resolve') {
      if (!apiKey) {
        return NextResponse.json({ error: 'Chybí TorBox API klíč' }, { status: 400 });
      }
      const streamUrl = await resolveTorBoxStreamUrl(magnet, apiKey, season, episode);
      if (streamUrl) {
        return NextResponse.json({ url: streamUrl });
      } else {
        return NextResponse.json({ error: 'Nepodařilo se vygenerovat odkaz z TorBoxu' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });
  } catch (error) {
    console.error('TorBox API Route Error:', error);
    return NextResponse.json({ error: 'Chyba při komunikaci s TorBox API' }, { status: 500 });
  }
}
