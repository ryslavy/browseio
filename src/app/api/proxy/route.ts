import { NextResponse } from 'next/server.js';

function isInternalHost(hostname: string): boolean {
  if (!hostname) return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    host === '0:0:0:0:0:0:0:1' ||
    host === '0:0:0:0:0:0:0:0'
  ) {
    return true;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const [, oct1, oct2, oct3, oct4] = ipv4Match.map(Number);
    if (oct1 > 255 || oct2 > 255 || oct3 > 255 || oct4 > 255) {
      return true;
    }
    if (oct1 === 127) return true;
    if (oct1 === 0) return true;
    if (oct1 === 10) return true;
    if (oct1 === 172 && oct2 >= 16 && oct2 <= 31) return true;
    if (oct1 === 192 && oct2 === 168) return true;
    if (oct1 === 169 && oct2 === 254) return true;
  }

  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    if (host.startsWith('fe80:')) return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
  }

  return false;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new NextResponse('Chybí URL adresa videa', { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return new NextResponse('Neplatná URL adresa', { status: 400 });
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return new NextResponse('Zakázaný protokol: vyžadováno HTTP nebo HTTPS', { status: 400 });
    }

    if (isInternalHost(parsedUrl.hostname)) {
      return new NextResponse('Zakázaný přístup na interní adresu', { status: 400 });
    }

    const rangeHeader = request.headers.get('range');

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const videoRes = await fetch(parsedUrl.toString(), {
      headers,
      redirect: 'follow'
    });

    if (!videoRes.ok && videoRes.status !== 206) {
      return new NextResponse(`Server vrátil chybu ${videoRes.status}`, { status: videoRes.status });
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Range');
    
    if (videoRes.headers.get('content-type')) {
      responseHeaders.set('Content-Type', videoRes.headers.get('content-type')!);
    } else {
      responseHeaders.set('Content-Type', 'video/mp4');
    }

    if (videoRes.headers.get('content-length')) {
      responseHeaders.set('Content-Length', videoRes.headers.get('content-length')!);
    }

    if (videoRes.headers.get('content-range')) {
      responseHeaders.set('Content-Range', videoRes.headers.get('content-range')!);
    }

    if (videoRes.headers.get('accept-ranges')) {
      responseHeaders.set('Accept-Ranges', videoRes.headers.get('accept-ranges')!);
    } else {
      responseHeaders.set('Accept-Ranges', 'bytes');
    }

    return new NextResponse(videoRes.body as unknown as BodyInit, {
      status: videoRes.status,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Video Proxy Error:', error);
    return new NextResponse('Chyba při přenosu videa z proxy', { status: 500 });
  }
}
