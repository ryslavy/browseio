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

    if (action === 'cache') {
      if (!apiKey) {
        return NextResponse.json({ error: 'Chybí TorBox API klíč v nastavení.' }, { status: 400 });
      }
      const magnetUrl = magnet || (hashes && hashes[0] ? `magnet:?xt=urn:btih:${hashes[0]}` : null);
      if (!magnetUrl) {
        return NextResponse.json({ error: 'Chybí magnet odkaz' }, { status: 400 });
      }
      
      const bodyData = new URLSearchParams();
      bodyData.append('magnet', magnetUrl);
      bodyData.append('seed', '1');
      bodyData.append('allow_zip', 'false');

      const createRes = await fetch('https://api.torbox.app/v1/api/torrents/createtorrent', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyData
      });

      const createJson = await createRes.json();
      if (createJson.success) {
        return NextResponse.json({ success: true, message: createJson.detail || 'Torrent byl přidán do TorBox ke stažení/nacacheování!' });
      } else {
        return NextResponse.json({ error: createJson.detail || 'Nepodařilo se přidat torrent do TorBoxu' }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });
  } catch (error) {
    console.error('TorBox API Route Error:', error);
    return NextResponse.json({ error: 'Chyba při komunikaci s TorBox API' }, { status: 500 });
  }
}
