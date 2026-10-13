# AV Doc Sirikit — เอกสารห้อง G01–G21

A small, phone-first web app for a 3-person team (นับทอง, หมิว, รัน) that delivers and collects documents across 21 rooms of a large hall. It shows, at a glance, which rooms already have today's document **placed** and which have been **picked up**, so nobody walks to a room someone else has already handled.

> Personal/internal tool. There are no logins: you pick your name from a list once per phone.

---

## The problem

- **21 rooms**: `G01` – `G21`.
- Every room gets **one document per day**; each has to be **placed** and later **picked up**.
- **3 people** share the walking. Without a shared record, two people can end up going to the same room while another gets missed.
- The work runs **13 – 18 Oct 2026**: 6 days × 21 rooms = **126 room-days**.

## What the app does

1. **Who are you?** On first visit, tap your name (นับทอง / หมิว / รัน). It is remembered on that phone and can be changed from the button in the header.
2. **Pick the day.** The app opens on today (Asia/Bangkok). The day strip lets you review or fix any day from 13 to 18 Oct.
3. **See every room at once.** 21 room cards, colour-coded:

   | Status      | Thai label | Meaning                                       | Colour |
   | ----------- | ---------- | --------------------------------------------- | ------ |
   | `pending`   | รอวาง      | Document not placed yet                       | White  |
   | `placed`    | วางแล้ว    | Document is in the room, waiting for pick-up  | Amber  |
   | `picked`    | เก็บแล้ว   | Document collected, room done for the day     | Green  |

4. **Update with one tap.** Tap a room, then **วางเอกสารแล้ว** (placed) or **เก็บเอกสารแล้ว** (picked up). Who and when (server time, shown in Bangkok time) are recorded. **ยกเลิก** reverts a step if you tapped by mistake. An optional **โน้ต** field is there for things like "ห้องล็อก".
5. **No double work.** If two people tap the same room at almost the same moment, the database lets only the first update through. The second person sees `ห้อง G09 วางแล้วโดย นับทอง เมื่อ 09:42` instead of silently overwriting it.
6. **Stays in sync.** The board refreshes itself every 7 seconds and whenever the page comes back to the foreground.
7. **Progress & filters.** `วางแล้ว 15/21 · เก็บแล้ว 9/21`, with filters ทั้งหมด / รอวาง / รอเก็บ / เสร็จแล้ว, plus a per-person tally.
8. **History.** Each room shows its timeline for the day (who did what, when).
9. **Add to Home Screen.** Ships a web manifest and icons so it opens like an app on iOS/Android.

## Tech stack

| Layer     | Choice                                                                                       |
| --------- | -------------------------------------------------------------------------------------------- |
| Framework | [Next.js 16](https://nextjs.org/) (App Router, Cache Components, Server Actions), TypeScript |
| Styling   | Tailwind CSS v4, mobile-first; Noto Sans Thai via `next/font`                                |
| Database  | [Neon](https://neon.tech/) serverless Postgres via `@neondatabase/serverless` (HTTP driver)  |
| Hosting   | [Vercel](https://vercel.com/), with the Neon integration providing `DATABASE_URL`            |

## Project structure

```
app/
  layout.tsx          # Thai font, metadata, manifest / home-screen icon links
  page.tsx            # reads ?date=, loads the day, renders <Board> inside Suspense
  actions.ts          # server actions: place, pickup, undoPlace, undoPickup, saveNote
  error.tsx           # friendly error screen with retry
  icon.svg            # favicon
  apple-icon.tsx      # 180×180 PNG for "Add to Home Screen"
components/
  Board.tsx           # the whole UI: header, date strip, progress, grid, room sheet, toast
  NamePicker.tsx      # "คุณคือใคร?" chooser
lib/
  config.ts           # team members, date range, rooms, timezone (env-overridable)
  dates.ts            # today-in-Bangkok, working-day list, Thai labels
  db.ts               # lazy Neon client
  rooms.ts            # queries for one day: room states + activity log
db/
  schema.sql          # tables
scripts/
  migrate.ts          # creates tables and seeds G01–G21 × 13–18 Oct (idempotent)
public/
  manifest.webmanifest
```

## Data model

One row per room per day holds the current state; a log table keeps every action.

```sql
CREATE TABLE room_day (
  room_code   text        NOT NULL,
  work_date   date        NOT NULL,
  placed_by   text,
  placed_at   timestamptz,
  picked_by   text,
  picked_at   timestamptz,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, work_date),
  CHECK (picked_at IS NULL OR placed_at IS NOT NULL)   -- can't pick up before placing
);

CREATE TABLE activity_log (
  id          bigserial   PRIMARY KEY,
  room_code   text        NOT NULL,
  work_date   date        NOT NULL,
  action      text        NOT NULL CHECK (action IN ('place','pickup','undo_place','undo_pickup','note')),
  actor       text        NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

Status is derived from the timestamps (no `placed_at` → รอวาง; `placed_at` only → วางแล้ว; both → เก็บแล้ว).

Every change is a single conditional statement that also writes the log row, so the database decides who was first:

```sql
WITH changed AS (
  INSERT INTO room_day (room_code, work_date, placed_by, placed_at)
  VALUES ($1, $2::date, $3, now())
  ON CONFLICT (room_code, work_date) DO UPDATE
    SET placed_by = EXCLUDED.placed_by, placed_at = now(), updated_at = now()
    WHERE room_day.placed_at IS NULL            -- only if still empty
  RETURNING room_code, work_date)
INSERT INTO activity_log (room_code, work_date, action, actor)
SELECT room_code, work_date, 'place', $3 FROM changed
RETURNING id;                                   -- 0 rows => someone else was first
```

## Configuration

Copy `.env.example` to `.env.local` for local development. On Vercel, set the same values under *Project Settings → Environment Variables*.

| Variable       | Default                | Notes                                              |
| -------------- | ---------------------- | -------------------------------------------------- |
| `DATABASE_URL` | —                      | Required. Set automatically by the Neon integration |
| `TEAM_MEMBERS` | `นับทอง,หมิว,รัน`       | Comma-separated names for the chooser              |
| `START_DATE`   | `2026-10-13`           | First working day                                  |
| `END_DATE`     | `2026-10-18`           | Last working day                                   |
| `ROOM_PREFIX`  | `G`                    |                                                    |
| `ROOM_COUNT`   | `21`                   | Rooms are `G01` … `G21`                            |
| `TIMEZONE`     | `Asia/Bangkok`         | Decides "today" and how times are shown            |

`NEON_FETCH_ENDPOINT` exists only for local testing against a stand-in HTTP endpoint; leave it unset in production.

## Getting started (local)

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL from your Neon project
npm run db:migrate                # creates tables + seeds 21 rooms × 6 days (safe to re-run)
npm run dev
```

Open http://localhost:3000. To try it on a phone on the same Wi-Fi, use your computer's local IP instead of `localhost`.

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.

## Deploying to Vercel + Neon

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project** and import the repo (framework preset: Next.js, no extra settings needed).
3. In the project, open **Storage → Create / Connect Database → Neon**. Vercel adds `DATABASE_URL` to the project for you.
4. (Optional) add any `TEAM_MEMBERS` / date overrides from the table above.
5. Deploy.
6. Run the migration once against the production database. Easiest: pull the env locally and run it —
   ```bash
   npx vercel env pull .env.local
   npm run db:migrate
   ```
   (or paste `db/schema.sql` into the Neon SQL editor; the app also creates a room row on first tap if the seed is missing).
7. Share the URL with the team. On each phone, use **Add to Home Screen**.

## Security note

There is no authentication by design, because only 3 trusted people use the app for 6 days. Anyone with the URL can view and change statuses, so:

- Keep the URL private; a non-obvious Vercel project name helps.
- If the link might spread, turn on Vercel **Deployment Protection → Password Protection** (Pro) or put it behind a shared passcode.
- The activity log means any wrong change can be traced and undone.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run build` all pass.
- SQL statements (schema, seed, race-safe place/pickup, undo rules, note, check constraint) were exercised against Postgres 16.
- An end-to-end Chromium run (phone viewport, two "phones" at once) checked: name chooser and persistence, placing, a simultaneous place on the same room (exactly one wins, the other is told who was first), pickup, undo, note, history, auto-refresh on the other phone, progress counters, filters, day switching, out-of-range date fallback and desktop layout.

## Nice-to-have (not built)

- Export a day's records (or the whole period) to CSV
- Room map view matching the physical layout of the hall
- Offline queue for spots with weak signal, syncing when back online
