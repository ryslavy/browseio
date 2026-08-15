import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range, Accept, Origin, Cookie, User-Agent',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type, Set-Cookie',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  return handleUniversalProxy(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleUniversalProxy(request, 'POST');
}

export async function HEAD(request: NextRequest) {
  return handleUniversalProxy(request, 'HEAD');
}

export async function PUT(request: NextRequest) {
  return handleUniversalProxy(request, 'PUT');
}

export async function DELETE(request: NextRequest) {
  return handleUniversalProxy(request, 'DELETE');
}

/**
 * Universal CORS Proxy
 * Dynamically computes target Origin, Referer, and forwards all standard headers and bodies.
 * Works seamlessly with ANY website, video host, scraper, or API with zero hardcoding.
 */
async function handleUniversalProxy(request: NextRequest, method: string) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400, headers: corsHeaders });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    // Dynamically derive Origin & Referer from target URL
    let targetOrigin: string;
    let targetReferer: string;
    try {
      const parsed = new URL(targetUrl);
      targetOrigin = `${parsed.protocol}//${parsed.host}`;
      targetReferer = `${targetOrigin}/`;
    } catch {
      targetOrigin = 'https://google.com';
      targetReferer = 'https://google.com/';
    }

    const incomingAccept = request.headers.get('accept');
    const authHeader = request.headers.get('authorization');
    const contentType = request.headers.get('content-type');
    const rangeHeader = request.headers.get('range');
    const cookieHeader = request.headers.get('cookie');
    const customUserAgent = request.headers.get('x-user-agent') || request.headers.get('user-agent');

    const headers: Record<string, string> = {
      'User-Agent': customUserAgent && !customUserAgent.includes('Next.js') 
        ? customUserAgent 
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': incomingAccept || 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain,*/*;q=0.8',
      'Accept-Language': 'cs,sk;q=0.9,en;q=0.8,en-US;q=0.7',
      'Referer': targetReferer,
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers['Origin'] = targetOrigin;
    }

    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    let body: string | undefined = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      body = await request.text();
    }

    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await res.text();
    const responseContentType = res.headers.get('content-type') || 'text/html; charset=UTF-8';

    return new NextResponse(data, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Content-Type': responseContentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to proxy request';
    return NextResponse.json({ error: errMsg }, { status: 502, headers: corsHeaders });
  }
}
