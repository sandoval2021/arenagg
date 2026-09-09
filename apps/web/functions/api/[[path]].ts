const API_ORIGIN = 'https://arenagg-api.sandovaloliveira284.workers.dev';

type PagesFunctionContext = {
  request: Request;
  params: { path?: string | string[] };
};

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const incoming = new URL(context.request.url);
  const rawPath = context.params.path;
  const suffix = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath ?? '');
  const upstreamUrl = new URL(`/api/${suffix}`, API_ORIGIN);
  upstreamUrl.search = incoming.search;

  // Browser -> chavea.pages.dev/api/* is first-party. The HttpOnly session
  // cookie arrives here and is forwarded server-to-server to the Hono Worker.
  // Set-Cookie coming back from the Worker is returned through this same-origin
  // response, so Safari/iOS stores chavea_session for chavea.pages.dev instead
  // of treating it as a third-party workers.dev cookie.
  const upstreamRequest = new Request(upstreamUrl.toString(), context.request);
  const upstreamResponse = await fetch(upstreamRequest);
  const headers = new Headers(upstreamResponse.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}
