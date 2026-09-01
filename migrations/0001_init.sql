-- Anonymous analytics for /events. Deliberately stores no IP address and no
-- raw user-agent string: only the derived device/os/browser. `visitor_id` is a
-- random UUID minted in a cookie, not tied to any identity.
CREATE TABLE IF NOT EXISTS event_hits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,          -- epoch ms
  kind          TEXT    NOT NULL,          -- 'view' | 'click'
  event_slug    TEXT    NOT NULL,
  link_id       TEXT,                      -- null for 'view'
  visitor_id    TEXT    NOT NULL,
  country       TEXT,
  region        TEXT,
  city          TEXT,
  timezone      TEXT,
  colo          TEXT,
  device        TEXT,
  os            TEXT,
  browser       TEXT,
  referrer_host TEXT,
  referrer      TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  lang          TEXT
);

CREATE INDEX IF NOT EXISTS idx_hits_ts       ON event_hits(ts);
CREATE INDEX IF NOT EXISTS idx_hits_event_ts ON event_hits(event_slug, ts);
CREATE INDEX IF NOT EXISTS idx_hits_visitor  ON event_hits(visitor_id);
