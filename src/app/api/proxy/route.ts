import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  return handleProxyRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleProxyRequest(request, 'POST');
}

async function handleProxyRequest(request: NextRequest, method: 'GET' | 'POST') {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400, headers: corsHeaders });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const authHeader = request.headers.get('authorization');
    const contentType = request.headers.get('content-type');

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    let body: any = undefined;
    if (method === 'POST') {
      body = await request.text();
    }

    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to proxy request' }, { status: 502, headers: corsHeaders });
  }
}
