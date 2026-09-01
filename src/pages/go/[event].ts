import type { APIContext } from "astro";
import { getEntry } from "astro:content";
import { trackHit } from "../../lib/analytics";

export const prerender = false;

/**
 * Tracked ticket redirect: /go/<event-slug> -> the event's external URL.
 *
 * The destination is resolved from the events collection, never from the query
 * string, so this cannot be used as an open redirect.
 */
export async function GET(context: APIContext): Promise<Response> {
  const { event: eventSlug } = context.params;

  const fallback = new URL("/events", context.url).href;
  if (!eventSlug) return redirect(fallback);

  const entry = await getEntry("events", eventSlug);
  // A cancelled or sold-out event must not send anyone to a payment link, even
  // if the URL is still shared somewhere.
  if (!entry?.data.url || entry.data.status !== "upcoming") {
    return redirect(fallback);
  }

  trackHit(context, { kind: "click", eventSlug });

  return redirect(entry.data.url);
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      // Never let a CDN or the browser cache the hop, or repeat clicks go uncounted.
      "Cache-Control": "no-store",
    },
  });
}
