import { env } from "cloudflare:workers";
import type { APIContext } from "astro";

/** Both the `Astro` page global and an endpoint's APIContext satisfy this. */
type TrackContext = Pick<APIContext, "request" | "url" | "cookies" | "locals">;

/**
 * Anonymous analytics for /events.
 *
 * What is deliberately NOT stored: IP addresses and the raw User-Agent string.
 * We keep only coarse derived values (country/city from Cloudflare's edge, and
 * device/os/browser parsed from the UA) plus a random UUID held in a cookie.
 * That keeps the table out of personal-data territory.
 */

export const VISITOR_COOKIE = "clv_vid";

/**
 * `event_slug` for a page view. Views are counted once per page load, not once
 * per event card: every upcoming event is on every load, so per-event view
 * counts were all identical to the page-load count and only inflated the total
 * by the number of events listed.
 */
export const PAGE_VIEW_SLUG = "/events";

/** Chrome caps cookie lifetime at 400 days; anything longer is silently clamped. */
const VISITOR_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export type HitKind = "view" | "click";

export interface Hit {
  ts: number;
  kind: HitKind;
  event_slug: string;
  link_id: string | null;
  visitor_id: string;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  colo: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  referrer_host: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  lang: string | null;
}

/** Subset of Cloudflare's request.cf we care about. */
interface EdgeGeo {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  colo?: string;
}

// Link-preview fetchers (Telegram, WhatsApp, Facebook) are included on purpose:
// they hit the page on every share and would otherwise inflate the numbers.
const BOT_RE =
  /bot\b|bots\b|crawler|spider|crawl|slurp|headless|lighthouse|preview|monitor|uptime|curl\/|wget|python-requests|okhttp|axios|go-http-client|java\/|facebookexternalhit|telegram|whatsapp|discord|slackbot|twitterbot|linkedinbot|embedly|quora link|redditbot|applebot|petalbot|semrush|ahrefs|mj12|dotbot|bingpreview|yandex/i;

export function isBot(ua: string): boolean {
  return ua === "" || BOT_RE.test(ua);
}

/** Cheap UA classification. Not exhaustive — good enough to answer "phone or laptop?". */
export function parseUserAgent(ua: string): {
  device: string;
  os: string;
  browser: string;
} {
  const device = /ipad|tablet|playbook|silk|android(?!.*mobi)/i.test(ua)
    ? "tablet"
    : /mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)
      ? "mobile"
      : "desktop";

  const os = /windows nt/i.test(ua)
    ? "Windows"
    : /android/i.test(ua)
      ? "Android"
      : /iphone|ipad|ipod/i.test(ua)
        ? "iOS"
        : /cros/i.test(ua)
          ? "ChromeOS"
          : /mac os x/i.test(ua)
            ? "macOS"
            : /linux/i.test(ua)
              ? "Linux"
              : "other";

  // Order matters: Edge/Opera/Samsung all also claim "Chrome" and "Safari".
  const browser = /edg[ea]?\//i.test(ua)
    ? "Edge"
    : /opr\/|opera/i.test(ua)
      ? "Opera"
      : /samsungbrowser/i.test(ua)
        ? "Samsung Internet"
        : /firefox|fxios/i.test(ua)
          ? "Firefox"
          : /chrome|crios|chromium/i.test(ua)
            ? "Chrome"
            : /safari/i.test(ua)
              ? "Safari"
              : "other";

  return { device, os, browser };
}

/** Reads the visitor cookie, minting and setting a fresh UUID on first contact. */
export function getVisitorId(context: TrackContext): string {
  const existing = context.cookies.get(VISITOR_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;

  const id = crypto.randomUUID();
  context.cookies.set(VISITOR_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // A Secure cookie is dropped over plain http, which would mint a new id on
    // every local request and make dev testing meaningless.
    secure: import.meta.env.PROD,
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
  return id;
}

function trimmed(value: string | null | undefined, max = 255): string | null {
  if (!value) return null;
  const v = value.trim();
  return v === "" ? null : v.slice(0, max);
}

export interface BuildHitOptions {
  kind: HitKind;
  eventSlug: string;
  linkId?: string | null;
  /** Referrer reported by the client (views only) — the header would just be our own page. */
  referrerOverride?: string | null;
  /** UTM source when it comes from a beacon body rather than the URL. */
  utmOverride?: Record<string, string | null> | null;
}

/**
 * Builds a row, or returns null when the request should not be counted
 * (a bot, or a browser prefetch that no human ever saw).
 */
export function buildHit(
  context: TrackContext,
  options: BuildHitOptions,
): Hit | null {
  const { request, url } = context;
  const ua = request.headers.get("user-agent") ?? "";
  if (isBot(ua)) return null;

  const purpose =
    request.headers.get("sec-purpose") ?? request.headers.get("purpose") ?? "";
  if (/prefetch|prerender/i.test(purpose)) return null;

  const cf = (request as unknown as { cf?: EdgeGeo }).cf ?? {};
  const { device, os, browser } = parseUserAgent(ua);

  // For a click the Referer is our own /events page, which tells us nothing —
  // keep only genuinely external referrers.
  const rawReferrer =
    options.referrerOverride ?? request.headers.get("referer") ?? null;
  let referrer: string | null = null;
  let referrerHost: string | null = null;
  if (rawReferrer) {
    try {
      const parsed = new URL(rawReferrer);
      if (parsed.host !== url.host) {
        referrer = trimmed(parsed.href, 500);
        referrerHost = trimmed(parsed.host);
      }
    } catch {
      // Malformed Referer header — ignore it rather than storing junk.
    }
  }

  const utm = options.utmOverride ?? {
    utm_source: url.searchParams.get("utm_source"),
    utm_medium: url.searchParams.get("utm_medium"),
    utm_campaign: url.searchParams.get("utm_campaign"),
  };

  return {
    ts: Date.now(),
    kind: options.kind,
    event_slug: options.eventSlug,
    link_id: options.linkId ?? null,
    visitor_id: getVisitorId(context),
    country: trimmed(cf.country, 8),
    region: trimmed(cf.region, 80),
    city: trimmed(cf.city, 80),
    timezone: trimmed(cf.timezone, 64),
    colo: trimmed(cf.colo, 8),
    device,
    os,
    browser,
    referrer_host: referrerHost,
    referrer,
    utm_source: trimmed(utm.utm_source, 120),
    utm_medium: trimmed(utm.utm_medium, 120),
    utm_campaign: trimmed(utm.utm_campaign, 120),
    lang: trimmed(request.headers.get("accept-language")?.split(",")[0], 16),
  };
}

const INSERT_SQL = `INSERT INTO event_hits (
  ts, kind, event_slug, link_id, visitor_id,
  country, region, city, timezone, colo,
  device, os, browser,
  referrer_host, referrer,
  utm_source, utm_medium, utm_campaign, lang
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Writes the row outside the response path. Analytics must never delay a ticket
 * redirect, and a database problem must never break one either — hence
 * waitUntil plus a swallowed error.
 */
export function recordHit(context: TrackContext, hit: Hit | null): void {
  if (!hit) return;

  // Analytics must never be able to break a ticket link, so every failure path
  // here — a missing binding included — is swallowed.
  try {
    recordHitUnsafe(context, hit);
  } catch (error) {
    console.error("event_hits insert failed", error);
  }
}

function recordHitUnsafe(context: TrackContext, hit: Hit): void {
  const write = env.DB.prepare(INSERT_SQL)
    .bind(
      hit.ts,
      hit.kind,
      hit.event_slug,
      hit.link_id,
      hit.visitor_id,
      hit.country,
      hit.region,
      hit.city,
      hit.timezone,
      hit.colo,
      hit.device,
      hit.os,
      hit.browser,
      hit.referrer_host,
      hit.referrer,
      hit.utm_source,
      hit.utm_medium,
      hit.utm_campaign,
      hit.lang,
    )
    .run()
    .then(
      () => undefined,
      (error: unknown) => {
        console.error("event_hits insert failed", error);
      },
    );

  // cfContext is absent when prerendering; the write still runs, just unsupervised.
  context.locals.cfContext?.waitUntil(write);
}

/** Convenience wrapper: build and record in one call. */
export function trackHit(context: TrackContext, options: BuildHitOptions): void {
  recordHit(context, buildHit(context, options));
}
