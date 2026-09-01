-- Runtime open/close switch for the events listed on /events, flipped from
-- /admin/visibility. The Markdown files stay the source of truth for what an
-- event is; this table only answers whether it is currently listed.
--
-- A missing row means visible, so a newly added event file goes live on deploy
-- with no database write, and the table only ever holds the events an admin has
-- actually touched.
CREATE TABLE IF NOT EXISTS event_visibility (
  slug       TEXT PRIMARY KEY,          -- content collection id, e.g. 2026-09-17-kyiv-1700
  hidden     INTEGER NOT NULL DEFAULT 0, -- 0 = shown on /events, 1 = closed
  updated_at INTEGER NOT NULL            -- epoch ms
);
