// Replaces global fetch with a router so tests never touch the network.
//
//   const calls = stubFetch([
//     ['wbsearchentities', { search: [] }],          // substring match -> JSON body
//     [/ids=Q2\b/, (url) => ({ ... })],              // regex match; body may be a function of the URL
//     ['broken', new Error('boom')],                 // Error -> HTTP 500
//   ]);
// Unmatched URLs return HTTP 404. `calls` records every requested URL.

type Route = [matcher: string | RegExp, body: unknown];

const originalFetch = globalThis.fetch as typeof fetch | undefined;

export function stubFetch(routes: Route[]): string[] {
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(target);
    const route = routes.find(([matcher]) => (typeof matcher === 'string' ? target.includes(matcher) : matcher.test(target)));
    if (!route) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    const body: unknown = typeof route[1] === 'function' ? (route[1] as (url: string) => unknown)(target) : route[1];
    if (body instanceof Error) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  });
  return calls;
}

export function restoreFetch(): void {
  if (originalFetch) globalThis.fetch = originalFetch;
  else delete (globalThis as { fetch?: unknown }).fetch;
}
