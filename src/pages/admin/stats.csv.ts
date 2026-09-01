import { env } from "cloudflare:workers";
import type { APIContext } from "astro";
import { isRangeKey, rangeStart } from "../../lib/stats";

export const prerender = false;

const COLUMNS = [
  "ts",
  "kind",
  "event_slug",
  "link_id",
  "visitor_id",
  "country",
  "region",
  "city",
  "timezone",
  "colo",
  "device",
  "os",
  "browser",
  "referrer_host",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "lang",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Raw-row export. Behind the same /admin guard as the dashboard. */
export async function GET(context: APIContext): Promise<Response> {
  const requested = context.url.searchParams.get("range");
  const range = isRangeKey(requested) ? requested : "30";

  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS.join(", ")} FROM event_hits WHERE ts >= ? ORDER BY ts DESC LIMIT 50000`,
  )
    .bind(rangeStart(range))
    .all<Record<string, unknown>>();

  const lines = [
    ["iso_time", ...COLUMNS].join(","),
    ...(results ?? []).map((row) =>
      [
        new Date(Number(row.ts)).toISOString(),
        ...COLUMNS.map((column) => csvCell(row[column])),
      ].join(","),
    ),
  ];

  return new Response(`﻿${lines.join("\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contrlve-events-${range}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
