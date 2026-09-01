import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Events shown on /events. One Markdown file per event — adding an event is a
 * new file plus a deploy.
 *
 * The one thing that is not in these files is whether an event is currently
 * listed: /admin/visibility keeps that switch in D1 (see lib/visibility.ts), so
 * closing a sold-out session takes a click rather than a deploy.
 *
 * One event = one card = one ticket link. An event running several sessions
 * gets one file per session, so every card has an unambiguous click target and
 * each session's clicks are counted separately under its own slug.
 */
const events = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/events" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Event start. Written as local Kyiv time in the file. */
      date: z.coerce.date(),
      venue: z.string().optional(),
      city: z.string().optional(),
      address: z.string().optional(),
      /**
       * Card poster, resolved relative to this Markdown file
       * (e.g. ../../assets/events/pesday.webp). Astro optimizes it at build
       * time. Omit it and the card falls back to the show logo.
       */
      cover: image().optional(),
      status: z.enum(["upcoming", "soldout", "cancelled"]).default("upcoming"),
      /**
       * Pin the event ahead of the rest, regardless of date. Priority events
       * are listed first, and both groups stay sorted by date within
       * themselves. Defaults to false, i.e. plain date order.
       */
      priority: z.boolean().default(false),
      /** Short highlighted line on the card, e.g. "лишилось мало місць". */
      note: z.string().optional(),
      /**
       * Ticket link. The whole card points at /go/<slug>, which records the
       * click and then redirects here. Without it the card is not clickable.
       */
      url: z.string().url().optional(),
    }),
});

export const collections = { events };
