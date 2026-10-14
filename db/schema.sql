-- Current state: one row per room per day.
-- Status is derived from the timestamps:
--   placed_at IS NULL                      -> pending
--   placed_at IS NOT NULL, picked_at NULL  -> placed
--   both set                               -> picked up
CREATE TABLE IF NOT EXISTS room_day (
  room_code   text        NOT NULL,
  work_date   date        NOT NULL,
  placed_by   text,
  placed_at   timestamptz,
  picked_by   text,
  picked_at   timestamptz,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, work_date),
  -- a document cannot be picked up before it was placed
  CONSTRAINT room_day_pick_after_place CHECK (picked_at IS NULL OR placed_at IS NOT NULL)
);

-- Audit trail: every place / pick-up / undo / note / day-note / photo change.
CREATE TABLE IF NOT EXISTS activity_log (
  id          bigserial   PRIMARY KEY,
  room_code   text        NOT NULL,
  work_date   date        NOT NULL,
  action      text        NOT NULL,
  actor       text        NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Keep the CHECK in sync with the action set the app writes. Drop-then-add so
-- an existing deployment picks up the new values (day_note / photo_*).
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_action_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_action_check
  CHECK (action IN ('place', 'pickup', 'undo_place', 'undo_pickup',
                    'note', 'day_note', 'photo_add', 'photo_delete'));

CREATE INDEX IF NOT EXISTS activity_log_day_idx ON activity_log (work_date, room_code, created_at);

-- Day-wide personal notes: one per team member per day, visible to everyone.
-- Not tied to a room. room_code in activity_log is left as a sentinel ('') for
-- day_note rows.
CREATE TABLE IF NOT EXISTS day_notes (
  work_date  date         NOT NULL,
  author     text         NOT NULL,
  note       text         NOT NULL,
  updated_at timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (work_date, author)
);

-- Document photos per room per day. Capped at 2 in the application layer;
-- Vercel Blob holds the file, we keep the URL + pathname (for deletion).
CREATE TABLE IF NOT EXISTS room_photos (
  id          bigserial    PRIMARY KEY,
  room_code   text         NOT NULL,
  work_date   date         NOT NULL,
  url         text         NOT NULL,
  pathname    text         NOT NULL,
  uploaded_by text         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_photos_day_idx ON room_photos (work_date, room_code, created_at);
