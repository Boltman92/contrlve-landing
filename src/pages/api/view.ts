import type { APIContext } from "astro";
import { PAGE_VIEW_SLUG, trackHit } from "../../lib/analytics";

export const prerender = false;

interface ViewPayload {
  ref?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
}

function asString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().slice(0, max)
    : null;
}

/**
 * Page-view beacon for /events — one row per page load, which is the
 * denominator every event's click-through rate is measured against.
 *
 * /events is prerendered, so the referrer and UTM tags that brought the visitor
 * in can only be read on the client; they arrive in the body rather than being
 * derived from this request.
 */
export async function POST(context: APIContext): Promise<Response> {
  const noContent = new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });

  // Only accept beacons fired by our own pages. sendBeacon always sets Origin.
  const site = context.url.origin;
  const origin = context.request.headers.get("origin");
  const fetchSite = context.request.headers.get("sec-fetch-site");
  if (origin !== site && fetchSite !== "same-origin") return noContent;

  let payload: ViewPayload;
  try {
    payload = (await context.request.json()) as ViewPayload;
  } catch {
    return noContent;
  }

  trackHit(context, {
    kind: "view",
    eventSlug: PAGE_VIEW_SLUG,
    referrerOverride: asString(payload.ref, 500),
    utmOverride: {
      utm_source: asString(payload.utm_source, 120),
      utm_medium: asString(payload.utm_medium, 120),
      utm_campaign: asString(payload.utm_campaign, 120),
    },
  });

  return noContent;
}
