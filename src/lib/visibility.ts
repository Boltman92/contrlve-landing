import { env } from "cloudflare:workers";

/**
 * Open/close switch for events, flipped from /admin/visibility.
 *
 * Events themselves live in Markdown; only this one bit is runtime state, which
 * keeps "close the 17:00 session, we're full" a click instead of a deploy.
 * Absence of a row means visible, so nothing has to be written when an event is
 * added.
 */

/** Thrown when the table can't be read; /admin turns this into a setup hint. */
export class VisibilityUnavailableError extends Error {
  constructor(
    message: string,
    /** Shown to the operator on the admin page. */
    readonly hint: string,
  ) {
    super(message);
  }
}

function database(): D1Database {
  const db = env.DB;
  // A renamed or missing binding would otherwise surface as an opaque
  // "cannot read properties of undefined" from deep inside a query.
  if (!db) {
    throw new VisibilityUnavailableError(
      "D1 binding DB is not available",
      'Немає прив\'язки D1 з іменем "DB". Перевір d1_databases у wrangler.jsonc і передеплой.',
    );
  }
  return db;
}

/** Turns "no such table" into a runnable instruction, and rethrows the rest. */
function rethrow(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/no such table/i.test(message)) {
    throw new VisibilityUnavailableError(
      message,
      "Таблиця event_visibility ще не створена. Застосуй міграцію: npm run db:migrate:remote (або db:migrate:local для локальної розробки).",
    );
  }
  throw error;
}

/** Slugs an admin has closed. */
export async function loadHiddenSlugs(): Promise<Set<string>> {
  try {
    const { results } = await database()
      .prepare("SELECT slug FROM event_visibility WHERE hidden = 1")
      .all<{ slug: string }>();
    return new Set((results ?? []).map((row) => row.slug));
  } catch (error) {
    rethrow(error);
  }
}

/**
 * The same read, resolving to "nothing is closed" on any failure.
 *
 * Public pages fail towards showing the events: an unapplied migration or an
 * unreachable D1 must never empty the ticket page or break a ticket link.
 */
export async function loadHiddenSlugsSafe(): Promise<Set<string>> {
  try {
    return await loadHiddenSlugs();
  } catch (error) {
    console.error("event_visibility read failed", error);
    return new Set();
  }
}

/** Flips one event. Only ever reached from behind the /admin guard. */
export async function setHidden(slug: string, hidden: boolean): Promise<void> {
  try {
    await database()
      .prepare(
        `INSERT INTO event_visibility (slug, hidden, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           hidden = excluded.hidden,
           updated_at = excluded.updated_at`,
      )
      .bind(slug, hidden ? 1 : 0, Date.now())
      .run();
  } catch (error) {
    rethrow(error);
  }
}
