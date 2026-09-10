const API_ORIGIN = 'https://arenagg-api.sandovaloliveira284.workers.dev';

type PagesFunctionContext = {
  request: Request;
  params: { path?: string | string[] };
};

function buildUpstreamRequest(request: Request, upstreamUrl: URL): Request {
  // Build a fresh Request for the Worker and explicitly preserve the browser
  // cookie. This avoids relying on runtime-specific Request cloning semantics
  // when the target origin changes from chavea.pages.dev to workers.dev.
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  return new Request(upstreamUrl.toString(), {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const incoming = new URL(context.request.url);
  const rawPath = context.params.path;
  const suffix = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath ?? '');
  const upstreamUrl = new URL(`/api/${suffix}`, API_ORIGIN);
  upstreamUrl.search = incoming.search;

  // Browser -> chavea.pages.dev/api/* is first-party. The HttpOnly session
  // cookie arrives here and is forwarded explicitly server-to-server.
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(buildUpstreamRequest(context.request, upstreamUrl));
  } catch (error) {
    console.error('[pages-api-proxy] upstream request failed', {
      path: upstreamUrl.pathname,
      method: context.request.method,
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        error: 'UPSTREAM_UNAVAILABLE',
        message: 'A API está temporariamente indisponível. Tente novamente.',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Preserve every upstream response header. Re-assign Set-Cookie explicitly
  // as an extra guard because it is the critical credential handoff between
  // workers.dev and the first-party Pages response seen by the PWA.
  const headers = new Headers(upstreamResponse.headers);
  const setCookie = upstreamResponse.headers.get('set-cookie');
  if (setCookie) headers.set('set-cookie', setCookie);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.set('X-Chavea-Api-Proxy', 'pages');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}
