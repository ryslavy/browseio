/**
 * BrowseIO CORS Proxy — Cloudflare Worker
 * 
 * Deploy to Cloudflare Workers (free tier) to enable browser-side scraping
 * for plugins that don't support CORS (e.g. sktorrent.eu, online.sktorrent.eu).
 *
 * Deployment:
 *   1. Go to https://workers.cloudflare.com and create a free account
 *   2. Create a new Worker
 *   3. Paste this code into the Worker editor
 *   4. Deploy
 *   5. Copy the Worker URL (e.g. https://browseio-cors.yourname.workers.dev)
 *   6. In BrowseIO Settings, paste: https://browseio-cors.yourname.workers.dev/?
 *
 * Usage from BrowseIO:
 *   The app automatically appends the target URL as a query parameter:
 *   https://browseio-cors.yourname.workers.dev/?https%3A%2F%2Fexample.com%2Fapi
 */

const ALLOWED_ORIGINS = [
  'https://ryslavy.github.io',
  'http://localhost:3000',
  'http://localhost:3001',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range, Accept, Origin, Cookie, User-Agent',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type, Set-Cookie',
    'Access-Control-Max-Age': '86400',
  };
}

const worker = {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    const url = new URL(request.url);

    // Extract target URL from query string
    // Supports: ?https%3A%2F%2Fexample.com  OR  ?url=https%3A%2F%2Fexample.com
    let targetUrl = '';

    const urlParam = url.searchParams.get('url');
    if (urlParam) {
      targetUrl = urlParam;
    } else {
      // Get raw query string and decode it as the target URL
      const rawQuery = url.search.slice(1); // Remove leading '?'
      if (rawQuery) {
        targetUrl = decodeURIComponent(rawQuery.split('&')[0]);
      }
    }

    if (!targetUrl) {
      return new Response(
        JSON.stringify({
          error: 'Missing target URL',
          usage: 'Add target URL as query parameter: ?https://example.com/api',
          version: '1.1.0',
          name: 'BrowseIO CORS Proxy'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request),
          },
        }
      );
    }

    // Validate target URL
    try {
      new URL(targetUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid target URL', received: targetUrl }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request),
          },
        }
      );
    }

    try {
      const targetHeaders = new Headers();
      targetHeaders.set('User-Agent', request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
      targetHeaders.set('Accept', request.headers.get('Accept') || '*/*');
      targetHeaders.set('Accept-Language', request.headers.get('Accept-Language') || 'cs,sk;q=0.9,en;q=0.8');

      if (request.headers.has('Authorization')) {
        targetHeaders.set('Authorization', request.headers.get('Authorization'));
      }
      if (request.headers.has('Content-Type')) {
        targetHeaders.set('Content-Type', request.headers.get('Content-Type'));
      }
      if (request.headers.has('Range')) {
        targetHeaders.set('Range', request.headers.get('Range'));
      }
      if (request.headers.has('Cookie')) {
        targetHeaders.set('Cookie', request.headers.get('Cookie'));
      }

      // Forward the request to the target
      const targetRequest = new Request(targetUrl, {
        method: request.method,
        headers: targetHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'follow',
      });

      const response = await fetch(targetRequest);

      // Clone response and add CORS headers
      const newHeaders = new Headers(response.headers);
      const corsHeaders = getCorsHeaders(request);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      // Remove problematic headers
      newHeaders.delete('Content-Security-Policy');
      newHeaders.delete('X-Frame-Options');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Proxy fetch failed', message: err.message, target: targetUrl }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(request),
          },
        }
      );
    }
  },
};

export default worker;
