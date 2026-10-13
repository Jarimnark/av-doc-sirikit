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

-- Audit trail: every place / pick-up / undo / note change.
CREATE TABLE IF NOT EXISTS activity_log (
  id          bigserial   PRIMARY KEY,
  room_code   text        NOT NULL,
  work_date   date        NOT NULL,
  action      text        NOT NULL
              CHECK (action IN ('place', 'pickup', 'undo_place', 'undo_pickup', 'note')),
  actor       text        NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_day_idx ON activity_log (work_date, room_code, created_at);
