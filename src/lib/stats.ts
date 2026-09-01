import { env } from "cloudflare:workers";

/**
 * Read side of the analytics table. Every aggregation happens in SQLite and the
 * dashboard renders the results server-side, so /admin/stats ships no client
 * JavaScript and no charting library.
 */

export const RANGES = {
  "7": { label: "7 днів", days: 7 },
  "30": { label: "30 днів", days: 30 },
  "90": { label: "90 днів", days: 90 },
  all: { label: "Весь час", days: null },
} as const;

export type RangeKey = keyof typeof RANGES;

export function isRangeKey(value: string | null): value is RangeKey {
  return value !== null && value in RANGES;
}

export function rangeStart(range: RangeKey): number {
  const { days } = RANGES[range];
  return days === null ? 0 : Date.now() - days * 24 * 60 * 60 * 1000;
}

/** Column whitelist — these names are interpolated into SQL, so they can never come from input. */
export const BREAKDOWNS = {
  country: "Країна",
  city: "Місто",
  device: "Пристрій",
  os: "ОС",
  browser: "Браузер",
  referrer_host: "Джерело переходу",
  utm_source: "UTM source",
  utm_campaign: "UTM campaign",
} as const;

export type BreakdownKey = keyof typeof BREAKDOWNS;

export interface Totals {
  views: number;
  clicks: number;
  visitors: number;
  clickers: number;
}

export interface EventStats {
  slug: string;
  clicks: number;
  clickers: number;
}

export interface BreakdownRow {
  key: string;
  clicks: number;
}

export interface TimelinePoint {
  day: string;
  views: number;
  clicks: number;
}

export interface Stats {
  totals: Totals;
  events: EventStats[];
  breakdowns: Record<BreakdownKey, BreakdownRow[]>;
  timeline: TimelinePoint[];
}

/** Thrown when the data can't be read yet; the dashboard turns this into a setup hint. */
export class StatsUnavailableError extends Error {
  constructor(
    message: string,
    /** Shown to the operator on the dashboard. */
    readonly hint: string,
  ) {
    super(message);
  }
}

interface KindRow {
  kind: string;
  hits: number;
  uniques: number;
}
interface EventRow {
  event_slug: string;
  hits: number;
  uniques: number;
}
interface DayRow {
  day: string;
  kind: string;
  hits: number;
}

export async function loadStats(since: number): Promise<Stats> {
  const db = env.DB;
  // A renamed or missing binding would otherwise surface as an opaque
  // "cannot read properties of undefined" from deep inside a query.
  if (!db) {
    throw new StatsUnavailableError(
      "D1 binding DB is not available",
      'Немає прив\'язки D1 з іменем "DB". Перевір d1_databases у wrangler.jsonc і передеплой.',
    );
  }

  const breakdownKeys = Object.keys(BREAKDOWNS) as BreakdownKey[];
  const breakdownStatements = breakdownKeys.map((column) =>
    db
      .prepare(
        `SELECT COALESCE(NULLIF(${column}, ''), '—') AS key, COUNT(*) AS clicks
         FROM event_hits
         WHERE ts >= ? AND kind = 'click'
         GROUP BY key
         ORDER BY clicks DESC
         LIMIT 10`,
      )
      .bind(since),
  );

  let results: unknown[];
  try {
    results = await db.batch([
      db
        .prepare(
          `SELECT kind, COUNT(*) AS hits, COUNT(DISTINCT visitor_id) AS uniques
           FROM event_hits WHERE ts >= ? GROUP BY kind`,
        )
        .bind(since),
      db
        .prepare(
          `SELECT event_slug, COUNT(*) AS hits, COUNT(DISTINCT visitor_id) AS uniques
           FROM event_hits WHERE ts >= ? AND kind = 'click'
           GROUP BY event_slug ORDER BY hits DESC`,
        )
        .bind(since),
      db
        .prepare(
          `SELECT date(ts / 1000, 'unixepoch') AS day, kind, COUNT(*) AS hits
           FROM event_hits WHERE ts >= ? GROUP BY day, kind ORDER BY day`,
        )
        .bind(since),
      ...breakdownStatements,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table/i.test(message)) {
      throw new StatsUnavailableError(
        message,
        "Таблиця event_hits ще не створена. Застосуй міграцію: npm run db:migrate:remote (або db:migrate:local для локальної розробки).",
      );
    }
    throw error;
  }

  const rowsOf = <T>(index: number): T[] =>
    ((results[index] as { results?: T[] } | undefined)?.results ?? []) as T[];

  const kindRows = rowsOf<KindRow>(0);
  const eventRows = rowsOf<EventRow>(1);
  const dayRows = rowsOf<DayRow>(2);

  const totals: Totals = {
    views: kindRows.find((row) => row.kind === "view")?.hits ?? 0,
    clicks: kindRows.find((row) => row.kind === "click")?.hits ?? 0,
    visitors: kindRows.find((row) => row.kind === "view")?.uniques ?? 0,
    clickers: kindRows.find((row) => row.kind === "click")?.uniques ?? 0,
  };

  const events: EventStats[] = eventRows.map((row) => ({
    slug: row.event_slug,
    clicks: row.hits,
    clickers: row.uniques,
  }));

  const timeline = new Map<string, TimelinePoint>();
  for (const row of dayRows) {
    const point = timeline.get(row.day) ?? { day: row.day, views: 0, clicks: 0 };
    if (row.kind === "view") point.views = row.hits;
    else if (row.kind === "click") point.clicks = row.hits;
    timeline.set(row.day, point);
  }

  const breakdowns = Object.fromEntries(
    breakdownKeys.map((key, index) => [key, rowsOf<BreakdownRow>(3 + index)]),
  ) as Record<BreakdownKey, BreakdownRow[]>;

  return {
    totals,
    events,
    breakdowns,
    timeline: [...timeline.values()],
  };
}

/**
 * Click counts keyed by event slug — the same figure the dashboard shows,
 * for surfaces that need only the numbers. Used by /admin/visibility so the
 * decision to close an event sits next to the traffic it is getting.
 *
 * Never throws: the numbers are context there, and an event must stay
 * switchable even before the analytics migration has been applied.
 */
export async function loadClicksBySlug(
  since: number,
): Promise<Map<string, EventStats>> {
  const db = env.DB;
  if (!db) return new Map();

  try {
    const { results } = await db
      .prepare(
        `SELECT event_slug, COUNT(*) AS hits, COUNT(DISTINCT visitor_id) AS uniques
         FROM event_hits WHERE ts >= ? AND kind = 'click'
         GROUP BY event_slug`,
      )
      .bind(since)
      .all<EventRow>();

    return new Map(
      (results ?? []).map((row) => [
        row.event_slug,
        { slug: row.event_slug, clicks: row.hits, clickers: row.uniques },
      ]),
    );
  } catch (error) {
    console.error("event_hits read failed", error);
    return new Map();
  }
}
