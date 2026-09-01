import type { APIContext } from "astro";
import { getEntry } from "astro:content";
import { trackHit } from "../../lib/analytics";
import { loadHiddenSlugsSafe } from "../../lib/visibility";

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

  // Same for an event closed from /admin/visibility. Its card is gone from
  // /events, so the link that used to reach it stops working too — otherwise
  // closing an event would still leave the payment page one shared link away.
  const hidden = await loadHiddenSlugsSafe();
  if (hidden.has(eventSlug)) return redirect(fallback);

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
