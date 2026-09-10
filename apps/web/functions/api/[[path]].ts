const API_ORIGIN = 'https://arenagg-api.sandovaloliveira284.workers.dev';

type PagesFunctionContext = {
  request: Request;
  params: { path?: string | string[] };
};

function buildUpstreamRequest(request: Request, upstreamUrl: URL): Request {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('cookie');

  // Authorization is the only application session credential. Set it
  // explicitly so Pages -> Worker origin changes cannot drop the Bearer JWT.
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);

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

  const headers = new Headers(upstreamResponse.headers);
  headers.delete('set-cookie');
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.set('X-Chavea-Api-Proxy', 'pages-bearer');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}
