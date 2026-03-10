/**
 * API proxy — forwards all /api/* requests from the browser to the backend.
 *
 * Using a server-side proxy means:
 * - No NEXT_PUBLIC_ bake-time URL needed (browser only talks to Next.js)
 * - API_INTERNAL_URL is a true runtime env var (container-to-container)
 * - Works identically in local dev, Docker Compose, and Kubernetes
 */
const BACKEND = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = `${BACKEND}${url.pathname}${url.search}`;

  const reqHeaders = new Headers(req.headers);
  reqHeaders.delete('host');

  const init: RequestInit & { duplex?: string } = {
    method: req.method,
    headers: reqHeaders,
  };

  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = req.body;
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return new Response(JSON.stringify({ message: 'API service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resHeaders = new Headers(upstream.headers);
  // Remove hop-by-hop headers that should not be forwarded
  resHeaders.delete('transfer-encoding');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
