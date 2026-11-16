import "server-only";

/**
 * Builds an absolute URL for a redirect using the real public host/proto
 * from the forwarded headers nginx sets (see nginx/app.ssl.conf), rather
 * than `request.url`'s own origin — which, for these OAuth redirect routes,
 * can resolve to the container's internal bind address (e.g. 0.0.0.0:3000)
 * instead of the public domain, sending Google's redirect to a dead address.
 */
export function absoluteUrl(request: Request, path: string, params?: Record<string, string>) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : request.url;
  const url = new URL(path, base);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}
